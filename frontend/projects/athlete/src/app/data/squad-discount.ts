/**
 * Prévia do desconto do seguidor (código/link de embaixador do NexaSquad) no checkout.
 *
 * Espelho de `followerDiscountFor` (functions/src/squad-commission-lifecycle.ts) e do teto de
 * `squad-fee-cap.ts`: % sobre o preço desta cobrança, arredondado ao centavo, sem deixar a cobrança
 * abaixo do mínimo do Asaas e sem passar da taxa da plataforma — o desconto sai da taxa da nexaGO
 * (o organizador recebe o mesmo líquido). O valor de verdade volta na cobrança (`squadDiscountReais`).
 */
const MIN_CHARGE_CENTS = 500;
/** Piso da taxa por transação — `FEE_FLOOR_REAIS` de `functions/src/platform-fees.ts`. */
const FEE_FLOOR_CENTS = 150;

/** Taxa da plataforma em centavos, como `computePlatformFeeReais`; `null` = sem organizador. */
export function platformFeeCents(priceReais: number, feePercent: number | null): number | null {
  if (feePercent === null) return null;
  if (!(priceReais > 0) || !(feePercent > 0)) return 0;
  const priceCents = Math.round(priceReais * 100);
  const pctFee = Math.round((priceCents * feePercent) / 100);
  return Math.max(0, Math.min(priceCents - 1, Math.max(FEE_FLOOR_CENTS, pctFee)));
}

export function squadDiscountPreviewCents(priceReais: number, pct: number, feePercent: number | null = null): number {
  if (!(pct > 0) || !(priceReais > 0)) return 0;
  const priceCents = Math.round(priceReais * 100);
  const raw = Math.round((priceCents * pct) / 100);
  const feeCap = platformFeeCents(priceReais, feePercent) ?? Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(raw, priceCents - MIN_CHARGE_CENTS, feeCap));
}

/** `squadDiscountReais` da resposta; backend antigo (sem o campo) → 0. */
export function readSquadDiscount(raw: object | null | undefined): number {
  const v = (raw as Record<string, unknown> | null | undefined)?.['squadDiscountReais'];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}
