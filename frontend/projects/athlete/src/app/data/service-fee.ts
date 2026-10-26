/**
 * Prévia da "Taxa de serviço" no checkout de inscrição em torneio.
 *
 * Espelho de `athleteFeeReais` / `tournamentFeeReais` (functions/src/tournament-fees.ts) e de
 * `computePlatformFeeReais` (functions/src/platform-fees.ts). "Quem paga" (`payer`) decide quanto
 * da taxa da plataforma vai POR CIMA do preço: nada (organizador, como sempre foi), toda (atleta)
 * ou metade arredondada para baixo (dividido; o centavo ímpar fica com o organizador). A taxa
 * incide sobre o PREÇO desta cobrança, nunca sobre o valor já com desconto/cashback.
 *
 * É só prévia: a cobrança refaz a conta no servidor e devolve o valor de verdade
 * (`serviceFeeReais`). Puro, sem I/O.
 */

export type ServiceFeePayer = 'atleta' | 'organizador' | 'dividido';

/** Regra visível ao atleta (`getTournamentServiceFee`). */
export interface ServiceFeeRule {
  percent: number;
  floorReais: number;
  payer: ServiceFeePayer;
}

/** Organizador pagando (ou regra indisponível): nada por cima do preço. */
export const NO_SERVICE_FEE: ServiceFeeRule = { percent: 0, floorReais: 0, payer: 'organizador' };

const PAYERS: readonly ServiceFeePayer[] = ['atleta', 'organizador', 'dividido'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function positiveOrZero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Resposta da callable normalizada. Qualquer coisa fora do contrato vira "sem taxa". */
export function serviceFeeRuleFromRaw(raw: unknown): ServiceFeeRule {
  const r = (raw ?? {}) as Record<string, unknown>;
  const payer = r['payer'];
  if (typeof payer !== 'string' || !PAYERS.includes(payer as ServiceFeePayer) || payer === 'organizador') {
    return NO_SERVICE_FEE;
  }
  return { percent: positiveOrZero(r['percent']), floorReais: positiveOrZero(r['floorReais']), payer: payer as ServiceFeePayer };
}

/** Taxa da plataforma sobre o preço: % ou piso, nunca o preço inteiro (sobra ao menos R$ 0,01). */
export function platformServiceFeeReais(priceReais: number, rule: Pick<ServiceFeeRule, 'percent' | 'floorReais'>): number {
  if (!(priceReais > 0) || !(rule.percent > 0)) return 0;
  const pct = round2((priceReais * rule.percent) / 100);
  return Math.max(0, Math.min(round2(priceReais - 0.01), round2(Math.max(rule.floorReais, pct))));
}

/** Parte da taxa que o atleta paga por cima do preço desta cobrança. */
export function athleteServiceFeeReais(priceReais: number, rule: ServiceFeeRule): number {
  if (rule.payer === 'organizador') return 0;
  const feeCents = Math.round(platformServiceFeeReais(priceReais, rule) * 100);
  return (rule.payer === 'atleta' ? feeCents : Math.floor(feeCents / 2)) / 100;
}

/** `serviceFeeReais` da resposta da cobrança; backend antigo (sem o campo) → 0. */
export function readServiceFee(raw: object | null | undefined): number {
  const v = (raw as Record<string, unknown> | null | undefined)?.['serviceFeeReais'];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}
