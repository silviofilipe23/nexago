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

/** Recorte da arrecadação de um torneio, em centavos. `toVerifyCents` é um SUBCONJUNTO de
 *  `viaOrganizerCents` (dinheiro declarado que ainda não teve baixa), não uma quarta parcela:
 *  `totalCents === viaAppCents + viaOrganizerCents`. */
export type TournamentCollectedStats = {
  totalCents: number;
  viaAppCents: number;
  viaOrganizerCents: number;
  toVerifyCents: number;
};

export const EMPTY_COLLECTED_STATS: TournamentCollectedStats = {
  totalCents: 0,
  viaAppCents: 0,
  viaOrganizerCents: 0,
  toVerifyCents: 0,
};

/** MESMA âncora que o portal usa pro selo "A conferir" (`inscriptions-repository.ts`):
 *  `declaredPaidAt` (e não `paymentChannel`) para que inscrições diretas ANTERIORES ao fluxo de
 *  declaração não entrem retroativamente numa fila de conferência que ninguém vai fazer. Se esta
 *  regra divergir da do selo, o organizador vê um valor "a conferir" que não bate com as
 *  inscrições marcadas "A conferir" na tela de Inscrições. */
export function isAwaitingOrganizerVerification(
  inscription: Record<string, unknown>,
): boolean {
  const declared = inscription.declaredPaidAt;
  if (declared === null || declared === undefined) return false;
  return inscription.paymentVerifiedByOrganizer !== true;
}

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

export function computeTournamentCollectedStats(
  tournament: Record<string, unknown>,
  inscriptions: Array<Record<string, unknown>>,
): TournamentCollectedStats {
  const feeByCategoryKey = categoryFeeLookup(tournament);
  let viaAppCents = 0;
  let viaOrganizerCents = 0;
  let toVerifyCents = 0;

  for (const inscription of inscriptions) {
    const categoryId = String(inscription.categoryId ?? "").trim();
    const entryFeeCents = feeByCategoryKey.get(categoryId) ?? 0;
    const payment = confirmedInscriptionPayment({inscription, entryFeeCents});
    if (!payment) continue;
    if (payment.channel === "viaApp") {
      viaAppCents += payment.cents;
      continue;
    }
    viaOrganizerCents += payment.cents;
    if (isAwaitingOrganizerVerification(inscription)) {
      toVerifyCents += payment.cents;
    }
  }

  return {
    totalCents: viaAppCents + viaOrganizerCents,
    viaAppCents,
    viaOrganizerCents,
    toVerifyCents,
  };
}

function extractTournamentId(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const raw = (data as Record<string, unknown>).tournamentId;
  return typeof raw === "string" ? raw.trim() : "";
}

/** `null` = campo AUSENTE no doc, que é diferente de zero. Sem essa distinção, torneio antigo
 *  sem arrecadação nunca ganharia os campos do recorte (o total bateria em 0 e a escrita seria
 *  pulada), e o portal ficaria preso no fallback pelo `paymentMode` pra sempre. */
function storedCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function isCollectedUpToDate(
  tournament: Record<string, unknown>,
  stats: TournamentCollectedStats,
): boolean {
  return (
    storedCents(tournament.collectedCents) === stats.totalCents &&
    storedCents(tournament.collectedViaAppCents) === stats.viaAppCents &&
    storedCents(tournament.collectedViaOrganizerCents) === stats.viaOrganizerCents &&
    storedCents(tournament.collectedToVerifyCents) === stats.toVerifyCents
  );
}

export async function recomputeTournamentCollectedStats(
  db: Firestore,
  projectId: string,
  tournamentId: string,
): Promise<TournamentCollectedStats> {
  const tid = tournamentId.trim();
  if (!tid) return EMPTY_COLLECTED_STATS;

  const tournamentSnap = await db.doc(`tournaments/${tid}`).get();
  if (!tournamentSnap.exists) return EMPTY_COLLECTED_STATS;

  const tournament = tournamentSnap.data() ?? {};
  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tid)
    .get();

  const inscriptions = inscriptionsSnap.docs.map((doc) => doc.data());
  const stats = computeTournamentCollectedStats(tournament, inscriptions);

  if (!isCollectedUpToDate(tournament, stats)) {
    // `collectedCents` continua sendo o total: o app Flutter e o portal da arena já o leem, e
    // mudar seu significado quebraria as duas superfícies.
    await db.doc(`tournaments/${tid}`).set({
      collectedCents: stats.totalCents,
      collectedViaAppCents: stats.viaAppCents,
      collectedViaOrganizerCents: stats.viaOrganizerCents,
      collectedToVerifyCents: stats.toVerifyCents,
    }, {merge: true});
  }

  return stats;
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
          await recomputeTournamentCollectedStats(db, projectId, tournamentId);
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
