import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  applyFlexPlan,
  flexSubscriptionFrom,
  lineInsideWindows,
  usedFlexUses,
  type FlexPlanSubscription,
} from "./arena-schedule-flex";
import {billingWeekdaysOf, isFlexibleSubscription, planFirstCharge, planWindowWeekdays} from "./arena-schedule-subscriptions";
import {
  chosenDueDay,
  clampPixDiscount,
  parseDueDayOptions,
  parseSchedulePlan,
  pixDiscountedReais,
  validateSchedulePlanInput,
} from "./arena-schedule-plan-constants";
import type {CouponPricingOutcome} from "./arena-coupons";

const NO_COUPON: CouponPricingOutcome = {couponApplied: false, couponId: null, couponCode: null, couponDiscountReais: 0};

function lines(prices: number[], firstHour = 7, minutes = 60) {
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

// Manhã de seg a sex, 06:00–12:00, 2x por semana de 1h.
const SUB: FlexPlanSubscription = {
  subscriptionId: "sub1",
  planId: "p1",
  planName: "Manhã",
  timesPerWeek: 2,
  durationMinutes: 60,
  windows: [1, 2, 3, 4, 5].map((weekday) => ({weekday, startTime: "06:00", endTime: "12:00"})),
  courtIds: [],
};

const SUB_DOC = {
  arenaId: "a1",
  planId: "p1",
  planName: "Manhã",
  status: "active",
  startDate: "2026-11-10",
  endsOn: null,
  planSnapshot: {bookingMode: "flexible", timesPerWeek: 2, durationMinutes: 60, windows: SUB.windows, courtIds: []},
};

describe("flexSubscriptionFrom", () => {
  it("assinatura livre ativa cobre datas a partir do início", () => {
    const sub = flexSubscriptionFrom("sub1", SUB_DOC, "a1", "2026-11-12");
    assert.equal(sub?.timesPerWeek, 2);
    assert.equal(sub?.windows.length, 5);
  });

  it("não cobre antes do início, depois da saída, outra arena ou fora de active", () => {
    assert.equal(flexSubscriptionFrom("sub1", SUB_DOC, "a1", "2026-11-09"), null);
    assert.equal(flexSubscriptionFrom("sub1", {...SUB_DOC, endsOn: "2026-12-01"}, "a1", "2026-12-01"), null);
    assert.notEqual(flexSubscriptionFrom("sub1", {...SUB_DOC, endsOn: "2026-12-01"}, "a1", "2026-11-30"), null);
    assert.equal(flexSubscriptionFrom("sub1", SUB_DOC, "a2", "2026-11-12"), null);
    for (const status of ["paused", "suspended", "pending_payment", "canceled"]) {
      assert.equal(flexSubscriptionFrom("sub1", {...SUB_DOC, status}, "a1", "2026-11-12"), null, status);
    }
  });

  it("assinatura de horário fixo não entra (segue nas séries)", () => {
    assert.equal(flexSubscriptionFrom("sub1", {...SUB_DOC, planSnapshot: {timesPerWeek: 2, durationMinutes: 60}}, "a1", "2026-11-12"), null);
  });
});

describe("lineInsideWindows", () => {
  it("o horário precisa caber inteiro na janela do dia", () => {
    assert.equal(lineInsideWindows({startTime: "06:00", endTime: "07:00"}, SUB.windows, 1), true);
    assert.equal(lineInsideWindows({startTime: "11:00", endTime: "12:00"}, SUB.windows, 5), true);
    assert.equal(lineInsideWindows({startTime: "11:30", endTime: "12:30"}, SUB.windows, 1), false);
    assert.equal(lineInsideWindows({startTime: "08:00", endTime: "09:00"}, SUB.windows, 6), false);
  });

  it("janela até meia-noite (fim 00:00)", () => {
    const night = [{weekday: 3, startTime: "20:00", endTime: "00:00"}];
    assert.equal(lineInsideWindows({startTime: "23:00", endTime: "00:00"}, night, 3), true);
  });
});

describe("applyFlexPlan", () => {
  it("um uso cobre a duração do plano dentro da janela: R$ 0", () => {
    const out = applyFlexPlan(lines([80]), SUB, {weekday: 2, courtId: "c1", usesLeft: 2});
    assert.equal(out.result.amountReais, 0);
    assert.equal(out.flex.scheduleFlexMinutes, 60);
    assert.equal(out.flex.scheduleFlexDiscountReais, 80);
    assert.equal(out.flex.scheduleFlexSubscriptionId, "sub1");
    assert.equal(out.blockedReason, null);
  });

  it("reserva maior que o plano: o que passa da duração é cobrado", () => {
    const out = applyFlexPlan(lines([80, 80]), SUB, {weekday: 2, courtId: null, usesLeft: 1});
    assert.equal(out.result.amountReais, 80);
    assert.equal(out.flex.scheduleFlexMinutes, 60);
  });

  it("só o que cai na janela é coberto", () => {
    // 11:00–13:00: 11h dentro, 12h fora.
    const out = applyFlexPlan(lines([80, 100], 11), {...SUB, durationMinutes: 120}, {weekday: 1, courtId: null, usesLeft: 1});
    assert.equal(out.result.amountReais, 100);
    assert.equal(out.flex.scheduleFlexMinutes, 60);
  });

  it("fora da janela, na semana esgotada ou em quadra fora do plano não cobre", () => {
    assert.equal(applyFlexPlan(lines([80], 18), SUB, {weekday: 1, courtId: null, usesLeft: 2}).blockedReason, "outside_window");
    assert.equal(applyFlexPlan(lines([80], 8), SUB, {weekday: 6, courtId: null, usesLeft: 2}).blockedReason, "outside_window");
    const exhausted = applyFlexPlan(lines([80], 8), SUB, {weekday: 1, courtId: null, usesLeft: 0});
    assert.equal(exhausted.blockedReason, "exhausted");
    assert.equal(exhausted.result.amountReais, 80);
    const courts = {...SUB, courtIds: ["c1"]};
    assert.equal(applyFlexPlan(lines([80], 8), courts, {weekday: 1, courtId: "c2", usesLeft: 2}).blockedReason, "outside_window");
    assert.equal(applyFlexPlan(lines([80], 8), courts, {weekday: 1, courtId: "c1", usesLeft: 2}).result.amountReais, 0);
    // Quadra ainda não definida (a arena define): vale.
    assert.equal(applyFlexPlan(lines([80], 8), courts, {weekday: 1, courtId: null, usesLeft: 2}).result.amountReais, 0);
  });

  it("cupom mais barato que o plano: fica o cupom", () => {
    const withCoupon = lines([80, 80]);
    withCoupon.result.amountReais = 40;
    withCoupon.coupon = {couponApplied: true, couponId: "x", couponCode: "X", couponDiscountReais: 120};
    const out = applyFlexPlan(withCoupon, SUB, {weekday: 1, courtId: null, usesLeft: 1});
    assert.equal(out.blockedReason, "coupon_cheaper");
    assert.equal(out.result.amountReais, 40);
  });
});

describe("usedFlexUses", () => {
  it("conta reservas vivas cobertas; cancelada devolve o uso", () => {
    assert.equal(usedFlexUses([
      {scheduleFlexMinutes: 60, status: "active"},
      {scheduleFlexMinutes: 60, status: "canceled"},
      {scheduleFlexMinutes: 60, status: "cancelled"},
      {scheduleFlexMinutes: 0, status: "active"},
      {scheduleFlexMinutes: 90, status: "pending_payment"},
    ]), 2);
  });
});

describe("plano livre: modo, proporcional e dias", () => {
  const baseInput = {
    name: "Manhã livre",
    status: "active",
    timesPerWeek: 4,
    durationMinutes: 60,
    windows: [{weekday: 6, startTime: "07:00", endTime: "12:00"}],
    courtIds: ["c1"],
    capacity: 10,
    monthlyPriceReais: 300,
  };

  it("livre aceita até 7x e repetir o dia; fixo segue até 3 em dias distintos", () => {
    const flex = validateSchedulePlanInput({...baseInput, bookingMode: "flexible"});
    assert.equal(flex.bookingMode, "flexible");
    assert.equal(flex.timesPerWeek, 4);
    assert.throws(() => validateSchedulePlanInput({...baseInput, bookingMode: "flexible", timesPerWeek: 8}));
    assert.throws(() => validateSchedulePlanInput({...baseInput, timesPerWeek: 4}));
    assert.throws(() => validateSchedulePlanInput({...baseInput, timesPerWeek: 2}), /dias suficientes/);
  });

  it("modo ausente no doc ou no portal antigo = fixo", () => {
    assert.equal(parseSchedulePlan({}).bookingMode, "fixed");
    assert.equal(validateSchedulePlanInput({...baseInput, timesPerWeek: 1}).bookingMode, "fixed");
  });

  it("1ª proporcional do livre conta os dias de janela que sobram no mês", () => {
    const plan = parseSchedulePlan({windows: [1, 2, 3, 4, 5].map((weekday) => ({weekday, startTime: "06:00", endTime: "12:00"}))});
    const weekdays = planWindowWeekdays(plan);
    assert.deepEqual(weekdays, [1, 2, 3, 4, 5]);
    // 23/11/2026 (seg): sobram 6 dias úteis de 21 em novembro.
    const first = planFirstCharge(210, weekdays, "2026-11-23", 5);
    assert.equal(first.period, "2026-11");
    assert.ok(first.totalReais > 0 && first.totalReais < 210);
  });

  it("assinatura livre: dias do proporcional vêm das janelas", () => {
    const sub = {planSnapshot: {bookingMode: "flexible", windows: [{weekday: 6, startTime: "07:00", endTime: "12:00"}]}, slots: []};
    assert.equal(isFlexibleSubscription(sub), true);
    assert.deepEqual(billingWeekdaysOf(sub), [6]);
    assert.deepEqual(billingWeekdaysOf({slots: [{weekday: 2}, {weekday: 4}]}), [2, 4]);
    assert.equal(isFlexibleSubscription({planSnapshot: {timesPerWeek: 1}}), false);
  });
});

describe("desconto no Pix do plano", () => {
  it("valor no Pix em centavos; 0%, valor baixo ou sem mudança = sem desconto", () => {
    assert.equal(pixDiscountedReais(220, 10), 198);
    assert.equal(pixDiscountedReais(99.9, 5), 94.91);
    assert.equal(pixDiscountedReais(220, 0), null);
    assert.equal(pixDiscountedReais(5.2, 10), null); // 4,68 < mínimo online
    assert.equal(clampPixDiscount(80), 50);
    assert.equal(clampPixDiscount("x"), 0);
  });

  it("validação: até 50%, e sem Pix entre as formas o desconto zera", () => {
    const base = {
      name: "Noite", status: "active", timesPerWeek: 1, durationMinutes: 60, capacity: 5, monthlyPriceReais: 200,
      windows: [{weekday: 1, startTime: "18:00", endTime: "22:00"}], courtIds: ["c1"],
    };
    assert.equal(validateSchedulePlanInput({...base, billing: {pixDiscountPercent: 10}}).billing.pixDiscountPercent, 10);
    assert.equal(validateSchedulePlanInput(base).billing.pixDiscountPercent, 0);
    assert.throws(() => validateSchedulePlanInput({...base, billing: {pixDiscountPercent: 60}}), /Desconto no Pix/);
    assert.equal(validateSchedulePlanInput({...base, billing: {methods: ["card", "onsite"], pixDiscountPercent: 10}})
      .billing.pixDiscountPercent, 0);
    assert.equal(parseSchedulePlan({billing: {pixDiscountPercent: 15}}).billing.pixDiscountPercent, 15);
  });
});

describe("vencimento escolhido pelo assinante", () => {
  it("opções: até 4 dias 1..28, ordenadas; uma só não é escolha", () => {
    assert.deepEqual(parseDueDayOptions([25, 5, 15]), [5, 15, 25]);
    assert.deepEqual(parseDueDayOptions([10]), []);
    assert.deepEqual(parseDueDayOptions(undefined), []);
    assert.throws(() => parseDueDayOptions([5, 31]), /entre 1 e 28/);
  });

  it("plano com opções: padrão é a 1ª; sem opções vale o dueDay", () => {
    const base = {
      name: "Noite", status: "active", timesPerWeek: 1, durationMinutes: 60, capacity: 5, monthlyPriceReais: 200,
      windows: [{weekday: 1, startTime: "18:00", endTime: "22:00"}], courtIds: ["c1"],
    };
    const plan = validateSchedulePlanInput({...base, billing: {dueDay: 10, dueDayOptions: [15, 5, 25]}});
    assert.deepEqual(plan.billing.dueDayOptions, [5, 15, 25]);
    assert.equal(plan.billing.dueDay, 5);
    assert.equal(chosenDueDay(plan.billing, 25), 25);
    assert.equal(chosenDueDay(plan.billing, undefined), 5);
    assert.throws(() => chosenDueDay(plan.billing, 10), /dia 5, 15, 25/);
    assert.equal(chosenDueDay({dueDay: 10, dueDayOptions: []}, 25), 10, "sem opções, ignora o pedido");
  });
});
