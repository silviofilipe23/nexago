import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {setGlobalOptions} from "firebase-functions";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {createHmac, createHash, randomBytes, timingSafeEqual} from "node:crypto";

import {
  rolesFromClaims,
  hasRoleInClaims,
  callerCanLinkMercadoPago,
  callerIsOrganizer,
  uniqueSortedRoles,
  applyRolesToClaims,
  firestoreRolesPayload,
} from "./auth-roles";
import {
  ARENA_BOOKING_MP_REF_PREFIX,
  processArenaBookingMercadoPagoNotification,
} from "./mercadopago-arena-booking-webhook";
import {recalculateArenaReviewAggregates} from "./arena-review-aggregates";
import {quoteArenaBooking, createArenaBooking} from "./arena-booking-create";
import {
  cancelPendingArenaBookingPayment,
  createArenaBookingPixPayment,
  expirePendingArenaBookingPayments,
  requestArenaWithdrawal,
  listPendingArenaWithdrawals,
  reviewArenaWithdrawal,
} from "./arena-booking-pix";
import {createArenaSubscription, cancelArenaSubscription} from "./arena-subscription";
import {asaasWebhook} from "./asaas-webhook";
import {onArenaBookingCanceledNotifySlotVacancyAlerts} from "./slot-vacancy-alerts";
import {
  sendTournamentPartnerInvite,
  acceptTournamentPartnerInvite,
  cancelTournamentPartnerInvite,
  registerSoloTournament,
  setRegistrationUniform,
} from "./tournament-partner-invite";
import {
  createTournamentRegistrationPixPayment,
  cancelPendingTournamentRegistrationPix,
  confirmFreeTournamentRegistration,
  reserveDirectOrganizerRegistration,
} from "./tournament-registration-pix";
import {onBookingInviteCreatedNotifyInvitee} from "./booking-invite-notify";
import {
  onUserSearchKeywordsSync,
  onTournamentSearchKeywordsSync,
  onLegacyTournamentSearchKeywordsSync,
  onLeagueSearchKeywordsSync,
  onTeamSearchKeywordsSync,
  backfillSearchKeywords,
} from "./search-keywords-sync";
import {
  BOOKING_REMINDER_15M_MINUTES_BEFORE,
  BOOKING_REMINDER_15M_TYPE,
  collectConfirmedAthleteIds,
  parseDateKeyFromBookingDate as parseBookingDateKey,
  sendBooking15mReminderToAthletes,
} from "./arena-booking-reminder-15m";
import {onTournamentMatchCompletedAwardXp} from "./tournament-match-gamification";
import {
  deliverNotificationToUser,
  parseStoredFcmTokens,
} from "./notification-delivery";
import {
  generateCategoryBracket,
  organizerConfirmRegistrationPayment,
  organizerMoveToWaitlist,
  organizerRemoveFromCategory,
  sendCategoryCommunication,
  resendRegistrationPayment,
  closeTournamentRegistrations,
  cancelTournament,
} from "./organizer-category-ops";
import {
  scheduleMatch,
  rescheduleMatch,
  autoScheduleTournamentDay,
  callMatchToCourt,
  releaseMatchAfterCheckIn,
  declareMatchWalkover,
  submitMatchResult,
  validateMatchResult,
  advanceBracketWinner,
  applyLeagueRankingForMatch,
  onTournamentMatchCompletedAdvance,
} from "./organizer-match-ops";
import {deleteOwnAccount} from "./account-deletion";
import {onTournamentInscriptionWriteSyncCollectedCents} from "./tournament-collected-stats";

export {
  onArenaCourtCreatedCountUp,
  onArenaCourtDeletedCountDown,
  backfillArenaCourtsCount,
} from "./arena-courts-count";

export {finalizeLapsedArenaPlans} from "./arena-plan-sweeper";

export {
  setOrganizerPayoutPixKey,
  requestOrganizerWithdrawal,
  listPendingOrganizerWithdrawals,
  reviewOrganizerWithdrawal,
} from "./organizer-withdrawal";

export {
  quoteArenaBooking,
  createArenaBooking,
  cancelPendingArenaBookingPayment,
  createArenaBookingPixPayment,
  expirePendingArenaBookingPayments,
  requestArenaWithdrawal,
  listPendingArenaWithdrawals,
  reviewArenaWithdrawal,
  createArenaSubscription,
  cancelArenaSubscription,
  asaasWebhook,
  onArenaBookingCanceledNotifySlotVacancyAlerts,
  sendTournamentPartnerInvite,
  acceptTournamentPartnerInvite,
  cancelTournamentPartnerInvite,
  registerSoloTournament,
  setRegistrationUniform,
  createTournamentRegistrationPixPayment,
  cancelPendingTournamentRegistrationPix,
  confirmFreeTournamentRegistration,
  reserveDirectOrganizerRegistration,
  onBookingInviteCreatedNotifyInvitee,
  onUserSearchKeywordsSync,
  onTournamentSearchKeywordsSync,
  onLegacyTournamentSearchKeywordsSync,
  onLeagueSearchKeywordsSync,
  onTeamSearchKeywordsSync,
  backfillSearchKeywords,
  onTournamentMatchCompletedAwardXp,
  generateCategoryBracket,
  organizerConfirmRegistrationPayment,
  organizerMoveToWaitlist,
  organizerRemoveFromCategory,
  sendCategoryCommunication,
  resendRegistrationPayment,
  closeTournamentRegistrations,
  cancelTournament,
  scheduleMatch,
  rescheduleMatch,
  autoScheduleTournamentDay,
  callMatchToCourt,
  releaseMatchAfterCheckIn,
  declareMatchWalkover,
  submitMatchResult,
  validateMatchResult,
  advanceBracketWinner,
  applyLeagueRankingForMatch,
  onTournamentMatchCompletedAdvance,
  deleteOwnAccount,
  onTournamentInscriptionWriteSyncCollectedCents,
};

// Initialize Firebase Admin
initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time.
setGlobalOptions({maxInstances: 10});

export const onArenaReviewWriteRecalculateAggregates = recalculateArenaReviewAggregates;

/**
 * Helper function para obter o projectId do Firebase dinamicamente
 * Usa process.env.GCLOUD_PROJECT que é automaticamente definido pelo Firebase
 */
function getFirebaseProjectId(): string {
  // process.env.GCLOUD_PROJECT é automaticamente definido pelo Firebase Functions
  // Retorna o projectId do projeto onde a função está sendo executada
  return process.env.GCLOUD_PROJECT || 'volley-track-2dd3b'; // Fallback para produção
}

// Secret binding for production
const ADMIN_ELEVATE_SECRET = defineSecret("ADMIN_ELEVATE_SECRET");

// Cloudflare Turnstile (captcha) para formulário de contato
const TURNSTILE_SECRET = defineSecret("TURNSTILE_SECRET");

// Mercado Pago (marketplace / split)
const MERCADOPAGO_APP_ID = defineSecret("MERCADOPAGO_APP_ID");
const MERCADOPAGO_APP_SECRET = defineSecret("MERCADOPAGO_APP_SECRET");
const MERCADOPAGO_WEBHOOK_SECRET = defineSecret("MERCADOPAGO_WEBHOOK_SECRET");
const PLATFORM_FEE_FIXED_BRL = defineSecret("PLATFORM_FEE_FIXED_BRL");
const WEB_PUSH_PUBLIC_KEY = defineSecret("WEB_PUSH_PUBLIC_KEY");
const WEB_PUSH_PRIVATE_KEY = defineSecret("WEB_PUSH_PRIVATE_KEY");
const WEB_PUSH_SUBJECT = defineSecret("WEB_PUSH_SUBJECT");

interface StoredWebPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

async function getUserNotificationChannels(
  userId: string
): Promise<{ fcmTokens: string[]; webPushSubscriptions: StoredWebPushSubscription[] }> {
  const db = getFirestore();
  const [tokensSnapshot, webPushSnapshot] = await Promise.all([
    db.collection(`users/${userId}/tokens`).get(),
    db.collection(`users/${userId}/webPushSubscriptions`).get(),
  ]);

  const fcmTokens = parseStoredFcmTokens(tokensSnapshot.docs).map(
    (entry) => entry.token
  );
  const uniqueFcmTokens = Array.from(new Set(fcmTokens));
  const webPushSubscriptions = webPushSnapshot.docs
    .map((doc) => {
      const data = doc.data();
      const endpoint = data["endpoint"];
      const keys = data["keys"];
      if (
        typeof endpoint !== "string" ||
        !keys ||
        typeof keys["p256dh"] !== "string" ||
        typeof keys["auth"] !== "string"
      ) {
        return null;
      }

      return {
        id: doc.id,
        userId,
        endpoint,
        keys: {
          p256dh: keys["p256dh"],
          auth: keys["auth"],
        },
      } as StoredWebPushSubscription;
    })
    .filter((item): item is StoredWebPushSubscription => item !== null);

  return {fcmTokens: uniqueFcmTokens, webPushSubscriptions};
}

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

export {
  setUserRole,
  addUserRole,
  removeUserRole,
  setUserRoles,
  migrateUsersToMultiRole,
} from "./user-role-ops";

/**
 * Recebe mensagem de contato com token Turnstile; valida o captcha e grava em contactMessages.
 */
export const submitContactMessageSecure = onCall(
  {secrets: [TURNSTILE_SECRET]},
  async (request) => {
    try {
      const {name, email, subject, message, captchaToken} = request.data || {};
      if (!name || typeof name !== "string" || !name.trim()) {
        throw new HttpsError("invalid-argument", "Nome é obrigatório.");
      }
      if (!email || typeof email !== "string" || !email.trim()) {
        throw new HttpsError("invalid-argument", "E-mail é obrigatório.");
      }
      if (!subject || typeof subject !== "string" || !subject.trim()) {
        throw new HttpsError("invalid-argument", "Assunto é obrigatório.");
      }
      if (!message || typeof message !== "string" || !message.trim()) {
        throw new HttpsError("invalid-argument", "Mensagem é obrigatória.");
      }
      if (!captchaToken || typeof captchaToken !== "string" || !captchaToken.trim()) {
        throw new HttpsError("invalid-argument", "Validação de segurança (captcha) é obrigatória. Atualize a página e tente novamente.");
      }

      let secret: string;
      try {
        secret = TURNSTILE_SECRET.value() ?? "";
      } catch (e) {
        logger.error("TURNSTILE_SECRET não disponível", e);
        throw new HttpsError("failed-precondition", "Configuração de segurança indisponível. Configure TURNSTILE_SECRET nas Firebase Functions.");
      }
      if (!secret) {
        logger.error("TURNSTILE_SECRET está vazio");
        throw new HttpsError("failed-precondition", "Configuração de segurança indisponível. Configure o secret TURNSTILE_SECRET (ex.: firebase functions:secrets:set TURNSTILE_SECRET).");
      }

      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({secret, response: captchaToken.trim()}).toString()
      });
      if (!verifyRes.ok) {
        const text = await verifyRes.text();
        logger.warn("Turnstile verify request failed", verifyRes.status, text);
        throw new HttpsError("internal", "Não foi possível validar a segurança. Tente novamente.");
      }
      let verifyData: { success?: boolean };
      try {
        verifyData = (await verifyRes.json()) as { success?: boolean };
      } catch (e) {
        logger.error("Turnstile response não é JSON", e);
        throw new HttpsError("internal", "Resposta inválida do serviço de verificação. Tente novamente.");
      }
      if (!verifyData.success) {
        throw new HttpsError("invalid-argument", "Validação de segurança falhou. Tente novamente.");
      }

      const db = getFirestore();
      const docRef = await db.collection("contactMessages").add({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        read: false,
        createdAt: FieldValue.serverTimestamp()
      });
      logger.info("Contact message saved", {messageId: docRef.id});
      return {messageId: docRef.id};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("submitContactMessageSecure error", err);
      const message = err instanceof Error ? err.message : "Erro ao enviar mensagem. Tente novamente.";
      throw new HttpsError("internal", message);
    }
  }
);

export {
  createOrganizer,
  createArena,
  listBackofficeUsers,
  clearMustChangePassword,
  getUserRole,
  setAthletePro,
} from "./user-account-ops";

/**
 * Eleva um usuário para admin em produção via HTTP protegido por segredo.
 * Uso: Enviar requisição HTTP com header 'X-Admin-Secret' e body JSON { uid: string }
 */
export const elevateToAdmin = onRequest({secrets: [ADMIN_ELEVATE_SECRET]}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const providedSecret = req.header("X-Admin-Secret") || "";
    const configuredSecret = ADMIN_ELEVATE_SECRET.value() || "";

    if (!configuredSecret) {
      logger.error("ADMIN_ELEVATE_SECRET não configurado");
      res.status(500).send("Configuração de segredo ausente");
      return;
    }

    if (providedSecret !== configuredSecret) {
      res.status(403).send("Forbidden");
      return;
    }

    const {uid} = req.body || {};
    if (!uid || typeof uid !== "string") {
      res.status(400).send("Body inválido: informe { uid }");
      return;
    }

    const authSvc = getAuth();
    const existing = await authSvc.getUser(uid);
    const prevClaims = (existing.customClaims || {}) as Record<string, unknown>;
    const nextRoles = uniqueSortedRoles([...rolesFromClaims(prevClaims), "admin"]);
    const newClaims = applyRolesToClaims(prevClaims, nextRoles);
    newClaims["superAdmin"] = true;
    await authSvc.setCustomUserClaims(uid, newClaims);

    const db = getFirestore();
    await db.doc(`users/${uid}`).set(firestoreRolesPayload(nextRoles), {merge: true});

    logger.info(`Usuário ${uid} elevado a super admin (custom claims + Firestore)`);
    res.status(200).json({success: true, uid, roles: nextRoles, role: "admin", superAdmin: true});
  } catch (err) {
    logger.error("Falha ao elevar admin:", err);
    res.status(500).send("Erro interno");
  }
});

/**
 * Envia notificação push para um usuário específico
 * Requer autenticação e permissão de admin
 */
export const sendNotification = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const {userId, title, body, data, requireInteraction} = request.data;
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  // Verifica se o caller é admin ou arena (arena pode notificar atletas sobre cancelamento de reserva)
  const callerUser = await getAuth().getUser(callerUid);
  const cc = callerUser.customClaims;
  const canSend =
    hasRoleInClaims(cc, "admin") ||
    hasRoleInClaims(cc, "arena");

  if (!canSend) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas admins e gestores de arena podem enviar notificações");
  }

  if (!userId || !title || !body) {
    throw new HttpsError("invalid-argument", "Parâmetros inválidos: userId, title e body são obrigatórios");
  }

  try {
    const pushData = data ?
      Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as Record<string, string>) :
      {};
    const notificationType =
      typeof pushData.type === "string" ? pushData.type : "general";

    const delivery = await deliverNotificationToUser({
      userId,
      title,
      body,
      type: notificationType,
      data: pushData,
      requireInteraction: !!requireInteraction,
    });

    if (delivery.sent === 0 && delivery.failed === 0) {
      logger.warn(`Nenhum canal de push encontrado para o usuário ${userId}`);
      return {success: false, message: "Usuário não possui inscrições de push registradas"};
    }

    logger.info(`Notificação enviada para ${userId}: ${delivery.sent} sucesso, ${delivery.failed} falhas`);

    return {
      success: delivery.sent > 0,
      sent: delivery.sent,
      failed: delivery.failed,
      total: delivery.sent + delivery.failed,
    };
  } catch (error) {
    logger.error("Erro ao enviar notificação:", error);
    throw new Error("Erro ao enviar notificação");
  }
});

/**
 * Notifica o gestor da arena quando um atleta cria uma reserva.
 *
 * Segurança:
 * - Exige autenticação.
 * - Valida que o caller é o dono da reserva em `arenaBookings/{bookingId}`.
 * - Envia a notificação para `arenas/{arenaId}.managerUserId`.
 */
export const notifyArenaBookingCreated = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const {bookingId} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (!bookingId || typeof bookingId !== "string") {
    throw new HttpsError("invalid-argument", "Parâmetro inválido: bookingId é obrigatório");
  }

  const db = getFirestore();

  const bookingDoc = await db.collection("arenaBookings").doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada");
  }

  const booking = bookingDoc.data() as {
    arenaId?: string;
    courtId?: string;
    athleteId?: string | null;
    date?: string;
    startTime?: string;
    endTime?: string;
  };

  const athleteId = typeof booking?.athleteId === "string" ? booking.athleteId : null;
  const arenaId = booking?.arenaId;

  if (!athleteId) {
    throw new HttpsError("failed-precondition", "Reserva não possui atleta associado");
  }

  if (athleteId !== callerUid) {
    throw new HttpsError("permission-denied", "Você não é o dono desta reserva");
  }

  if (!arenaId || typeof arenaId !== "string") {
    throw new HttpsError("failed-precondition", "Reserva não possui arenaId válido");
  }

  const arenaDoc = await db.collection("arenas").doc(arenaId).get();
  if (!arenaDoc.exists) {
    throw new HttpsError("not-found", "Arena não encontrada");
  }

  const arena = arenaDoc.data() as {
    name?: string;
    managerUserId?: string;
  };

  const arenaName = typeof arena?.name === "string" ? arena.name : "Arena";
  const arenaManagerUserId = typeof arena?.managerUserId === "string" ? arena.managerUserId : null;

  if (!arenaManagerUserId) {
    throw new HttpsError("failed-precondition", "Arena não possui managerUserId válido");
  }

  let formattedDate = typeof booking?.date === "string" ? booking.date : "";
  if (formattedDate) {
    const parsed = new Date(`${formattedDate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      formattedDate = parsed.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
  }

  const startTime = typeof booking?.startTime === "string" ? booking.startTime : "";
  const endTime = typeof booking?.endTime === "string" ? booking.endTime : "";

  const title = "Nova reserva";
  let courtName = "Quadra";
  const courtId = typeof booking?.courtId === "string" ? booking.courtId : "";
  if (courtId) {
    const courtDoc = await db.collection("arenas").doc(arenaId).collection("courts").doc(courtId).get();
    if (courtDoc.exists) {
      const court = courtDoc.data() as {name?: string};
      if (typeof court?.name === "string" && court.name.trim().length > 0) {
        courtName = court.name.trim();
      }
    }
  }
  const body = `Dia ${formattedDate} de  ${startTime} às ${endTime} na quadra ${courtName}.`;

  const notificationType = "arena_booking_created";
  const data: Record<string, string> = {
    type: notificationType,
    url: "/arena/calendar",
    athleteId,
    arenaName,
    date: typeof booking?.date === "string" ? booking.date : "",
    startTime,
    endTime,
  };

  const delivery = await deliverNotificationToUser({
    userId: arenaManagerUserId,
    title,
    body,
    type: notificationType,
    data,
    requireInteraction: true,
  });

  logger.info(
    `Notificação criada para ${arenaManagerUserId}: ${delivery.sent} sucesso, ${delivery.failed} falhas`
  );

  return {
    success: true,
    sent: delivery.sent,
    failed: delivery.failed,
    total: delivery.sent + delivery.failed,
  };
});

/**
 * Envia notificação para múltiplos usuários (ex: todos os participantes de um torneio)
 */
export const sendBulkNotification = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const {userIds, title, body, data, requireInteraction} = request.data;
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new Error("Usuário não autenticado");
  }

  // Verifica se o caller é admin
  const callerUser = await getAuth().getUser(callerUid);
  const isAdmin = callerIsOrganizer(callerUser);

  if (!isAdmin) {
    throw new Error("Permissão negada: apenas admins podem enviar notificações");
  }

  if (!Array.isArray(userIds) || userIds.length === 0 || !title || !body) {
    throw new Error("Parâmetros inválidos: userIds (array), title e body são obrigatórios");
  }

  try {
    const pushData = data ?
      Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as Record<string, string>) :
      {};
    const notificationType =
      typeof pushData.type === "string" ? pushData.type : "general";

    const results = await Promise.allSettled(
      userIds.map((userId: string) =>
        deliverNotificationToUser({
          userId,
          title,
          body,
          type: notificationType,
          data: pushData,
          requireInteraction: !!requireInteraction,
        })
      )
    );

    let sent = 0;
    let failed = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        sent += result.value.sent;
        failed += result.value.failed;
      } else {
        failed += 1;
        logger.warn("sendBulkNotification: falha por usuário", result.reason);
      }
    }

    if (sent === 0 && failed === 0) {
      logger.warn("Nenhum canal de push encontrado para os usuários especificados");
      return {success: false, message: "Nenhuma inscrição de push encontrada"};
    }

    logger.info(`Notificação em massa enviada: ${sent} sucesso, ${failed} falhas`);

    return {
      success: sent > 0,
      sent,
      failed,
      total: userIds.length,
    };
  } catch (error) {
    logger.error("Erro ao enviar notificação em massa:", error);
    throw new Error("Erro ao enviar notificação em massa");
  }
});

/**
 * Cloud Function agendada para enviar lembretes de partidas
 * Executa a cada hora e verifica partidas que começam em 1 hora
 * 
 * Para ativar, configure no Firebase Console:
 * - Cloud Scheduler > Create Job
 * - Schedule: "0 * * * *" (a cada hora)
 * - Target: HTTP
 * - URL: https://us-central1-[PROJECT_ID].cloudfunctions.net/sendMatchReminders
 *   (Substitua [PROJECT_ID] pelo ID do projeto onde a função está deployada)
 */
export const sendMatchReminders = onRequest({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (req, res) => {
  try {
    const db = getFirestore();
    const projectId = getFirebaseProjectId();
    
    // Busca todas as partidas agendadas para as próximas 1-2 horas
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const matchesRef = db.collection(`artifacts/${projectId}/public/data/matches`);
    const matchesSnapshot = await matchesRef
      .where('status', '==', 'Scheduled')
      .where('scheduleTime', '>=', oneHourFromNow)
      .where('scheduleTime', '<=', twoHoursFromNow)
      .get();

    if (matchesSnapshot.empty) {
      logger.info('Nenhuma partida encontrada para lembrete');
      res.status(200).json({ success: true, sent: 0 });
      return;
    }

    let totalSent = 0;
    let totalFailed = 0;

    for (const matchDoc of matchesSnapshot.docs) {
      const match = matchDoc.data();
      const matchId = matchDoc.id;

      // Verifica se já foi enviado lembrete (usando campo sentReminder)
      if (match.sentReminder) {
        continue;
      }

      try {
        // Busca times
        const [teamA, teamB] = await Promise.all([
          db.doc(`artifacts/${projectId}/public/data/teams/${match.teamAId}`).get(),
          db.doc(`artifacts/${projectId}/public/data/teams/${match.teamBId}`).get()
        ]);

        const teamAData = teamA.data();
        const teamBData = teamB.data();

        if (!teamAData || !teamBData) {
          continue;
        }

        // Coleta userIds
        const userIds = new Set<string>();
        if (teamAData.player1Id) userIds.add(teamAData.player1Id);
        if (teamAData.player2Id) userIds.add(teamAData.player2Id);
        if (teamBData.player1Id) userIds.add(teamBData.player1Id);
        if (teamBData.player2Id) userIds.add(teamBData.player2Id);

        if (userIds.size === 0) {
          continue;
        }

        // Formata horário
        const scheduleTime = match.scheduleTime?.toDate() || new Date();
        const timeStr = scheduleTime.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        const teamAName = teamAData.teamName || 'Time A';
        const teamBName = teamBData.teamName || 'Time B';
        const courtName = match.courtName || 'Quadra';

        // Busca nome do torneio
        let tournamentName = 'Torneio';
        try {
          const tournamentDoc = await db.doc(`artifacts/${projectId}/public/data/tournaments/${match.tournamentId}`).get();
          if (tournamentDoc.exists) {
            const tournamentData = tournamentDoc.data();
            tournamentName = tournamentData?.['name'] || 'Torneio';
          }
        } catch (error) {
          logger.warn(`Erro ao buscar nome do torneio ${match.tournamentId}:`, error);
        }

        const title = '⏰ Lembrete: Partida em 1h';
        const pushBody = `${teamAName} vs ${teamBName}\n${courtName} - ${timeStr}`;
        const inboxBody = `${pushBody}\n${tournamentName}`;
        const reminderData = {
          matchId,
          tournamentId: String(match.tournamentId),
          categoryId: String(match.categoryId),
          hoursBefore: '1',
          url: `/admin/tournament/${match.tournamentId}/match/${matchId}/result/${encodeURIComponent(match.categoryId)}`,
        };

        const deliveryResults = await Promise.allSettled(
          Array.from(userIds).map((userId) =>
            deliverNotificationToUser({
              userId,
              title,
              body: inboxBody,
              type: 'match_reminder',
              data: reminderData,
              requireInteraction: false,
            })
          )
        );

        for (const result of deliveryResults) {
          if (result.status === "fulfilled") {
            totalSent += result.value.sent;
            totalFailed += result.value.failed;
          } else {
            totalFailed += 1;
            logger.warn(`sendMatchReminders: falha para partida ${matchId}`, result.reason);
          }
        }

        // Marca que o lembrete foi enviado
        await matchDoc.ref.update({ sentReminder: true });

      } catch (error) {
        logger.error(`Erro ao processar partida ${matchId}:`, error);
        totalFailed++;
      }
    }

    logger.info(`Lembretes enviados: ${totalSent} sucesso, ${totalFailed} falhas`);
    res.status(200).json({ success: true, sent: totalSent, failed: totalFailed });
  } catch (error) {
    logger.error('Erro ao enviar lembretes:', error);
    res.status(500).json({ success: false, error: 'Erro ao enviar lembretes' });
  }
});

// ---------- Mercado Pago (marketplace / split) ----------

const MP_OAUTH_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
const MP_PREFERENCES_URL = "https://api.mercadopago.com/checkout/preferences";
const MP_PAYMENTS_URL = "https://api.mercadopago.com/v1/payments";
/** URL de autorização OAuth (documentação oficial usa auth.mercadopago.com). */
const MP_AUTH_URL = "https://auth.mercadopago.com/authorization";

/** Origens permitidas para callables do Mercado Pago (evita CORS no browser). */
const MP_CORS_ORIGINS = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "https://voleigo.com.br",
  "https://www.voleigo.com.br",
  /^https:\/\/[^/]+\.web\.app$/,
  /^https:\/\/[^/]+\.firebaseapp\.com$/,
];

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildPkcePair(): {codeVerifier: string; codeChallenge: string} {
  // RFC 7636: code_verifier with high entropy and URL-safe characters
  const codeVerifier = toBase64Url(randomBytes(64));
  const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());
  return {codeVerifier, codeChallenge};
}

type MercadoPagoSignature = {ts: string; v1: string};

function parseMercadoPagoSignature(headerValue: string): MercadoPagoSignature | null {
  const raw = (headerValue || "").trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split(",");
  let ts = "";
  let v1 = "";

  for (const part of parts) {
    const [keyRaw, valueRaw] = part.split("=", 2);
    const key = (keyRaw || "").trim();
    const value = (valueRaw || "").trim();
    if (!key || !value) {
      continue;
    }
    if (key === "ts") {
      ts = value;
    } else if (key === "v1") {
      v1 = value.toLowerCase();
    }
  }

  if (!ts || !v1) {
    return null;
  }
  return {ts, v1};
}

function normalizeWebhookDataId(dataId: string): string {
  const normalized = dataId.trim();
  // Conforme guia do Mercado Pago, ids alfanuméricos na URL devem ir em minúsculo.
  if (/^[a-z0-9]+$/i.test(normalized)) {
    return normalized.toLowerCase();
  }
  return normalized;
}

function verifyMercadoPagoWebhookSignature(input: {
  secret: string;
  xSignatureHeader: string;
  xRequestIdHeader: string;
  dataIdFromQuery?: string;
}): boolean {
  const parsed = parseMercadoPagoSignature(input.xSignatureHeader);
  if (!parsed) {
    return false;
  }

  let manifest = "";
  if (input.dataIdFromQuery) {
    manifest += `id:${normalizeWebhookDataId(input.dataIdFromQuery)};`;
  }
  manifest += `request-id:${input.xRequestIdHeader};`;
  manifest += `ts:${parsed.ts};`;

  try {
    const expected = createHmac("sha256", input.secret)
      .update(manifest)
      .digest("hex");

    const expectedBuffer = Buffer.from(expected, "hex");
    const providedBuffer = Buffer.from(parsed.v1, "hex");
    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifica se o organizador já vinculou a conta Mercado Pago (para exibir "Conta vinculada" no perfil).
 */
export const getMercadoPagoStatus = onCall({
  secrets: [MERCADOPAGO_APP_ID],
  cors: MP_CORS_ORIGINS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    return { linked: false };
  }
  const db = getFirestore();
  const snap = await db.doc(`users/${uid}/mercadopago/credentials`).get();
  const data = snap.data();
  return { linked: !!(data?.access_token) };
});

/**
 * Retorna a URL de autorização OAuth do Mercado Pago para o organizador vincular a conta.
 * Redirect URI deve apontar para mercadopagoOAuthCallback (HTTP).
 */
export const getMercadoPagoAuthUrl = onCall({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET],
  cors: MP_CORS_ORIGINS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const callerUser = await getAuth().getUser(uid);
  if (!callerCanLinkMercadoPago(callerUser)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas gestores de arena ou administradores podem vincular Mercado Pago.",
    );
  }
  const payload = (request.data ?? {}) as {redirectTarget?: string};
  const redirectTarget =
    payload.redirectTarget === "app" ? "app" : "web";
  const appId = MERCADOPAGO_APP_ID.value();
  if (!appId) {
    throw new HttpsError("failed-precondition", "MERCADOPAGO_APP_ID não configurado");
  }
  // Log seguro: só mascarado para conferir qual App ID está em uso (nunca logar secret)
  const mask = (s: string) => s.length <= 8 ? "***" : s.slice(0, 4) + "…" + s.slice(-4);
  logger.info(`getMercadoPagoAuthUrl: MERCADOPAGO_APP_ID em uso appIdMasked=${mask(appId)} appIdLength=${appId.length}`);
  const projectId = getFirebaseProjectId();
  const redirectUri = `https://us-central1-${projectId}.cloudfunctions.net/mercadopagoOAuthCallback`;
  const {codeVerifier, codeChallenge} = buildPkcePair();
  const db = getFirestore();
  await db.doc(`users/${uid}/mercadopago/oauthPkce`).set({
    codeVerifier,
    redirectTarget,
    createdAt: FieldValue.serverTimestamp(),
  });
  // Mantém o authorize com parâmetros mínimos para evitar 400 por escopo incompatível.
  const url = `${MP_AUTH_URL}?client_id=${encodeURIComponent(appId)}&response_type=code&platform_id=mp&state=${encodeURIComponent(uid)}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
  return { url };
});

/**
 * Callback OAuth do Mercado Pago: troca code por tokens e grava em users/{managerId}/mercadopago/credentials.
 * Redireciona para o app com ?mp=success ou ?mp=error.
 */
function mercadoPagoOAuthReturnBase(
  redirectTarget: string | undefined,
): string {
  if (redirectTarget === "app") {
    return "nexago://mercadopago";
  }
  return "https://voleigo.com.br/admin/profile";
}

export const mercadopagoOAuthCallback = onRequest({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET],
}, async (req, res) => {
  const projectId = getFirebaseProjectId();
  const code = req.query?.code as string | undefined;
  const state = req.query?.state as string | undefined; // managerId (uid)
  const errorQuery = req.query?.error as string | undefined;
  const db = getFirestore();
  const pkceRef = state ?
    db.doc(`users/${state}/mercadopago/oauthPkce`) :
    null;
  const pkceSnap = pkceRef ? await pkceRef.get() : null;
  const redirectTarget = pkceSnap?.data()?.["redirectTarget"] as string | undefined;
  const returnBase = mercadoPagoOAuthReturnBase(redirectTarget);

  if (errorQuery) {
    logger.warn("Mercado Pago OAuth error:", errorQuery);
    const reason = errorQuery === "access_denied" ? "access_denied" : "oauth_error";
    res.redirect(`${returnBase}?mp=error&reason=${encodeURIComponent(reason)}`);
    return;
  }
  if (!code || !state) {
    res.redirect(`${returnBase}?mp=error&reason=no_code`);
    return;
  }

  const appId = MERCADOPAGO_APP_ID.value();
  const appSecret = MERCADOPAGO_APP_SECRET.value();
  if (!appId || !appSecret) {
    logger.warn(`mercadopagoOAuthCallback: credenciais ausentes hasAppId=${!!appId} hasAppSecret=${!!appSecret}`);
    res.redirect(`${returnBase}?mp=error&reason=config`);
    return;
  }
  // Log seguro: App ID mascarado; Client Secret nunca logado (só comprimento)
  const mask = (s: string) => s.length <= 8 ? "***" : s.slice(0, 4) + "…" + s.slice(-4);
  logger.info(`mercadopagoOAuthCallback: credenciais em uso appIdMasked=${mask(appId)} appIdLength=${appId.length} appSecretLength=${appSecret.length}`);

  const redirectUri = `https://us-central1-${projectId}.cloudfunctions.net/mercadopagoOAuthCallback`;
  if (!pkceRef || !pkceSnap?.exists) {
    logger.warn(`mercadopagoOAuthCallback: PKCE doc ausente para uid=${state}`);
    res.redirect(`${returnBase}?mp=error&reason=pkce_missing`);
    return;
  }
  const codeVerifier = pkceSnap.data()?.["codeVerifier"];
  if (!codeVerifier || typeof codeVerifier !== "string") {
    logger.warn(`mercadopagoOAuthCallback: PKCE ausente para uid=${state}`);
    res.redirect(`${returnBase}?mp=error&reason=pkce_missing`);
    return;
  }
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  try {
    const tokenRes = await fetch(MP_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error("MP OAuth token exchange failed:", tokenRes.status, errText);
      const reason = tokenRes.status === 401 ? "token_failed_invalid_client" : `token_failed_${tokenRes.status}`;
      res.redirect(`${returnBase}?mp=error&reason=${encodeURIComponent(reason)}`);
      return;
    }
    const data = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      public_key?: string;
    };
    const expiresAt = Date.now() + (data.expires_in * 1000);
    await db.doc(`users/${state}/mercadopago/credentials`).set({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      public_key: data.public_key || null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await pkceRef.delete().catch(() => undefined);
    logger.info(`Mercado Pago vinculado para usuário ${state}`);
    res.redirect(`${returnBase}?mp=success`);
  } catch (e) {
    logger.error("mercadopagoOAuthCallback error:", e);
    res.redirect(`${returnBase}?mp=error&reason=exception`);
  }
});

/**
 * Refresh do access_token do organizador usando refresh_token.
 */
async function refreshMercadoPagoToken(managerId: string): Promise<string> {
  const db = getFirestore();
  const docSnap = await db.doc(`users/${managerId}/mercadopago/credentials`).get();
  const creds = docSnap.data();
  if (!creds?.refresh_token) {
    throw new Error("Organizador ainda não vinculou conta Mercado Pago");
  }
  const appId = MERCADOPAGO_APP_ID.value();
  const appSecret = MERCADOPAGO_APP_SECRET.value();
  if (!appId || !appSecret) {
    throw new Error("Configuração Mercado Pago incompleta");
  }
  const tokenRes = await fetch(MP_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "refresh_token",
      refresh_token: String(creds.refresh_token),
    }).toString(),
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    logger.error("MP refresh token failed:", tokenRes.status, errText);
    throw new Error("Falha ao renovar token Mercado Pago");
  }
  const data = await tokenRes.json() as { access_token: string; expires_in: number };
  const expiresAt = Date.now() + (data.expires_in * 1000);
  await db.doc(`users/${managerId}/mercadopago/credentials`).update({
    access_token: data.access_token,
    expires_at: expiresAt,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return data.access_token;
}

/**
 * Cria preferência de pagamento no Mercado Pago (split: organizador recebe, plataforma fica com taxa).
 * amountType: 'share' = parcela (entryFee/2), 'full' = valor total da equipe.
 */
export const createMercadoPagoPreference = onCall({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET, PLATFORM_FEE_FIXED_BRL],
  cors: MP_CORS_ORIGINS,
}, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado");
    }

    const { registrationId, amountType } = request.data as { registrationId?: string; amountType?: "share" | "full" };
    if (!registrationId || !amountType || (amountType !== "share" && amountType !== "full")) {
      throw new HttpsError("invalid-argument", "Parâmetros inválidos: registrationId e amountType ('share' ou 'full') são obrigatórios");
    }

    const projectId = getFirebaseProjectId();
    const db = getFirestore();
    const inscriptionsRef = db.collection(`artifacts/${projectId}/public/data/inscriptions`);
    const registrationSnap = await inscriptionsRef.doc(registrationId).get();
    if (!registrationSnap.exists) {
      throw new HttpsError("not-found", "Inscrição não encontrada");
    }
    const registration = registrationSnap.data()!;
    if (registration.isPaid === true) {
      throw new HttpsError("failed-precondition", "Esta inscrição já foi paga");
    }

    const teamId = registration.teamId as string;
    const tournamentId = registration.tournamentId as string;
    const categoryId = registration.categoryId as string;

    const teamSnap = await db.doc(`artifacts/${projectId}/public/data/teams/${teamId}`).get();
    if (!teamSnap.exists) {
      throw new HttpsError("not-found", "Equipe não encontrada");
    }
    const team = teamSnap.data()!;
    if (team.player1Id !== uid && team.player2Id !== uid) {
      throw new HttpsError("permission-denied", "Você não é um dos atletas desta inscrição");
    }

    // Torneio: tentar root "tournaments" e depois artifacts (compatível com ambos os layouts)
    let tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
    if (!tournamentSnap.exists) {
      tournamentSnap = await db.doc(`artifacts/${projectId}/public/data/tournaments/${tournamentId}`).get();
    }
    if (!tournamentSnap.exists) {
      throw new HttpsError("not-found", "Torneio não encontrado");
    }
    const tournament = tournamentSnap.data()!;
    const managerId = tournament.managerId as string;
    const categories = (tournament.categories || []) as Array<{ categoryName: string; entryFee: number }>;
    const category = categories.find((c: { categoryName: string }) => c.categoryName === categoryId);
    const entryFee = category?.entryFee ?? 0;
    if (entryFee <= 0) {
      throw new HttpsError("failed-precondition", "Categoria sem taxa de inscrição");
    }

    const teamSize = 2; // equipes
    let amount: number;
    if (amountType === "full") {
      amount = entryFee;
    } else {
      amount = Math.round((entryFee / teamSize) * 100) / 100;
    }
    if (amount <= 0) {
      throw new HttpsError("failed-precondition", "Valor a pagar inválido");
    }

    const mpCredsSnap = await db.doc(`users/${managerId}/mercadopago/credentials`).get();
    const mpCreds = mpCredsSnap.data();
    if (!mpCreds?.access_token) {
      throw new HttpsError("failed-precondition", "Organizador ainda não vinculou conta Mercado Pago. O pagamento online estará disponível após a vinculação.");
    }

    let accessToken = mpCreds.access_token as string;
    const expiresAt = mpCreds.expires_at as number | undefined;
    if (expiresAt != null && Date.now() >= expiresAt - 60000) {
      accessToken = await refreshMercadoPagoToken(managerId);
    }

    let platformFeeBrl = 2;
    try {
      const feeVal = PLATFORM_FEE_FIXED_BRL.value();
      if (feeVal != null && feeVal !== "") {
        platformFeeBrl = Number(feeVal) || 2;
      }
    } catch {
      // secret não configurado: usa padrão
    }
    const platformFee = Math.min(platformFeeBrl, amount - 0.01);
    const tournamentName = (tournament.name as string) || "Torneio";
    const title = amountType === "full"
      ? `Inscrição completa - ${tournamentName} - ${categoryId}`
      : `Parcela da inscrição - ${tournamentName} - ${categoryId}`;

    const projectIdForUrl = getFirebaseProjectId();
    const baseUrl = `https://us-central1-${projectIdForUrl}.cloudfunctions.net`;
    const notificationUrl = `${baseUrl}/mercadopagoWebhook`;
    const backSuccess = `https://${projectIdForUrl}.web.app/athlete/register/success?paid=success`;
    const backPending = `https://${projectIdForUrl}.web.app/athlete/register/success?paid=pending`;
    const backFailure = `https://${projectIdForUrl}.web.app/athlete/register/success?paid=failure`;

    // Qualidade da integração MP: items com quantity e unit_price explícitos; back_urls para redirecionar ao concluir
    const unitPrice = Number(amount);
    const preferenceBody = {
      items: [{
        title,
        quantity: 1,
        unit_price: unitPrice,
        currency_id: "BRL",
      }],
      external_reference: registrationId,
      notification_url: notificationUrl,
      back_urls: {
        success: backSuccess,
        pending: backPending,
        failure: backFailure,
      },
      auto_return: "all" as const,
      marketplace_fee: platformFee,
    };

    const prefRes = await fetch(MP_PREFERENCES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    if (!prefRes.ok) {
      const errText = await prefRes.text();
      logger.error("MP create preference failed:", prefRes.status, errText);
      throw new HttpsError("internal", "Não foi possível gerar o link de pagamento. Tente novamente.");
    }
    const prefData = await prefRes.json() as { init_point?: string };
    if (!prefData.init_point) {
      throw new HttpsError("internal", "Resposta inválida do Mercado Pago");
    }
    return { initPoint: prefData.init_point };
  } catch (err) {
    if (err instanceof HttpsError) {
      throw err;
    }
    if (err instanceof Error) {
      logger.warn("createMercadoPagoPreference:", err.message);
      throw new HttpsError("internal", err.message);
    }
    logger.error("createMercadoPagoPreference unexpected error:", err);
    throw new HttpsError("internal", "Erro ao gerar pagamento. Tente novamente.");
  }
});

/**
 * Gera preferência de pagamento Mercado Pago para uma reserva em `arenaBookings`.
 *
 * Entrada: `bookingId`, `userId`, `valor` (deve bater com `amountReais` da reserva).
 * - Valida autenticação e que o atleta é dono da reserva.
 * - Usa o token OAuth do gestor da arena (`arenas/{arenaId}.managerUserId`).
 * - Grava em `arenaBookings/{id}`: `paymentId` (id da preferência MP), `paymentStatus: "pending"`.
 * - Retorna `initPoint` (URL do checkout).
 */
export const createArenaBookingMercadoPagoPayment = onCall({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET, PLATFORM_FEE_FIXED_BRL],
  cors: MP_CORS_ORIGINS,
}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const data = request.data as { bookingId?: string; userId?: string; valor?: number };
  const bookingId = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  const valorRaw = data.valor;

  if (!bookingId) {
    throw new HttpsError("invalid-argument", "bookingId é obrigatório");
  }
  if (!userId || userId !== callerUid) {
    throw new HttpsError("permission-denied", "userId deve ser o usuário autenticado");
  }
  if (typeof valorRaw !== "number" || !Number.isFinite(valorRaw) || valorRaw <= 0) {
    throw new HttpsError("invalid-argument", "valor deve ser um número positivo");
  }

  const db = getFirestore();
  const bookingRef = db.collection("arenaBookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada");
  }

  const booking = bookingSnap.data()!;
  const athleteId = booking.athleteId as string | undefined;
  if (!athleteId || athleteId !== callerUid) {
    throw new HttpsError("permission-denied", "Você não é o titular desta reserva");
  }

  const expectedAmount = Number(booking.amountReais);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    throw new HttpsError("failed-precondition", "Reserva sem valor válido (amountReais)");
  }

  const valor = Math.round(valorRaw * 100) / 100;
  const expected = Math.round(expectedAmount * 100) / 100;
  if (Math.abs(valor - expected) > 0.02) {
    throw new HttpsError(
      "invalid-argument",
      `Valor não confere com a reserva (esperado R$ ${expected.toFixed(2)})`,
    );
  }

  const existingPaymentStatus = (booking.paymentStatus as string | undefined)?.toLowerCase();
  if (existingPaymentStatus === "paid" || existingPaymentStatus === "approved") {
    throw new HttpsError("failed-precondition", "Esta reserva já foi paga");
  }

  const arenaId = booking.arenaId as string | undefined;
  if (!arenaId) {
    throw new HttpsError("failed-precondition", "Reserva sem arenaId");
  }

  const arenaSnap = await db.collection("arenas").doc(arenaId).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada");
  }
  const arena = arenaSnap.data()!;
  const managerId = arena.managerUserId as string | undefined;
  if (!managerId) {
    throw new HttpsError(
      "failed-precondition",
      "Arena sem gestor vinculado; pagamento online indisponível.",
    );
  }

  const mpCredsSnap = await db.doc(`users/${managerId}/mercadopago/credentials`).get();
  const mpCreds = mpCredsSnap.data();
  if (!mpCreds?.access_token) {
    throw new HttpsError(
      "failed-precondition",
      "A arena ainda não configurou recebimento via Mercado Pago.",
    );
  }

  let accessToken = mpCreds.access_token as string;
  const expiresAt = mpCreds.expires_at as number | undefined;
  if (expiresAt != null && Date.now() >= expiresAt - 60000) {
    accessToken = await refreshMercadoPagoToken(managerId);
  }

  let platformFeeBrl = 2;
  try {
    const feeVal = PLATFORM_FEE_FIXED_BRL.value();
    if (feeVal != null && feeVal !== "") {
      platformFeeBrl = Number(feeVal) || 2;
    }
  } catch {
    // secret ausente
  }
  const amount = expected;
  const platformFee = Math.min(platformFeeBrl, amount - 0.01);

  const projectIdForUrl = getFirebaseProjectId();
  const baseUrl = `https://us-central1-${projectIdForUrl}.cloudfunctions.net`;
  const notificationUrl = `${baseUrl}/mercadopagoWebhook`;
  const arenaName = (booking.arenaName as string) || (arena.name as string) || "Arena";
  const courtName = (booking.courtName as string) || "Quadra";
  const dateStr = (booking.date as string) || "";
  const title = `Reserva ${arenaName} — ${courtName}${dateStr ? ` (${dateStr})` : ""}`;

  const webAppHost = `${projectIdForUrl}.web.app`;
  const backSuccess = `https://${webAppHost}/arena/${arenaId}/book/success?paid=success&bookingId=${encodeURIComponent(bookingId)}`;
  const backPending = `https://${webAppHost}/arena/${arenaId}/book/success?paid=pending&bookingId=${encodeURIComponent(bookingId)}`;
  const backFailure = `https://${webAppHost}/arena/${arenaId}/book/success?paid=failure&bookingId=${encodeURIComponent(bookingId)}`;

  const preferenceBody = {
    items: [{
      title,
      quantity: 1,
      unit_price: amount,
      currency_id: "BRL",
    }],
    external_reference: `${ARENA_BOOKING_MP_REF_PREFIX}${bookingId}`,
    notification_url: notificationUrl,
    back_urls: {
      success: backSuccess,
      pending: backPending,
      failure: backFailure,
    },
    auto_return: "all" as const,
    marketplace_fee: platformFee,
  };

  const prefRes = await fetch(MP_PREFERENCES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify(preferenceBody),
  });

  if (!prefRes.ok) {
    const errText = await prefRes.text();
    logger.error("createArenaBookingMercadoPagoPayment MP preference failed:", prefRes.status, errText);
    throw new HttpsError("internal", "Não foi possível gerar o link de pagamento. Tente novamente.");
  }

  const prefData = await prefRes.json() as { id?: string; init_point?: string };
  const mpPreferenceId = prefData.id;
  const initPoint = prefData.init_point;
  if (!mpPreferenceId || !initPoint) {
    throw new HttpsError("internal", "Resposta inválida do Mercado Pago");
  }

  await bookingRef.update({
    paymentId: mpPreferenceId,
    paymentStatus: "pending",
    paymentAmountReais: amount,
    mercadopagoPreferenceCreatedAt: FieldValue.serverTimestamp(),
  });

  return {
    init_point: initPoint,
    preferenceId: mpPreferenceId,
  };
});

/**
 * Webhook Mercado Pago (URL única para preferências e inscrições).
 *
 * - `external_reference` `arenaBooking:{id}`: trata aprovado (booking `confirmed`, slot `booked`) e
 *   rejeitado/cancelado/estorno (libera locks e remove slots); pendente/in_process não marca idempotência.
 * - Demais referências (inscrição em torneio): apenas pagamento `approved` atualiza `paidAmount` / `isPaid`.
 */
export const mercadopagoWebhook = onRequest({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET, MERCADOPAGO_WEBHOOK_SECRET, PLATFORM_FEE_FIXED_BRL],
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const webhookSecret = MERCADOPAGO_WEBHOOK_SECRET.value();
  if (!webhookSecret) {
    logger.error("MERCADOPAGO_WEBHOOK_SECRET não configurado.");
    res.status(500).send("Config error");
    return;
  }

  const xSignature = req.get("x-signature") || "";
  const xRequestId = req.get("x-request-id") || "";
  const rawDataIdQuery = req.query["data.id"];
  const dataIdFromQuery =
    typeof rawDataIdQuery === "string" ? rawDataIdQuery :
      (Array.isArray(rawDataIdQuery) && typeof rawDataIdQuery[0] === "string" ? rawDataIdQuery[0] : undefined);

  if (!xSignature || !xRequestId) {
    logger.warn("Webhook MP sem headers de assinatura obrigatórios.");
    res.status(401).send("Unauthorized");
    return;
  }

  const signatureOk = verifyMercadoPagoWebhookSignature({
    secret: webhookSecret,
    xSignatureHeader: xSignature,
    xRequestIdHeader: xRequestId,
    dataIdFromQuery,
  });
  if (!signatureOk) {
    logger.warn("Webhook MP com assinatura inválida.");
    res.status(401).send("Unauthorized");
    return;
  }

  let body: { type?: string; data?: { id?: string } | string };
  try {
    if (typeof req.body === "string") {
      body = JSON.parse(req.body) as { type?: string; data?: { id?: string } | string };
    } else if (req.body && typeof req.body === "object") {
      body = req.body as { type?: string; data?: { id?: string } | string };
      if (typeof body.data === "string") {
        body.data = JSON.parse(body.data) as { id?: string };
      }
    } else {
      body = {};
    }
  } catch {
    res.status(400).send("Bad Request");
    return;
  }
  const dataObj = body?.data && typeof body.data === "object" ? body.data : undefined;
  if (body?.type !== "payment" || !dataObj?.id) {
    res.status(200).send("OK");
    return;
  }

  const paymentId = String(dataObj.id);
  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  const processedRef = db.doc(`artifacts/${projectId}/public/data/mp_processed_payments/${paymentId}`);
  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
    res.status(200).send("OK");
    return;
  }

  const appId = MERCADOPAGO_APP_ID.value();
  const appSecret = MERCADOPAGO_APP_SECRET.value();
  if (!appId || !appSecret) {
    res.status(500).send("Config error");
    return;
  }

  const tokenRes = await fetch(MP_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "client_credentials",
    }).toString(),
  });
  if (!tokenRes.ok) {
    logger.error("MP client_credentials failed:", await tokenRes.text());
    res.status(500).send("Token error");
    return;
  }
  const tokenData = await tokenRes.json() as { access_token: string };
  const appToken = tokenData.access_token;

  const payRes = await fetch(`${MP_PAYMENTS_URL}/${paymentId}`, {
    headers: { "Authorization": `Bearer ${appToken}` },
  });
  if (!payRes.ok) {
    logger.warn("MP get payment failed:", payRes.status);
    res.status(200).send("OK");
    return;
  }
  const payment = await payRes.json() as {
    status?: string;
    external_reference?: string;
    transaction_amount?: number;
  };

  const externalRef = (payment.external_reference || "").trim();
  if (externalRef.startsWith(ARENA_BOOKING_MP_REF_PREFIX)) {
    await processArenaBookingMercadoPagoNotification(db, paymentId, payment, processedRef);
    res.status(200).send("OK");
    return;
  }

  if (payment.status !== "approved") {
    res.status(200).send("OK");
    return;
  }

  const paymentAmount = Number(payment.transaction_amount) || 0;

  const registrationId = externalRef;
  if (!registrationId || paymentAmount <= 0) {
    res.status(200).send("OK");
    return;
  }

  const registrationRef = db.doc(`artifacts/${projectId}/public/data/inscriptions/${registrationId}`);
  const registrationSnap = await registrationRef.get();
  if (!registrationSnap.exists) {
    res.status(200).send("OK");
    return;
  }

  const regData = registrationSnap.data()!;
  const tournamentId = regData.tournamentId as string;
  const categoryId = regData.categoryId as string;
  let entryFee = 0;
  let tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) {
    tournamentSnap = await db.doc(`artifacts/${projectId}/public/data/tournaments/${tournamentId}`).get();
  }
  if (tournamentSnap.exists) {
    const categories = (tournamentSnap.data()?.categories || []) as Array<{ categoryName: string; entryFee: number }>;
    const cat = categories.find((c: { categoryName: string }) => c.categoryName === categoryId);
    entryFee = cat?.entryFee ?? 0;
  }

  const currentPaid = Number(regData.paidAmount) || 0;
  const newPaidAmount = Math.round((currentPaid + paymentAmount) * 100) / 100;
  const reachedFullAmount = entryFee > 0 && newPaidAmount >= entryFee - 0.01;
  const isPaid = reachedFullAmount ? true : (regData.isPaid === true);

  await registrationRef.update({
    paidAmount: newPaidAmount,
    isPaid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await processedRef.set({ registrationId, processedAt: FieldValue.serverTimestamp() });

  logger.info(`MP webhook: registration ${registrationId} paidAmount=${newPaidAmount} isPaid=${isPaid}`);
  res.status(200).send("OK");
});

/**
 * Vincula perfil do usuário autenticado com unicidade forte de e-mail.
 * Usa doc de reserva em userEmails/{normalizedEmail} para impedir duplicidade entre UIDs.
 */
export const linkAuthenticatedUserProfile = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const rawEmail = request.data?.email;
  if (typeof rawEmail !== "string" || !rawEmail.trim()) {
    throw new HttpsError("invalid-argument", "E-mail inválido para vincular perfil.");
  }

  const normalizedEmail = normalizeEmail(rawEmail);
  const fullName = typeof request.data?.fullName === "string" ? request.data.fullName.trim() : "";
  const profilePhotoUrl = typeof request.data?.profilePhotoUrl === "string" ? request.data.profilePhotoUrl.trim() : "";

  const db = getFirestore();
  const usersByEmailSnapshot = await db
    .collection("users")
    .where("email", "==", normalizedEmail)
    .get();

  const matchingUids = Array.from(new Set(usersByEmailSnapshot.docs.map((item) => item.id)));
  const foreignMatches = matchingUids.filter((uid) => uid !== callerUid);

  if (foreignMatches.length > 1) {
    throw new HttpsError(
      "failed-precondition",
      "Foram encontrados perfis duplicados com o mesmo e-mail. Contate o suporte para saneamento."
    );
  }

  const userRef = db.doc(`users/${callerUid}`);
  const emailLockRef = db.doc(`userEmails/${normalizedEmail}`);
  const legacyUid = foreignMatches.length === 1 ? foreignMatches[0] : null;
  const legacyRef = legacyUid ? db.doc(`users/${legacyUid}`) : null;

  let mergedFromLegacy = false;
  try {
    await db.runTransaction(async (tx) => {
      const docsToRead = [tx.get(emailLockRef), tx.get(userRef)];
      if (legacyRef) {
        docsToRead.push(tx.get(legacyRef));
      }
      const [lockSnap, userSnap, legacySnap] = await Promise.all(docsToRead);

      if (lockSnap.exists) {
        const lockUid = lockSnap.get("uid");
        const canTakeOverLegacyLock = !!(legacyUid && typeof lockUid === "string" && lockUid === legacyUid);
        if (typeof lockUid === "string" && lockUid && lockUid !== callerUid && !canTakeOverLegacyLock) {
          throw new HttpsError(
            "already-exists",
            "Este e-mail já está em uso por outro usuário."
          );
        }
      }

      const userData = userSnap.exists ? userSnap.data() || {} : {};
      const nextPayload: Record<string, unknown> = {
        email: normalizedEmail,
        role: typeof userData["role"] === "string" ? userData["role"] : "athlete",
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!userSnap.exists || !userData["createdAt"]) {
        nextPayload["createdAt"] = FieldValue.serverTimestamp();
      }

      if (!userData["historicalPoints"]) {
        nextPayload["historicalPoints"] = 0;
      }
      if (userData["isProfileComplete"] === undefined) {
        nextPayload["isProfileComplete"] = false;
      }

      if (fullName && !userData["fullName"]) {
        nextPayload["fullName"] = fullName;
      }
      if (profilePhotoUrl && !userData["profilePhotoUrl"]) {
        nextPayload["profilePhotoUrl"] = profilePhotoUrl;
      }

      if (legacyUid && legacySnap?.exists) {
        mergedFromLegacy = true;
        const legacyData = legacySnap.data() || {};
        const mergedPayload: Record<string, unknown> = {
          ...legacyData,
          ...nextPayload,
          email: normalizedEmail,
          role: typeof nextPayload["role"] === "string" ? nextPayload["role"] : (legacyData["role"] || "athlete"),
          updatedAt: FieldValue.serverTimestamp(),
        };
        delete mergedPayload["uid"];
        delete mergedPayload["mergedInto"];
        tx.set(userRef, mergedPayload, {merge: true});
        tx.set(legacyRef!, {
          mergedInto: callerUid,
          email: FieldValue.delete(),
          partnerInviteStatus: "accepted",
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      } else {
        tx.set(userRef, nextPayload, {merge: true});
      }

      tx.set(emailLockRef, {
        uid: callerUid,
        email: normalizedEmail,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: lockSnap.exists ? lockSnap.get("createdAt") || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      }, {merge: true});
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Erro ao vincular perfil autenticado com unicidade de e-mail:", error);
    throw new HttpsError("internal", "Não foi possível vincular o perfil do usuário.");
  }

  let migratedTeams = 0;
  if (legacyUid) {
    try {
      const teamsRef = db.collection(`artifacts/${getFirebaseProjectId()}/public/data/teams`);
      const [player1Snap, player2Snap] = await Promise.all([
        teamsRef.where("player1Id", "==", legacyUid).get(),
        teamsRef.where("player2Id", "==", legacyUid).get(),
      ]);

      const updatesByDocId = new Map<string, Record<string, unknown>>();
      player1Snap.docs.forEach((teamDoc) => {
        const current = updatesByDocId.get(teamDoc.id) || {};
        current["player1Id"] = callerUid;
        updatesByDocId.set(teamDoc.id, current);
      });
      player2Snap.docs.forEach((teamDoc) => {
        const current = updatesByDocId.get(teamDoc.id) || {};
        current["player2Id"] = callerUid;
        updatesByDocId.set(teamDoc.id, current);
      });

      if (updatesByDocId.size > 0) {
        const batch = db.batch();
        updatesByDocId.forEach((payload, docId) => {
          batch.update(teamsRef.doc(docId), {
            ...payload,
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        await batch.commit();
        migratedTeams = updatesByDocId.size;
      }
    } catch (error) {
      logger.error("Erro ao migrar playerId legado nas equipes:", {legacyUid, callerUid, error});
      throw new HttpsError(
        "internal",
        "Perfil vinculado, mas não foi possível migrar as inscrições/equipes automaticamente."
      );
    }
  }

  return {
    success: true,
    email: normalizedEmail,
    uid: callerUid,
    mergedFromLegacy,
    legacyUid: legacyUid || null,
    migratedTeams,
  };
});



function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}