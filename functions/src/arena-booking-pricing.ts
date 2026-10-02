/**
 * Total da reserva de quadra calculado pelo SERVIDOR.
 *
 * `createArenaBooking` grava o total (promoções + cupom) em
 * `arenaBookingPricing/{bookingId}` no mesmo commit da reserva — coleção que
 * nenhum cliente lê nem escreve (firestore.rules). Quem cobra (PIX da reserva,
 * divisão em fatias) e quem fecha o pagamento (webhook) parte desse total, não
 * de `amountReais`/`amountToPayNowReais` do doc da reserva: até out/2026 as
 * rules deixavam o dono reescrevê-los e gerar um PIX de R$ 1.
 *
 * Reserva sem o doc (criada antes deste deploy; o PIX vence em
 * ARENA_BOOKING_PAYMENT_EXPIRY_MINUTES) cai no valor do próprio doc.
 */
import type {DocumentData, Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {roundMoney} from "./mercadopago-arena-helpers";

export const ARENA_BOOKING_PRICING = "arenaBookingPricing";

/** 0.5 (sinal) ou 1 (integral) — os únicos valores que createArenaBooking aceita. */
export function normalizeArenaBookingPaymentFraction(raw: unknown): number | null {
  const n = Number(raw);
  if (n === 0.5 || n === 1) return n;
  return null;
}

export type ArenaBookingChargeAmounts = {
  amountReais: number;
  paymentFraction: number;
  amountToPayNowReais: number;
  amountDueOnsiteReais: number;
  /** `server`: arenaBookingPricing; `booking_doc`: reserva legada, sem o doc de preço. */
  source: "server" | "booking_doc";
};

/** Total gravado na criação, ou `null` se a reserva não tem (legada) ou o valor é inválido. */
export async function readArenaBookingServerAmountReais(
  db: Firestore,
  bookingId: string,
): Promise<number | null> {
  const snap = await db.collection(ARENA_BOOKING_PRICING).doc(bookingId).get();
  if (!snap.exists) return null;
  const amount = Number(snap.data()?.amountReais);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * Total do servidor × fração — a pedida agora, senão a gravada na reserva,
 * senão integral. Fração fora de {0.5, 1} é ignorada, venha de onde vier.
 */
export function resolveArenaBookingChargeAmounts(params: {
  serverAmountReais: number | null;
  booking: DocumentData;
  requestedFraction?: unknown;
}): ArenaBookingChargeAmounts {
  const fromServer = params.serverAmountReais != null;
  const amountReais = roundMoney(
    fromServer ? params.serverAmountReais as number : Number(params.booking.amountReais),
  );
  const paymentFraction =
    normalizeArenaBookingPaymentFraction(params.requestedFraction) ??
    normalizeArenaBookingPaymentFraction(params.booking.paymentFraction) ??
    1;
  const amountToPayNowReais = roundMoney(amountReais * paymentFraction);
  return {
    amountReais,
    paymentFraction,
    amountToPayNowReais,
    amountDueOnsiteReais: roundMoney(amountReais - amountToPayNowReais),
    source: fromServer ? "server" : "booking_doc",
  };
}

/** Campos de valor do doc que divergem do calculado (`{}` quando já batem). */
export function arenaBookingAmountsPatch(
  booking: DocumentData,
  amounts: ArenaBookingChargeAmounts,
): Record<string, number> {
  const patch: Record<string, number> = {};
  for (const field of [
    "amountReais",
    "paymentFraction",
    "amountToPayNowReais",
    "amountDueOnsiteReais",
  ] as const) {
    if (Number(booking[field]) !== amounts[field]) patch[field] = amounts[field];
  }
  return patch;
}

/**
 * Valores a cobrar desta reserva, já regravados no doc quando divergem (doc
 * adulterado, ou o atleta trocou sinal ↔ integral): a tela e o webhook passam
 * a ver o mesmo número que vai para o Asaas.
 */
export async function resolveAndSyncArenaBookingChargeAmounts(
  db: Firestore,
  bookingId: string,
  booking: DocumentData,
  requestedFraction?: unknown,
): Promise<ArenaBookingChargeAmounts> {
  const serverAmountReais = await readArenaBookingServerAmountReais(db, bookingId);
  const amounts = resolveArenaBookingChargeAmounts({serverAmountReais, booking, requestedFraction});
  if (amounts.source === "booking_doc") {
    logger.warn(`arenaBookingPricing ausente em ${bookingId}: cobrando pelo doc (reserva legada)`);
  }
  const patch = arenaBookingAmountsPatch(booking, amounts);
  if (Object.keys(patch).length === 0) return amounts;
  if (amounts.source === "server" && "amountReais" in patch) {
    logger.warn(`Reserva ${bookingId}: amountReais do doc diverge do servidor`, {
      doc: booking.amountReais,
      server: amounts.amountReais,
    });
  }
  await db.collection("arenaBookings").doc(bookingId).update(patch);
  return amounts;
}
