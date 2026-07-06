import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";

import {
  BOOKING_REMINDER_15M_MINUTES_BEFORE,
  BOOKING_REMINDER_15M_TYPE,
  collectConfirmedAthleteIds,
  parseDateKeyFromBookingDate as parseBookingDateKey,
  sendBooking15mReminderToAthletes,
} from "./arena-booking-reminder-15m";
import {getFirebaseProjectId} from "./firebase-paths";
import {
  deliverNotificationToUser,
  getUserNotificationChannels,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";

const ARENA_REMINDER_HOURS_BEFORE = 1;
const ARENA_REMINDER_WINDOW_MIN = 55;
const ARENA_REMINDER_WINDOW_MAX = 65;
const ATTENDANCE_REMINDER_2H_MINUTES_BEFORE = 120;
const ATTENDANCE_REMINDER_2H_WINDOW_MIN = 115;
const ATTENDANCE_REMINDER_2H_WINDOW_MAX = 125;
const ATTENDANCE_REMINDER_30M_MINUTES_BEFORE = 30;
const ATTENDANCE_REMINDER_30M_WINDOW_MIN = 25;
const ATTENDANCE_REMINDER_30M_WINDOW_MAX = 35;
const ATTENDANCE_NO_SHOW_TOLERANCE_MINUTES = 30;
const ARENA_TIMEZONE_OFFSET = "-03:00";
const ARENA_REMINDER_TYPE = "arena_booking_1h_reminder";
const ATTENDANCE_REMINDER_2H_TYPE = "attendance_confirm_2h_reminder";
const ATTENDANCE_REMINDER_30M_TYPE = "attendance_confirm_30m_reminder";

function dateKeyAtOffset(date: Date, offsetHours: number): string {
  const shifted = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T00:00:00${ARENA_TIMEZONE_OFFSET}`);
  if (Number.isNaN(base.getTime())) return dateKey;
  base.setUTCDate(base.getUTCDate() + days);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function bookingStartAt(dateKey: string, startTime: string): Date | null {
  if (!dateKey || !startTime) return null;
  const hhmm = startTime.trim().slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const dt = new Date(`${dateKey}T${hhmm}:00${ARENA_TIMEZONE_OFFSET}`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
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

/**
 * Ao criar booking, calcula e grava o horário do lembrete (15 min antes).
 */
export const prepareArenaBookingReminder15m = onDocumentCreated("arenaBookings/{bookingId}", async (event) => {
  const snap = event.data;
  if (!snap?.exists) return;
  const booking = snap.data() as {[k: string]: unknown};

  const dateKey = parseDateKeyFromBookingDate(booking["date"]);
  const startTime = typeof booking["startTime"] === "string" ? booking["startTime"].trim() : "";
  const startAt = dateKey && startTime ? bookingStartAt(dateKey, startTime) : null;
  if (!startAt) {
    logger.warn("prepareArenaBookingReminder15m: booking sem data/hora válidas", {bookingId: snap.id});
    return;
  }

  const reminderAt = new Date(startAt.getTime() - BOOKING_REMINDER_15M_MINUTES_BEFORE * 60 * 1000);
  await snap.ref.set({
    reminder15mAt: Timestamp.fromDate(reminderAt),
    reminder15mPreparedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
});

/**
 * Executa a cada minuto e envia push FCM para bookings próximos (15 min antes).
 */
export const sendArenaBookingReminders15m = onSchedule({
  schedule: "every 1 minutes",
  timeZone: "America/Sao_Paulo",
}, async () => {
  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const reminderLocksRef = db.collection(`artifacts/${projectId}/public/data/arenaBookingReminders15m`);

  const nowTs = Timestamp.now();
  const now = new Date();

  const bookingsSnap = await db
    .collection("arenaBookings")
    .where("reminder15mAt", "<=", nowTs)
    .limit(200)
    .get();

  if (bookingsSnap.empty) {
    logger.info("sendArenaBookingReminders15m: nenhuma reserva elegível");
    return;
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const bookingDoc of bookingsSnap.docs) {
    const booking = bookingDoc.data() as Record<string, unknown>;
    const status = typeof booking["status"] === "string" ? booking["status"].toLowerCase() : "";
    if (status && status !== "booked" && status !== "active" && status !== "confirmed") {
      skipped += 1;
      continue;
    }

    const dateKey = parseBookingDateKey(booking["date"]);
    const startTime = typeof booking["startTime"] === "string" ? booking["startTime"].trim() : "";

    if (!dateKey || !startTime) {
      skipped += 1;
      continue;
    }

    const startAt = bookingStartAt(dateKey, startTime);
    if (!startAt) {
      skipped += 1;
      continue;
    }

    const minutesToStart = Math.round((startAt.getTime() - now.getTime()) / (60 * 1000));
    if (minutesToStart < 0) {
      skipped += 1;
      continue;
    }

    const recipientIds = await collectConfirmedAthleteIds(booking, bookingDoc.id, db);
    if (recipientIds.length === 0) {
      skipped += 1;
      continue;
    }

    const lockRef = reminderLocksRef.doc(`${bookingDoc.id}_15m`);
    const lockAcquired = await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        return false;
      }
      tx.set(lockRef, {
        bookingId: bookingDoc.id,
        recipientCount: recipientIds.length,
        recipientIds,
        type: BOOKING_REMINDER_15M_TYPE,
        createdAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (!lockAcquired) {
      skipped += 1;
      continue;
    }

    try {
      const result = await sendBooking15mReminderToAthletes(
        bookingDoc.id,
        booking,
        recipientIds
      );

      sent += result.sent;
      failed += result.failed;

      await bookingDoc.ref.set({
        reminder15mSentAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      await lockRef.set({
        sentAt: FieldValue.serverTimestamp(),
        sent: result.sent,
        failed: result.failed,
        inboxWritten: result.inboxWritten,
        recipientCount: recipientIds.length,
      }, {merge: true});
    } catch (error) {
      failed += 1;
      logger.error(`sendArenaBookingReminders15m: erro ao enviar booking ${bookingDoc.id}`, error);
      await lockRef.delete().catch(() => undefined);
    }
  }

  logger.info("sendArenaBookingReminders15m: ciclo concluído", {sent, skipped, failed});
});

export const sendArenaBookingReminders = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "America/Sao_Paulo",
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const remindersRef = db.collection(`artifacts/${projectId}/public/data/arenaBookingReminders`);

  const now = new Date();
  const todayKey = dateKeyAtOffset(now, -3);
  const tomorrowKey = addDaysToDateKey(todayKey, 1);

  const bookingsSnap = await db
    .collection("arenaBookings")
    .where("date", "in", [todayKey, tomorrowKey])
    .get();

  if (bookingsSnap.empty) {
    logger.info("arena booking reminder: nenhuma reserva encontrada no intervalo de datas");
    return;
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const bookingDoc of bookingsSnap.docs) {
    const booking = bookingDoc.data() as {
      athleteId?: string;
      arenaId?: string;
      arenaName?: string;
      courtName?: string;
      date?: string;
      startTime?: string;
      endTime?: string;
      status?: string;
      attendanceStatus?: string;
      attendanceConfirmed?: boolean;
    };

    const status = (booking.status || "").toLowerCase();
    if (status && status !== "active" && status !== "confirmed") {
      skipped += 1;
      continue;
    }

    const athleteId = (booking.athleteId || "").trim();
    const dateKey = (booking.date || "").trim();
    const startTime = (booking.startTime || "").trim();
    if (!athleteId || !dateKey || !startTime) {
      skipped += 1;
      continue;
    }

    const startAt = bookingStartAt(dateKey, startTime);
    if (!startAt) {
      skipped += 1;
      continue;
    }

    const minutesToStart = (startAt.getTime() - now.getTime()) / (60 * 1000);
    const attendanceStatus = (booking.attendanceStatus || "pending").toLowerCase().trim();
    const attendanceConfirmed = booking.attendanceConfirmed === true;

    if (
      !attendanceConfirmed &&
      attendanceStatus !== "checked_in" &&
      attendanceStatus !== "no_show"
    ) {
      const minutesSinceStart = (now.getTime() - startAt.getTime()) / (60 * 1000);
      if (minutesSinceStart >= ATTENDANCE_NO_SHOW_TOLERANCE_MINUTES) {
        await bookingDoc.ref.set({
          attendanceStatus: "no_show",
          noShowMarkedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        continue;
      }
    }

    if (minutesToStart < ARENA_REMINDER_WINDOW_MIN || minutesToStart > ARENA_REMINDER_WINDOW_MAX) {
      // segue fluxo para lembretes de presença (2h e 30min), mesmo fora da janela de 1h.
    } else {
      const reminderId = `${bookingDoc.id}_${ARENA_REMINDER_HOURS_BEFORE}h`;
      const reminderDocRef = remindersRef.doc(reminderId);
      const lockAcquired = await db.runTransaction(async (tx) => {
        const snap = await tx.get(reminderDocRef);
        if (snap.exists) {
          return false;
        }
        tx.set(reminderDocRef, {
          bookingId: bookingDoc.id,
          athleteId,
          type: ARENA_REMINDER_TYPE,
          createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (lockAcquired) {
        try {
          const {fcmTokens, webPushSubscriptions} = await getUserNotificationChannels(athleteId);
          if (fcmTokens.length === 0 && webPushSubscriptions.length === 0) {
            await reminderDocRef.set({
              sentAt: FieldValue.serverTimestamp(),
              sent: 0,
              failed: 0,
              skippedNoChannel: true,
            }, {merge: true});
            skipped += 1;
          } else {
            const title = "Seu jogo está chegando! Confirme sua presença";
            const body = "Seu jogo começa em 1 hora";
            const courtName = (booking.courtName || "Quadra").trim();
            const arenaName = (booking.arenaName || "Arena").trim();
            const endTime = (booking.endTime || "").trim();
            const inboxBody =
              `${body}\n${arenaName} · ${courtName}\n${startTime}${endTime ? ` - ${endTime}` : ""}`;

            const delivery = await deliverNotificationToUser({
              userId: athleteId,
              title,
              body: inboxBody,
              type: ARENA_REMINDER_TYPE,
              data: {
                type: ARENA_REMINDER_TYPE,
                bookingId: bookingDoc.id,
                arenaId: String(booking.arenaId || ""),
                date: dateKey,
                startTime,
                endTime,
                hoursBefore: String(ARENA_REMINDER_HOURS_BEFORE),
              },
              requireInteraction: false,
            });

            sent += delivery.sent;
            failed += delivery.failed;

            await reminderDocRef.set({
              sentAt: FieldValue.serverTimestamp(),
              sent: delivery.sent,
              failed: delivery.failed,
            }, {merge: true});
          }
        } catch (error) {
          failed += 1;
          logger.error(`arena booking reminder: erro ao enviar para booking ${bookingDoc.id}`, error);
          await reminderDocRef.delete().catch(() => undefined);
        }
      } else {
        skipped += 1;
      }
    }

    const shouldSend2h = !attendanceConfirmed &&
      attendanceStatus !== "checked_in" &&
      attendanceStatus !== "no_show" &&
      minutesToStart >= ATTENDANCE_REMINDER_2H_WINDOW_MIN &&
      minutesToStart <= ATTENDANCE_REMINDER_2H_WINDOW_MAX;
    const shouldSend30m = !attendanceConfirmed &&
      attendanceStatus !== "checked_in" &&
      attendanceStatus !== "no_show" &&
      minutesToStart >= ATTENDANCE_REMINDER_30M_WINDOW_MIN &&
      minutesToStart <= ATTENDANCE_REMINDER_30M_WINDOW_MAX;

    if (shouldSend2h || shouldSend30m) {
      const reminderKey = shouldSend2h ? "attendance_2h" : "attendance_30m";
      const reminderType = shouldSend2h ? ATTENDANCE_REMINDER_2H_TYPE : ATTENDANCE_REMINDER_30M_TYPE;
      const title = shouldSend2h ?
        "🔥 Seu jogo está chegando! Confirme sua presença" :
        "⚠️ Última chance de confirmar";
      const body = shouldSend2h ?
        "Confirme agora sua presença para garantir sua prioridade no jogo." :
        "Faltam 30 minutos. Confirme sua presença agora.";
      const lockRef = remindersRef.doc(`${bookingDoc.id}_${reminderKey}`);
      const lockAcquired = await db.runTransaction(async (tx) => {
        const snap = await tx.get(lockRef);
        if (snap.exists) return false;
        tx.set(lockRef, {
          bookingId: bookingDoc.id,
          athleteId,
          type: reminderType,
          createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (!lockAcquired) continue;
      try {
        await deliverNotificationToUser({
          userId: athleteId,
          title,
          body,
          type: reminderType,
          data: {
            bookingId: bookingDoc.id,
            arenaId: String(booking.arenaId || ""),
            date: dateKey,
            startTime,
            minutesBefore: String(
              shouldSend2h ?
                ATTENDANCE_REMINDER_2H_MINUTES_BEFORE :
                ATTENDANCE_REMINDER_30M_MINUTES_BEFORE
            ),
          },
          requireInteraction: false,
        });
        await bookingDoc.ref.set({
          [shouldSend2h ? "attendanceReminder2hSentAt" : "attendanceReminder30mSentAt"]:
            FieldValue.serverTimestamp(),
        }, {merge: true});
      } catch (error) {
        logger.error(`attendance reminder: erro no booking ${bookingDoc.id}`, error);
        await lockRef.delete().catch(() => undefined);
      }
    }
  }

  logger.info("arena booking reminder: ciclo concluído", {sent, skipped, failed});
});
