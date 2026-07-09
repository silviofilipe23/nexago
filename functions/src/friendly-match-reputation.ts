import {Timestamp, type Firestore} from "firebase-admin/firestore";

/**
 * Bora Jogar — reputação comportamental do atleta.
 *
 * Modelo espelhado na gamificação/rating: ledger append-only de eventos com
 * id determinístico (existência = já processado, idempotente) + summary
 * derivado na MESMA transação + espelho compacto em `users/{uid}.reputation`
 * (que o public-profile-sync propaga para `public_profiles`). Escrita é
 * exclusiva das Cloud Functions; as rules bloqueiam o client — inclusive o
 * campo `reputation` do próprio doc users (anti-spoof).
 */

export type ReputationEventType =
  | "match_completed"
  | "review_received"
  | "no_show"
  | "late_cancel";

export type ReputationSummary = {
  gamesCompleted: number;
  noShows: number;
  lateCancellations: number;
  ratingSum: number;
  ratingCount: number;
};

export function matchCompletedEventId(matchId: string): string {
  return `match_completed_${matchId}`;
}

export function noShowEventId(matchId: string): string {
  return `no_show_${matchId}`;
}

export function lateCancelEventId(matchId: string): string {
  return `late_cancel_${matchId}`;
}

export function reviewReceivedEventId(matchId: string, reviewerUid: string): string {
  return `review_received_${matchId}_${reviewerUid}`;
}

/**
 * Score 0–100: parte de 100, no-show tira 15, cancelamento tardio tira 5 e
 * a média de estrelas ajusta ±10 por estrela em torno de 4 (média 5 → +10,
 * média 3 → −10). Sem avaliações, sem ajuste.
 */
export function computeReputationScore(summary: ReputationSummary): number {
  const ratingAdjustment = summary.ratingCount > 0 ?
    Math.round((summary.ratingSum / summary.ratingCount - 4) * 10) :
    0;
  const score =
    100 - 15 * summary.noShows - 5 * summary.lateCancellations + ratingAdjustment;
  return Math.min(100, Math.max(0, score));
}

function numberField(data: Record<string, unknown>, field: string): number {
  const value = data[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Aplica um evento de reputação de forma idempotente (por eventId) e deriva
 * summary + espelho na mesma transação. Retorna false se já processado.
 */
export async function applyReputationEvent(
  db: Firestore,
  uid: string,
  eventId: string,
  type: ReputationEventType,
  payload?: {matchId?: string; stars?: number},
): Promise<boolean> {
  const eventRef = db.doc(`users/${uid}/reputationEvents/${eventId}`);
  const summaryRef = db.doc(`users/${uid}/reputation/summary`);
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return false;

    const summarySnap = await tx.get(summaryRef);
    const data = (summarySnap.data() ?? {}) as Record<string, unknown>;
    const summary: ReputationSummary = {
      gamesCompleted: numberField(data, "gamesCompleted"),
      noShows: numberField(data, "noShows"),
      lateCancellations: numberField(data, "lateCancellations"),
      ratingSum: numberField(data, "ratingSum"),
      ratingCount: numberField(data, "ratingCount"),
    };

    if (type === "match_completed") summary.gamesCompleted += 1;
    if (type === "no_show") summary.noShows += 1;
    if (type === "late_cancel") summary.lateCancellations += 1;
    if (type === "review_received") {
      const stars = payload?.stars;
      if (typeof stars !== "number" || stars < 1 || stars > 5) {
        throw new Error(`review_received sem stars válidas: ${stars}`);
      }
      summary.ratingSum += stars;
      summary.ratingCount += 1;
    }

    const ratingAvg = summary.ratingCount > 0 ?
      Math.round((summary.ratingSum / summary.ratingCount) * 100) / 100 :
      null;
    const score = computeReputationScore(summary);

    tx.set(summaryRef, {
      ...summary,
      ratingAvg,
      score,
      updatedAt: Timestamp.now(),
    }, {merge: true});

    const event: Record<string, unknown> = {type, createdAt: Timestamp.now()};
    if (payload?.matchId) event.matchId = payload.matchId;
    if (payload?.stars != null) event.stars = payload.stars;
    tx.set(eventRef, event);

    // Espelho compacto lido pelo discover via public_profiles.
    tx.set(userRef, {
      reputation: {
        score,
        ratingAvg,
        ratingCount: summary.ratingCount,
        gamesCompleted: summary.gamesCompleted,
        noShows: summary.noShows,
      },
    }, {merge: true});

    return true;
  });
}
