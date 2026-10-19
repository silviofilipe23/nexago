/**
 * Cartão de crédito no aluguel de quadra: regras puras e a reconciliação com o
 * Asaas usadas pela cobrança, pelo "voltar sem pagar" e pela varredura de
 * reservas não pagas (arena-booking-pix.ts). Desenho em
 * docs/superpowers/specs/2026-10-19-reserva-quadra-cartao-design.md.
 */
import type {Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {ARENA_BOOKING_CARD_PAYMENT_EXPIRY_MINUTES} from "./arena-booking-constants";
import {supersededPaymentIdsOf} from "./arena-booking-split";
import {processArenaBookingAsaasNotification} from "./asaas-arena-booking-webhook";
import {
  deleteAsaasPaymentOrThrow,
  getAsaasPayment,
  type AsaasPaymentDetails,
} from "./asaas-booking-payment";
import {AsaasApiError} from "./asaas-client";
import {getFirebaseProjectId} from "./firebase-paths";

const MINUTE_MS = 60_000;

/**
 * Até quando a reserva segura o horário esperando o cartão: 15 min desde a
 * criação, sem nunca encurtar o prazo atual. Sem data de criação (doc antigo),
 * estica o atual em 10 min.
 */
export function cardPaymentDeadline(createdAt: Date | null, currentExpiresAt: Date): Date {
  const cardDeadlineMs = createdAt ?
    createdAt.getTime() + ARENA_BOOKING_CARD_PAYMENT_EXPIRY_MINUTES * MINUTE_MS :
    currentExpiresAt.getTime() + 10 * MINUTE_MS;
  return new Date(Math.max(currentExpiresAt.getTime(), cardDeadlineMs));
}

/**
 * O que fazer com a cobrança de cartão de uma reserva antes de liberar o
 * horário (varredura, "voltar sem pagar") ou de gerar outra cobrança:
 * aprovada/liquidada → reconcilia (a reserva é do atleta); em análise →
 * espera; o resto → apaga a cobrança e segue.
 */
export function decideCardChargeBeforeRelease(status: string): "reconcile" | "wait" | "delete" {
  const s = status.trim().toUpperCase();
  if (s === "CONFIRMED" || s === "RECEIVED" || s === "RECEIVED_IN_CASH") return "reconcile";
  if (s === "AWAITING_RISK_ANALYSIS") return "wait";
  return "delete";
}

/** Reserva dividida paga por fatias PIX próprias: o cartão não entra nela. */
export function cardChargeBlockReason(booking: Record<string, unknown>): string | null {
  if (booking.hasSplitShares === true || supersededPaymentIdsOf(booking).length > 0) {
    return "Reserva dividida só aceita PIX.";
  }
  return null;
}

/** A reserva está numa cobrança de cartão (ausente = PIX, todo o acervo). */
export function bookingUsesCard(booking: Record<string, unknown>): boolean {
  return booking.billingType === "CREDIT_CARD";
}

/**
 * Cobrança da reserva que o Asaas diz estar aprovada/liquidada: processa pelo
 * mesmo caminho do webhook (idempotente pelo doc do pagamento). É a rede
 * quando o aviso se perde ou atrasa.
 */
export async function reconcilePaidBookingCharge(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
): Promise<void> {
  const processedRef = db.doc(
    `artifacts/${getFirebaseProjectId()}/public/data/asaas_processed_payments/${paymentId}`,
  );
  await processArenaBookingAsaasNotification(db, paymentId, payment, processedRef);
}

/**
 * Quanto a varredura empurra uma reserva de cartão que não pôde soltar (em
 * análise, Asaas sem resposta): sem isso ela voltaria primeiro na fila a cada
 * minuto e, acumulando, deixaria as outras reservas vencidas sem vez.
 */
export const CARD_RETRY_BACKOFF_MS = 10 * MINUTE_MS;

export type CardChargeSettlement = "released" | "reconciled" | "wait" | "failed";

/**
 * Acerta a cobrança de cartão antes de soltar o horário ou de gerar outra
 * cobrança. `released` = a cobrança não pode mais ser paga (apagada agora ou
 * já removida); `reconciled` = estava aprovada e a reserva foi confirmada;
 * `wait` = em análise; `failed` = o Asaas não respondeu ou recusou apagar —
 * quem chamou NÃO solta o horário (tenta de novo depois).
 */
export async function settleCardChargeBeforeRelease(
  db: Firestore,
  paymentId: string,
): Promise<CardChargeSettlement> {
  let payment;
  try {
    payment = await getAsaasPayment(paymentId);
  } catch (e) {
    // Cobrança que o Asaas não conhece (id antigo, conta trocada) não pode ser paga.
    if (e instanceof AsaasApiError && e.httpStatus === 404) return "released";
    logger.warn("settleCardChargeBeforeRelease: cobrança não lida", {paymentId, error: String(e)});
    return "failed";
  }
  if (payment.deleted === true) return "released";
  const decision = decideCardChargeBeforeRelease(payment.status ?? "");
  if (decision === "reconcile") {
    await reconcilePaidBookingCharge(db, paymentId, payment);
    return "reconciled";
  }
  if (decision === "wait") return "wait";
  try {
    await deleteAsaasPaymentOrThrow(paymentId);
    return "released";
  } catch (e) {
    logger.warn("settleCardChargeBeforeRelease: cobrança não apagada", {paymentId, error: String(e)});
    return "failed";
  }
}
