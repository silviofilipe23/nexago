import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {applyProfessorCourtDiscount} from "./arena-professor-court-discount";
import type {CouponPricingOutcome} from "./arena-coupons";

const NO_COUPON: CouponPricingOutcome = {couponApplied: false, couponId: null, couponCode: null, couponDiscountReais: 0};

function full(prices: number[]) {
  return {
    result: {
      amountReais: prices.reduce((s, p) => s + p, 0),
      lineItems: prices.map((p, i) => ({
        startTime: `${18 + i}:00`, endTime: `${19 + i}:00`, baseSlotPriceReais: p, finalSlotPriceReais: p,
      })),
      appliedPromotionIds: [],
    },
    coupon: NO_COUPON,
  };
}

describe("desconto do professor no aluguel de quadra", () => {
  it("sem desconto, nada muda", () => {
    const current = full([100]);
    const out = applyProfessorCourtDiscount(current, 0);
    assert.equal(out.result, current.result);
    assert.deepEqual(out.professor, {professorDiscountPercent: 0, professorDiscountReais: 0});
  });

  it("aplica sobre o preço cheio de cada horário", () => {
    const out = applyProfessorCourtDiscount(full([100, 120]), 20);
    assert.equal(out.result.amountReais, 176);
    assert.deepEqual(out.result.lineItems.map((l) => l.finalSlotPriceReais), [80, 96]);
    assert.deepEqual(out.professor, {professorDiscountPercent: 20, professorDiscountReais: 44});
  });

  it("arredonda por horário em centavos", () => {
    const out = applyProfessorCourtDiscount(full([99.99]), 15);
    assert.equal(out.result.amountReais, 84.99);
    assert.equal(out.professor.professorDiscountReais, 15);
  });

  it("não acumula: promoção mais barata fica", () => {
    const promo = {
      result: {
        amountReais: 60,
        lineItems: [{startTime: "18:00", endTime: "19:00", baseSlotPriceReais: 100, finalSlotPriceReais: 60, appliedPromotionId: "p1"}],
        appliedPromotionIds: ["p1"],
      },
      coupon: NO_COUPON,
    };
    const out = applyProfessorCourtDiscount(promo, 20);
    assert.equal(out.result, promo.result);
    assert.equal(out.professor.professorDiscountPercent, 0);
  });

  it("vence a promoção e o cupom: tira os dois (cupom não é consumido)", () => {
    const withCoupon = {
      result: {
        amountReais: 90,
        lineItems: [{startTime: "18:00", endTime: "19:00", baseSlotPriceReais: 100, finalSlotPriceReais: 100}],
        appliedPromotionIds: [],
      },
      coupon: {couponApplied: true, couponId: "c1", couponCode: "BORA10", couponDiscountReais: 10},
    };
    const out = applyProfessorCourtDiscount(withCoupon, 30);
    assert.equal(out.result.amountReais, 70);
    assert.deepEqual(out.result.appliedPromotionIds, []);
    assert.deepEqual(out.coupon, NO_COUPON);
  });

  it("empate com a promoção mantém a promoção", () => {
    const promo = {
      result: {
        amountReais: 80,
        lineItems: [{startTime: "18:00", endTime: "19:00", baseSlotPriceReais: 100, finalSlotPriceReais: 80, appliedPromotionId: "p1"}],
        appliedPromotionIds: ["p1"],
      },
      coupon: NO_COUPON,
    };
    assert.deepEqual(applyProfessorCourtDiscount(promo, 20).result.appliedPromotionIds, ["p1"]);
  });
});
