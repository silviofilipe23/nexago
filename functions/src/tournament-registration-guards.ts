import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {Timestamp} from "firebase-admin/firestore";
import {artifactsInscriptionsPath} from "./firebase-paths";

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

/** Copy única do bloqueio da reserva solo em torneio de dupla já formada. */
export const FORMED_PAIR_REQUIRED_MESSAGE =
  "Este torneio exige dupla já formada. Convide seu parceiro: a vaga é " +
  "criada quando ele aceitar o convite.";

/**
 * Torneio exige DUPLA JÁ FORMADA: não há reserva solo, a inscrição nasce
 * quando o parceiro aceita o convite (`tournaments/{id}.requireFormedPair`).
 *
 * Ausente = `false` = comportamento histórico (o atleta reserva a vaga sozinho
 * e chama o parceiro depois), então torneio antigo não muda de regra.
 */
export function requiresFormedPair(
  tournament: TournamentData | null | undefined,
): boolean {
  return tournament?.requireFormedPair === true;
}

/** Taxa de inscrição da categoria (por `id`, `categoryId` ou `categoryName`). */
export function resolveCategoryEntryFee(
  tournament: TournamentData,
  categoryKey: string,
): number {
  const category = findCategory(tournament, categoryKey);
  if (!category) return 0;
  const raw = category.entryFee;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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

/**
 * Opções do guard.
 *
 * `allowClosedRegistration` existe para o organizador inscrever uma dupla depois do prazo
 * (`organizerCreateTeamRegistration`): pula SÓ as travas de calendário/vitrine — listagem
 * fechada, `registrationClosesAt` vencido, `registrationOpensAt` futuro e
 * `category.registrationClosed`. Torneio em rascunho/programado/cancelado, categoria concluída
 * e categoria lotada continuam barrando: essas não são "o atleta perdeu o prazo", são estados
 * em que uma inscrição nova corrompe a competição.
 */
export interface RegistrationGuardOptions {
  allowClosedRegistration?: boolean;

  /**
   * Inscrição que JÁ ocupa uma vaga e não deve contar contra si mesma.
   *
   * Sem isto, confirmar uma inscrição existente numa categoria cheia a jogaria
   * na fila de espera — e ela é justamente uma das que enchem a categoria.
   * Usado por quem confirma/paga uma inscrição que já existe (PIX, confirmação
   * gratuita, reserva direta com o organizador).
   */
  occupancyExcludesRegistrationId?: string;
}

/**
 * Teto da categoria em EQUIPES (duplas/trios/…), ou `null` quando ela não
 * declara teto — e aí não há o que lotar.
 *
 * `spotsLeft` entra por último e só como fallback de doc legado: ele nasce
 * igual à capacidade e nenhum writer o decrementa, então serve como "quanto
 * cabe", nunca como "quanto sobra". O primeiro valor POSITIVO vence — assim
 * `maxTeams: 0` (sem teto declarado) cai para o próximo campo em vez de ser
 * lido como categoria lotada.
 */
export function resolveCategoryCapacity(
  category: Record<string, unknown> | null | undefined,
): number | null {
  if (!category) return null;
  for (const field of ["maxTeams", "spotsTotal", "spots", "spotsLeft"]) {
    const raw = category[field];
    const n =
      typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
}

/**
 * Vagas ocupadas na categoria: a CONTAGEM dos documentos de inscrição
 * (1 doc = 1 dupla/equipe), que é a única fonte exata — cancelamento faz hard
 * delete. Fila de espera não ocupa vaga.
 *
 * Antes desta conta o guard lia `categories[].spotsLeft`, contador que nasce
 * igual à capacidade e que ninguém decrementa: uma categoria de 1 dupla
 * aceitava quantas quisesse, e a única trava real era a tela do app.
 */
async function countCategoryOccupancy(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryKeys: Set<string>,
  excludeRegistrationId: string,
): Promise<number> {
  // `in` aceita no máximo 10 valores; as chaves equivalentes de uma categoria
  // são 4 no pior caso (id, categoryId, categoryName, name).
  const keys = [...categoryKeys].filter((key) => key.length > 0).slice(0, 10);
  if (keys.length === 0) return 0;

  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "in", keys)
    .get();

  let occupied = 0;
  for (const doc of snap.docs) {
    if (doc.id === excludeRegistrationId) continue;
    if (doc.data()?.waitlist === true) continue;
    occupied++;
  }
  return occupied;
}

/** Bloqueia inscrição/convite/PIX quando torneio ou categoria está fechado. */
export async function assertTournamentAcceptsRegistration(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId?: string,
  options?: RegistrationGuardOptions,
): Promise<TournamentData> {
  const allowClosed = options?.allowClosedRegistration === true;
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

  if (!allowClosed && isRegistrationListingClosed(listingStatus)) {
    throw new HttpsError(
      "failed-precondition",
      "Inscrições encerradas para este torneio.",
    );
  }

  const closesAt = tournament.registrationClosesAt;
  if (
    !allowClosed &&
    closesAt instanceof Timestamp &&
    closesAt.toMillis() < Date.now()
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Prazo de inscrição encerrado.",
    );
  }

  const opensAt = tournament.registrationOpensAt;
  if (
    !allowClosed &&
    opensAt instanceof Timestamp &&
    opensAt.toMillis() > Date.now()
  ) {
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
    if (!allowClosed && category.registrationClosed === true) {
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
    const capacity = resolveCategoryCapacity(category);
    if (capacity != null) {
      const occupied = await countCategoryOccupancy(
        db,
        projectId,
        tournamentId,
        resolveCategoryMatchKeys(tournament, categoryKey),
        options?.occupancyExcludesRegistrationId?.trim() ?? "",
      );
      if (occupied >= capacity) {
        if (tournament.waitlistEnabled !== false) {
          (tournament as TournamentData).__shouldWaitlist = true;
        } else {
          throw new HttpsError(
            "failed-precondition",
            "Categoria lotada.",
          );
        }
      }
    }
  }

  return tournament;
}
