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

async function getUserNotificationChannels(
  userId: string
): Promise<{fcmTokens: string[]; webPushSubscriptions: StoredWebPushSubscription[]}> {
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
      return doc.id;
    })
    .filter((t) => t.length > 0);

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

  return {fcmTokens: Array.from(new Set(fcmTokens)), webPushSubscriptions};
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

export interface UserNotificationPrefs {
  pushEnabled: boolean;
  availableSlotsTopic: boolean;
}

export async function loadUserNotificationPrefs(
  userId: string
): Promise<UserNotificationPrefs> {
  const snap = await getFirestore().doc(`users/${userId}`).get();
  const data = snap.data() ?? {};
  const prefs = data["notificationPreferences"];
  if (!prefs || typeof prefs !== "object") {
    return {pushEnabled: true, availableSlotsTopic: false};
  }
  const channels = (prefs as {channels?: Record<string, unknown>}).channels;
  const topics = (prefs as {topics?: Record<string, unknown>}).topics;
  const pushEnabled = channels?.["push"] !== false;
  const availableSlotsTopic = topics?.["availableSlots"] === true;
  return {pushEnabled, availableSlotsTopic};
}

export interface DeliverNotificationInput {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
  requireInteraction?: boolean;
}

/**
 * Envia push (FCM + Web Push) e grava histórico in-app em `users/{uid}/notifications`.
 */
export async function deliverNotificationToUser(
  input: DeliverNotificationInput
): Promise<{sent: number; failed: number}> {
  const {userId, title, body, type, data, requireInteraction = true} = input;
  const {fcmTokens, webPushSubscriptions} = await getUserNotificationChannels(userId);
  const messaging = getMessaging();

  const message = {
    notification: {title, body},
    data: {
      ...data,
      type,
      requireInteraction: requireInteraction ? "true" : "false",
    },
    android: {
      priority: "high" as const,
      notification: {channelId: "default", sound: "default"},
    },
    apns: {
      headers: {"apns-priority": "10"},
      payload: {aps: {sound: "default"}},
    },
  };

  const fcmResults =
    fcmTokens.length > 0
      ? await Promise.allSettled(
        fcmTokens.map((token) => messaging.send({...message, token}))
      )
      : [];

  const fcmSuccessful = fcmResults.filter((r) => r.status === "fulfilled").length;
  const fcmFailed = fcmResults.length - fcmSuccessful;

  const webPushResult = await sendWebPushToSubscriptions(webPushSubscriptions, {
    notification: {title, body},
    data: {...data, type},
    requireInteraction,
  });

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
