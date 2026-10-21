import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {applyProfessorCourtDiscount, slotInsideCourtDiscountWindow} from "./arena-professor-court-discount";
import type {CouponPricingOutcome} from "./arena-coupons";

const allDay = (percent: number) => ({percent, startTime: null, endTime: null});
const window = (percent: number, startTime: string, endTime: string) => ({percent, startTime, endTime});

const NO_COUPON: CouponPricingOutcome = {couponApplied: false, couponId: null, couponCode: null, couponDiscountReais: 0};

function full(prices: number[], firstHour = 18) {
  return {
    result: {
      amountReais: prices.reduce((s, p) => s + p, 0),
      lineItems: prices.map((p, i) => ({
        startTime: `${String(firstHour + i).padStart(2, "0")}:00`,
        endTime: `${String(firstHour + i + 1).padStart(2, "0")}:00`, baseSlotPriceReais: p, finalSlotPriceReais: p,
      })),
      appliedPromotionIds: [],
    },
    coupon: NO_COUPON,
  };
}

describe("desconto do professor no aluguel de quadra", () => {
  it("sem desconto, nada muda", () => {
    const current = full([100]);
    const out = applyProfessorCourtDiscount(current, allDay(0));
    assert.equal(out.result, current.result);
    assert.deepEqual(out.professor, {professorDiscountPercent: 0, professorDiscountReais: 0});
  });

  it("aplica sobre o preço cheio de cada horário", () => {
    const out = applyProfessorCourtDiscount(full([100, 120]), allDay(20));
    assert.equal(out.result.amountReais, 176);
    assert.deepEqual(out.result.lineItems.map((l) => l.finalSlotPriceReais), [80, 96]);
    assert.deepEqual(out.professor, {professorDiscountPercent: 20, professorDiscountReais: 44});
  });

  it("arredonda por horário em centavos", () => {
    const out = applyProfessorCourtDiscount(full([99.99]), allDay(15));
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
    const out = applyProfessorCourtDiscount(promo, allDay(20));
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
    const out = applyProfessorCourtDiscount(withCoupon, allDay(30));
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
    assert.deepEqual(applyProfessorCourtDiscount(promo, allDay(20)).result.appliedPromotionIds, ["p1"]);
  });

  it("sem regra (vínculo inválido na cotação), nada muda", () => {
    const current = full([100]);
    assert.equal(applyProfessorCourtDiscount(current, null).result, current.result);
  });
});

describe("faixa de horário do desconto", () => {
  it("só o horário inteiro dentro da faixa entra", () => {
    const rule = {startTime: "08:00", endTime: "17:00"};
    assert.equal(slotInsideCourtDiscountWindow({startTime: "08:00", endTime: "09:00"}, rule), true);
    assert.equal(slotInsideCourtDiscountWindow({startTime: "16:00", endTime: "17:00"}, rule), true);
    assert.equal(slotInsideCourtDiscountWindow({startTime: "16:30", endTime: "17:30"}, rule), false);
    assert.equal(slotInsideCourtDiscountWindow({startTime: "07:00", endTime: "08:00"}, rule), false);
    assert.equal(slotInsideCourtDiscountWindow({startTime: "23:00", endTime: "00:00"}, {startTime: "18:00", endTime: "24:00"}), true);
    assert.equal(slotInsideCourtDiscountWindow({startTime: "23:00", endTime: "24:00"}, {startTime: null, endTime: null}), true);
  });

  it("reserva que cruza o fim da faixa: desconto só nos horários de dentro", () => {
    const out = applyProfessorCourtDiscount(full([100, 100], 16), window(20, "08:00", "17:00"));
    assert.deepEqual(out.result.lineItems.map((l) => l.finalSlotPriceReais), [80, 100]);
    assert.equal(out.result.amountReais, 180);
    assert.deepEqual(out.professor, {professorDiscountPercent: 20, professorDiscountReais: 20});
  });

  it("toda fora da faixa: preço de atleta, cupom mantido", () => {
    const current = {...full([100], 18), coupon: {couponApplied: true, couponId: "c1", couponCode: "X", couponDiscountReais: 5}};
    current.result = {...current.result, amountReais: 95};
    const out = applyProfessorCourtDiscount(current, window(20, "08:00", "17:00"));
    assert.equal(out.result, current.result);
    assert.equal(out.coupon.couponApplied, true);
    assert.equal(out.professor.professorDiscountPercent, 0);
  });

  it("fora da faixa a promoção do horário continua", () => {
    const promo = {
      result: {
        amountReais: 160,
        lineItems: [
          {startTime: "16:00", endTime: "17:00", baseSlotPriceReais: 100, finalSlotPriceReais: 90, appliedPromotionId: "p1"},
          {startTime: "17:00", endTime: "18:00", baseSlotPriceReais: 100, finalSlotPriceReais: 70, appliedPromotionId: "p2"},
        ],
        appliedPromotionIds: ["p1", "p2"],
      },
      coupon: NO_COUPON,
    };
    const out = applyProfessorCourtDiscount(promo, window(30, "08:00", "17:00"));
    assert.deepEqual(out.result.lineItems.map((l) => l.finalSlotPriceReais), [70, 70]);
    assert.equal(out.result.amountReais, 140);
    assert.deepEqual(out.result.appliedPromotionIds, ["p2"]);
  });
});
