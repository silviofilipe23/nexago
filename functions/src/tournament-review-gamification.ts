import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {FieldValue, type Firestore, getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {syncAchievementsForUser} from "./achievement-engine";
import {TOURNAMENT_REVIEWS_COLLECTION, XP_TOURNAMENT_REVIEW} from "./tournament-review-constants";

/** Um evento por torneio, não por avaliação: editar a avaliação não paga de novo. */
export function tournamentReviewEventId(tournamentId: string): string {
  return `tournament_review_${tournamentId.trim()}`;
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Mesmo molde de `awardArenaReviewXp` (arena-review-gamification.ts), idempotente pelo doc
 *  de evento. */
export async function awardTournamentReviewXp(
  db: Firestore,
  userId: string,
  tournamentId: string,
  syncAchievements: (db: Firestore, uid: string) => Promise<unknown> = syncAchievementsForUser,
): Promise<boolean> {
  const uid = userId.trim();
  const tid = tournamentId.trim();
  if (!uid || !tid) return false;

  const eventRef = db.collection("users").doc(uid).collection("gamification_events").doc(tournamentReviewEventId(tid));
  const summaryRef = db.collection("users").doc(uid).collection("gamification").doc("summary");

  const awarded = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return false;
    const summarySnap = await tx.get(summaryRef);
    const nextXp = numberField(summarySnap.data() ?? {}, "xp") + XP_TOURNAMENT_REVIEW;
    tx.set(
      summaryRef,
      {
        xp: nextXp,
        level: Math.floor(nextXp / 100),
        updatedAt: FieldValue.serverTimestamp(),
        lastXpReason: "TOURNAMENT_REVIEW",
      },
      {merge: true},
    );
    tx.set(eventRef, {
      type: "TOURNAMENT_REVIEW",
      tournamentId: tid,
      xp: XP_TOURNAMENT_REVIEW,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!awarded) return false;
  await syncAchievements(db, uid);
  return true;
}

export const onTournamentReviewCreatedAwardXp = onDocumentCreated(
  `${TOURNAMENT_REVIEWS_COLLECTION}/{reviewId}`,
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const uid = typeof data.uid === "string" ? data.uid.trim() : "";
    const tournamentId = typeof data.tournamentId === "string" ? data.tournamentId.trim() : "";
    if (!uid || !tournamentId) return;
    try {
      if (await awardTournamentReviewXp(getFirestore(), uid, tournamentId)) {
        logger.info(`tournamentReviewXp: +${XP_TOURNAMENT_REVIEW} XP para ${uid} (torneio ${tournamentId})`);
      }
    } catch (error) {
      logger.error(`tournamentReviewXp: falha na avaliação ${event.params.reviewId}`, error);
    }
  },
);
