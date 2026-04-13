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

export const ARENA_BOOKING_MP_REF_PREFIX = "arenaBooking:";

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
]);

export type MercadoPagoPaymentPayload = {
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
};

function safeIdPart(s: string): string {
  return s.replace(/\//g, "_");
}

function toMinutes(hhmm: string): number {
  const t = hhmm.trim();
  const parts = t.split(":");
  const h = parseInt(parts[0] || "0", 10) || 0;
  const m = parts.length > 1 ? (parseInt(parts[1], 10) || 0) : 0;
  return h * 60 + m;
}

function calendarHoursSpanning(startMin: number, endMin: number): number[] {
  if (endMin <= startMin) {
    return [];
  }
  const startH = Math.floor(startMin / 60);
  const endH = Math.floor((endMin - 1) / 60);
  const out: number[] = [];
  for (let h = startH; h <= endH; h++) {
    out.push(h);
  }
  return out;
}

function lockDocIdsForBooking(booking: DocumentData): string[] {
  const arenaId = booking.arenaId as string | undefined;
  const courtId = booking.courtId as string | undefined;
  const dateKey = booking.date as string | undefined;
  const startTime = booking.startTime as string | undefined;
  const endTime = booking.endTime as string | undefined;
  if (!arenaId || !courtId || !dateKey || !startTime || !endTime) {
    return [];
  }
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  const hours = calendarHoursSpanning(startMin, endMin);
  const safeArena = safeIdPart(arenaId);
  const safeCourt = safeIdPart(courtId);
  return hours.map(
    (h) => `${safeArena}_${safeCourt}_${dateKey}_h${h.toString().padStart(2, "0")}`,
  );
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

    const batch = db.batch();
    batch.update(bookingRef, {
      status: "confirmed",
      paymentStatus: "paid",
      mercadopagoPaymentId: paymentId,
      mercadopagoPaidAmount: amount,
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
    logger.info(`MP arena booking ${bookingId}: confirmada, paymentId=${paymentId}, amount=${amount}`);
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
 * Remove slot(s) e locks da reserva após falha do pagamento.
 */
async function releaseArenaBookingHold(
  db: Firestore,
  bookingRef: DocumentReference,
  booking: DocumentData,
  bookingId: string,
  paymentId: string,
  mpStatus: string,
): Promise<void> {
  const batch = db.batch();

  batch.update(bookingRef, {
    status: "cancelled",
    paymentStatus: "rejected",
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
