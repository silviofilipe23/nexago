import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {getFirestore} from "firebase-admin/firestore";
import {deliverNotificationToUser} from "./notification-delivery";

export const onArenaReviewCreatedNotifyManager = onDocumentCreated(
  "arena_reviews/{reviewId}",
  async (event) => {
    const snap = event.data;
    if (!snap?.exists) return;
    const db = getFirestore();
    const data = snap.data() as {[k: string]: unknown};
    const arenaId = typeof data["arenaId"] === "string" ? data["arenaId"].trim() : "";
    if (!arenaId) return;
    const rating = typeof data["rating"] === "number" ? data["rating"] : 0;
    const comment = typeof data["comment"] === "string" ? data["comment"].trim() : "";
    const arenaDoc = await db.collection("arenas").doc(arenaId).get();
    if (!arenaDoc.exists) return;
    const managerUserId = typeof arenaDoc.data()?.["managerUserId"] === "string"
      ? (arenaDoc.data()?.["managerUserId"] as string).trim()
      : "";
    const arenaName = typeof arenaDoc.data()?.["name"] === "string"
      ? (arenaDoc.data()?.["name"] as string).trim()
      : "Arena";
    if (!managerUserId) return;

    const title = "Nova avaliação recebida";
    const body = `⭐ ${rating} em ${arenaName}${comment ? ` • ${comment.slice(0, 80)}` : ""}`;

    try {
      await deliverNotificationToUser({
        userId: managerUserId,
        title,
        body,
        type: "arena_new_review",
        data: {
          reviewId: snap.id,
          arenaId,
        },
        requireInteraction: false,
      });
    } catch (error) {
      logger.error("onArenaReviewCreatedNotifyManager: falha no envio", error);
    }
  }
);
