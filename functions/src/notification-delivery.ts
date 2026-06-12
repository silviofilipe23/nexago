import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import webpush, {PushSubscription} from "web-push";

export const WEB_PUSH_PUBLIC_KEY = defineSecret("WEB_PUSH_PUBLIC_KEY");
export const WEB_PUSH_PRIVATE_KEY = defineSecret("WEB_PUSH_PRIVATE_KEY");
export const WEB_PUSH_SUBJECT = defineSecret("WEB_PUSH_SUBJECT");

interface StoredWebPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  keys: {p256dh: string; auth: string};
}

export interface StoredFcmToken {
  docId: string;
  token: string;
  platform?: string;
}

let webPushConfigured = false;

function configureWebPushIfPossible(): boolean {
  if (webPushConfigured) return true;
  try {
    const publicKey = WEB_PUSH_PUBLIC_KEY.value();
    const privateKey = WEB_PUSH_PRIVATE_KEY.value();
    const subject = WEB_PUSH_SUBJECT.value() || "mailto:suporte@voleigo.com.br";
    if (!publicKey || !privateKey) return false;
    webpush.setVapidDetails(subject, publicKey, privateKey);
    webPushConfigured = true;
    return true;
  } catch (error) {
    logger.warn("Web Push não configurado.", error);
    return false;
  }
}

/** Extrai tokens FCM válidos; ignora docs sem campo `token` (sem fallback para doc.id). */
export function parseStoredFcmTokens(
  docs: Array<{id: string; data: () => Record<string, unknown>}>
): StoredFcmToken[] {
  const byToken = new Map<string, StoredFcmToken>();

  for (const doc of docs) {
    const data = doc.data();
    const rawToken = data["token"];
    if (typeof rawToken !== "string" || rawToken.trim().length === 0) {
      continue;
    }
    const token = rawToken.trim();
    const platform = data["platform"];
    byToken.set(token, {
      docId: doc.id,
      token,
      platform: typeof platform === "string" ? platform : undefined,
    });
  }

  return Array.from(byToken.values());
}

/** FCM exige que todos os valores em `data` sejam strings. */
export function coerceNotificationData(
  data: Record<string, string>,
  type: string,
  requireInteraction: boolean
): Record<string, string> {
  const out: Record<string, string> = {
    type,
    requireInteraction: requireInteraction ? "true" : "false",
  };
  for (const [key, value] of Object.entries(data)) {
    out[key] = value == null ? "" : String(value);
  }
  return out;
}

/** Monta payload FCM com APNS alert explícito (iOS 13+). */
export function buildFcmMessage(params: {
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
  requireInteraction: boolean;
}) {
  const {title, body, type, data, requireInteraction} = params;
  return {
    notification: {title, body},
    data: coerceNotificationData(data, type, requireInteraction),
    android: {
      priority: "high" as const,
      notification: {channelId: "default", sound: "default"},
    },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
      },
      payload: {
        aps: {
          alert: {title, body},
          sound: "default",
        },
      },
    },
    fcmOptions: {analyticsLabel: type},
  };
}

export function isInvalidFcmTokenError(code: string): boolean {
  return (
    code === "messaging/invalid-registration-token" ||
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/registration-token-not-found"
  );
}

async function getUserNotificationChannels(
  userId: string
): Promise<{
  fcmTokens: StoredFcmToken[];
  webPushSubscriptions: StoredWebPushSubscription[];
}> {
  const db = getFirestore();
  const [tokensSnapshot, webPushSnapshot] = await Promise.all([
    db.collection(`users/${userId}/tokens`).get(),
    db.collection(`users/${userId}/webPushSubscriptions`).get(),
  ]);

  const fcmTokens = parseStoredFcmTokens(tokensSnapshot.docs);

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
        keys: {p256dh: keys["p256dh"], auth: keys["auth"]},
      } as StoredWebPushSubscription;
    })
    .filter((item): item is StoredWebPushSubscription => item !== null);

  return {fcmTokens, webPushSubscriptions};
}

async function sendWebPushToSubscriptions(
  subscriptions: StoredWebPushSubscription[],
  payload: Record<string, unknown>
): Promise<{sent: number; failed: number}> {
  if (subscriptions.length === 0) return {sent: 0, failed: 0};
  if (!configureWebPushIfPossible()) {
    return {sent: 0, failed: subscriptions.length};
  }

  const db = getFirestore();
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          subscription as PushSubscription,
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (error: unknown) {
        failed += 1;
        const statusCode = (error as {statusCode?: number})?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .doc(`users/${subscription.userId}/webPushSubscriptions/${subscription.id}`)
            .delete()
            .catch(() => undefined);
        }
      }
    })
  );

  return {sent, failed};
}

async function sendFcmToTokens(
  userId: string,
  storedTokens: StoredFcmToken[],
  message: ReturnType<typeof buildFcmMessage>
): Promise<{sent: number; failed: number}> {
  if (storedTokens.length === 0) {
    logger.info(`FCM: nenhum token válido para usuário ${userId}`);
    return {sent: 0, failed: 0};
  }

  const messaging = getMessaging();
  const db = getFirestore();
  const fcmResults = await Promise.allSettled(
    storedTokens.map((entry) =>
      messaging.send({...message, token: entry.token})
    )
  );

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < fcmResults.length; i++) {
    const result = fcmResults[i];
    const entry = storedTokens[i];
    if (result.status === "fulfilled") {
      sent += 1;
      continue;
    }

    failed += 1;
    const err = result.reason as {code?: string; message?: string};
    const code = err?.code ?? "";
    const platform = entry.platform ?? "unknown";

    if (isInvalidFcmTokenError(code)) {
      logger.warn(
        `FCM token inválido removido (${platform}) user=${userId} doc=${entry.docId} code=${code}`
      );
      await db
        .doc(`users/${userId}/tokens/${entry.docId}`)
        .delete()
        .catch((cleanupErr) => {
          logger.warn("Erro ao remover token FCM inválido", cleanupErr);
        });
    } else {
      logger.warn(
        `FCM send falhou (${platform}) user=${userId} code=${code}:`,
        err?.message ?? result.reason
      );
    }
  }

  logger.info(
    `FCM deliver user=${userId}: ${sent} ok, ${failed} falha(s), ${storedTokens.length} token(s)`
  );

  return {sent, failed};
}

export interface UserNotificationPrefs {
  pushEnabled: boolean;
  availableSlotsTopic: boolean;
  bookingsAndGamesTopic: boolean;
}

export async function loadUserNotificationPrefs(
  userId: string
): Promise<UserNotificationPrefs> {
  const snap = await getFirestore().doc(`users/${userId}`).get();
  const data = snap.data() ?? {};
  const prefs = data["notificationPreferences"];
  if (!prefs || typeof prefs !== "object") {
    return {pushEnabled: true, availableSlotsTopic: false, bookingsAndGamesTopic: true};
  }
  const channels = (prefs as {channels?: Record<string, unknown>}).channels;
  const topics = (prefs as {topics?: Record<string, unknown>}).topics;
  const pushEnabled = channels?.["push"] !== false;
  const availableSlotsTopic = topics?.["availableSlots"] === true;
  const bookingsAndGamesTopic = topics?.["bookingsAndGames"] !== false;
  return {pushEnabled, availableSlotsTopic, bookingsAndGamesTopic};
}

export interface DeliverNotificationInput {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
  requireInteraction?: boolean;
  /** Se true, grava apenas inbox (sem FCM/Web Push). */
  skipPush?: boolean;
}

/**
 * Envia push (FCM + Web Push) e grava histórico in-app em `users/{uid}/notifications`.
 */
export async function deliverNotificationToUser(
  input: DeliverNotificationInput
): Promise<{sent: number; failed: number}> {
  const {userId, title, body, type, data, requireInteraction = true, skipPush = false} = input;

  let fcmSuccessful = 0;
  let fcmFailed = 0;
  let webPushResult = {sent: 0, failed: 0};

  if (!skipPush) {
    const {fcmTokens, webPushSubscriptions} = await getUserNotificationChannels(userId);

    const message = buildFcmMessage({
      title,
      body,
      type,
      data,
      requireInteraction,
    });

    const fcmResult = await sendFcmToTokens(userId, fcmTokens, message);
    fcmSuccessful = fcmResult.sent;
    fcmFailed = fcmResult.failed;

    webPushResult = await sendWebPushToSubscriptions(webPushSubscriptions, {
      notification: {title, body},
      data: {...data, type},
      requireInteraction,
    });
  }

  const sent = fcmSuccessful + webPushResult.sent;
  const failed = fcmFailed + webPushResult.failed;

  try {
    await getFirestore().collection(`users/${userId}/notifications`).add({
      userId,
      title,
      body,
      type,
      data,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    });
  } catch (historyError) {
    logger.warn(`Histórico de notificação falhou para ${userId}`, historyError);
  }

  return {sent, failed};
}
