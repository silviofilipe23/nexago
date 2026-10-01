import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {computeReviewAggregate} from "./tournament-review-aggregate";
import {
  anonymousReviewPath,
  ORGANIZER_REPUTATION_COLLECTION,
  TOURNAMENT_REVIEW_SUMMARIES_COLLECTION,
  TOURNAMENT_REVIEWS_COLLECTION,
} from "./tournament-review-constants";

type DocData = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Cópia que o organizador lê: sem uid, sem data, sem categoria. `shuffleKey` nasce uma vez e a
 * tela ordena por ele, então a ordem de chegada não fica guardada.
 */
async function syncAnonymousCopy(
  db: Firestore,
  before: DocData | null,
  after: DocData | null,
  randomKey: () => number,
): Promise<void> {
  const tournamentId = str((after ?? before)?.tournamentId);
  if (!tournamentId) return;
  if (!after) {
    const anonId = str(before?.anonId);
    if (anonId) await db.doc(anonymousReviewPath(tournamentId, anonId)).delete();
    return;
  }
  const anonId = str(after.anonId);
  if (!anonId) return;
  const ref = db.doc(anonymousReviewPath(tournamentId, anonId));
  const existing = await ref.get();
  const previousKey = existing.exists ? existing.data()?.shuffleKey : undefined;
  await ref.set({
    overall: after.overall,
    aspects: after.aspects ?? {},
    comment: after.comment ?? null,
    shuffleKey: typeof previousKey === "number" ? previousKey : randomKey(),
  });
}

/**
 * Resumo do torneio, recalculado do zero (idempotente com o at-least-once do trigger) e
 * regravado inteiro numa transação, preservando os campos da janela. `set` sem merge de
 * propósito: com merge, um aspecto que deixou de ter nota ficaria velho dentro do mapa.
 * Resumo ausente não é criado aqui: quem cria é o job, ao abrir a janela.
 */
export async function recomputeTournamentReviewSummary(
  db: Firestore,
  tournamentId: string,
  nowMs: number,
): Promise<void> {
  const summaryRef = db.collection(TOURNAMENT_REVIEW_SUMMARIES_COLLECTION).doc(tournamentId);
  const reviewsQuery = db.collection(TOURNAMENT_REVIEWS_COLLECTION).where("tournamentId", "==", tournamentId);
  await db.runTransaction(async (tx) => {
    const summarySnap = await tx.get(summaryRef);
    const reviewsSnap = await tx.get(reviewsQuery);
    if (!summarySnap.exists) {
      logger.warn("recomputeTournamentReviewSummary: resumo ausente", {tournamentId});
      return;
    }
    const aggregate = computeReviewAggregate(reviewsSnap.docs.map((d) => d.data()));
    tx.set(summaryRef, {
      ...summarySnap.data(),
      count: aggregate.count,
      average: aggregate.average,
      distribution: aggregate.distribution,
      aspects: aggregate.aspects,
      updatedAt: Timestamp.fromMillis(nowMs),
    });
  });
}

/** Reputação do organizador: todas as avaliações de todos os torneios dele, inclusive dos que
 *  fecharam com menos de 3. Recalcula do zero; troque por acumulador se algum organizador
 *  passar de ~10 mil avaliações. */
export async function recomputeOrganizerReputation(
  db: Firestore,
  organizerId: string,
  nowMs: number,
): Promise<void> {
  const snap = await db.collection(TOURNAMENT_REVIEWS_COLLECTION).where("organizerId", "==", organizerId).get();
  const reviews = snap.docs.map((d) => d.data());
  const aggregate = computeReviewAggregate(reviews);
  const tournaments = new Set(reviews.map((r) => str(r.tournamentId)).filter((id) => id.length > 0));
  await db.collection(ORGANIZER_REPUTATION_COLLECTION).doc(organizerId).set({
    organizerId,
    reviewsCount: aggregate.count,
    tournamentsRated: tournaments.size,
    average: aggregate.average,
    distribution: aggregate.distribution,
    aspects: aggregate.aspects,
    updatedAt: Timestamp.fromMillis(nowMs),
  });
}

export async function syncTournamentReviewDerivedDocs(
  db: Firestore,
  before: DocData | null,
  after: DocData | null,
  nowMs: number = Date.now(),
  randomKey: () => number = Math.random,
): Promise<void> {
  await syncAnonymousCopy(db, before, after, randomKey);
  const tournamentIds = new Set([str(before?.tournamentId), str(after?.tournamentId)].filter((id) => id));
  const organizerIds = new Set([str(before?.organizerId), str(after?.organizerId)].filter((id) => id));
  for (const tournamentId of tournamentIds) {
    await recomputeTournamentReviewSummary(db, tournamentId, nowMs);
  }
  for (const organizerId of organizerIds) {
    await recomputeOrganizerReputation(db, organizerId, nowMs);
  }
}

export const onTournamentReviewWritten = onDocumentWritten(
  `${TOURNAMENT_REVIEWS_COLLECTION}/{reviewId}`,
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() ?? null : null;
    const after = event.data?.after.exists ? event.data.after.data() ?? null : null;
    await syncTournamentReviewDerivedDocs(getFirestore(), before, after);
  },
);
