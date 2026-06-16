import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {Timestamp} from "firebase-admin/firestore";

export type TournamentData = Record<string, unknown>;

export async function loadTournamentData(
  db: Firestore,
  projectId: string,
  tournamentId: string,
): Promise<TournamentData | null> {
  let snap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!snap.exists) {
    snap = await db
      .doc(`artifacts/${projectId}/public/data/tournaments/${tournamentId}`)
      .get();
  }
  if (!snap.exists) return null;
  return snap.data() ?? null;
}

function normalizeListingStatus(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/_/g, " ");
}

function isRegistrationListingClosed(listingStatus: unknown): boolean {
  const n = normalizeListingStatus(listingStatus);
  return (
    n === "closed" ||
    n === "inscrições encerradas" ||
    n === "inscricoes encerradas"
  );
}

export function findCategory(
  tournament: TournamentData,
  categoryId: string,
): Record<string, unknown> | null {
  const categories = (tournament.categories || []) as Array<
    Record<string, unknown>
  >;
  const id = categoryId.trim();
  return (
    categories.find((c) => {
      const name = String(c.categoryName ?? c.name ?? "").trim();
      const cid = String(c.id ?? c.categoryId ?? "").trim();
      return name === id || cid === id;
    }) ?? null
  );
}

/** Chaves equivalentes da categoria (`id`, `categoryId`, `categoryName`) para inscrições legadas. */
export function resolveCategoryMatchKeys(
  tournament: TournamentData,
  categoryKey: string,
): Set<string> {
  const keys = new Set<string>();
  const trimmed = categoryKey.trim();
  if (trimmed) keys.add(trimmed);
  const category = findCategory(tournament, trimmed);
  if (!category) return keys;
  for (const field of ["id", "categoryId", "categoryName", "name"] as const) {
    const value = String(category[field] ?? "").trim();
    if (value) keys.add(value);
  }
  return keys;
}

/** Bloqueia inscrição/convite/PIX quando torneio ou categoria está fechado. */
export async function assertTournamentAcceptsRegistration(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId?: string,
): Promise<TournamentData> {
  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }

  const listingStatus = tournament.listingStatus ?? tournament.status;
  const statusNorm = normalizeListingStatus(listingStatus);

  if (
    statusNorm === "draft" ||
    statusNorm === "programado" ||
    statusNorm === "cancelled" ||
    statusNorm === "canceled" ||
    statusNorm === "cancelado"
    || statusNorm === "cancelada"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Este torneio não aceita novas inscrições.",
    );
  }

  if (isRegistrationListingClosed(listingStatus)) {
    throw new HttpsError(
      "failed-precondition",
      "Inscrições encerradas para este torneio.",
    );
  }

  const closesAt = tournament.registrationClosesAt;
  if (closesAt instanceof Timestamp && closesAt.toMillis() < Date.now()) {
    throw new HttpsError(
      "failed-precondition",
      "Prazo de inscrição encerrado.",
    );
  }

  const opensAt = tournament.registrationOpensAt;
  if (opensAt instanceof Timestamp && opensAt.toMillis() > Date.now()) {
    throw new HttpsError(
      "failed-precondition",
      "Prazo de inscrição ainda não iniciado.",
    );
  }

  const categoryKey = categoryId?.trim() ?? "";
  if (categoryKey.length > 0) {
    const category = findCategory(tournament, categoryKey);
    if (!category) {
      throw new HttpsError("not-found", "Categoria não encontrada.");
    }
    if (category.registrationClosed === true) {
      throw new HttpsError(
        "failed-precondition",
        "Inscrições encerradas nesta categoria.",
      );
    }
    if (category.isCompleted === true) {
      throw new HttpsError(
        "failed-precondition",
        "Categoria já concluída.",
      );
    }

    // Capacidade: se lotado e fila ativa, a inscrição entra na fila.
    // (A marcação real de `waitlist` é feita pelas funções que persistem a inscrição,
    // usando o campo interno `__shouldWaitlist` retornado aqui.)
    const waitlistEnabled = tournament.waitlistEnabled !== false;
    const rawSpotsLeft =
      category.spotsLeft ??
      category.spotsTotal ??
      category.maxTeams ??
      category.spots;
    const spotsLeft =
      typeof rawSpotsLeft === "number"
        ? rawSpotsLeft
        : typeof rawSpotsLeft === "string"
          ? Number(rawSpotsLeft)
          : Number.NaN;

    if (Number.isFinite(spotsLeft) && spotsLeft <= 0) {
      if (waitlistEnabled) {
        (tournament as TournamentData).__shouldWaitlist = true;
      } else {
        throw new HttpsError(
          "failed-precondition",
          "Categoria lotada.",
        );
      }
    }
  }

  return tournament;
}
