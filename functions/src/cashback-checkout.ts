/**
 * Saldo de cashback nas callables de cobrança (inscrição, reserva, clubinho).
 *
 * Sequência em todas: preço → `reserveCashbackForCharge` → cobrança no Asaas
 * por `chargeReais` → `attachHoldPayment` → grava `cashbackAppliedCents` e
 * `cashbackHoldId` no registro da cobrança. Falha no Asaas →
 * `releaseCashbackHoldQuietly`. Cliente que não manda `useCashback: true`
 * (inclusive o app antigo) paga exatamente como antes.
 */
import type {Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {readCashbackConfig} from "./cashback-config";
import {centsToReais, toCents, type CashbackSourceType} from "./cashback-rules";
import {holdCashback, releaseHold} from "./athlete-wallet";

export type CashbackReservation = {
  holdId: string | null;
  appliedCents: number;
  chargeReais: number;
};

export async function reserveCashbackForCharge(
  db: Firestore,
  p: {
    uid: string;
    useCashback: unknown;
    priceReais: number;
    sourceType: CashbackSourceType;
    sourceId: string;
    trackingPath: string;
    label: string;
    nowMs: number;
  },
): Promise<CashbackReservation> {
  const priceCents = toCents(p.priceReais);
  const none: CashbackReservation = {
    holdId: null,
    appliedCents: 0,
    chargeReais: centsToReais(priceCents),
  };
  if (p.useCashback !== true) return none;
  const config = await readCashbackConfig(db);
  if (!config.enabled) return none;
  // Sempre sobra o mínimo em dinheiro: existe cobrança no Asaas e o webhook
  // continua sendo a única porta de confirmação.
  const maxCents = priceCents - config.minCashCents;
  if (maxCents <= 0) return none;
  const {holdId, appliedCents} = await holdCashback(db, {
    uid: p.uid,
    maxCents,
    sourceType: p.sourceType,
    sourceId: p.sourceId,
    trackingPath: p.trackingPath,
    label: p.label,
    nowMs: p.nowMs,
  });
  return {holdId, appliedCents, chargeReais: centsToReais(priceCents - appliedCents)};
}

export async function releaseCashbackHoldQuietly(
  db: Firestore,
  uid: string,
  holdId: string | null | undefined,
  nowMs: number,
): Promise<void> {
  if (!holdId) return;
  try {
    await releaseHold(db, uid, holdId, nowMs);
  } catch (e) {
    logger.error("cashback: falha ao devolver a reserva — a varredura de 5 min devolve", {
      uid,
      holdId,
      error: String(e),
    });
  }
}

/** Com saldo aplicado o valor muda: a mesma chave devolveria a cobrança antiga no Asaas. */
export function cashbackIdempotencyKey(baseKey: string, holdId: string | null): string {
  return holdId ? `${baseKey}-${holdId}` : baseKey;
}

export function cashbackResponseFields(
  reservation: CashbackReservation,
): {cashbackAppliedReais: number; chargedReais: number} {
  return {
    cashbackAppliedReais: centsToReais(reservation.appliedCents),
    chargedReais: reservation.chargeReais,
  };
}
