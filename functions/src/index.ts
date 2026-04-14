import {initializeApp} from "firebase-admin/app";
import {getAuth, type UserRecord} from "firebase-admin/auth";
import {setGlobalOptions} from "firebase-functions";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import webpush, {PushSubscription} from "web-push";
import {createHmac, createHash, randomBytes, timingSafeEqual} from "node:crypto";

import {
  type AppRole,
  rolesFromClaims,
  hasRoleInClaims,
  callerIsOrganizer,
  callerIsSuperAdmin,
  uniqueSortedRoles,
  applyRolesToClaims,
  firestoreRolesPayload,
  isAllowedRole,
} from "./auth-roles";
import {
  ARENA_BOOKING_MP_REF_PREFIX,
  processArenaBookingMercadoPagoNotification,
} from "./mercadopago-arena-booking-webhook";

// Initialize Firebase Admin
initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time.
setGlobalOptions({maxInstances: 10});

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

let webPushConfigured = false;

function configureWebPushIfPossible(): boolean {
  if (webPushConfigured) {
    return true;
  }

  try {
    const publicKey = WEB_PUSH_PUBLIC_KEY.value();
    const privateKey = WEB_PUSH_PRIVATE_KEY.value();
    const subject = WEB_PUSH_SUBJECT.value() || "mailto:suporte@voleigo.com.br";
    if (!publicKey || !privateKey) {
      logger.warn("WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY não configuradas.");
      return false;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    webPushConfigured = true;
    return true;
  } catch (error) {
    logger.warn("Não foi possível configurar Web Push.", error);
    return false;
  }
}

async function getUserNotificationChannels(
  userId: string
): Promise<{ fcmTokens: string[]; webPushSubscriptions: StoredWebPushSubscription[] }> {
  const db = getFirestore();
  const [tokensSnapshot, webPushSnapshot] = await Promise.all([
    db.collection(`users/${userId}/tokens`).get(),
    db.collection(`users/${userId}/webPushSubscriptions`).get(),
  ]);

  const fcmTokens = tokensSnapshot.docs
    .map((doc) => {
      const data = doc.data();
      const token = data["token"];
      if (typeof token === "string" && token.trim().length > 0) {
        return token.trim();
      }
      // Compatibilidade com modelo legado onde o doc.id era o próprio token.
      return doc.id;
    })
    .filter((token) => token.length > 0);
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

  return {fcmTokens, webPushSubscriptions};
}

const ARENA_REMINDER_HOURS_BEFORE = 1;
const ARENA_REMINDER_WINDOW_MIN = 55;
const ARENA_REMINDER_WINDOW_MAX = 65;
const ARENA_TIMEZONE_OFFSET = "-03:00";
const ARENA_REMINDER_TYPE = "arena_booking_1h_reminder";

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

const BOOKING_REMINDER_15M_TYPE = "arena_booking_15m_reminder";
const BOOKING_REMINDER_15M_MINUTES_BEFORE = 15;

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

function bookingAthleteUserId(booking: {[k: string]: unknown}): string {
  const bookingAthleteId = booking["bookingAthleteId"];
  if (typeof bookingAthleteId === "string" && bookingAthleteId.trim().length > 0) {
    return bookingAthleteId.trim();
  }
  const athleteId = booking["athleteId"];
  if (typeof athleteId === "string" && athleteId.trim().length > 0) {
    return athleteId.trim();
  }
  return "";
}

async function getUserFcmTokens(userId: string): Promise<string[]> {
  const db = getFirestore();
  const userDoc = await db.doc(`users/${userId}`).get();
  const userData = userDoc.data() || {};
  const directToken = typeof userData["fcmToken"] === "string" ? userData["fcmToken"].trim() : "";
  const channels = await getUserNotificationChannels(userId);
  const all = new Set<string>();
  if (directToken) all.add(directToken);
  for (const token of channels.fcmTokens) {
    if (token.trim().length > 0) {
      all.add(token.trim());
    }
  }
  return Array.from(all);
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
  const messaging = getMessaging();
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
    const booking = bookingDoc.data() as {[k: string]: unknown};
    const status = typeof booking["status"] === "string" ? booking["status"].toLowerCase() : "";
    if (status && status !== "booked" && status !== "active" && status !== "confirmed") {
      skipped += 1;
      continue;
    }

    const athleteId = bookingAthleteUserId(booking);
    const dateKey = parseDateKeyFromBookingDate(booking["date"]);
    const startTime = typeof booking["startTime"] === "string" ? booking["startTime"].trim() : "";
    const arenaName = typeof booking["arenaName"] === "string" ? booking["arenaName"].trim() : "Arena";

    if (!athleteId || !dateKey || !startTime) {
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

    const lockRef = reminderLocksRef.doc(`${bookingDoc.id}_15m`);
    const lockAcquired = await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        return false;
      }
      tx.set(lockRef, {
        bookingId: bookingDoc.id,
        athleteId,
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
      const fcmTokens = await getUserFcmTokens(athleteId);
      if (fcmTokens.length === 0) {
        await lockRef.set({skippedNoFcmToken: true, sentAt: FieldValue.serverTimestamp()}, {merge: true});
        skipped += 1;
        continue;
      }

      const title = "Seu jogo começa em breve";
      const body = `${arenaName} • ${startTime}`;

      const message = {
        notification: {title, body},
        data: {
          type: BOOKING_REMINDER_15M_TYPE,
          bookingId: bookingDoc.id,
          arenaId: String(booking["arenaId"] || ""),
          date: dateKey,
          startTime,
        },
        android: {
          priority: "high" as const,
          notification: {
            channelId: "default",
            sound: "default",
          },
        },
        apns: {
          headers: {"apns-priority": "10"},
          payload: {aps: {sound: "default"}},
        },
      };

      const fcmResults = await Promise.allSettled(
        fcmTokens.map((token) => messaging.send({...message, token}))
      );
      const successful = fcmResults.filter((r) => r.status === "fulfilled").length;
      const failedCount = fcmResults.length - successful;
      sent += successful;
      failed += failedCount;

      if (successful > 0) {
        await db.collection(`users/${athleteId}/notifications`).add({
          userId: athleteId,
          title,
          body,
          type: BOOKING_REMINDER_15M_TYPE,
          data: {
            bookingId: bookingDoc.id,
            arenaId: booking["arenaId"] || "",
            date: dateKey,
            startTime,
            minutesBefore: String(BOOKING_REMINDER_15M_MINUTES_BEFORE),
          },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
        });
      }

      await bookingDoc.ref.set({
        reminder15mSentAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      await lockRef.set({
        sentAt: FieldValue.serverTimestamp(),
        sent: successful,
        failed: failedCount,
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
  const messaging = getMessaging();
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
    if (minutesToStart < ARENA_REMINDER_WINDOW_MIN || minutesToStart > ARENA_REMINDER_WINDOW_MAX) {
      skipped += 1;
      continue;
    }

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

    if (!lockAcquired) {
      skipped += 1;
      continue;
    }

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
        continue;
      }

      const title = "Lembrete de jogo";
      const body = "Seu jogo começa em 1 hora";
      const courtName = (booking.courtName || "Quadra").trim();
      const arenaName = (booking.arenaName || "Arena").trim();
      const endTime = (booking.endTime || "").trim();

      const message = {
        notification: {title, body},
        data: {
          type: ARENA_REMINDER_TYPE,
          bookingId: bookingDoc.id,
          arenaId: String(booking.arenaId || ""),
          date: dateKey,
          startTime,
          endTime,
        },
        android: {
          priority: "high" as const,
          notification: {
            channelId: "default",
            sound: "default",
          },
        },
        apns: {
          headers: {"apns-priority": "10"},
          payload: {
            aps: {sound: "default"},
          },
        },
      };

      const fcmResults = await Promise.allSettled(
        fcmTokens.map((token) => messaging.send({...message, token}))
      );
      const successful = fcmResults.filter((r) => r.status === "fulfilled").length;
      const failedCount = fcmResults.length - successful;

      const webPushResult = await sendWebPushToSubscriptions(webPushSubscriptions, {
        notification: {title, body},
        data: {
          type: ARENA_REMINDER_TYPE,
          bookingId: bookingDoc.id,
          arenaId: String(booking.arenaId || ""),
          date: dateKey,
          startTime,
          endTime,
        },
        requireInteraction: false,
      });

      const totalSent = successful + webPushResult.sent;
      const totalFailed = failedCount + webPushResult.failed;
      sent += totalSent;
      failed += totalFailed;

      if (totalSent > 0) {
        await db.collection(`users/${athleteId}/notifications`).add({
          userId: athleteId,
          title,
          body: `${body}\n${arenaName} · ${courtName}\n${startTime}${endTime ? ` - ${endTime}` : ""}`,
          type: ARENA_REMINDER_TYPE,
          data: {
            bookingId: bookingDoc.id,
            arenaId: booking.arenaId || "",
            date: dateKey,
            startTime,
            endTime,
            hoursBefore: String(ARENA_REMINDER_HOURS_BEFORE),
          },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
        });
      }

      await reminderDocRef.set({
        sentAt: FieldValue.serverTimestamp(),
        sent: totalSent,
        failed: totalFailed,
      }, {merge: true});
    } catch (error) {
      failed += 1;
      logger.error(`arena booking reminder: erro ao enviar para booking ${bookingDoc.id}`, error);
      // Remove lock para permitir retry no próximo ciclo quando houver falha de envio.
      await reminderDocRef.delete().catch(() => undefined);
    }
  }

  logger.info("arena booking reminder: ciclo concluído", {sent, skipped, failed});
});

async function sendWebPushToSubscriptions(
  subscriptions: StoredWebPushSubscription[],
  payload: Record<string, unknown>
): Promise<{sent: number; failed: number}> {
  if (subscriptions.length === 0) {
    return {sent: 0, failed: 0};
  }

  const enabled = configureWebPushIfPossible();
  if (!enabled) {
    logger.warn("Web Push não configurado: WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY ausentes ou inválidos");
    return {sent: 0, failed: subscriptions.length};
  }

  const db = getFirestore();
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription as PushSubscription, JSON.stringify(payload));
      sent += 1;
    } catch (error: any) {
      failed += 1;
      const statusCode = error?.statusCode as number | undefined;
      logger.warn(`Web Push falhou (status ${statusCode}):`, error?.message ?? error);
      if (statusCode === 404 || statusCode === 410) {
        try {
          await db.doc(`users/${subscription.userId}/webPushSubscriptions/${subscription.id}`).delete();
          logger.info(`WebPushSubscription inválida removida para usuário ${subscription.userId}`);
        } catch (cleanupError) {
          logger.warn("Erro ao remover webPushSubscription inválida", cleanupError);
        }
      }
    }
  }));

  return {sent, failed};
}

/**
 * Substitui todos os papéis do usuário por um único papel (compatível com clients antigos).
 * Grava claim `roles: [role]` e campo legado `role`.
 */
export const setUserRole = onCall(async (request) => {
  const {uid, role} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }

  if (typeof role !== "string" || !isAllowedRole(role)) {
    throw new HttpsError("invalid-argument", "Role inválido. Use 'admin', 'organizer', 'athlete' ou 'arena'");
  }

  const roleTyped = role as AppRole;
  const auth = getAuth();
  const callerUser = await auth.getUser(callerUid);
  const isCallerAdmin = callerIsOrganizer(callerUser);
  const isCallerSuperAdmin = callerIsSuperAdmin(callerUser);
  const isSelf = callerUid === uid;

  if (isSelf && !isCallerAdmin && roleTyped !== "athlete") {
    throw new HttpsError("permission-denied", "Permissão negada: não é permitido promover a própria conta");
  }

  if (!isSelf && !isCallerAdmin) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas admins podem definir roles de outros usuários");
  }

  if (!isSelf && (roleTyped === "admin" || roleTyped === "arena") && !isCallerSuperAdmin) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode cadastrar ou promover usuários a organizador (admin) ou gestor de arena (arena).");
  }
  if (!isSelf && roleTyped === "organizer" && !isCallerAdmin && !isCallerSuperAdmin) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o administrador da plataforma ou o super administrador pode atribuir o papel de gestor de torneios (organizer).",
    );
  }

  try {
    const targetUser = await auth.getUser(uid);
    const currentClaims = (targetUser.customClaims || {}) as Record<string, unknown>;
    const claims = applyRolesToClaims(currentClaims, [roleTyped]);

    await auth.setCustomUserClaims(uid, claims);

    const db = getFirestore();
    const fp = firestoreRolesPayload([roleTyped]);
    await db.doc(`users/${uid}`).set(fp, {merge: true});

    logger.info(`Papéis definidos para ${uid}: ${JSON.stringify(uniqueSortedRoles([roleTyped]))} (setUserRole)`);

    return {success: true, role: roleTyped, roles: uniqueSortedRoles([roleTyped])};
  } catch (error) {
    logger.error("Erro ao definir role:", error);
    throw new HttpsError("internal", "Erro ao definir role do usuário");
  }
});

/**
 * Acrescenta um papel ao usuário (união com os existentes).
 */
export const addUserRole = onCall(async (request) => {
  const {uid, role} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }
  if (typeof role !== "string" || !isAllowedRole(role)) {
    throw new HttpsError("invalid-argument", "Role inválido. Use 'admin', 'organizer', 'athlete' ou 'arena'");
  }

  const roleTyped = role as AppRole;
  const auth = getAuth();
  const callerUser = await auth.getUser(callerUid);
  const isCallerAdmin = callerIsOrganizer(callerUser);
  const isCallerSuperAdmin = callerIsSuperAdmin(callerUser);
  const isSelf = callerUid === uid;

  if (isSelf && !isCallerAdmin && roleTyped !== "athlete") {
    throw new HttpsError("permission-denied", "Permissão negada: não é permitido promover a própria conta");
  }
  if (!isSelf && !isCallerAdmin) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas admins podem alterar roles de outros usuários");
  }
  if (!isSelf && (roleTyped === "admin" || roleTyped === "arena") && !isCallerSuperAdmin) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode atribuir organizador ou gestor de arena a terceiros.");
  }
  if (!isSelf && roleTyped === "organizer" && !isCallerAdmin && !isCallerSuperAdmin) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o administrador da plataforma ou o super administrador pode atribuir o papel de gestor de torneios (organizer).",
    );
  }

  const targetUser = await auth.getUser(uid);
  const currentClaims = (targetUser.customClaims || {}) as Record<string, unknown>;
  const existing = rolesFromClaims(currentClaims);

  if (existing.includes(roleTyped)) {
    const fp = firestoreRolesPayload(existing);
    await getFirestore().doc(`users/${uid}`).set(fp, {merge: true});
    return {success: true, roles: existing, alreadyHad: true as const};
  }

  const next = uniqueSortedRoles([...existing, roleTyped]);
  const claims = applyRolesToClaims(currentClaims, next);
  await auth.setCustomUserClaims(uid, claims);
  const fp = firestoreRolesPayload(next);
  await getFirestore().doc(`users/${uid}`).set(fp, {merge: true});
  logger.info(`Papel ${roleTyped} adicionado a ${uid}: ${JSON.stringify(next)}`);
  return {success: true, roles: next};
});

/**
 * Remove um papel do usuário. Deve permanecer ao menos um papel.
 */
export const removeUserRole = onCall(async (request) => {
  const {uid, role} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }
  if (typeof role !== "string" || !isAllowedRole(role)) {
    throw new HttpsError("invalid-argument", "Role inválido");
  }

  const roleTyped = role as AppRole;
  const auth = getAuth();
  const callerUser = await auth.getUser(callerUid);
  const isCallerAdmin = callerIsOrganizer(callerUser);
  const isCallerSuperAdmin = callerIsSuperAdmin(callerUser);
  const isSelf = callerUid === uid;

  const targetUser = await auth.getUser(uid);
  const existing = rolesFromClaims(targetUser.customClaims);

  if (!existing.includes(roleTyped)) {
    const fp = firestoreRolesPayload(existing);
    await getFirestore().doc(`users/${uid}`).set(fp, {merge: true});
    return {success: true, roles: existing, wasAbsent: true as const};
  }

  if (existing.length <= 1) {
    throw new HttpsError("failed-precondition", "O usuário deve manter ao menos um papel.");
  }

  if (isSelf && (roleTyped === "admin" || roleTyped === "arena" || roleTyped === "organizer")) {
    throw new HttpsError(
      "permission-denied",
      "Para remover este papel da própria conta, chame um administrador da plataforma ou super administrador.",
    );
  }
  if (!isSelf && !isCallerAdmin) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas admins podem alterar roles de outros usuários");
  }
  if (!isSelf && (roleTyped === "admin" || roleTyped === "arena") && !isCallerSuperAdmin) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode remover o papel de organizador ou gestor de arena.");
  }
  if (!isSelf && roleTyped === "organizer" && !isCallerAdmin && !isCallerSuperAdmin) {
    throw new HttpsError(
      "permission-denied",
      "Apenas um administrador da plataforma ou o super administrador pode remover o papel de gestor de torneios.",
    );
  }

  const next = existing.filter((r) => r !== roleTyped);
  const currentClaims = (targetUser.customClaims || {}) as Record<string, unknown>;
  const claims = applyRolesToClaims(currentClaims, next);
  await auth.setCustomUserClaims(uid, claims);
  const fp = firestoreRolesPayload(next);
  await getFirestore().doc(`users/${uid}`).set(fp, {merge: true});
  logger.info(`Papel ${roleTyped} removido de ${uid}: ${JSON.stringify(next)}`);
  return {success: true, roles: next};
});

/**
 * Define a lista completa de papéis. Apenas super administrador.
 */
export const setUserRoles = onCall(async (request) => {
  const {uid, roles: rolesIn} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }
  if (!callerIsSuperAdmin(await getAuth().getUser(callerUid))) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode definir a lista completa de papéis.");
  }
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }
  if (!Array.isArray(rolesIn)) {
    throw new HttpsError("invalid-argument", "roles deve ser um array de strings");
  }

  const next = uniqueSortedRoles(rolesIn.filter((x: unknown): x is string => typeof x === "string"));
  if (next.length === 0) {
    throw new HttpsError("invalid-argument", "Informe ao menos um papel válido");
  }

  const auth = getAuth();
  const targetUser = await auth.getUser(uid);
  const currentClaims = (targetUser.customClaims || {}) as Record<string, unknown>;
  const claims = applyRolesToClaims(currentClaims, next);
  await auth.setCustomUserClaims(uid, claims);
  const fp = firestoreRolesPayload(next);
  await getFirestore().doc(`users/${uid}`).set(fp, {merge: true});
  logger.info(`setUserRoles ${uid}: ${JSON.stringify(next)}`);
  return {success: true, roles: next};
});

/**
 * Migração única: preenche claim `roles` e Firestore a partir do claim `role` legado.
 * Apenas super administrador. Idempotente para usuários que já têm `roles`.
 */
export const migrateUsersToMultiRole = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }
  const callerUser = await getAuth().getUser(callerUid);
  if (!callerIsSuperAdmin(callerUser)) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode executar a migração.");
  }

  const auth = getAuth();
  const db = getFirestore();
  let updatedAuth = 0;
  let updatedFirestore = 0;
  let nextPageToken: string | undefined;

  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    for (const u of listResult.users) {
      const claims = (u.customClaims || {}) as Record<string, unknown>;

      if (Array.isArray(claims["roles"]) && (claims["roles"] as unknown[]).length > 0) {
        continue;
      }

      const existingRoles = rolesFromClaims(claims);
      const legacy = claims["role"];
      const sourceRoles: AppRole[] =
        existingRoles.length > 0 ?
          existingRoles :
          (typeof legacy === "string" && isAllowedRole(legacy) ? [legacy as AppRole] : []);

      if (sourceRoles.length === 0) {
        continue;
      }

      const nextClaims = applyRolesToClaims(claims, sourceRoles);
      await auth.setCustomUserClaims(u.uid, nextClaims);
      updatedAuth += 1;

      const userDoc = await db.doc(`users/${u.uid}`).get();
      const data = userDoc.data();
      const docRoles = data?.roles;
      if (!userDoc.exists || !Array.isArray(docRoles) || docRoles.length === 0) {
        await db.doc(`users/${u.uid}`).set(firestoreRolesPayload(sourceRoles), {merge: true});
        updatedFirestore += 1;
      }
    }
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  logger.info(`migrateUsersToMultiRole: auth=${updatedAuth} firestoreDocs=${updatedFirestore}`);
  return {success: true, updatedAuth, updatedFirestore};
});

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

/**
 * Cria um novo organizador (admin sem superAdmin).
 * Apenas usuários com custom claim superAdmin === true podem chamar.
 */
export const createOrganizer = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const callerUser = await getAuth().getUser(callerUid);
  if (callerUser.customClaims?.superAdmin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o super administrador pode cadastrar organizadores."
    );
  }

  const {email, fullName, temporaryPassword} = request.data || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    throw new HttpsError("invalid-argument", "E-mail é obrigatório.");
  }
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    throw new HttpsError("invalid-argument", "Nome completo é obrigatório.");
  }
  if (!temporaryPassword || typeof temporaryPassword !== "string" || temporaryPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Senha temporária deve ter no mínimo 6 caracteres.");
  }

  const auth = getAuth();
  try {
    await auth.getUserByEmail(email.trim());
    throw new HttpsError("already-exists", "Já existe um usuário com este e-mail.");
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      throw err;
    }
  }

  const userRecord = await auth.createUser({
    email: email.trim(),
    password: temporaryPassword,
    displayName: fullName.trim()
  });
  const uid = userRecord.uid;

  const adminClaims = applyRolesToClaims({mustChangePassword: true}, ["admin"]);
  await auth.setCustomUserClaims(uid, adminClaims);

  const db = getFirestore();
  await db.doc(`users/${uid}`).set({
    uid,
    email: email.trim(),
    fullName: fullName.trim(),
    ...firestoreRolesPayload(["admin"]),
    createdAt: FieldValue.serverTimestamp()
  }, {merge: true});

  logger.info(`Organizador criado: ${uid} (${email})`);
  return {uid, email: email.trim()};
});

/**
 * Cria um novo gestor de arena (arena).
 * Apenas usuários com custom claim superAdmin === true podem chamar.
 */
export const createArena = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const callerUser = await getAuth().getUser(callerUid);
  if (callerUser.customClaims?.superAdmin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o super administrador pode cadastrar gestores de arena."
    );
  }

  const {email, fullName, temporaryPassword, arenaName} = request.data || {};
  if (!email || typeof email !== "string" || !email.trim()) {
    throw new HttpsError("invalid-argument", "E-mail é obrigatório.");
  }
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    throw new HttpsError("invalid-argument", "Nome completo é obrigatório.");
  }
  if (!temporaryPassword || typeof temporaryPassword !== "string" || temporaryPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Senha temporária deve ter no mínimo 6 caracteres.");
  }

  const auth = getAuth();
  try {
    await auth.getUserByEmail(email.trim());
    throw new HttpsError("already-exists", "Já existe um usuário com este e-mail.");
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      throw err;
    }
  }

  const userRecord = await auth.createUser({
    email: email.trim(),
    password: temporaryPassword,
    displayName: fullName.trim()
  });
  const uid = userRecord.uid;

  const arenaClaims = applyRolesToClaims({mustChangePassword: true}, ["arena"]);
  await auth.setCustomUserClaims(uid, arenaClaims);

  const db = getFirestore();
  await db.doc(`users/${uid}`).set({
    uid,
    email: email.trim(),
    fullName: fullName.trim(),
    ...firestoreRolesPayload(["arena"]),
    createdAt: FieldValue.serverTimestamp()
  }, {merge: true});

  // Cria documento da arena vinculada ao gestor
  const arenaRef = db.collection("arenas").doc();
  await arenaRef.set({
    id: arenaRef.id,
    name: arenaName && typeof arenaName === "string" ? arenaName.trim() : "Minha Arena",
    managerUserId: uid,
    status: "active",
    basePriceReais: 0,
    createdAt: FieldValue.serverTimestamp()
  }, {merge: true});

  logger.info(`Gestor de arena criado: ${uid} (${email})`);
  return {uid, email: email.trim(), arenaId: arenaRef.id};
});

/** Rótulos em minúsculas para o filtro de busca (alinhado ao backoffice). */
const BO_ROLE_SEARCH_LABEL: Record<AppRole, string> = {
  admin: "organizador",
  organizer: "gestor torneios",
  athlete: "atleta",
  arena: "arena gestor",
};

function backofficeUserMatchesSearch(
  u: UserRecord,
  qLower: string,
  firestoreFullName: string | null,
): boolean {
  const roles = rolesFromClaims(u.customClaims);
  const legacy = u.customClaims?.["role"];
  const roleStr = typeof legacy === "string" ? legacy : "";
  const pieces: string[] = [
    u.email ?? "",
    u.displayName ?? "",
    u.phoneNumber ?? "",
    firestoreFullName ?? "",
    u.uid,
    roleStr,
    ...roles,
    ...roles.map((r) => BO_ROLE_SEARCH_LABEL[r]),
  ];
  const haystack = pieces.join(" ").toLowerCase();
  return haystack.includes(qLower);
}

async function fetchUserFullName(db: FirebaseFirestore.Firestore, uid: string): Promise<string | null> {
  try {
    const fsSnap = await db.doc(`users/${uid}`).get();
    const fn = fsSnap.data()?.["fullName"];
    return typeof fn === "string" ? fn : null;
  } catch {
    return null;
  }
}

function backofficeRowFromUserRecord(u: UserRecord, fullName: string | null) {
  const roles = rolesFromClaims(u.customClaims);
  const legacy = u.customClaims?.["role"];
  const role =
    typeof legacy === "string" ? legacy : (roles.length > 0 ? roles[0]! : null);
  return {
    uid: u.uid,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    disabled: u.disabled === true,
    emailVerified: u.emailVerified === true,
    roles,
    role,
    fullName,
  };
}

type SearchListState =
  | {v: 1; kind: "scan"; authToken: string | undefined}
  | {v: 1; kind: "leftover"; uids: string[]; nextAuthToken: string | null};

function encodeBackofficeSearchState(s: SearchListState): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

function decodeBackofficeSearchState(tok: string): SearchListState | null {
  try {
    const s = JSON.parse(Buffer.from(tok, "base64url").toString("utf8")) as SearchListState;
    if (s?.v !== 1) {
      return null;
    }
    if (s.kind === "scan") {
      return {v: 1, kind: "scan", authToken: s.authToken};
    }
    if (s.kind === "leftover" && Array.isArray(s.uids)) {
      return {v: 1, kind: "leftover", uids: s.uids, nextAuthToken: s.nextAuthToken};
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Lista usuários (Firebase Auth + enriquecimento Firestore) para o backoffice.
 * Apenas organizador (admin) ou super administrador.
 *
 * Com `search`, percorre todos os usuários do Auth (em lotes) até encher `maxResults`
 * ou esgotar a base; `nextPageToken` codifica continuação (inclui fila de UIDs pendentes).
 */
export const listBackofficeUsers = onCall({timeoutSeconds: 300}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const callerUser = await getAuth().getUser(callerUid);
  if (!callerIsOrganizer(callerUser) && !callerIsSuperAdmin(callerUser)) {
    throw new HttpsError("permission-denied", "Apenas organizadores podem listar usuários.");
  }

  const raw = request.data as {maxResults?: unknown; pageToken?: unknown; search?: unknown} | undefined;
  const requested =
    typeof raw?.maxResults === "number" && Number.isFinite(raw.maxResults) ? raw.maxResults : 50;
  const maxResults = Math.min(Math.max(1, Math.floor(requested)), 100);
  const pageToken = typeof raw?.pageToken === "string" && raw.pageToken.trim() ? raw.pageToken : undefined;
  const searchRaw = typeof raw?.search === "string" ? raw.search.trim() : "";
  const searchQ = searchRaw.length > 0 ? searchRaw.toLowerCase() : "";

  const auth = getAuth();
  const db = getFirestore();

  try {
    if (searchQ) {
      const emailLike = searchRaw.includes("@");
      if (emailLike) {
        try {
          const u = await auth.getUserByEmail(searchRaw);
          const fullName = await fetchUserFullName(db, u.uid);
          return {
            users: [backofficeRowFromUserRecord(u, fullName)],
            nextPageToken: null,
          };
        } catch {
          // não encontrado por e-mail exato — segue para varredura
        }
      }
      const uidExact = /^[a-zA-Z0-9_-]{22,128}$/.test(searchRaw);
      if (uidExact) {
        try {
          const u = await auth.getUser(searchRaw);
          const fullName = await fetchUserFullName(db, u.uid);
          return {
            users: [backofficeRowFromUserRecord(u, fullName)],
            nextPageToken: null,
          };
        } catch {
          // segue para varredura (ex.: substring de UID)
        }
      }

      let state: SearchListState =
        pageToken ?
          decodeBackofficeSearchState(pageToken) ?? {v: 1, kind: "scan", authToken: undefined} :
          {v: 1, kind: "scan", authToken: undefined};

      const out: ReturnType<typeof backofficeRowFromUserRecord>[] = [];
      /** Limite de usuários Auth listados por chamada (evita timeout / custo). */
      let listedAuthUsers = 0;
      const MAX_LISTED_AUTH_PER_CALL = 25000;

      while (out.length < maxResults && listedAuthUsers < MAX_LISTED_AUTH_PER_CALL) {
        if (state.kind === "leftover") {
          while (state.uids.length > 0 && out.length < maxResults && listedAuthUsers < MAX_LISTED_AUTH_PER_CALL) {
            const uid = state.uids.shift()!;
            const u = await auth.getUser(uid);
            listedAuthUsers++;
            const fullName = await fetchUserFullName(db, u.uid);
            out.push(backofficeRowFromUserRecord(u, fullName));
          }
          if (state.uids.length > 0) {
            return {
              users: out,
              nextPageToken: encodeBackofficeSearchState(state),
            };
          }
          if (!state.nextAuthToken) {
            return {users: out, nextPageToken: null};
          }
          state = {v: 1, kind: "scan", authToken: state.nextAuthToken};
          continue;
        }

        const listResult = await auth.listUsers(1000, state.authToken);
        listedAuthUsers += listResult.users.length;

        const refs = listResult.users.map((u) => db.doc(`users/${u.uid}`));
        const snaps = refs.length > 0 ? await db.getAll(...refs) : [];
        const fullNameByUid = new Map<string, string | null>();
        snaps.forEach((snap, i) => {
          const u = listResult.users[i];
          if (!u) {
            return;
          }
          const fn = snap.data()?.["fullName"];
          fullNameByUid.set(u.uid, typeof fn === "string" ? fn : null);
        });

        const matching: UserRecord[] = [];
        for (const u of listResult.users) {
          const fn = fullNameByUid.get(u.uid) ?? null;
          if (backofficeUserMatchesSearch(u, searchQ, fn)) {
            matching.push(u);
          }
        }

        let mi = 0;
        while (mi < matching.length && out.length < maxResults) {
          const u = matching[mi]!;
          mi++;
          const fullName = fullNameByUid.get(u.uid) ?? null;
          out.push(backofficeRowFromUserRecord(u, fullName));
        }

        const leftoverUids = matching.slice(mi).map((u) => u.uid);
        const nextAuth = listResult.pageToken ?? null;

        if (leftoverUids.length > 0) {
          return {
            users: out,
            nextPageToken: encodeBackofficeSearchState({
              v: 1,
              kind: "leftover",
              uids: leftoverUids,
              nextAuthToken: nextAuth,
            }),
          };
        }

        if (!nextAuth) {
          return {users: out, nextPageToken: null};
        }

        if (out.length >= maxResults) {
          return {
            users: out,
            nextPageToken: encodeBackofficeSearchState({v: 1, kind: "scan", authToken: nextAuth}),
          };
        }

        if (listedAuthUsers >= MAX_LISTED_AUTH_PER_CALL) {
          return {
            users: out,
            nextPageToken: encodeBackofficeSearchState({v: 1, kind: "scan", authToken: nextAuth}),
          };
        }

        state = {v: 1, kind: "scan", authToken: nextAuth};
      }

      return {
        users: out,
        nextPageToken:
          listedAuthUsers >= MAX_LISTED_AUTH_PER_CALL && state.kind === "scan" && state.authToken ?
            encodeBackofficeSearchState(state) :
            null,
      };
    }

    const listResult = await auth.listUsers(maxResults, pageToken);

    const users = await Promise.all(
      listResult.users.map(async (u) => {
        const fullName = await fetchUserFullName(db, u.uid);
        return backofficeRowFromUserRecord(u, fullName);
      }),
    );

    return {
      users,
      nextPageToken: listResult.pageToken ?? null,
    };
  } catch (err) {
    logger.error("listBackofficeUsers failed", err);
    throw new HttpsError("internal", "Não foi possível listar usuários.");
  }
});

/**
 * Remove a flag mustChangePassword do custom claim do usuário
 * Apenas o próprio usuário ou um admin pode chamar esta função
 */
export const clearMustChangePassword = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  const {uid} = request.data || {};
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID é obrigatório");
  }

  // Verifica se o caller é o próprio usuário ou um admin
  const callerUser = await getAuth().getUser(callerUid);
  const isAdmin = callerIsOrganizer(callerUser);
  const isSelf = callerUid === uid;

  if (!isAdmin && !isSelf) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas o próprio usuário ou um admin pode remover esta flag");
  }

  // Obtém os claims atuais do usuário
  const targetUser = await getAuth().getUser(uid);
  const currentClaims = targetUser.customClaims || {};

  // Remove mustChangePassword mantendo os outros claims
  const {mustChangePassword, ...remainingClaims} = currentClaims;

  // Atualiza os custom claims sem mustChangePassword
  await getAuth().setCustomUserClaims(uid, remainingClaims);

  logger.info(`Flag mustChangePassword removida para usuário ${uid}`);
  return {success: true};
});

/**
 * Obtém o role de um usuário pelos custom claims
 */
export const getUserRole = onCall(async (request) => {
  const {uid} = request.data;
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new Error("Usuário não autenticado");
  }

  // Usuário pode ver seu próprio role ou deve ser admin ou super admin
  const callerUser = await getAuth().getUser(callerUid);
  const isAdmin = callerIsOrganizer(callerUser);
  const isSuperAdmin = callerIsSuperAdmin(callerUser);

  if (callerUid !== uid && !isAdmin && !isSuperAdmin) {
    throw new Error("Permissão negada");
  }

  try {
    const user = await getAuth().getUser(uid);
    const roles = rolesFromClaims(user.customClaims);
    const legacy = user.customClaims?.role;
    return {
      roles,
      role: typeof legacy === "string" ? legacy : (roles[0] ?? null),
    };
  } catch (error) {
    logger.error("Erro ao obter role:", error);
    throw new Error("Erro ao obter role do usuário");
  }
});

/**
 * Define ou atualiza o status PRO de um atleta
 * Apenas admins podem chamar
 */
export const setAthletePro = onCall(async (request) => {
  const {uid, isPro, expiresAt} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }
  if (typeof isPro !== "boolean") {
    throw new HttpsError("invalid-argument", "isPro inválido");
  }
  if (expiresAt !== undefined && (typeof expiresAt !== "number" || Number.isNaN(expiresAt))) {
    throw new HttpsError("invalid-argument", "expiresAt inválido");
  }

  // Apenas admin pode alterar status PRO
  const auth = getAuth();
  const callerUser = await auth.getUser(callerUid);
  const isAdmin = callerIsOrganizer(callerUser);

  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Permissão negada");
  }

  // Atualiza custom claims sem remover claims existentes
  const targetUser = await auth.getUser(uid);
  const claims: Record<string, unknown> = {...(targetUser.customClaims || {}), athletePro: isPro};
  if (expiresAt) {
    claims.athleteProExpiresAt = expiresAt;
  } else if (!isPro) {
    // Remove expiração se não é PRO
    claims.athleteProExpiresAt = null;
  }

  await auth.setCustomUserClaims(uid, claims);

  // Atualiza Firestore
  const db = getFirestore();
  const updateData: any = {
    isPro,
    updatedAt: FieldValue.serverTimestamp()
  };

  if (isPro && !expiresAt) {
    // Se está ativando PRO e não tem data de expiração, marca como ativado agora
    const proProfileRef = db.doc(`athlete_profiles/${uid}`);
    const proProfile = await proProfileRef.get();
    
    if (!proProfile.exists || !proProfile.data()?.proActivatedAt) {
      updateData.proActivatedAt = FieldValue.serverTimestamp();
    }
  }

  if (expiresAt) {
    updateData.subscriptionEndDate = new Date(expiresAt * 1000);
  }

  await db.doc(`athlete_profiles/${uid}`).set(updateData, {merge: true});

  logger.info(`Status PRO ${isPro ? 'ativado' : 'desativado'} para usuário ${uid}`);

  return {success: true, message: "Status PRO atualizado"};
});

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
    const db = getFirestore();
    const {fcmTokens, webPushSubscriptions} = await getUserNotificationChannels(userId);
    if (fcmTokens.length === 0 && webPushSubscriptions.length === 0) {
      logger.warn(`Nenhum canal de push encontrado para o usuário ${userId}`);
      return {success: false, message: "Usuário não possui inscrições de push registradas"};
    }

    const messaging = getMessaging();

    // Prepara a mensagem
    const message = {
      notification: {
        title,
        body
      },
      data: data ? {
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {} as Record<string, string>),
        requireInteraction: requireInteraction ? "true" : "false"
      } : {
        requireInteraction: requireInteraction ? "true" : "false"
      },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "default",
          sound: "default"
        }
      },
      apns: {
        headers: {
          "apns-priority": "10"
        },
        payload: {
          aps: {
            sound: "default"
          }
        }
      }
    };

    const fcmResults = await Promise.allSettled(
      fcmTokens.map((token) =>
        messaging.send({ ...message, token })
      )
    );

    let fcmSuccessful = 0;
    let fcmFailed = 0;
    for (let i = 0; i < fcmResults.length; i++) {
      const result = fcmResults[i];
      const token = fcmTokens[i];
      if (result.status === "fulfilled") {
        fcmSuccessful += 1;
      } else {
        fcmFailed += 1;
        const err = result.reason as { code?: string };
        const code = err?.code ?? "";
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/registration-token-not-found"
        ) {
          try {
            await db.doc(`users/${userId}/tokens/${token}`).delete();
            logger.info(`Token FCM inválido removido para usuário ${userId}`);
          } catch (cleanupErr) {
            logger.warn("Erro ao remover token FCM inválido", cleanupErr);
          }
        } else {
          logger.warn(`FCM send falhou para token (código ${code}):`, (err as Error)?.message ?? err);
        }
      }
    }

    const webPushResult = await sendWebPushToSubscriptions(webPushSubscriptions, {
      notification: {
        title,
        body,
      },
      data: data ? Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as Record<string, string>) : {},
      requireInteraction: !!requireInteraction,
    });

    const successful = fcmSuccessful + webPushResult.sent;
    const failed = fcmFailed + webPushResult.failed;

    logger.info(`Notificação enviada para ${userId}: ${successful} sucesso, ${failed} falhas`);

    // Salva a notificação no histórico do usuário
    if (successful > 0) {
      try {
        const notificationsRef = db.collection(`users/${userId}/notifications`);
        const notificationDoc = notificationsRef.doc();
        
        await notificationDoc.set({
          userId,
          title,
          body,
          type: data?.['type'] || 'general',
          data: data ? Object.keys(data).reduce((acc, key) => {
            acc[key] = String(data[key]);
            return acc;
          }, {} as Record<string, string>) : undefined,
          read: false,
          createdAt: new Date(),
          readAt: null
        });
        
        logger.info(`Notificação salva no histórico para ${userId}`);
      } catch (historyError) {
        logger.warn(`Erro ao salvar notificação no histórico para ${userId}:`, historyError);
        // Não falha a função se o histórico falhar
      }
    }

    return {
      success: successful > 0,
      sent: successful,
      failed,
      total: fcmTokens.length + webPushSubscriptions.length
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

  // Push (quando houver inscrição cadastrada)
  const {fcmTokens, webPushSubscriptions} = await getUserNotificationChannels(arenaManagerUserId);
  const messaging = getMessaging();

  const message = {
    notification: {title, body},
    data: {
      ...data,
      requireInteraction: "true",
    },
    android: {
      priority: "high" as const,
      notification: {
        channelId: "default",
        sound: "default",
      },
    },
    apns: {
      headers: {"apns-priority": "10"},
      payload: {
        aps: {sound: "default"},
      },
    },
  };

  const fcmResults =
    fcmTokens.length > 0
      ? await Promise.allSettled(fcmTokens.map((token) => messaging.send({...message, token})))
      : [];

  const fcmSuccessful = fcmResults.filter((r) => r.status === "fulfilled").length;
  const fcmFailed = fcmResults.filter((r) => r.status === "rejected").length;

  const webPushResult = await sendWebPushToSubscriptions(webPushSubscriptions, {
    notification: {title, body},
    data,
    requireInteraction: true,
  });

  const successful = fcmSuccessful + webPushResult.sent;
  const failed = fcmFailed + webPushResult.failed;

  // Histórico in-app (garante a exibição no app mesmo se não houver push configurado)
  try {
    const notificationsRef = db.collection(`users/${arenaManagerUserId}/notifications`);
    const notificationDoc = notificationsRef.doc();

    await notificationDoc.set({
      userId: arenaManagerUserId,
      title,
      body,
      type: notificationType,
      data,
      read: false,
      createdAt: new Date(),
      readAt: null,
    });
  } catch (historyError) {
    logger.warn("Erro ao salvar notificação no histórico:", historyError);
    // Não falha a função se o histórico falhar
  }

  logger.info(`Notificação criada para ${arenaManagerUserId}: ${successful} sucesso, ${failed} falhas`);

  return {
    success: true,
    sent: successful,
    failed,
    total: fcmTokens.length + webPushSubscriptions.length,
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
    const db = getFirestore();
    const messaging = getMessaging();
    
    const channelResults = await Promise.all(
      userIds.map(async (userId: string) => ({userId, ...(await getUserNotificationChannels(userId))}))
    );
    const allTokens = channelResults.flatMap((result) => result.fcmTokens);
    const allWebPushSubscriptions = channelResults.flatMap((result) => result.webPushSubscriptions);

    if (allTokens.length === 0 && allWebPushSubscriptions.length === 0) {
      logger.warn("Nenhum canal de push encontrado para os usuários especificados");
      return {success: false, message: "Nenhuma inscrição de push encontrada"};
    }

    // Prepara a mensagem
    const message = {
      notification: {
        title,
        body
      },
      data: data ? {
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {} as Record<string, string>),
        requireInteraction: requireInteraction ? "true" : "false"
      } : {
        requireInteraction: requireInteraction ? "true" : "false"
      },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "default",
          sound: "default"
        }
      },
      apns: {
        headers: {
          "apns-priority": "10"
        },
        payload: {
          aps: {
            sound: "default"
          }
        }
      }
    };

    const results = await Promise.allSettled(
      allTokens.map(token => 
        messaging.send({
          ...message,
          token
        })
      )
    );

    const fcmSuccessful = results.filter(r => r.status === "fulfilled").length;
    const fcmFailed = results.filter(r => r.status === "rejected").length;

    const webPushResult = await sendWebPushToSubscriptions(allWebPushSubscriptions, {
      notification: {
        title,
        body,
      },
      data: data ? Object.keys(data).reduce((acc, key) => {
        acc[key] = String(data[key]);
        return acc;
      }, {} as Record<string, string>) : {},
      requireInteraction: !!requireInteraction,
    });

    const successful = fcmSuccessful + webPushResult.sent;
    const failed = fcmFailed + webPushResult.failed;

    logger.info(`Notificação em massa enviada: ${successful} sucesso, ${failed} falhas`);

    // Salva a notificação no histórico de cada usuário
    if (successful > 0) {
      const historyPromises = userIds.map(async (userId: string) => {
        try {
          const notificationsRef = db.collection(`users/${userId}/notifications`);
          const notificationDoc = notificationsRef.doc();
          
          await notificationDoc.set({
            userId,
            title,
            body,
            type: data?.['type'] || 'general',
            data: data ? Object.keys(data).reduce((acc, key) => {
              acc[key] = String(data[key]);
              return acc;
            }, {} as Record<string, string>) : undefined,
            read: false,
            createdAt: new Date(),
            readAt: null
          });
          
          logger.debug(`Notificação salva no histórico para ${userId}`);
        } catch (historyError) {
          logger.warn(`Erro ao salvar notificação no histórico para ${userId}:`, historyError);
          // Não falha se um histórico falhar
        }
      });

      await Promise.allSettled(historyPromises);
      logger.info(`Histórico de notificações atualizado para ${userIds.length} usuários`);
    }

    return {
      success: true,
      sent: successful,
      failed,
      total: allTokens.length + allWebPushSubscriptions.length
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
    const messaging = getMessaging();
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

        const channelResults = await Promise.all(
          Array.from(userIds).map(async (userId) => ({userId, ...(await getUserNotificationChannels(userId))}))
        );
        const allTokens = channelResults.flatMap((result) => result.fcmTokens);
        const allWebPushSubscriptions = channelResults.flatMap((result) => result.webPushSubscriptions);

        if (allTokens.length === 0 && allWebPushSubscriptions.length === 0) {
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

        // Prepara mensagem
        const message = {
          notification: {
            title: '⏰ Lembrete: Partida em 1h',
            body: `${teamAName} vs ${teamBName}\n${courtName} - ${timeStr}`
          },
          data: {
            type: 'match_reminder',
            matchId,
            tournamentId: match.tournamentId,
            categoryId: match.categoryId,
            url: `/admin/tournament/${match.tournamentId}/match/${matchId}/result/${encodeURIComponent(match.categoryId)}`
          },
          android: {
            priority: 'high' as const,
            notification: {
              channelId: 'default',
              sound: 'default'
            }
          },
          apns: {
            headers: {
              'apns-priority': '10'
            },
            payload: {
              aps: {
                sound: 'default'
              }
            }
          }
        };

        // Envia para todos os tokens
        const results = await Promise.allSettled(
          allTokens.map(token =>
            messaging.send({
              ...message,
              token
            })
          )
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.length - successful;
        const webPushResult = await sendWebPushToSubscriptions(allWebPushSubscriptions, {
          notification: {
            title: '⏰ Lembrete: Partida em 1h',
            body: `${teamAName} vs ${teamBName}\n${courtName} - ${timeStr}`,
          },
          data: {
            type: 'match_reminder',
            matchId,
            tournamentId: String(match.tournamentId),
            categoryId: String(match.categoryId),
            url: `/admin/tournament/${match.tournamentId}/match/${matchId}/result/${encodeURIComponent(match.categoryId)}`,
          },
          requireInteraction: false,
        });

        totalSent += successful + webPushResult.sent;
        totalFailed += failed + webPushResult.failed;

        // Salva a notificação no histórico de cada usuário
        if (successful > 0 || webPushResult.sent > 0) {
          const historyPromises = Array.from(userIds).map(async (userId: string) => {
            try {
              const notificationsRef = db.collection(`users/${userId}/notifications`);
              const notificationDoc = notificationsRef.doc();
              
              await notificationDoc.set({
                userId,
                title: '⏰ Lembrete: Partida em 1h',
                body: `${teamAName} vs ${teamBName}\n${courtName} - ${timeStr}\n${tournamentName}`,
                type: 'match_reminder',
                data: {
                  matchId,
                  tournamentId: match.tournamentId,
                  categoryId: match.categoryId,
                  hoursBefore: '1',
                  url: `/admin/tournament/${match.tournamentId}/match/${matchId}/result/${encodeURIComponent(match.categoryId)}`
                },
                read: false,
                createdAt: new Date(),
                readAt: null
              });
            } catch (historyError) {
              logger.warn(`Erro ao salvar lembrete no histórico para ${userId}:`, historyError);
            }
          });

          await Promise.allSettled(historyPromises);
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
    throw new Error("Usuário não autenticado");
  }
  const callerUser = await getAuth().getUser(uid);
  if (!callerIsOrganizer(callerUser)) {
    throw new Error("Apenas organizadores podem vincular conta Mercado Pago");
  }
  const appId = MERCADOPAGO_APP_ID.value();
  if (!appId) {
    throw new Error("MERCADOPAGO_APP_ID não configurado");
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
export const mercadopagoOAuthCallback = onRequest({
  secrets: [MERCADOPAGO_APP_ID, MERCADOPAGO_APP_SECRET],
}, async (req, res) => {
  const projectId = getFirebaseProjectId();
  const appUrl = `https://voleigo.com.br`; // Ajuste se o app tiver URL diferente
  const code = req.query?.code as string | undefined;
  const state = req.query?.state as string | undefined; // managerId (uid)
  const errorQuery = req.query?.error as string | undefined;

  if (errorQuery) {
    logger.warn("Mercado Pago OAuth error:", errorQuery);
    const reason = errorQuery === "access_denied" ? "access_denied" : "oauth_error";
    res.redirect(`${appUrl}/admin/profile?mp=error&reason=${encodeURIComponent(reason)}`);
    return;
  }
  if (!code || !state) {
    res.redirect(`${appUrl}/admin/profile?mp=error&reason=no_code`);
    return;
  }

  const appId = MERCADOPAGO_APP_ID.value();
  const appSecret = MERCADOPAGO_APP_SECRET.value();
  if (!appId || !appSecret) {
    logger.warn(`mercadopagoOAuthCallback: credenciais ausentes hasAppId=${!!appId} hasAppSecret=${!!appSecret}`);
    res.redirect(`${appUrl}/admin/profile?mp=error&reason=config`);
    return;
  }
  // Log seguro: App ID mascarado; Client Secret nunca logado (só comprimento)
  const mask = (s: string) => s.length <= 8 ? "***" : s.slice(0, 4) + "…" + s.slice(-4);
  logger.info(`mercadopagoOAuthCallback: credenciais em uso appIdMasked=${mask(appId)} appIdLength=${appId.length} appSecretLength=${appSecret.length}`);

  const redirectUri = `https://us-central1-${projectId}.cloudfunctions.net/mercadopagoOAuthCallback`;
  const db = getFirestore();
  const pkceRef = db.doc(`users/${state}/mercadopago/oauthPkce`);
  const pkceSnap = await pkceRef.get();
  const codeVerifier = pkceSnap.data()?.["codeVerifier"];
  if (!codeVerifier || typeof codeVerifier !== "string") {
    logger.warn(`mercadopagoOAuthCallback: PKCE ausente para uid=${state}`);
    res.redirect(`${appUrl}/admin/profile?mp=error&reason=pkce_missing`);
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
      res.redirect(`${appUrl}/admin/profile?mp=error&reason=${encodeURIComponent(reason)}`);
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
    res.redirect(`${appUrl}/admin/profile?mp=success`);
  } catch (e) {
    logger.error("mercadopagoOAuthCallback error:", e);
    res.redirect(`${appUrl}/admin/profile?mp=error&reason=exception`);
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
