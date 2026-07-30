/**
 * Processamento de notificações Mercado Pago para reservas de arena (`arenaBookings`).
 *
 * - `external_reference` = `arenaBooking:{bookingId}`
 * - Estados finais positivos: `approved` → booking `status: confirmed`, slot `booked`
 * - Estados finais negativos: `rejected`, `cancelled`, `refunded`, `charged_back` → libera quadra e locks
 * - `pending` / `in_process` / etc.: não marca como processado (aguarda próximo webhook)
 */

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {creditArenaWalletFromBooking} from "./arena-wallet";
import {computeSlotLockIds} from "./arena-booking-waitlist";
import {roundMoney} from "./mercadopago-arena-helpers";
import {isArenaEntitledPro} from "./arena-entitlement";
import {BOOKING_FEE_PERCENT, computePlatformFeeReais} from "./platform-fees";

import {
  ARENA_BOOKING_MP_REF_PREFIX,
} from "./arena-booking-payment-constants";

export {ARENA_BOOKING_PAYMENT_REF_PREFIX, ARENA_BOOKING_MP_REF_PREFIX} from "./arena-booking-payment-constants";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";

/** Aguarda outro webhook — não gravar em `mp_processed_payments`. */
const MERCADOPAGO_NON_TERMINAL_STATUSES = new Set([
  "pending",
  "in_process",
  "in_mediation",
  "authorized",
]);

const MERCADOPAGO_NEGATIVE_TERMINAL_STATUSES = new Set([
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
  "expired",
]);

export type MercadoPagoPaymentPayload = {
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
};

function lockDocIdsForBooking(booking: DocumentData): string[] {
  const arenaId = booking.arenaId as string | undefined;
  const courtId = booking.courtId as string | undefined;
  const dateKey = booking.date as string | undefined;
  const startTime = booking.startTime as string | undefined;
  const endTime = booking.endTime as string | undefined;
  if (!arenaId || !courtId || !dateKey || !startTime || !endTime) {
    return [];
  }
  // Mesma fórmula de `createArenaBooking` — inclusive endTime "00:00" virar
  // 24:00 (a versão local antiga zerava as horas e deixava locks órfãos).
  return computeSlotLockIds({arenaId, courtId, dateKey, startTime, endTime});
}

/**
 * Processa um pagamento MP cujo `external_reference` é reserva de arena.
 * Idempotência: usa `processedRef` (um doc por `paymentId` do MP).
 */
export async function processArenaBookingMercadoPagoNotification(
  db: Firestore,
  paymentId: string,
  payment: MercadoPagoPaymentPayload,
  processedRef: DocumentReference,
): Promise<void> {
  const externalRef = payment.external_reference || "";
  if (!externalRef.startsWith(ARENA_BOOKING_MP_REF_PREFIX)) {
    return;
  }

  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
    logger.info(`MP arena booking: payment ${paymentId} já processado`);
    return;
  }

  const bookingId = externalRef.slice(ARENA_BOOKING_MP_REF_PREFIX.length).trim();
  if (!bookingId) {
    logger.warn("MP arena booking: external_reference sem bookingId");
    return;
  }

  const status = (payment.status || "").toLowerCase();

  if (MERCADOPAGO_NON_TERMINAL_STATUSES.has(status)) {
    logger.info(`MP arena booking ${bookingId}: pagamento ${paymentId} ainda ${status} — aguardando`);
    return;
  }

  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    logger.warn(`MP arena booking: reserva ${bookingId} não encontrada`);
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

  if (status === "approved") {
    const amount = Number(payment.transaction_amount) || 0;
    if (amount <= 0) {
      logger.warn(`MP arena booking ${bookingId}: valor inválido`);
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
      amountPaidOnlineReais: paidOnline,
      amountDueOnsiteReais: dueOnsite,
      mercadopagoPaymentId: paymentId,
      mercadopagoPaidAmount: paidOnline,
      mercadopagoPaidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const slotsSnap = await db.collection(ARENA_SLOTS).where("bookingId", "==", bookingId).get();
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
        logger.error(`MP arena booking ${bookingId}: wallet credit failed`, walletErr);
      }
    }

    logger.info(
      `MP arena booking ${bookingId}: confirmada, paymentId=${paymentId}, amount=${amount}, status=${paymentStatus}`,
    );
    return;
  }

  if (MERCADOPAGO_NEGATIVE_TERMINAL_STATUSES.has(status)) {
    await releaseArenaBookingHold(db, bookingRef, booking, bookingId, paymentId, status);
    await processedRef.set({
      kind: "arenaBooking",
      bookingId,
      outcome: "rejected",
      mercadopagoPaymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    logger.info(`MP arena booking ${bookingId}: pagamento ${status}, reserva cancelada`);
    return;
  }

  logger.warn(`MP arena booking ${bookingId}: status MP não tratado: ${status}`);
}

/**
 * Remove slot(s) e locks da reserva após falha ou expiração do pagamento.
 */
export async function releaseArenaBookingHold(
  db: Firestore,
  bookingRef: DocumentReference,
  booking: DocumentData,
  bookingId: string,
  paymentId: string,
  mpStatus: string,
): Promise<void> {
  const batch = db.batch();

  const paymentStatus =
    mpStatus === "expired" ? "expired" : "rejected";

  batch.update(bookingRef, {
    status: "cancelled",
    paymentStatus,
    mercadopagoPaymentId: paymentId,
    mercadopagoLastPaymentStatus: mpStatus,
    cancelledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const slotsSnap = await db.collection(ARENA_SLOTS).where("bookingId", "==", bookingId).get();
  for (const doc of slotsSnap.docs) {
    batch.delete(doc.ref);
  }

  const lockIds = lockDocIdsForBooking(booking);
  for (const lockId of lockIds) {
    const lockRef = db.collection(ARENA_SLOT_LOCKS).doc(lockId);
    batch.delete(lockRef);
  }

  await batch.commit();
}
