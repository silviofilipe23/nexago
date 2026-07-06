import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {FieldValue, type Firestore, getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {syncAchievementsForUser} from "./achievement-engine";

export const XP_ARENA_REVIEW = 10;

export function arenaReviewEventId(reviewId: string): string {
  return `arena_review_${reviewId.trim()}`;
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Porte da chamada GamificationService.addXp(amount: 10, reason: 'ARENA_REVIEW')
 * que existia em rating_dialog.dart — bloqueada pelas rules e sem idempotência
 * (addXp genérico não tinha doc de evento). Aqui vira idempotente por reviewId.
 */
export async function awardArenaReviewXp(
  db: Firestore,
  userId: string,
  reviewId: string,
): Promise<boolean> {
  const uid = userId.trim();
  const rid = reviewId.trim();
  if (!uid || !rid) return false;

  const eventRef = db
    .collection("users")
    .doc(uid)
    .collection("gamification_events")
    .doc(arenaReviewEventId(rid));
  const summaryRef = db.collection("users").doc(uid).collection("gamification").doc("summary");

  const awarded = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return false;

    const summarySnap = await tx.get(summaryRef);
    const data = summarySnap.data() ?? {};
    const xp = numberField(data, "xp");
    const nextXp = xp + XP_ARENA_REVIEW;

    tx.set(
      summaryRef,
      {
        xp: nextXp,
        level: Math.floor(nextXp / 100),
        updatedAt: FieldValue.serverTimestamp(),
        lastXpReason: "ARENA_REVIEW",
      },
      {merge: true},
    );
    tx.set(eventRef, {
      type: "ARENA_REVIEW",
      reviewId: rid,
      xp: XP_ARENA_REVIEW,
      createdAt: FieldValue.serverTimestamp(),
    });

    return true;
  });

  if (!awarded) return false;
  await syncAchievementsForUser(db, uid);
  return true;
}

export const onArenaReviewCreatedAwardXp = onDocumentCreated(
  "arena_reviews/{reviewId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const userId = typeof data["userId"] === "string" ? data["userId"].trim() : "";
    if (!userId) return;

    try {
      const awarded = await awardArenaReviewXp(getFirestore(), userId, event.params.reviewId);
      if (awarded) {
        logger.info(`arenaReviewXp: +${XP_ARENA_REVIEW} XP para ${userId} (review ${event.params.reviewId})`);
      }
    } catch (error) {
      logger.error(`arenaReviewXp: falha na review ${event.params.reviewId}`, error);
    }
  },
);
