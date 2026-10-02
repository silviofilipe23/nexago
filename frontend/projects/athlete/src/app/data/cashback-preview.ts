/**
 * Prévia do cashback no checkout — espelho de `reserveCashbackForCharge` do backend
 * (`functions/src/cashback-checkout.ts`). O servidor recalcula e devolve o valor real: a tela
 * mostra a prévia ANTES da cobrança e o que voltou DEPOIS. Puro, sem I/O.
 */
import { reaisToCents, type CashbackConfig } from './cashback-model';

/** `max(0, min(disponível, preço − mínimo em dinheiro))` — sempre sobra o mínimo no PIX. */
export function redeemablePreviewCents(input: {
  priceCents: number;
  availableCents: number;
  minCashCents: number;
}): number {
  return Math.max(0, Math.min(input.availableCents, input.priceCents - input.minCashCents));
}

export type CheckoutCashbackState =
  | { kind: 'hidden' }
  | { kind: 'earn'; ratePercent: number }
  | { kind: 'redeem'; availableCents: number; redeemableCents: number; minCashCents: number; capped: boolean };

/** Os três estados do toggle: recurso desligado → nada; sem saldo usável → só "Ganhe até X%";
 *  com saldo usável → o switch (`capped` quando o mínimo em dinheiro travou o uso). */
export function checkoutCashbackState(input: {
  priceReais: number;
  availableCents: number;
  config: CashbackConfig;
}): CheckoutCashbackState {
  const { config } = input;
  if (!config.enabled) return { kind: 'hidden' };
  const redeemableCents = redeemablePreviewCents({
    priceCents: reaisToCents(input.priceReais),
    availableCents: input.availableCents,
    minCashCents: config.minCashCents,
  });
  if (redeemableCents <= 0) return { kind: 'earn', ratePercent: config.ratePercent };
  return {
    kind: 'redeem',
    availableCents: input.availableCents,
    redeemableCents,
    minCashCents: config.minCashCents,
    capped: redeemableCents < input.availableCents,
  };
}

/** Centavos de saldo que esta cobrança vai pedir: zero com o switch desligado, o recurso
 *  desligado ou nada usável (preço trocado depois de ligar o switch, por exemplo). É o MESMO
 *  número que decide se a callable recebe `useCashback: true`. */
export function appliedPreviewCents(input: {
  use: boolean;
  priceReais: number;
  availableCents: number;
  config: CashbackConfig;
}): number {
  if (!input.use) return 0;
  const state = checkoutCashbackState(input);
  return state.kind === 'redeem' ? state.redeemableCents : 0;
}

export interface CashbackChargeFields {
  /** Parte paga com saldo (0 sem saldo). */
  cashbackAppliedReais: number;
  /** O que a cobrança no Asaas vale de fato — o QR/checkout mostra este. */
  chargedReais: number;
}

/** Campos novos da resposta das callables. Backend antigo (sem eles) → nada aplicado e o valor
 *  cobrado é o preço. */
export function readCashbackCharge(raw: object | null | undefined, priceReais: number): CashbackChargeFields {
  const r = (raw ?? {}) as Record<string, unknown>;
  const applied = r['cashbackAppliedReais'];
  const charged = r['chargedReais'];
  return {
    cashbackAppliedReais: typeof applied === 'number' && Number.isFinite(applied) && applied > 0 ? applied : 0,
    chargedReais: typeof charged === 'number' && Number.isFinite(charged) && charged > 0 ? charged : priceReais,
  };
}

/** Resposta de callable cujo preço é `amountReais` (inscrição e clubinho) + os campos de
 *  cashback normalizados. */
export function withCashbackCharge<T extends { amountReais: number }>(data: T): T & CashbackChargeFields {
  return { ...data, ...readCashbackCharge(data, Number(data.amountReais) || 0) };
}
