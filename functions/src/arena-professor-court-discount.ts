/**
 * Desconto do professor no aluguel de quadra (`arenaProfessors.courtDiscountPercent`).
 *
 * Mesma régua de cupom × promoção (`decideCouponVsPromotion`): descontos NÃO acumulam, vale o
 * menor preço. O desconto do professor incide sobre o preço CHEIO de cada horário; se a promoção
 * ou o cupom já deixam a reserva mais barata, nada muda. Quando o desconto vence, a reserva sai sem
 * promoção e sem cupom — o cupom não é consumido.
 */
import type {BookingTotalResult} from "./arena-pricing";
import type {CouponPricingOutcome} from "./arena-coupons";
import {roundMoney} from "./mercadopago-arena-helpers";

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

export function applyProfessorCourtDiscount(
  current: {result: BookingTotalResult; coupon: CouponPricingOutcome},
  percent: number,
): {result: BookingTotalResult; coupon: CouponPricingOutcome; professor: ProfessorCourtDiscountOutcome} {
  const none = {professorDiscountPercent: 0, professorDiscountReais: 0};
  if (!(percent > 0) || current.result.lineItems.length === 0) {
    return {...current, professor: none};
  }
  const factor = 1 - percent / 100;
  const lineItems = current.result.lineItems.map((l) => ({
    startTime: l.startTime,
    endTime: l.endTime,
    baseSlotPriceReais: l.baseSlotPriceReais,
    finalSlotPriceReais: roundMoney(l.baseSlotPriceReais * factor),
  }));
  const amountReais = roundMoney(lineItems.reduce((sum, l) => sum + l.finalSlotPriceReais, 0));
  if (amountReais >= current.result.amountReais) {
    return {...current, professor: none};
  }
  const baseReais = roundMoney(lineItems.reduce((sum, l) => sum + l.baseSlotPriceReais, 0));
  return {
    result: {amountReais, lineItems, appliedPromotionIds: []},
    coupon: NO_COUPON,
    professor: {
      professorDiscountPercent: percent,
      professorDiscountReais: roundMoney(baseReais - amountReais),
    },
  };
}
