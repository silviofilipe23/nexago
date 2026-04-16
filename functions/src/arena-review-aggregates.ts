import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
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
  let repliedCount = 0;
  let responseSumMinutes = 0;
  let responseCount = 0;
  const distribution = {star1: 0, star2: 0, star3: 0, star4: 0, star5: 0};
  for (const doc of reviewsSnap.docs) {
    const data = doc.data();
    const rating = toRating(data);
    if (rating == null) continue;
    sum += rating;
    count += 1;
    if (rating == 1) distribution.star1 += 1;
    if (rating == 2) distribution.star2 += 1;
    if (rating == 3) distribution.star3 += 1;
    if (rating == 4) distribution.star4 += 1;
    if (rating == 5) distribution.star5 += 1;

    const reply = (data["reply"] ?? null) as {[k: string]: unknown} | null;
    const hasReply = reply != null && typeof reply["message"] === "string" &&
      (reply["message"] as string).trim().length > 0;
    if (hasReply) {
      repliedCount += 1;
      const createdAt = data["createdAt"];
      const repliedAt = reply["updatedAt"] ?? reply["createdAt"];
      const createdDate = createdAt instanceof Timestamp ? createdAt.toDate() : null;
      const repliedDate = repliedAt instanceof Timestamp ? repliedAt.toDate() : null;
      if (createdDate && repliedDate) {
        const diffMs = repliedDate.getTime() - createdDate.getTime();
        if (diffMs >= 0) {
          responseSumMinutes += Math.round(diffMs / (60 * 1000));
          responseCount += 1;
        }
      }
    }
  }

  const ratingAverage = count > 0 ? sum / count : 0;
  const responseRate = count > 0 ? repliedCount / count : 0;
  const avgResponseTimeMinutes = responseCount > 0 ?
    Math.round(responseSumMinutes / responseCount) :
    0;
  const score = Math.max(0, Math.min(100, Math.round(ratingAverage * 20)));
  await db.collection("arenas").doc(aid).set(
    {
      reviewsCount: count,
      ratingAverage,
      reputationScore: score,
      reviewResponseRate: responseRate,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  await db.collection("arena_reputation").doc(aid).set({
    arenaId: aid,
    ratingAverage,
    reviewsCount: count,
    ratingDistribution: distribution,
    responseRate,
    avgResponseTimeMinutes,
    score,
    lastUpdated: FieldValue.serverTimestamp(),
  }, {merge: true});
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
