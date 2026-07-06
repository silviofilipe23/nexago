import {type Firestore, getFirestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

import {ORGANIZER_DIRECT_PAYMENT_METHOD} from "./organizer-category-ops-payments";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";


export function inscriptionPaidAmountCents(paidAmount: unknown): number {
  if (typeof paidAmount !== "number" || !Number.isFinite(paidAmount) || paidAmount <= 0) {
    return 0;
  }
  return Math.round(paidAmount * 100);
}

export function categoryEntryFeeCents(category: Record<string, unknown>): number {
  const rawCents = category["entryFeeCents"];
  if (typeof rawCents === "number" && Number.isFinite(rawCents)) {
    return Math.round(rawCents);
  }
  const fee = category["entryFee"];
  if (typeof fee === "number" && Number.isFinite(fee)) {
    return Math.round(fee * 100);
  }
  if (typeof fee === "string") {
    const parsed = Number.parseFloat(fee);
    if (Number.isFinite(parsed)) return Math.round(parsed * 100);
  }
  return 0;
}

export type ConfirmedInscriptionPayment = {
  channel: "viaApp" | "viaOrganizer";
  cents: number;
};

export function confirmedInscriptionPayment(params: {
  inscription: Record<string, unknown>;
  entryFeeCents: number;
}): ConfirmedInscriptionPayment | null {
  if (params.inscription.waitlist === true) return null;
  if (params.inscription.isPaid !== true) return null;

  const paidCents = inscriptionPaidAmountCents(params.inscription.paidAmount);
  const method = String(params.inscription.paymentMethod ?? "").trim().toLowerCase();
  const cents = paidCents > 0 ? paidCents : params.entryFeeCents;
  const channel =
    method === ORGANIZER_DIRECT_PAYMENT_METHOD ?
      "viaOrganizer" :
      paidCents > 0 ?
        "viaApp" :
        "viaOrganizer";
  return {channel, cents};
}

function categoryFeeLookup(
  tournament: Record<string, unknown>,
): Map<string, number> {
  const lookup = new Map<string, number>();
  const categories = tournament.categories;
  if (!Array.isArray(categories)) return lookup;

  for (const item of categories) {
    if (typeof item !== "object" || item === null) continue;
    const category = item as Record<string, unknown>;
    const fee = categoryEntryFeeCents(category);
    for (const field of ["id", "categoryId", "categoryName", "name"] as const) {
      const key = String(category[field] ?? "").trim();
      if (key) lookup.set(key, fee);
    }
  }
  return lookup;
}

export function computeTournamentCollectedCents(
  tournament: Record<string, unknown>,
  inscriptions: Array<Record<string, unknown>>,
): number {
  const feeByCategoryKey = categoryFeeLookup(tournament);
  let total = 0;

  for (const inscription of inscriptions) {
    const categoryId = String(inscription.categoryId ?? "").trim();
    const entryFeeCents = feeByCategoryKey.get(categoryId) ?? 0;
    const payment = confirmedInscriptionPayment({inscription, entryFeeCents});
    if (payment) total += payment.cents;
  }

  return total;
}

function extractTournamentId(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const raw = (data as Record<string, unknown>).tournamentId;
  return typeof raw === "string" ? raw.trim() : "";
}

export async function recomputeTournamentCollectedCents(
  db: Firestore,
  projectId: string,
  tournamentId: string,
): Promise<number> {
  const tid = tournamentId.trim();
  if (!tid) return 0;

  const tournamentSnap = await db.doc(`tournaments/${tid}`).get();
  if (!tournamentSnap.exists) return 0;

  const tournament = tournamentSnap.data() ?? {};
  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tid)
    .get();

  const inscriptions = inscriptionsSnap.docs.map((doc) => doc.data());
  const collectedCents = computeTournamentCollectedCents(tournament, inscriptions);
  const current =
    typeof tournament.collectedCents === "number" && Number.isFinite(tournament.collectedCents) ?
      Math.round(tournament.collectedCents) :
      0;

  if (current !== collectedCents) {
    await db.doc(`tournaments/${tid}`).set({collectedCents}, {merge: true});
  }

  return collectedCents;
}

export const onTournamentInscriptionWriteSyncCollectedCents = onDocumentWritten(
  "artifacts/{appId}/public/data/inscriptions/{registrationId}",
  async (event) => {
    const beforeTournamentId = extractTournamentId(event.data?.before.data());
    const afterTournamentId = extractTournamentId(event.data?.after.data());
    const tournamentIds = new Set<string>();
    if (beforeTournamentId) tournamentIds.add(beforeTournamentId);
    if (afterTournamentId) tournamentIds.add(afterTournamentId);
    if (tournamentIds.size === 0) return;

    const db = getFirestore();
    const projectId = getFirebaseProjectId();

    await Promise.all(
      [...tournamentIds].map(async (tournamentId) => {
        try {
          await recomputeTournamentCollectedCents(db, projectId, tournamentId);
        } catch (err) {
          logger.error("tournament-collected-stats: recompute failed", {
            tournamentId,
            registrationId: event.params.registrationId,
            err,
          });
        }
      }),
    );
  },
);
