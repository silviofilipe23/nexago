import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

function extractArenaId(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const raw = (data as {[k: string]: unknown})["arenaId"];
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function toRating(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as {[k: string]: unknown})["rating"];
  if (typeof raw !== "number") return null;
  if (!Number.isFinite(raw)) return null;
  if (raw < 1 || raw > 5) return null;
  return raw;
}

async function recomputeArenaReviewAggregates(arenaId: string): Promise<void> {
  const aid = arenaId.trim();
  if (!aid) return;

  const db = getFirestore();
  const reviewsSnap = await db
    .collection("arena_reviews")
    .where("arenaId", "==", aid)
    .get();

  let sum = 0;
  let count = 0;
  for (const doc of reviewsSnap.docs) {
    const rating = toRating(doc.data());
    if (rating == null) continue;
    sum += rating;
    count += 1;
  }

  const ratingAverage = count > 0 ? sum / count : 0;
  await db.collection("arenas").doc(aid).set(
    {
      reviewsCount: count,
      ratingAverage,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

export const recalculateArenaReviewAggregates = onDocumentWritten(
  "arena_reviews/{reviewId}",
  async (event) => {
    const beforeArenaId = extractArenaId(event.data?.before.data());
    const afterArenaId = extractArenaId(event.data?.after.data());

    const arenaIds = new Set<string>();
    if (beforeArenaId.length > 0) arenaIds.add(beforeArenaId);
    if (afterArenaId.length > 0) arenaIds.add(afterArenaId);

    if (arenaIds.size === 0) {
      logger.warn("recalculateArenaReviewAggregates: arenaId ausente no review", {
        reviewId: event.params.reviewId,
      });
      return;
    }

    await Promise.all(Array.from(arenaIds).map((aid) => recomputeArenaReviewAggregates(aid)));
  },
);
