/**
 * Processamento de webhooks Asaas para reservas de arena (`arenaBookings`).
 */

import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";
import {creditArenaWalletFromBooking} from "./arena-wallet";
import {roundMoney} from "./mercadopago-arena-helpers";
import {isArenaEntitledPro} from "./arena-entitlement";
import {BOOKING_FEE_PERCENT, computePlatformFeeReais} from "./platform-fees";
import {releaseArenaBookingHold} from "./mercadopago-arena-booking-webhook";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";
import {
  finalizeArenaBookingIfAllSharesResolved,
  parseArenaBookingShareExternalReference,
} from "./arena-booking-split";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const PAYMENT_SHARES = "paymentShares";

/** Não confirma reserva — aguarda RECEIVED ou evento negativo. */
const ASAAS_NON_TERMINAL_STATUSES = new Set([
  "PENDING",
  "AWAITING_RISK_ANALYSIS",
  "CONFIRMED",
]);

const ASAAS_PAID_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH"]);

const ASAAS_NEGATIVE_TERMINAL_STATUSES = new Set([
  "OVERDUE",
  "REFUNDED",
  "REFUND_REQUESTED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED",
  "DUNNING_RECEIVED",
  "DELETED",
]);

export async function processArenaBookingAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
): Promise<void> {
  const externalRef = (payment.externalReference || "").trim();
  if (!externalRef.startsWith(ARENA_BOOKING_PAYMENT_REF_PREFIX)) {
    return;
  }

  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
    logger.info(`Asaas arena booking: payment ${paymentId} já processado`);
    return;
  }

  const bookingId = externalRef.slice(ARENA_BOOKING_PAYMENT_REF_PREFIX.length).trim();
  if (!bookingId) {
    logger.warn("Asaas arena booking: externalReference sem bookingId");
    return;
  }

  const status = (payment.status || "").toUpperCase();

  if (ASAAS_NON_TERMINAL_STATUSES.has(status)) {
    logger.info(
      `Asaas arena booking ${bookingId}: pagamento ${paymentId} ainda ${status} — aguardando`,
    );
    return;
  }

  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    logger.warn(`Asaas arena booking: reserva ${bookingId} não encontrada`);
    await processedRef.set({
      kind: "arenaBooking",
      bookingId,
      outcome: "orphan",
      paymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const booking = bookingSnap.data()!;

  if (ASAAS_PAID_STATUSES.has(status)) {
    const amount = Number(payment.value) || 0;
    if (amount <= 0) {
      logger.warn(`Asaas arena booking ${bookingId}: valor inválido`);
      return;
    }

    const totalReais = Number(booking.amountReais) || 0;
    const fraction = Number(booking.paymentFraction) || 1;
    const paidOnline = roundMoney(amount);
    const dueOnsite = roundMoney(Math.max(0, totalReais - paidOnline));
    const isPartial = fraction < 0.99 || dueOnsite > 0.02;
    const paymentStatus = isPartial ? "partial" : "paid";
    const arenaId = booking.arenaId as string | undefined;

    // Taxa só para arenas no plano gratuito; Pro/Parceiro isentos.
    let platformFee = 0;
    if (arenaId) {
      const arenaSnap = await db.collection("arenas").doc(arenaId).get();
      const entitled = arenaSnap.exists &&
        isArenaEntitledPro(arenaSnap.data() ?? {}, Date.now());
      platformFee = entitled ?
        0 :
        computePlatformFeeReais(paidOnline, BOOKING_FEE_PERCENT);
    }

    const batch = db.batch();
    batch.update(bookingRef, {
      status: "confirmed",
      paymentStatus,
      paymentChannel: booking.paymentChannel ?? "pix",
      paymentProvider: "asaas",
      amountPaidOnlineReais: paidOnline,
      amountDueOnsiteReais: dueOnsite,
      asaasPaymentId: paymentId,
      asaasPaidAmount: paidOnline,
      asaasPaidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const slotsSnap = await db
      .collection(ARENA_SLOTS)
      .where("bookingId", "==", bookingId)
      .get();
    for (const doc of slotsSnap.docs) {
      batch.update(doc.ref, {
        status: "booked",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    batch.set(processedRef, {
      kind: "arenaBooking",
      bookingId,
      outcome: "approved",
      processedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    if (arenaId) {
      try {
        await creditArenaWalletFromBooking(
          db,
          arenaId,
          bookingId,
          paidOnline,
          platformFee,
        );
      } catch (walletErr) {
        logger.error(`Asaas arena booking ${bookingId}: wallet credit failed`, walletErr);
      }
    }

    logger.info(
      `Asaas arena booking ${bookingId}: confirmada, paymentId=${paymentId}, amount=${amount}`,
    );
    return;
  }

  if (ASAAS_NEGATIVE_TERMINAL_STATUSES.has(status)) {
    const mpStatus = status === "OVERDUE" ? "expired" : status.toLowerCase();
    await releaseArenaBookingHold(db, bookingRef, booking, bookingId, paymentId, mpStatus);
    await processedRef.set({
      kind: "arenaBooking",
      bookingId,
      outcome: "rejected",
      asaasPaymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    logger.info(`Asaas arena booking ${bookingId}: pagamento ${status}, reserva cancelada`);
    return;
  }

  logger.warn(`Asaas arena booking ${bookingId}: status Asaas não tratado: ${status}`);
}

/**
 * Split de pagamento: resolve o pagamento de UMA fatia
 * (`arenaBookings/{bookingId}/paymentShares/{shareId}`), distinta do
 * pagamento único da reserva tratado acima — `externalReference` usa o
 * prefixo `arenaBookingShare:` (vs. `arenaBooking:`), então nunca colidem.
 */
export async function processArenaBookingShareAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
): Promise<void> {
  const parsed = parseArenaBookingShareExternalReference(
    (payment.externalReference || "").trim(),
  );
  if (!parsed) return;
  const {bookingId, shareId} = parsed;

  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
    logger.info(`Asaas arena booking share: payment ${paymentId} já processado`);
    return;
  }

  const status = (payment.status || "").toUpperCase();
  if (ASAAS_NON_TERMINAL_STATUSES.has(status)) {
    logger.info(
      `Asaas arena booking share ${bookingId}/${shareId}: pagamento ${paymentId} ainda ${status}`,
    );
    return;
  }

  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const shareRef = bookingRef.collection(PAYMENT_SHARES).doc(shareId);
  const shareSnap = await shareRef.get();
  if (!shareSnap.exists) {
    logger.warn(`Asaas arena booking share: fatia ${shareId} não encontrada (reserva ${bookingId})`);
    await processedRef.set({
      kind: "arenaBookingShare",
      bookingId,
      shareId,
      outcome: "orphan",
      paymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const share = shareSnap.data()!;
  if ((share.status as string | undefined) !== "pending") {
    // Já paga ou já expirada (covered_by_organizer) — não reprocessa.
    await processedRef.set({
      kind: "arenaBookingShare",
      bookingId,
      shareId,
      outcome: "already_resolved",
      paymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (ASAAS_PAID_STATUSES.has(status)) {
    const paidOnline = roundMoney(Number(payment.value) || 0);
    if (paidOnline <= 0) {
      logger.warn(`Asaas arena booking share ${bookingId}/${shareId}: valor inválido`);
      return;
    }

    const bookingSnap = await bookingRef.get();
    const booking = bookingSnap.data() ?? {};
    const arenaId = booking.arenaId as string | undefined;

    let platformFee = 0;
    if (arenaId) {
      const arenaSnap = await db.collection("arenas").doc(arenaId).get();
      const entitled = arenaSnap.exists &&
        isArenaEntitledPro(arenaSnap.data() ?? {}, Date.now());
      platformFee = entitled ?
        0 :
        computePlatformFeeReais(paidOnline, BOOKING_FEE_PERCENT);
    }

    const batch = db.batch();
    batch.set(shareRef, {
      status: "paid",
      asaasPaidAmount: paidOnline,
      paidAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    batch.set(bookingRef, {
      amountPaidOnlineReais: FieldValue.increment(paidOnline),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    batch.set(processedRef, {
      kind: "arenaBookingShare",
      bookingId,
      shareId,
      outcome: "approved",
      processedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    if (arenaId) {
      try {
        await creditArenaWalletFromBooking(db, arenaId, bookingId, paidOnline, platformFee);
      } catch (walletErr) {
        logger.error(
          `Asaas arena booking share ${bookingId}/${shareId}: wallet credit failed`,
          walletErr,
        );
      }
    }

    try {
      await finalizeArenaBookingIfAllSharesResolved(db, bookingId);
    } catch (finalizeErr) {
      logger.error(
        `Asaas arena booking share ${bookingId}/${shareId}: finalize failed`,
        finalizeErr,
      );
    }

    logger.info(
      `Asaas arena booking share ${bookingId}/${shareId}: paga, paymentId=${paymentId}, amount=${paidOnline}`,
    );
    return;
  }

  if (ASAAS_NEGATIVE_TERMINAL_STATUSES.has(status)) {
    // Não expira aqui: o job `expireArenaBookingPaymentShares` cuida da
    // transferência pro dono no prazo certo (2h antes do jogo). Só registra
    // o evento pra não reprocessar o mesmo paymentId.
    await processedRef.set({
      kind: "arenaBookingShare",
      bookingId,
      shareId,
      outcome: "rejected",
      asaasPaymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    logger.info(`Asaas arena booking share ${bookingId}/${shareId}: pagamento ${status}`);
    return;
  }

  logger.warn(
    `Asaas arena booking share ${bookingId}/${shareId}: status Asaas não tratado: ${status}`,
  );
}
