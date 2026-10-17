/**
 * Prévia do desconto do seguidor (código/link de embaixador do NexaSquad) no checkout.
 *
 * Espelho de `followerDiscountFor` em `functions/src/squad-commission-lifecycle.ts`: % sobre o preço
 * desta cobrança, arredondado ao centavo, sem deixar a cobrança abaixo do mínimo do Asaas. O valor
 * de verdade volta na resposta da cobrança (`squadDiscountReais`). Sai da taxa da nexaGO: o
 * organizador recebe o mesmo líquido.
 */
const MIN_CHARGE_CENTS = 500;

export function squadDiscountPreviewCents(priceReais: number, pct: number): number {
  if (!(pct > 0) || !(priceReais > 0)) return 0;
  const priceCents = Math.round(priceReais * 100);
  const raw = Math.round((priceCents * pct) / 100);
  return Math.max(0, Math.min(raw, priceCents - MIN_CHARGE_CENTS));
}

/** `squadDiscountReais` da resposta; backend antigo (sem o campo) → 0. */
export function readSquadDiscount(raw: object | null | undefined): number {
  const v = (raw as Record<string, unknown> | null | undefined)?.['squadDiscountReais'];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}
