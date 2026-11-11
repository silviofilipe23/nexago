import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  applyMemberHours,
  memberHoursWeek,
  parseSetMemberHoursPolicyInput,
  pickMemberContract,
  readMemberHoursPolicy,
  usedMemberMinutes,
} from "./arena-member-hours";
import {bookingPaymentPlan} from "./arena-booking-create";
import {manualAmountAfterMemberHours} from "./arena-manual-booking";
import {
  isActiveArenaEnrollment,
  readAthletePricingConfig,
  parseSetAthletePricingInput,
  studentFromClassesEnabled,
} from "./arena-athlete-pricing";
import type {CouponPricingOutcome} from "./arena-coupons";
import type {CrmContractRecord} from "./arena-crm-model";

const NO_COUPON: CouponPricingOutcome = {couponApplied: false, couponId: null, couponCode: null, couponDiscountReais: 0};

function lines(prices: number[], firstHour = 18, minutes = 60) {
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

function contract(over: Partial<CrmContractRecord> = {}): CrmContractRecord {
  return {
    id: "c1",
    arenaId: "a1",
    customerKey: "a:u1",
    athleteId: "u1",
    customerName: "Fulano",
    customerPhone: null,
    planId: null,
    planName: "Mensal 3h",
    period: "monthly",
    dueDay: 5,
    weeklyHours: 3,
    monthlyPriceReais: 400,
    startDate: "2026-11-01",
    autoRenew: true,
    paidInstallments: 1,
    status: "active",
    canceledOn: null,
    cancelReason: null,
    renewedFromId: null,
    renewedToId: null,
    note: null,
    createdAt: null,
    ...over,
  };
}

describe("readMemberHoursPolicy", () => {
  it("arena sem a chave = desligada (nada muda)", () => {
    assert.deepEqual(readMemberHoursPolicy(undefined), {enabled: false, blockWhenOverdue: true});
    assert.deepEqual(readMemberHoursPolicy({}), {enabled: false, blockWhenOverdue: true});
  });
  it("ligada; inadimplente barrado por padrão", () => {
    assert.deepEqual(readMemberHoursPolicy({memberHoursBank: {enabled: true}}), {enabled: true, blockWhenOverdue: true});
    assert.deepEqual(
      readMemberHoursPolicy({memberHoursBank: {enabled: true, blockWhenOverdue: false}}),
      {enabled: true, blockWhenOverdue: false},
    );
  });
  it("parse do portal exige arena", () => {
    assert.throws(() => parseSetMemberHoursPolicyInput({enabled: true}));
    assert.deepEqual(parseSetMemberHoursPolicyInput({arenaId: " a1 ", enabled: true}), {
      arenaId: "a1",
      policy: {enabled: true, blockWhenOverdue: true},
    });
  });
});

describe("memberHoursWeek", () => {
  it("semana de segunda a domingo", () => {
    // 11/11/2026 é quarta.
    assert.deepEqual(memberHoursWeek("2026-11-11"), {start: "2026-11-09", end: "2026-11-15"});
    assert.deepEqual(memberHoursWeek("2026-11-15"), {start: "2026-11-09", end: "2026-11-15"});
    assert.deepEqual(memberHoursWeek("2026-11-16"), {start: "2026-11-16", end: "2026-11-22"});
  });
});

describe("pickMemberContract", () => {
  const today = "2026-11-11";
  it("contrato vivo da arena cobre a data", () => {
    const got = pickMemberContract([contract()], "a1", "2026-11-12", today);
    assert.deepEqual(got, {contractId: "c1", planName: "Mensal 3h", weeklyMinutes: 180, overdue: false});
  });
  it("outra arena, cancelado ou antes do início não cobrem", () => {
    assert.equal(pickMemberContract([contract({arenaId: "a2"})], "a1", "2026-11-12", today), null);
    assert.equal(pickMemberContract([contract({status: "canceled"})], "a1", "2026-11-12", today), null);
    assert.equal(pickMemberContract([contract({startDate: "2026-11-20"})], "a1", "2026-11-12", today), null);
  });
  it("sem renovação automática, só até o fim do período", () => {
    const c = contract({autoRenew: false, startDate: "2026-11-01"});
    assert.ok(pickMemberContract([c], "a1", "2026-11-30", today));
    assert.equal(pickMemberContract([c], "a1", "2026-12-01", today), null);
  });
  it("com renovação automática, cobre os ciclos seguintes", () => {
    assert.ok(pickMemberContract([contract()], "a1", "2027-02-10", today));
  });
  it("dois contratos: vale o de mais horas", () => {
    const got = pickMemberContract([contract(), contract({id: "c2", weeklyHours: 5})], "a1", "2026-11-12", today);
    assert.equal(got?.contractId, "c2");
  });
  it("parcela vencida marca atraso", () => {
    const got = pickMemberContract([contract({paidInstallments: 0, startDate: "2026-11-01"})], "a1", "2026-11-12", today);
    assert.equal(got?.overdue, true);
  });
});

describe("usedMemberMinutes", () => {
  it("soma só o que saiu do banco e ignora canceladas", () => {
    assert.equal(usedMemberMinutes([
      {memberHoursMinutes: 60, status: "active"},
      {memberHoursMinutes: 90, status: "cancelled"},
      {memberHoursMinutes: 30, status: "canceled_by_arena"},
      {amountReais: 150, status: "active"},
      {memberHoursMinutes: 30, status: "completed"},
    ]), 90);
  });
});

describe("applyMemberHours", () => {
  it("saldo cobre tudo: reserva a R$ 0", () => {
    const got = applyMemberHours(lines([150, 150]), 180, "c1");
    assert.equal(got.result.amountReais, 0);
    assert.equal(got.member.memberHoursMinutes, 120);
    assert.equal(got.member.memberHoursDiscountReais, 300);
    assert.equal(got.member.memberContractId, "c1");
    assert.equal(got.blockedReason, null);
  });
  it("saldo menor que a reserva: o resto é cobrado", () => {
    const got = applyMemberHours(lines([150, 150]), 60, "c1");
    assert.equal(got.result.amountReais, 150);
    assert.equal(got.member.memberHoursMinutes, 60);
    assert.equal(got.result.lineItems[0]!.finalSlotPriceReais, 0);
    assert.equal(got.result.lineItems[1]!.finalSlotPriceReais, 150);
  });
  it("meia hora de saldo num horário de 1h = metade do preço", () => {
    const got = applyMemberHours(lines([150]), 30, "c1");
    assert.equal(got.result.amountReais, 75);
    assert.equal(got.member.memberHoursMinutes, 30);
  });
  it("sem saldo: nada muda e avisa", () => {
    const base = lines([150]);
    const got = applyMemberHours(base, 0, "c1");
    assert.equal(got.result.amountReais, 150);
    assert.equal(got.member.memberHoursMinutes, 0);
    assert.equal(got.blockedReason, "exhausted");
  });
  it("cobre sobre o preço que já estava (ex.: aluno)", () => {
    const base = lines([150, 150]);
    base.result.lineItems[1]!.finalSlotPriceReais = 100;
    base.result.amountReais = 250;
    const got = applyMemberHours(base, 60, "c1");
    assert.equal(got.result.amountReais, 100);
    assert.equal(got.member.memberHoursDiscountReais, 150);
  });
  it("cupom mais barato que o banco: fica o cupom, banco intocado", () => {
    const base = lines([150, 150]);
    base.result.amountReais = 30;
    base.coupon = {couponApplied: true, couponId: "k", couponCode: "X", couponDiscountReais: 270};
    const got = applyMemberHours(base, 60, "c1");
    assert.equal(got.result.amountReais, 30);
    assert.equal(got.coupon.couponApplied, true);
    assert.equal(got.member.memberHoursMinutes, 0);
    assert.equal(got.blockedReason, "coupon_cheaper");
  });
  it("banco mais barato que o cupom: cupom sai (não é consumido)", () => {
    const base = lines([150, 150]);
    base.result.amountReais = 270;
    base.coupon = {couponApplied: true, couponId: "k", couponCode: "X", couponDiscountReais: 30};
    const got = applyMemberHours(base, 120, "c1");
    assert.equal(got.result.amountReais, 0);
    assert.equal(got.coupon.couponApplied, false);
    assert.equal(got.member.memberHoursMinutes, 120);
  });
});

describe("bookingPaymentPlan com banco de horas", () => {
  it("coberta inteira: confirmada sem nada a pagar, mesmo pedindo Pix", () => {
    const plan = bookingPaymentPlan({amountReais: 0, weatherCreditReais: 0, paymentMode: "pix", paymentFraction: 1});
    assert.deepEqual(plan, {
      channel: "onsite",
      status: "active",
      paymentStatus: "none",
      paymentFraction: null,
      amountToPayNowReais: 0,
      amountDueOnsiteReais: 0,
    });
  });
  it("parte coberta segue o Pix pelo resto", () => {
    const plan = bookingPaymentPlan({amountReais: 75, weatherCreditReais: 0, paymentMode: "pix", paymentFraction: 1});
    assert.equal(plan.channel, "pix");
    assert.equal(plan.amountToPayNowReais, 75);
  });
});

describe("manualAmountAfterMemberHours", () => {
  it("tira a parte coberta do preço do balcão", () => {
    assert.equal(manualAmountAfterMemberHours(150, 60, 60), 0);
    assert.equal(manualAmountAfterMemberHours(300, 120, 60), 150);
    assert.equal(manualAmountAfterMemberHours(150, 60, 0), 150);
  });
});

describe("aluno pela matrícula", () => {
  it("opção só vale com o perfil Aluno ligado", () => {
    const on = readAthletePricingConfig({
      athletePricing: {student: {enabled: true, mode: "fixed", pricePerHourReais: 100, autoFromClasses: true}},
    });
    assert.equal(studentFromClassesEnabled(on), true);
    const off = readAthletePricingConfig({
      athletePricing: {student: {enabled: false, mode: "fixed", pricePerHourReais: 100, autoFromClasses: true}},
    });
    assert.equal(studentFromClassesEnabled(off), false);
    assert.equal(studentFromClassesEnabled(readAthletePricingConfig(undefined)), false);
  });
  it("professor nunca ganha a opção", () => {
    const cfg = readAthletePricingConfig({
      athletePricing: {professor: {enabled: true, mode: "percent", discountPercent: 10, autoFromClasses: true}},
    });
    assert.equal(cfg.professor.autoFromClasses, false);
    const parsed = parseSetAthletePricingInput({
      arenaId: "a1",
      student: {enabled: true, mode: "fixed", pricePerHourReais: 100, autoFromClasses: true},
      professor: {enabled: true, mode: "percent", discountPercent: 10, autoFromClasses: true},
    });
    assert.equal(parsed.tiers.student.autoFromClasses, true);
    assert.equal(parsed.tiers.professor.autoFromClasses, false);
  });
  it("matrícula ativa da própria arena", () => {
    assert.equal(isActiveArenaEnrollment({arenaId: "a1", status: "active"}, "a1"), true);
    assert.equal(isActiveArenaEnrollment({arenaId: "a2", status: "active"}, "a1"), false);
    assert.equal(isActiveArenaEnrollment({arenaId: "a1", status: "canceled"}, "a1"), false);
  });
});
