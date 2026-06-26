import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
  loadUserNotificationPrefs,
} from "./notification-delivery";

const SLOT_VACANCY_NOTIFICATION_TYPE = "slot_vacancy_available";
const CANCELED_STATUSES = new Set(["canceled", "cancelled"]);

export function normalizeBookingStatus(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

/** Transição para cancelado (não era cancelado antes). */
export function isBookingCanceledTransition(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  if (!after) return false;
  const next = normalizeBookingStatus(after["status"]);
  if (!CANCELED_STATUSES.has(next)) return false;
  const prev = normalizeBookingStatus(before?.["status"]);
  return !CANCELED_STATUSES.has(prev);
}

export function parseDateKeyFromBooking(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (trimmed.length >= 10) return trimmed.substring(0, 10);
    return null;
  }
  if (value && typeof value === "object" && "toDate" in value) {
    const d = (value as {toDate: () => Date}).toDate();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

export interface BookingSlotMatch {
  arenaId: string;
  courtId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  arenaName: string;
  canceledByAthleteId: string | null;
}

export function extractBookingSlotMatch(
  booking: Record<string, unknown>
): BookingSlotMatch | null {
  const arenaId = typeof booking["arenaId"] === "string" ? booking["arenaId"].trim() : "";
  const courtId = typeof booking["courtId"] === "string" ? booking["courtId"].trim() : "";
  const dateKey = parseDateKeyFromBooking(booking["date"]);
  if (!arenaId || !courtId || !dateKey) return null;

  const startTime =
    typeof booking["startTime"] === "string" ? booking["startTime"].trim() : "";
  const endTime = typeof booking["endTime"] === "string" ? booking["endTime"].trim() : "";
  const arenaName =
    typeof booking["arenaName"] === "string" && booking["arenaName"].trim().length > 0
      ? booking["arenaName"].trim()
      : "Arena";

  const athleteId =
    typeof booking["athleteId"] === "string" && booking["athleteId"].trim().length > 0
      ? booking["athleteId"].trim()
      : null;

  return {
    arenaId,
    courtId,
    dateKey,
    startTime,
    endTime,
    arenaName,
    canceledByAthleteId: athleteId,
  };
}

function userIdFromAlertPath(path: string): string | null {
  const parts = path.split("/");
  if (parts.length >= 4 && parts[0] === "users" && parts[2] === "slotVacancyAlerts") {
    return parts[1] ?? null;
  }
  return null;
}

function formatDateLabel(dateKey: string): string {
  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function buildSlotsDeepLink(match: BookingSlotMatch): string {
  const params = new URLSearchParams({date: match.dateKey, courtId: match.courtId});
  if (match.startTime) params.set("startTime", match.startTime);
  return `/arena/${match.arenaId}/slots?${params.toString()}`;
}

async function resolveCourtName(arenaId: string, courtId: string): Promise<string> {
  const db = getFirestore();
  const courtDoc = await db
    .collection("arenas")
    .doc(arenaId)
    .collection("courts")
    .doc(courtId)
    .get();
  if (!courtDoc.exists) return "Quadra";
  const name = courtDoc.data()?.["name"];
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  return "Quadra";
}

async function notifySubscriber({
  userId,
  bookingId,
  match,
  courtName,
  alertArenaName,
}: {
  userId: string;
  bookingId: string;
  match: BookingSlotMatch;
  courtName: string;
  alertArenaName?: string;
}): Promise<{sent: number; skipped: boolean}> {
  const db = getFirestore();
  const lockRef = db.doc(`users/${userId}/slotVacancyNotifyLocks/${bookingId}`);

  const lockSnap = await lockRef.get();
  if (lockSnap.exists) {
    return {sent: 0, skipped: true};
  }

  const prefs = await loadUserNotificationPrefs(userId);
  if (!prefs.availableSlotsTopic || !prefs.pushEnabled) {
    await lockRef.set({
      bookingId,
      skippedPrefs: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return {sent: 0, skipped: true};
  }

  const arenaLabel = alertArenaName?.trim() || match.arenaName;
  const timePart =
    match.startTime && match.endTime
      ? `${match.startTime}–${match.endTime}`
      : match.startTime || "";
  const dateLabel = formatDateLabel(match.dateKey);
  const title = "Quadra disponível";
  const body = timePart
    ? `${arenaLabel} · ${courtName} · ${dateLabel} · ${timePart}`
    : `${arenaLabel} · ${courtName} · ${dateLabel}`;

  const result = await deliverNotificationToUser({
    userId,
    title,
    body,
    type: SLOT_VACANCY_NOTIFICATION_TYPE,
    data: {
      url: buildSlotsDeepLink(match),
      arenaId: match.arenaId,
      courtId: match.courtId,
      date: match.dateKey,
      startTime: match.startTime,
      endTime: match.endTime,
      bookingId,
    },
  });

  await lockRef.set({
    bookingId,
    sent: result.sent,
    failed: result.failed,
    notifiedAt: FieldValue.serverTimestamp(),
  });

  return {sent: result.sent, skipped: false};
}

/**
 * Quando uma reserva em `arenaBookings` é cancelada, notifica atletas com alerta
 * ativo em `users/{uid}/slotVacancyAlerts` para a mesma arena/quadra/dia.
 */
export const onArenaBookingCanceledNotifySlotVacancyAlerts = onDocumentUpdated(
  {
    document: "arenaBookings/{bookingId}",
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    const bookingId = event.params.bookingId;
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;

    if (!isBookingCanceledTransition(before, after)) {
      return;
    }

    const match = extractBookingSlotMatch(after ?? {});
    if (!match) {
      logger.warn(
        `slotVacancyAlerts: booking ${bookingId} cancelado sem arenaId/courtId/date válidos`
      );
      return;
    }

    const db = getFirestore();
    const alertsSnap = await db
      .collectionGroup("slotVacancyAlerts")
      .where("arenaId", "==", match.arenaId)
      .where("courtId", "==", match.courtId)
      .where("date", "==", match.dateKey)
      .where("active", "==", true)
      .limit(50)
      .get();

    if (alertsSnap.empty) {
      logger.info(`slotVacancyAlerts: nenhum alerta para ${bookingId}`, match);
      return;
    }

    const courtName = await resolveCourtName(match.arenaId, match.courtId);
    let notified = 0;
    let skipped = 0;

    for (const alertDoc of alertsSnap.docs) {
      const userId = userIdFromAlertPath(alertDoc.ref.path);
      if (!userId) continue;
      if (match.canceledByAthleteId && userId === match.canceledByAthleteId) {
        skipped += 1;
        continue;
      }

      const alertData = alertDoc.data();
      const alertArenaName =
        typeof alertData["arenaName"] === "string" ? alertData["arenaName"] : undefined;

      try {
        const outcome = await notifySubscriber({
          userId,
          bookingId,
          match,
          courtName,
          alertArenaName,
        });
        if (outcome.skipped) {
          skipped += 1;
        } else if (outcome.sent > 0) {
          notified += 1;
        }
      } catch (error) {
        logger.error(
          `slotVacancyAlerts: falha ao notificar ${userId} (booking ${bookingId})`,
          error
        );
      }
    }

    logger.info(`slotVacancyAlerts: booking ${bookingId}`, {
      subscribers: alertsSnap.size,
      notified,
      skipped,
    });
  }
);
