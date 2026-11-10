import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  applyAthletePricing,
  athletePricingRuleFor,
  hasAnyAthletePricingTier,
  parseSetAthletePricingInput,
  parseSetAthletePricingMemberInput,
  readAthletePricingConfig,
  type AthletePricingRule,
} from "./arena-athlete-pricing";
import {applyAthleteDiscounts} from "./arena-booking-create";
import type {CouponPricingOutcome} from "./arena-coupons";

const NO_COUPON: CouponPricingOutcome = {couponApplied: false, couponId: null, couponCode: null, couponDiscountReais: 0};

function full(prices: number[], firstHour = 18, minutes = 60) {
  const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return {
    result: {
      amountReais: prices.reduce((s, p) => s + p, 0),
      lineItems: prices.map((p, i) => ({
        startTime: fmt(firstHour * 60 + i * minutes),
        endTime: fmt(firstHour * 60 + (i + 1) * minutes),
        baseSlotPriceReais: p,
        finalSlotPriceReais: p,
      })),
      appliedPromotionIds: [] as string[],
    },
    coupon: NO_COUPON,
  };
}

const student = (pricePerHourReais: number): AthletePricingRule =>
  ({tier: "student", label: "Aluno", mode: "fixed", pricePerHourReais, discountPercent: null});
const professorPct = (discountPercent: number): AthletePricingRule =>
  ({tier: "professor", label: "Professor", mode: "percent", pricePerHourReais: null, discountPercent});

describe("preço por perfil do atleta", () => {
  it("avulso (sem regra): nada muda", () => {
    const current = full([150]);
    const out = applyAthletePricing(current, null);
    assert.equal(out.result, current.result);
    assert.equal(out.athletePricing.athletePricingTier, null);
  });

  it("aluno com preço fixo: R$ 150/h vira R$ 100/h", () => {
    const out = applyAthletePricing(full([150, 150]), student(100));
    assert.equal(out.result.amountReais, 200);
    assert.deepEqual(out.athletePricing, {
      athletePricingTier: "student",
      athletePricingLabel: "Aluno",
      athletePricingDiscountReais: 100,
    });
  });

  it("preço fixo respeita a duração do horário (30 min)", () => {
    const out = applyAthletePricing(full([75, 75], 18, 30), student(100));
    assert.deepEqual(out.result.lineItems.map((l) => l.finalSlotPriceReais), [50, 50]);
  });

  it("professor com % sobre o preço cheio", () => {
    const out = applyAthletePricing(full([150]), professorPct(20));
    assert.equal(out.result.amountReais, 120);
    assert.equal(out.athletePricing.athletePricingTier, "professor");
  });

  it("preço fixo acima do cheio não encarece", () => {
    const current = full([80]);
    const out = applyAthletePricing(current, student(100));
    assert.equal(out.result, current.result);
    assert.equal(out.athletePricing.athletePricingTier, null);
  });

  it("não acumula com promoção: em cada horário fica o menor", () => {
    const current = {
      result: {
        amountReais: 140,
        lineItems: [
          {startTime: "18:00", endTime: "19:00", baseSlotPriceReais: 150, finalSlotPriceReais: 60, appliedPromotionId: "p1"},
          {startTime: "19:00", endTime: "20:00", baseSlotPriceReais: 150, finalSlotPriceReais: 80, appliedPromotionId: "p1"},
        ],
        appliedPromotionIds: ["p1"],
      },
      coupon: NO_COUPON,
    };
    const out = applyAthletePricing(current, student(70));
    assert.deepEqual(out.result.lineItems.map((l) => l.finalSlotPriceReais), [60, 70]);
    assert.equal(out.result.amountReais, 130);
    assert.deepEqual(out.result.appliedPromotionIds, ["p1"]);
    assert.equal(out.result.lineItems[0]!.appliedPromotionId, "p1");
    assert.equal(out.result.lineItems[1]!.appliedPromotionId, undefined);
  });

  it("cupom mais barato fica; perfil mais barato tira o cupom", () => {
    const withCoupon = {
      result: {...full([150]).result, amountReais: 90},
      coupon: {couponApplied: true, couponId: "c1", couponCode: "X", couponDiscountReais: 60},
    };
    const kept = applyAthletePricing(withCoupon, student(100));
    assert.equal(kept.result.amountReais, 90);
    assert.equal(kept.coupon.couponApplied, true);
    const won = applyAthletePricing(withCoupon, student(80));
    assert.equal(won.result.amountReais, 80);
    assert.equal(won.coupon.couponApplied, false);
  });

  it("desconto do vínculo de professor que vence desfaz o do perfil", () => {
    const vinculo = {percent: 50, startTime: null, endTime: null};
    const out = applyAthleteDiscounts(full([150]), student(100), vinculo);
    assert.equal(out.result.amountReais, 75);
    assert.equal(out.professor.professorDiscountPercent, 50);
    assert.equal(out.athletePricing.athletePricingTier, null);
    const tierWins = applyAthleteDiscounts(full([150]), student(60), vinculo);
    assert.equal(tierWins.result.amountReais, 60);
    assert.equal(tierWins.professor.professorDiscountPercent, 0);
    assert.equal(tierWins.athletePricing.athletePricingTier, "student");
  });
});

describe("config e vínculo", () => {
  it("arena sem config: tudo desligado", () => {
    const config = readAthletePricingConfig({});
    assert.equal(hasAnyAthletePricingTier(config), false);
    assert.equal(athletePricingRuleFor(config, {tier: "student"}), null);
  });

  it("perfil ligado sem valor válido conta como desligado", () => {
    const config = readAthletePricingConfig({athletePricing: {student: {enabled: true, mode: "fixed"}}});
    assert.equal(config.student.enabled, false);
  });

  it("regra só vale com o perfil do atleta ligado na arena", () => {
    const config = readAthletePricingConfig({
      athletePricing: {
        student: {enabled: true, mode: "fixed", pricePerHourReais: 100},
        professor: {enabled: false, mode: "percent", discountPercent: 30, label: "Professor de outro esporte"},
      },
    });
    assert.equal(athletePricingRuleFor(config, {tier: "student"})?.pricePerHourReais, 100);
    assert.equal(athletePricingRuleFor(config, {tier: "professor"}), null);
    assert.equal(athletePricingRuleFor(config, null), null);
    assert.equal(config.professor.label, "Professor de outro esporte");
  });

  it("valida o payload do portal", () => {
    assert.throws(() => parseSetAthletePricingInput({arenaId: "a", student: {enabled: true, mode: "fixed"}}));
    assert.throws(() => parseSetAthletePricingInput({arenaId: "a", professor: {enabled: true, mode: "percent", discountPercent: 95}}));
    const ok = parseSetAthletePricingInput({
      arenaId: "a",
      student: {enabled: true, mode: "fixed", pricePerHourReais: 100},
      professor: {enabled: false, mode: "percent"},
    });
    assert.equal(ok.tiers.student.pricePerHourReais, 100);
    assert.equal(ok.tiers.professor.enabled, false);
    assert.equal(ok.tiers.professor.label, "Professor");
  });

  it("valida o vínculo do atleta", () => {
    assert.throws(() => parseSetAthletePricingMemberInput({arenaId: "a", athleteId: "u", tier: "vip"}));
    assert.throws(() => parseSetAthletePricingMemberInput({arenaId: "a", athleteId: ""}));
    assert.equal(parseSetAthletePricingMemberInput({arenaId: "a", athleteId: "u"}).tier, null);
    assert.equal(parseSetAthletePricingMemberInput({arenaId: "a", athleteId: "u", tier: "student"}).tier, "student");
  });
});
