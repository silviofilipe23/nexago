/**
 * Desconto do professor no aluguel de quadra (`arenaProfessors.courtDiscountPercent`).
 *
 * Mesma régua de cupom × promoção (`decideCouponVsPromotion`): descontos NÃO acumulam, vale o
 * menor preço. O desconto do professor incide sobre o preço CHEIO de cada horário; se a promoção
 * ou o cupom já deixam a reserva mais barata, nada muda. Quando o desconto vence, a reserva sai sem
 * cupom (não é consumido) e sem a promoção nos horários com desconto.
 *
 * Com faixa no vínculo (ex.: 08:00–17:00), só o horário INTEIRO dentro dela tem desconto: 16–17
 * entra, 17–18 não. Fora da faixa fica o preço da promoção daquele horário (ou o cheio).
 */
import type {BookingTotalResult} from "./arena-pricing";
import type {CouponPricingOutcome} from "./arena-coupons";
import {roundMoney} from "./mercadopago-arena-helpers";
import {courtDiscountTimeToMinutes, type CourtDiscountRule} from "./arena-professor-links";

export interface ProfessorCourtDiscountOutcome {
  /** % aplicado na reserva — 0 quando não houve desconto ou ele não venceu. */
  professorDiscountPercent: number;
  /** Quanto o desconto tirou do preço cheio. */
  professorDiscountReais: number;
}

const NO_COUPON: CouponPricingOutcome = {
  couponApplied: false,
  couponId: null,
  couponCode: null,
  couponDiscountReais: 0,
};

/** O horário `startTime`–`endTime` cabe inteiro na faixa do desconto (sem faixa = sempre). */
export function slotInsideCourtDiscountWindow(
  slot: {startTime: string; endTime: string},
  rule: Pick<CourtDiscountRule, "startTime" | "endTime">,
): boolean {
  if (!rule.startTime || !rule.endTime) return true;
  const windowStart = courtDiscountTimeToMinutes(rule.startTime);
  const windowEnd = courtDiscountTimeToMinutes(rule.endTime);
  const start = courtDiscountTimeToMinutes(slot.startTime);
  let end = courtDiscountTimeToMinutes(slot.endTime);
  if (windowStart == null || windowEnd == null || start == null || end == null) return false;
  if (end === 0 && start > 0) end = 24 * 60;
  return start >= windowStart && end <= windowEnd;
}

export function applyProfessorCourtDiscount(
  current: {result: BookingTotalResult; coupon: CouponPricingOutcome},
  rule: CourtDiscountRule | null,
): {result: BookingTotalResult; coupon: CouponPricingOutcome; professor: ProfessorCourtDiscountOutcome} {
  const none = {professorDiscountPercent: 0, professorDiscountReais: 0};
  const percent = rule?.percent ?? 0;
  if (!rule || !(percent > 0) || current.result.lineItems.length === 0) {
    return {...current, professor: none};
  }
  const factor = 1 - percent / 100;
  // Com cupom, as linhas já vêm no preço cheio (o cupom é sobre o total).
  let discountReais = 0;
  const lineItems = current.result.lineItems.map((l) => {
    if (!slotInsideCourtDiscountWindow(l, rule)) return l;
    const discounted = roundMoney(l.baseSlotPriceReais * factor);
    discountReais += l.baseSlotPriceReais - discounted;
    return {
      startTime: l.startTime,
      endTime: l.endTime,
      baseSlotPriceReais: l.baseSlotPriceReais,
      finalSlotPriceReais: discounted,
    };
  });
  if (discountReais <= 0) return {...current, professor: none};
  const amountReais = roundMoney(lineItems.reduce((sum, l) => sum + l.finalSlotPriceReais, 0));
  if (amountReais >= current.result.amountReais) {
    return {...current, professor: none};
  }
  const appliedPromotionIds = [
    ...new Set(lineItems.map((l) => ("appliedPromotionId" in l ? l.appliedPromotionId : undefined)).filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    )),
  ];
  return {
    result: {amountReais, lineItems, appliedPromotionIds},
    coupon: NO_COUPON,
    professor: {
      professorDiscountPercent: percent,
      professorDiscountReais: roundMoney(discountReais),
    },
  };
}
