import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {FieldValue, type Firestore, getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {syncAchievementsForUser} from "./achievement-engine";

export const XP_INVITE_PLAYER = 20;

export function playerInviteEventId(inviteId: string): string {
  return `invite_${inviteId.trim()}`;
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Porte de GamificationService.onPlayerInvited (gamification_service.dart) — XP vai para quem convidou. */
export async function awardPlayerInviteXp(
  db: Firestore,
  inviterUid: string,
  inviteId: string,
): Promise<boolean> {
  const uid = inviterUid.trim();
  const iid = inviteId.trim();
  if (!uid || !iid) return false;

  const eventRef = db
    .collection("users")
    .doc(uid)
    .collection("gamification_events")
    .doc(playerInviteEventId(iid));
  const summaryRef = db.collection("users").doc(uid).collection("gamification").doc("summary");

  const awarded = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return false;

    const summarySnap = await tx.get(summaryRef);
    const data = summarySnap.data() ?? {};
    const invites = numberField(data, "invitesCount");
    const xp = numberField(data, "xp");
    const nextXp = xp + XP_INVITE_PLAYER;

    tx.set(
      summaryRef,
      {
        invitesCount: invites + 1,
        xp: nextXp,
        level: Math.floor(nextXp / 100),
        updatedAt: FieldValue.serverTimestamp(),
        lastXpReason: "INVITE_PLAYER",
      },
      {merge: true},
    );

    tx.set(eventRef, {
      type: "INVITE_PLAYER",
      createdAt: FieldValue.serverTimestamp(),
    });

    return true;
  });

  if (!awarded) return false;
  await syncAchievementsForUser(db, uid);
  return true;
}

/**
 * Quando um convite de reserva (bookingInvites/{inviteId}) é aceito, credita XP a quem convidou.
 * Substitui a chamada client-side GamificationService.onPlayerInvited, que as rules bloqueiam
 * (client não pode escrever em `gamification*`).
 */
export const onBookingInviteAcceptedAwardInviterXp = onDocumentUpdated(
  "bookingInvites/{inviteId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!after) return;

    const beforeStatus = typeof before?.["status"] === "string" ? before["status"] : "";
    const afterStatus = typeof after["status"] === "string" ? after["status"] : "";
    if (afterStatus !== "accepted" || beforeStatus === "accepted") return;

    const invitedByUid = typeof after["invitedByUid"] === "string" ? after["invitedByUid"].trim() : "";
    if (!invitedByUid) return;

    try {
      const awarded = await awardPlayerInviteXp(getFirestore(), invitedByUid, event.params.inviteId);
      if (awarded) {
        logger.info(
          `playerInviteXp: +${XP_INVITE_PLAYER} XP para ${invitedByUid} (convite ${event.params.inviteId})`,
        );
      }
    } catch (error) {
      logger.error(`playerInviteXp: falha ao creditar convite ${event.params.inviteId}`, error);
    }
  },
);
