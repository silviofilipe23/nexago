import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {
  computeCouponDiscountReais,
  couponRedemptionLimitError,
  couponValidityError,
  decideCouponVsPromotion,
  normalizeCouponCode,
  parseCouponDoc,
  type ArenaCouponDoc,
} from "./arena-coupons";

function baseCoupon(overrides: Partial<ArenaCouponDoc> = {}): ArenaCouponDoc {
  return {
    id: "VERAO10",
    code: "VERAO10",
    active: true,
    discountPercent: 10,
    maxRedemptionsPerAthlete: 1,
    redemptionsCount: 0,
    ...overrides,
  };
}

describe("normalizeCouponCode", () => {
  it("remove espaços e deixa maiúsculo", () => {
    assert.equal(normalizeCouponCode("  verao 10 "), "VERAO10");
    assert.equal(normalizeCouponCode("Praia2026"), "PRAIA2026");
  });

  it("não-string vira string vazia", () => {
    assert.equal(normalizeCouponCode(undefined), "");
    assert.equal(normalizeCouponCode(null), "");
    assert.equal(normalizeCouponCode(42), "");
  });
});

describe("parseCouponDoc", () => {
  it("aplica defaults (maxRedemptionsPerAthlete=1, redemptionsCount=0)", () => {
    const coupon = parseCouponDoc("ABC", {code: "ABC", active: true, discountPercent: 15});
    assert.equal(coupon.maxRedemptionsPerAthlete, 1);
    assert.equal(coupon.redemptionsCount, 0);
    assert.equal(coupon.maxRedemptionsTotal, undefined);
  });

  it("lê maxRedemptionsTotal/PerAthlete/redemptionsCount quando presentes", () => {
    const coupon = parseCouponDoc("ABC", {
      code: "ABC",
      active: true,
      fixedDiscountReais: 20,
      maxRedemptionsTotal: 50,
      maxRedemptionsPerAthlete: 3,
      redemptionsCount: 12,
    });
    assert.equal(coupon.maxRedemptionsTotal, 50);
    assert.equal(coupon.maxRedemptionsPerAthlete, 3);
    assert.equal(coupon.redemptionsCount, 12);
  });
});

describe("computeCouponDiscountReais — cupom válido aplica desconto correto", () => {
  it("desconto percentual", () => {
    const coupon = baseCoupon({discountPercent: 10, fixedDiscountReais: undefined});
    assert.equal(computeCouponDiscountReais(coupon, 200), 20);
  });

  it("desconto fixo em reais", () => {
    const coupon = baseCoupon({discountPercent: undefined, fixedDiscountReais: 30});
    assert.equal(computeCouponDiscountReais(coupon, 200), 30);
  });

  it("desconto fixo nunca ultrapassa o subtotal (não fica negativo)", () => {
    const coupon = baseCoupon({discountPercent: undefined, fixedDiscountReais: 500});
    assert.equal(computeCouponDiscountReais(coupon, 80), 80);
  });

  it("subtotal zero/negativo não gera desconto", () => {
    const coupon = baseCoupon();
    assert.equal(computeCouponDiscountReais(coupon, 0), 0);
  });
});

describe("decideCouponVsPromotion — precedência (não acumula, vale o maior desconto)", () => {
  it("cupom vence quando dá desconto maior que a promoção automática", () => {
    const coupon = baseCoupon({discountPercent: 20});
    const decision = decideCouponVsPromotion({
      coupon,
      baseSubtotalReais: 100,
      promotionAmountReais: 90, // promoção só dá 10% de desconto
    });
    assert.equal(decision.couponApplied, true);
    assert.equal(decision.amountReais, 80);
    assert.equal(decision.couponDiscountReais, 20);
  });

  it("promoção vence quando o desconto dela é maior — cupom não é consumido", () => {
    const coupon = baseCoupon({discountPercent: 5});
    const decision = decideCouponVsPromotion({
      coupon,
      baseSubtotalReais: 100,
      promotionAmountReais: 80, // promoção dá 20%, melhor que o cupom (5%)
    });
    assert.equal(decision.couponApplied, false);
    assert.equal(decision.amountReais, 80);
    assert.equal(decision.couponDiscountReais, 0);
  });

  it("empate mantém a promoção (cupom só some se for estritamente melhor)", () => {
    const coupon = baseCoupon({discountPercent: 20});
    const decision = decideCouponVsPromotion({
      coupon,
      baseSubtotalReais: 100,
      promotionAmountReais: 80,
    });
    assert.equal(decision.couponApplied, false);
  });
});

describe("couponValidityError — cupom expirado é rejeitado", () => {
  const now = new Date("2026-07-21T12:00:00-03:00");

  it("cupom ativo e dentro da janela é aceito", () => {
    const coupon = baseCoupon({
      validFrom: Timestamp.fromDate(new Date("2026-07-01T00:00:00-03:00")),
      validUntil: Timestamp.fromDate(new Date("2026-07-31T23:59:59-03:00")),
    });
    assert.equal(couponValidityError(coupon, now), null);
  });

  it("cupom expirado (validUntil no passado) é rejeitado", () => {
    const coupon = baseCoupon({
      validUntil: Timestamp.fromDate(new Date("2026-07-10T00:00:00-03:00")),
    });
    assert.notEqual(couponValidityError(coupon, now), null);
  });

  it("cupom ainda não iniciado (validFrom no futuro) é rejeitado", () => {
    const coupon = baseCoupon({
      validFrom: Timestamp.fromDate(new Date("2026-08-01T00:00:00-03:00")),
    });
    assert.notEqual(couponValidityError(coupon, now), null);
  });

  it("cupom inativo é rejeitado mesmo dentro da janela de validade", () => {
    const coupon = baseCoupon({active: false});
    assert.notEqual(couponValidityError(coupon, now), null);
  });
});

describe("couponRedemptionLimitError — limites de uso", () => {
  it("cupom no limite de uso por cliente é rejeitado na 2ª tentativa do mesmo atleta", () => {
    const coupon = baseCoupon({maxRedemptionsPerAthlete: 1});
    // 1ª tentativa: atleta ainda não resgatou.
    assert.equal(
      couponRedemptionLimitError(coupon, {totalRedemptions: 0, athleteRedemptions: 0}),
      null,
    );
    // 2ª tentativa: já resgatou 1 vez, limite por atleta é 1.
    assert.notEqual(
      couponRedemptionLimitError(coupon, {totalRedemptions: 1, athleteRedemptions: 1}),
      null,
    );
  });

  it("cupom com uso total esgotado é rejeitado mesmo pra um atleta novo", () => {
    const coupon = baseCoupon({maxRedemptionsTotal: 5, maxRedemptionsPerAthlete: 10});
    assert.equal(
      couponRedemptionLimitError(coupon, {totalRedemptions: 4, athleteRedemptions: 0}),
      null,
    );
    assert.notEqual(
      couponRedemptionLimitError(coupon, {totalRedemptions: 5, athleteRedemptions: 0}),
      null,
    );
  });

  it("sem maxRedemptionsTotal definido, não há limite agregado", () => {
    const coupon = baseCoupon({maxRedemptionsTotal: undefined, maxRedemptionsPerAthlete: 2});
    assert.equal(
      couponRedemptionLimitError(coupon, {totalRedemptions: 10_000, athleteRedemptions: 0}),
      null,
    );
  });
});
