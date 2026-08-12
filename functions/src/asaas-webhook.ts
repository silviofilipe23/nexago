import {onRequest} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  ASAAS_WEBHOOK_ACCESS_TOKEN,
  asaasArenaSecrets,
} from "./asaas-client";
import {PLATFORM_FEE_FIXED_BRL} from "./mercadopago-arena-helpers";
import {getAsaasPayment} from "./asaas-booking-payment";
import {
  processArenaBookingAsaasNotification,
  processArenaBookingShareAsaasNotification,
} from "./asaas-arena-booking-webhook";
import {
  ARENA_BOOKING_PAYMENT_REF_PREFIX,
  ARENA_BOOKING_SHARE_PAYMENT_REF_PREFIX,
  ARENA_SUBSCRIPTION_REF_PREFIX,
  TOURNAMENT_REGISTRATION_PAYMENT_REF_PREFIX,
} from "./arena-booking-payment-constants";
import {processArenaWithdrawalTransferWebhook} from "./asaas-withdrawal-webhook";
import {processTournamentRegistrationAsaasNotification} from "./asaas-tournament-registration-webhook";
import {processArenaSubscriptionAsaasNotification} from "./asaas-arena-subscription-webhook";
import {processArenaClubSessionAsaasNotification} from "./asaas-arena-club-webhook";
import {ARENA_CLUB_SESSION_PAYMENT_REF_PREFIX} from "./arena-club-constants";
import {getFirebaseProjectId} from "./firebase-paths";
import {WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";

const PAYMENT_EVENTS = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
]);


type AsaasWebhookBody = {
  event?: string;
  payment?: {id?: string; externalReference?: string};
  transfer?: {id?: string; externalReference?: string};
};

/**
 * Webhook Asaas — reservas (`arenaBooking:*`) e inscrições (`tournamentRegistration:*`).
 */
export const asaasWebhook = onRequest({
  secrets: [...asaasArenaSecrets, PLATFORM_FEE_FIXED_BRL, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  let expectedToken = "";
  try {
    expectedToken = ASAAS_WEBHOOK_ACCESS_TOKEN.value()?.trim() ?? "";
  } catch {
    logger.error("ASAAS_WEBHOOK_ACCESS_TOKEN não configurado.");
    res.status(500).send("Config error");
    return;
  }

  if (!expectedToken) {
    logger.error("ASAAS_WEBHOOK_ACCESS_TOKEN vazio.");
    res.status(500).send("Config error");
    return;
  }

  const receivedToken = (req.get("asaas-access-token") || "").trim();
  if (receivedToken !== expectedToken) {
    logger.warn("asaasWebhook: token inválido");
    res.status(401).send("Unauthorized");
    return;
  }

  let body: AsaasWebhookBody;
  try {
    if (typeof req.body === "string") {
      body = JSON.parse(req.body) as AsaasWebhookBody;
    } else if (req.body && typeof req.body === "object") {
      body = req.body as AsaasWebhookBody;
    } else {
      body = {};
    }
  } catch {
    res.status(400).send("Bad Request");
    return;
  }

  const event = (body.event || "").trim().toUpperCase();
  if (!event) {
    res.status(200).send("OK");
    return;
  }

  if (event.startsWith("TRANSFER_")) {
    const db = getFirestore();
    try {
      await processArenaWithdrawalTransferWebhook(db, event, body.transfer);
    } catch (e) {
      logger.error(`asaasWebhook transfer handler failed event=${event}`, e);
    }
    res.status(200).send("OK");
    return;
  }

  if (!PAYMENT_EVENTS.has(event)) {
    res.status(200).send("OK");
    return;
  }

  const paymentId = body.payment?.id?.trim();
  if (!paymentId) {
    res.status(200).send("OK");
    return;
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();
  const processedRef = db.doc(
    `artifacts/${projectId}/public/data/asaas_processed_payments/${paymentId}`,
  );

  try {
    const payment = await getAsaasPayment(paymentId);
    const externalRef = (payment.externalReference || "").trim();
    const subscriptionRef = (payment.subscription || "").trim();
    if (externalRef.startsWith(TOURNAMENT_REGISTRATION_PAYMENT_REF_PREFIX)) {
      await processTournamentRegistrationAsaasNotification(
        db,
        paymentId,
        payment,
        processedRef,
      );
    } else if (externalRef.startsWith(ARENA_CLUB_SESSION_PAYMENT_REF_PREFIX)) {
      await processArenaClubSessionAsaasNotification(db, paymentId, payment, processedRef);
    } else if (externalRef.startsWith(ARENA_BOOKING_SHARE_PAYMENT_REF_PREFIX)) {
      await processArenaBookingShareAsaasNotification(db, paymentId, payment, processedRef);
    } else if (externalRef.startsWith(ARENA_BOOKING_PAYMENT_REF_PREFIX)) {
      await processArenaBookingAsaasNotification(db, paymentId, payment, processedRef);
    } else if (externalRef.startsWith(ARENA_SUBSCRIPTION_REF_PREFIX) || subscriptionRef) {
      // Cobranças geradas por assinatura de plano de arena (o handler valida o ref).
      await processArenaSubscriptionAsaasNotification(db, paymentId, payment, processedRef);
    }
  } catch (e) {
    logger.error(`asaasWebhook failed paymentId=${paymentId} event=${event}`, e);
  }

  res.status(200).send("OK");
});
