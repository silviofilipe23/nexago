import {Firestore, Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  deliverNotificationToUser,
  loadUserNotificationPrefs,
} from "./notification-delivery";

export const BOOKING_REMINDER_15M_TYPE = "arena_booking_15m_reminder";
export const BOOKING_REMINDER_15M_MINUTES_BEFORE = 15;
const MAX_RECIPIENTS_PER_BOOKING = 10;

const ARENA_TIMEZONE_OFFSET = "-03:00";

const GUEST_ID_FIELDS = [
  "guestAthleteId",
  "guestUserId",
  "partnerAthleteId",
  "partnerUserId",
  "secondAthleteId",
  "invitedAthleteId",
] as const;

const ATHLETE_ARRAY_FIELDS = [
  "confirmedAthletes",
  "participants",
  "attendees",
  "guests",
  "players",
] as const;

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function addUid(ids: Set<string>, value: unknown): void {
  const uid = pickString(value);
  if (uid) ids.add(uid);
}

function parseDateKeyFromBookingDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (trimmed.length >= 10) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        const y = parsed.getUTCFullYear();
        const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
        const d = String(parsed.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }
    return null;
  }
  if (value instanceof Timestamp) {
    const d = value.toDate();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

function bookingOwnerUserId(booking: Record<string, unknown>): string {
  return pickString(booking["bookingAthleteId"]) ?? pickString(booking["athleteId"]) ?? "";
}

/**
 * Coleta UIDs do documento da reserva (sem convites Firestore). Exportada para testes.
 */
export function collectConfirmedAthleteIdsFromBookingData(
  booking: Record<string, unknown>
): string[] {
  const ids = new Set<string>();

  addUid(ids, booking["bookingAthleteId"]);
  addUid(ids, booking["athleteId"]);

  for (const key of GUEST_ID_FIELDS) {
    addUid(ids, booking[key]);
  }

  for (const key of ATHLETE_ARRAY_FIELDS) {
    const raw = booking[key];
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      if (typeof entry === "string") {
        const t = entry.trim();
        if (t.includes(" ")) continue;
        addUid(ids, t);
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      const map = entry as Record<string, unknown>;
      addUid(ids, map["userId"]);
      addUid(ids, map["uid"]);
      addUid(ids, map["athleteId"]);
    }
  }

  return Array.from(ids);
}

async function loadAcceptedInviteeUids(
  db: Firestore,
  bookingId: string
): Promise<string[]> {
  const snap = await db
    .collection("bookingInvites")
    .where("bookingId", "==", bookingId)
    .where("status", "==", "accepted")
    .limit(10)
    .get();

  const uids: string[] = [];
  for (const doc of snap.docs) {
    const acceptedBy = pickString(doc.data()["acceptedByUid"]);
    if (acceptedBy) uids.push(acceptedBy);
  }
  return uids;
}

/**
 * Todos os atletas confirmados na reserva (titular, convidados, arrays, convites aceitos).
 */
export async function collectConfirmedAthleteIds(
  booking: Record<string, unknown>,
  bookingId: string,
  db: Firestore
): Promise<string[]> {
  const ids = new Set(collectConfirmedAthleteIdsFromBookingData(booking));

  if (bookingId.trim()) {
    const fromInvites = await loadAcceptedInviteeUids(db, bookingId);
    for (const uid of fromInvites) {
      ids.add(uid);
    }
  }

  const list = Array.from(ids);
  if (list.length > MAX_RECIPIENTS_PER_BOOKING) {
    logger.warn("collectConfirmedAthleteIds: limite de destinatários", {
      bookingId,
      count: list.length,
    });
    return list.slice(0, MAX_RECIPIENTS_PER_BOOKING);
  }
  return list;
}

export function buildBooking15mReminderBody(booking: Record<string, unknown>): string {
  const arenaName = pickString(booking["arenaName"]) ?? "Arena";
  const courtName = pickString(booking["courtName"]) ?? pickString(booking["court"]);
  const startTime = pickString(booking["startTime"]) ?? "";
  const dateKey = parseDateKeyFromBookingDate(booking["date"]);

  const parts: string[] = [arenaName];
  if (courtName) parts.push(courtName);

  if (dateKey && startTime) {
    const startAt = new Date(`${dateKey}T${startTime.slice(0, 5)}:00${ARENA_TIMEZONE_OFFSET}`);
    if (!Number.isNaN(startAt.getTime())) {
      const now = new Date();
      const todayKey = formatDateKeyAtOffset(now, -3);
      const bookingDayKey = dateKey;
      const timeLabel = startTime.slice(0, 5);
      if (bookingDayKey === todayKey) {
        parts.push(`Hoje às ${timeLabel}`);
      } else {
        const [, m, d] = bookingDayKey.split("-");
        parts.push(`${d}/${m} às ${timeLabel}`);
      }
    } else {
      parts.push(startTime.slice(0, 5));
    }
  } else if (startTime) {
    parts.push(startTime.slice(0, 5));
  }

  return parts.join(" • ");
}

function formatDateKeyAtOffset(date: Date, offsetHours: number): string {
  const shifted = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function sendBooking15mReminderToAthletes(
  bookingId: string,
  booking: Record<string, unknown>,
  recipientIds: string[]
): Promise<{sent: number; failed: number; inboxWritten: number}> {
  const title = "Reserva começa em 15 min";
  const body = buildBooking15mReminderBody(booking);
  const dateKey = parseDateKeyFromBookingDate(booking["date"]) ?? "";
  const startTime = pickString(booking["startTime"]) ?? "";
  const arenaId = pickString(booking["arenaId"]) ?? "";
  const courtName = pickString(booking["courtName"]) ?? pickString(booking["court"]) ?? "";

  const data: Record<string, string> = {
    bookingId,
    arenaId,
    date: dateKey,
    startTime,
    courtName,
    minutesBefore: String(BOOKING_REMINDER_15M_MINUTES_BEFORE),
  };

  let sent = 0;
  let failed = 0;
  let inboxWritten = 0;

  for (const userId of recipientIds) {
    try {
      const prefs = await loadUserNotificationPrefs(userId);
      const skipPush = !prefs.pushEnabled || !prefs.bookingsAndGamesTopic;

      const result = await deliverNotificationToUser({
        userId,
        title,
        body,
        type: BOOKING_REMINDER_15M_TYPE,
        data,
        requireInteraction: true,
        skipPush,
      });

      sent += result.sent;
      failed += result.failed;
      inboxWritten += 1;
    } catch (error) {
      failed += 1;
      logger.warn("sendBooking15mReminderToAthletes: falha para atleta", {
        bookingId,
        userId,
        error,
      });
    }
  }

  return {sent, failed, inboxWritten};
}

export {bookingOwnerUserId, parseDateKeyFromBookingDate};
