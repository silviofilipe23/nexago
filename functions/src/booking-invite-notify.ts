import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";

/**
 * Quando um convite de reserva é criado, notifica o convidado se `inviteeUid` estiver no doc.
 * Convites por link (sem inviteeUid) não geram inbox até o destinatário abrir o link.
 */
export const onBookingInviteCreatedNotifyInvitee = onDocumentCreated(
  "bookingInvites/{inviteId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const inviteeUid = typeof data["inviteeUid"] === "string"
      ? data["inviteeUid"].trim()
      : "";
    if (!inviteeUid) {
      logger.info("bookingInvites: sem inviteeUid, notificação in-app omitida", {
        inviteId: snap.id,
      });
      return;
    }

    const invitedByName = typeof data["invitedByName"] === "string"
      ? data["invitedByName"].trim()
      : "Um atleta";
    const arenaName = typeof data["arenaName"] === "string"
      ? data["arenaName"].trim()
      : "Arena";
    const date = typeof data["date"] === "string" ? data["date"].trim() : "";
    const startTime = typeof data["startTime"] === "string"
      ? data["startTime"].trim()
      : "";
    const bookingId = typeof data["bookingId"] === "string"
      ? data["bookingId"].trim()
      : "";

    const schedule = [date, startTime].filter(Boolean).join(" · ");
    const body = schedule.length > 0
      ? `${invitedByName} te chamou para ${arenaName} · ${schedule}`
      : `${invitedByName} te chamou para jogar em ${arenaName}`;

    await deliverNotificationToUser({
      userId: inviteeUid,
      title: "Convite para jogar",
      body,
      type: "booking_invite",
      data: {
        inviteId: snap.id,
        bookingId,
        arenaId: String(data["arenaId"] ?? ""),
      },
    });
  }
);
