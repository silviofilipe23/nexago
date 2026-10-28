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

/**
 * Taxa da plataforma em centavos, como `computePlatformFeeReais`; `null` = sem teto (torneio sem
 * organizador). O piso é o da plataforma; o clubinho não tem piso (`floorCents` 0).
 */
export function platformFeeCents(
  priceReais: number,
  feePercent: number | null,
  floorCents: number = FEE_FLOOR_CENTS,
): number | null {
  if (feePercent === null) return null;
  if (!(priceReais > 0) || !(feePercent > 0)) return 0;
  const priceCents = Math.round(priceReais * 100);
  const pctFee = Math.round((priceCents * feePercent) / 100);
  return Math.max(0, Math.min(priceCents - 1, Math.max(floorCents, pctFee)));
}

/** Vale para inscrição, reserva de quadra e clubinho — muda só a taxa (e o piso) da cobrança. */
export function squadDiscountPreviewCents(
  priceReais: number,
  pct: number,
  feePercent: number | null = null,
  floorCents: number = FEE_FLOOR_CENTS,
): number {
  if (!(pct > 0) || !(priceReais > 0)) return 0;
  const priceCents = Math.round(priceReais * 100);
  const raw = Math.round((priceCents * pct) / 100);
  const feeCap = platformFeeCents(priceReais, feePercent, floorCents) ?? Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(raw, priceCents - MIN_CHARGE_CENTS, feeCap));
}

/**
 * Benefício "Inscrições" do próprio embaixador no checkout (espelho de `OwnPerkView` em
 * functions/src/squad-own-perk.ts): % na parcela dele, ou se ainda há parcela grátis no mês
 * (`remaining: null` = "ilimitadas", com teto oculto).
 */
export type OwnPerk =
  | { type: 'discount'; pct: number }
  | { type: 'free'; available: boolean; remaining: number | null };

/** `ownPerk` do `checkSquadCode`; ausente ou malformado (backend antigo) → `null`. */
export function ownPerkFromRaw(raw: unknown): OwnPerk | null {
  const r = raw as Record<string, unknown> | null | undefined;
  if (r?.['type'] === 'discount' && typeof r['pct'] === 'number' && r['pct'] > 0) {
    return { type: 'discount', pct: r['pct'] };
  }
  if (r?.['type'] === 'free') {
    return { type: 'free', available: r['available'] === true, remaining: typeof r['remaining'] === 'number' ? r['remaining'] : null };
  }
  return null;
}

/**
 * Prévia do desconto do embaixador na própria parcela (espelho de `perkDiscountCents`): % da parcela
 * dele, sem deixar a cobrança — já sem o desconto do seguidor — abaixo do mínimo do Asaas.
 */
export function ownPerkPreviewCents(pct: number, shareReais: number, chargeReais: number, otherDiscountReais: number): number {
  if (!(pct > 0) || !(shareReais > 0)) return 0;
  const shareCents = Math.round(shareReais * 100);
  const chargeCents = Math.round(chargeReais * 100);
  const raw = Math.round((Math.min(shareCents, chargeCents) * pct) / 100);
  return Math.max(0, Math.min(raw, chargeCents - Math.round(otherDiscountReais * 100) - MIN_CHARGE_CENTS));
}

/** `squadPerkReais` da resposta; backend antigo (sem o campo) → 0. */
export function readSquadPerk(raw: object | null | undefined): number {
  const v = (raw as Record<string, unknown> | null | undefined)?.['squadPerkReais'];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** `squadDiscountReais` da resposta; backend antigo (sem o campo) → 0. */
export function readSquadDiscount(raw: object | null | undefined): number {
  const v = (raw as Record<string, unknown> | null | undefined)?.['squadDiscountReais'];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}
