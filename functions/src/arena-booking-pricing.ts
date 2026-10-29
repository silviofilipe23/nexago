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

export type ArenaBookingServerPricing = {
  /** Preço do horário (promoções + cupom). */
  amountReais: number;
  /** Parte paga com crédito de chuva — sai do que se cobra em dinheiro. */
  weatherCreditReais: number;
};

/** Doc de preço gravado na criação, ou `null` se a reserva não tem (legada) ou o valor é inválido. */
export async function readArenaBookingServerPricing(
  db: Firestore,
  bookingId: string,
): Promise<ArenaBookingServerPricing | null> {
  const snap = await db.collection(ARENA_BOOKING_PRICING).doc(bookingId).get();
  if (!snap.exists) return null;
  const amount = Number(snap.data()?.amountReais);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const credit = Number(snap.data()?.weatherCreditReais);
  return {
    amountReais: amount,
    weatherCreditReais: Number.isFinite(credit) && credit > 0 ? Math.min(credit, amount) : 0,
  };
}

/** Total gravado na criação, ou `null` se a reserva não tem (legada) ou o valor é inválido. */
export async function readArenaBookingServerAmountReais(
  db: Firestore,
  bookingId: string,
): Promise<number | null> {
  return (await readArenaBookingServerPricing(db, bookingId))?.amountReais ?? null;
}

/**
 * O que ainda se cobra em dinheiro: total do servidor menos o crédito de
 * chuva usado na criação. Reserva legada cai no `amountReais` do doc.
 */
export async function readArenaBookingChargeTotalReais(
  db: Firestore,
  bookingId: string,
  booking: DocumentData,
): Promise<number> {
  const pricing = await readArenaBookingServerPricing(db, bookingId);
  if (!pricing) return Number(booking.amountReais) || 0;
  return roundMoney(pricing.amountReais - pricing.weatherCreditReais);
}

/**
 * Total do servidor × fração — a pedida agora, senão a gravada na reserva,
 * senão integral. Fração fora de {0.5, 1} é ignorada, venha de onde vier.
 * O crédito de chuva (só do servidor) sai do total, e o resto vai integral.
 */
export function resolveArenaBookingChargeAmounts(params: {
  serverAmountReais: number | null;
  serverWeatherCreditReais?: number;
  booking: DocumentData;
  requestedFraction?: unknown;
}): ArenaBookingChargeAmounts {
  const fromServer = params.serverAmountReais != null;
  const amountReais = roundMoney(
    fromServer ? params.serverAmountReais as number : Number(params.booking.amountReais),
  );
  const credit = fromServer ? Math.min(amountReais, Math.max(0, params.serverWeatherCreditReais ?? 0)) : 0;
  const chargeBase = roundMoney(amountReais - credit);
  // Com crédito o resto vai integral: metade de um resto pequeno cairia abaixo
  // do mínimo do Pix.
  const paymentFraction = credit > 0 ? 1 :
    normalizeArenaBookingPaymentFraction(params.requestedFraction) ??
    normalizeArenaBookingPaymentFraction(params.booking.paymentFraction) ??
    1;
  const amountToPayNowReais = roundMoney(chargeBase * paymentFraction);
  return {
    amountReais,
    paymentFraction,
    amountToPayNowReais,
    amountDueOnsiteReais: roundMoney(chargeBase - amountToPayNowReais),
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
  const pricing = await readArenaBookingServerPricing(db, bookingId);
  const amounts = resolveArenaBookingChargeAmounts({
    serverAmountReais: pricing?.amountReais ?? null,
    serverWeatherCreditReais: pricing?.weatherCreditReais,
    booking,
    requestedFraction,
  });
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
