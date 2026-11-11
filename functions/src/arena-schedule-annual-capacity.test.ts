/**
 * Planos de horário: anual pago à vista (12 mensalidades numa cobrança) e plano sem quadra na arena
 * que define a quadra (reservas por capacidade).
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {
  cancelMySubscriptionCore,
  createSubscriptionCore,
  pauseSubscriptionCore,
  planFirstCharge,
  type CreateSubscriptionRequest,
} from "./arena-schedule-subscriptions";
import {generateMonthlyChargesFor, monthsBetweenInclusive} from "./arena-schedule-billing";
import {getPlanAvailabilityCore, planCourtsOf, upsertSchedulePlanCore} from "./arena-schedule-plans";
import {getMakeupOptionsCore, grantManualMakeupCore} from "./arena-schedule-makeup";
import {chargePeriodLabel, prepaidMonthsOf} from "./arena-schedule-plan-constants";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {nextMonthKey} from "./arena-class-billing";
import {monthKeyOf} from "./arena-class-ledger";
import {ARENA, MANAGER, docsIn, holder, makeDb, planData, seedArena, today, weekdayIn} from "./arena-schedule.test-helper";

function request(overrides: Partial<CreateSubscriptionRequest> = {}): CreateSubscriptionRequest {
  return {
    arenaId: ARENA, planId: "p1", holder: holder("u1"), memberAthleteIds: [], weekdays: [weekdayIn(2)],
    startTime: "19:00", preferredCourtId: null, strictCourt: false, cycle: "annual", paymentMethod: "onsite",
    startDate: today(), source: "athlete", createdByUid: "u1", audience: "athlete", ...overrides,
  };
}

/** Arena no modo "a arena define a quadra" com a distribuição dada. */
function capacityArena(fake: ReturnType<typeof makeDb>["fake"], courtIds: string[]): void {
  fake.seedDoc(`arenas/${ARENA}`, {
    name: "Arena CFC", managerUserId: MANAGER, planTier: "pro", planStatus: "active",
    bookingAllocation: {mode: "capacity", courtIds, priceBySport: {beachTennis: 120}},
  });
}

describe("anual à vista: 1ª cobrança", () => {
  it("cobra a 1ª proporcional + 11 cheias numa cobrança só", () => {
    // 03/11/2026 é terça; segundas que sobram em novembro: 9, 16, 23, 30 de 5 → 240 de 300.
    assert.deepEqual(planFirstCharge(300, [1], "2026-11-03", 5, 12), {
      period: "2026-11", totalReais: 240 + 11 * 300, dueDate: "2026-11-09", billedThrough: "2027-10", months: 12,
    });
  });

  it("sem jogo sobrando no mês, cobre os 12 meses seguintes cheios", () => {
    assert.deepEqual(planFirstCharge(300, [2], "2026-11-30", 5, 12), {
      period: "2026-12", totalReais: 3600, dueDate: "2026-12-05", billedThrough: "2027-11", months: 12,
    });
  });

  it("só o anual é à vista", () => {
    assert.equal(prepaidMonthsOf("annual"), 12);
    assert.equal(prepaidMonthsOf("quarterly"), 1);
    assert.equal(prepaidMonthsOf("monthly"), 1);
  });
});

describe("anual à vista: assinatura", () => {
  it("grava prepaidMonths, a fidelidade no fim do pago e a mensalidade com coversThrough", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const result = await createSubscriptionCore(db, request(), today(), Date.now());
    const sub = fake.store.get(`arenaScheduleSubscriptions/${result.subscriptionId}`)!;
    assert.equal(sub["prepaidMonths"], 12);
    assert.equal(sub["monthlyPriceReais"], 270);
    const through = String(sub["billedThrough"]);
    assert.equal(monthsBetweenInclusive(result.firstCharge.period, through), 12);
    assert.equal(sub["commitmentEndsOn"], `${nextMonthKey(through)}-01`);

    const [[, charge]] = docsIn(fake, `arenaScheduleCharges/${result.subscriptionId}_`) as [[string, Record<string, unknown>]];
    assert.equal(charge["months"], 12);
    assert.equal(charge["coversThrough"], through);
    assert.equal(result.firstCharge.months, 12);
    assert.equal(result.firstCharge.coversThrough, through);
    // 11 meses cheios de R$ 270 + a 1ª (proporcional ou cheia).
    const firstMonth = Number(charge["amountReais"]) - 11 * 270;
    assert.ok(firstMonth > 0 && firstMonth <= 270, `1ª = ${firstMonth}`);
    assert.match(chargePeriodLabel(charge), / a /);
  });

  it("mensal segue mês a mês, sem prepaidMonths", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const result = await createSubscriptionCore(db, request({cycle: "monthly"}), today(), Date.now());
    const sub = fake.store.get(`arenaScheduleSubscriptions/${result.subscriptionId}`)!;
    assert.equal(sub["prepaidMonths"], undefined);
    assert.equal(sub["commitmentEndsOn"], null);
    const [[, charge]] = docsIn(fake, `arenaScheduleCharges/${result.subscriptionId}_`) as [[string, Record<string, unknown>]];
    assert.equal(charge["coversThrough"], undefined);
    assert.equal(result.firstCharge.months, 1);
  });

  it("titular que cancela sai no fim do que já pagou", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const result = await createSubscriptionCore(db, request(), today(), Date.now());
    const chargeId = result.firstCharge.chargeId;
    fake.seedDoc(`arenaScheduleCharges/${chargeId}`, {...fake.store.get(`arenaScheduleCharges/${chargeId}`)!, status: "paid"});
    const {endsOn} = await cancelMySubscriptionCore(db, "u1", result.subscriptionId, today());
    assert.equal(endsOn, `${nextMonthKey(result.firstCharge.coversThrough)}-01`);
  });
});

describe("anual à vista: renovação", () => {
  const sub = {
    arenaId: ARENA, planName: "Fixo", holderName: "A", holderAthleteId: "u1", monthlyPriceReais: 270, dueDay: 5,
    startDate: "2025-12-01", billedThrough: "2026-11", prepaidMonths: 12, endsOn: null, slots: [],
    members: [{athleteId: "u1", name: "A", photoUrl: null, shareReais: 270, role: "holder"}],
  };

  it("a 10 dias do vencimento cobra os próximos 12 meses de uma vez", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaScheduleSubscriptions/s1", {...sub, status: "active"});
    assert.equal(await generateMonthlyChargesFor(db, "s1", sub, "2026-11-26"), 1);
    const charge = fake.store.get("arenaScheduleCharges/s1_2026-12_0")!;
    assert.equal(charge["amountReais"], 3240);
    assert.equal(charge["months"], 12);
    assert.equal(charge["coversThrough"], "2027-11");
    assert.equal(fake.store.get("arenaScheduleSubscriptions/s1")!["billedThrough"], "2027-11");
    // Dentro do ano pago nada mais é gerado.
    const after = {...sub, billedThrough: "2027-11"};
    assert.equal(await generateMonthlyChargesFor(db, "s1", after, "2027-05-27"), 0);
  });

  it("com saída marcada cobra só até o último mês de jogo", async () => {
    const {fake, db} = makeDb();
    const ending = {...sub, endsOn: "2027-03-01"};
    fake.seedDoc("arenaScheduleSubscriptions/s1", {...ending, status: "active"});
    await generateMonthlyChargesFor(db, "s1", ending, "2026-11-26");
    const charge = fake.store.get("arenaScheduleCharges/s1_2026-12_0")!;
    assert.equal(charge["amountReais"], 810);
    assert.equal(charge["months"], 3);
    assert.equal(charge["coversThrough"], "2027-02");
  });
});

describe("anual à vista: pausa", () => {
  it("mês inteiro pausado empurra o pago até e a fidelidade, sem cancelar a cobrança", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const todayKey = "2027-01-31";
    fake.seedDoc("arenaScheduleSubscriptions/s1", {
      arenaId: ARENA, planId: "p1", planName: "Fixo", holderName: "A", holderAthleteId: "u1", memberAthleteIds: ["u1"],
      status: "active", prepaidMonths: 12, billedThrough: "2027-10", commitmentEndsOn: "2027-11-01", slots: [],
      planSnapshot: {rules: {pause: {enabled: true, maxDaysPerYear: 30}}},
    });
    fake.seedDoc("arenaScheduleCharges/s1_2026-11_0", {
      subscriptionId: "s1", period: "2026-11", coversThrough: "2027-10", months: 12, status: "paid",
    });
    await pauseSubscriptionCore(db, "u1", "s1", "2027-03-01", todayKey);
    const after = fake.store.get("arenaScheduleSubscriptions/s1")!;
    assert.equal(after["status"], "paused");
    assert.equal(after["billedThrough"], "2027-11");
    assert.equal(after["commitmentEndsOn"], "2027-12-01");
    assert.equal(fake.store.get("arenaScheduleCharges/s1_2026-11_0")!["status"], "paid");
  });
});

describe("arena que define a quadra", () => {
  it("o plano usa as quadras da distribuição, sem as de manutenção", () => {
    const courts = [
      {id: "q1", data: {name: "Quadra 1"}},
      {id: "q2", data: {name: "Quadra 2", status: "maintenance"}},
      {id: "q3", data: {name: "Quadra 3"}},
      {id: "q4", data: {name: "Quadra 4", status: "inactive"}},
    ];
    const plan = {courtIds: ["q1"], courtNames: ["Quadra 1"]};
    const arena = {bookingAllocation: {mode: "capacity", courtIds: ["q3", "q2", "q1", "q4"]}};
    assert.deepEqual(planCourtsOf(arena, plan, courts), {courtIds: ["q3", "q1"], courtNames: ["Quadra 3", "Quadra 1"]});
    // Distribuição sem lista = todas.
    assert.deepEqual(planCourtsOf({bookingAllocation: {mode: "capacity", courtIds: []}}, plan, courts).courtIds, ["q1", "q3"]);
    // Atleta escolhe a quadra: as do plano.
    assert.deepEqual(planCourtsOf({}, plan, courts).courtIds, ["q1"]);
  });

  it("salva plano sem quadra; no modo normal a quadra continua obrigatória", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const input = {...planData(), arenaId: ARENA, courtIds: [], courtNames: []};
    await assert.rejects(upsertSchedulePlanCore(db, MANAGER, input, Date.now()),
      (e: unknown) => e instanceof HttpsError && /quadras do plano/.test(e.message));
    capacityArena(fake, ["q1", "q2"]);
    const {planId} = await upsertSchedulePlanCore(db, MANAGER, {...input, courtIds: ["q3"]}, Date.now());
    assert.deepEqual(fake.store.get(`arenas/${ARENA}/schedulePlans/${planId}`)!["courtIds"], []);
  });

  it("disponibilidade e assinatura usam a distribuição, não as quadras do plano", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {courts: ["q1", "q2", "q3", "q4"], plan: {courtIds: [], courtNames: []}});
    capacityArena(fake, ["q4", "q2"]);
    const availability = await getPlanAvailabilityCore(db, "u1", ARENA, "p1", today(), Date.now());
    assert.equal(availability.arenaDefinesCourt, true);
    const time = availability.days.find((d) => d.weekday === weekdayIn(2))!.times.find((t) => t.startTime === "19:00")!;
    assert.equal(time.freeCourts, 2);

    const result = await createSubscriptionCore(db, request({cycle: "monthly"}), today(), Date.now());
    assert.equal(result.courtName, "Quadra 4");
  });

  it("reposição: uma opção por horário", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {plan: {
      courtIds: [], courtNames: [],
      windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({weekday, startTime: "18:00", endTime: "20:00"})),
    }});
    capacityArena(fake, ["q1", "q2", "q3"]);
    const {subscriptionId} = await createSubscriptionCore(db, request({cycle: "monthly", startTime: "18:00"}), today(), Date.now());
    const {creditId} = await grantManualMakeupCore(db, MANAGER, subscriptionId, null, today());
    const date = addDaysToDateKey(today(), 4);
    const {options} = await getMakeupOptionsCore(db, "u1", creditId, date, today(), Date.now());
    const starts = options.map((o) => o.startTime);
    assert.equal(new Set(starts).size, starts.length);
    assert.ok(starts.length > 0);
    assert.equal(monthKeyOf(date) >= monthKeyOf(today()), true);
  });
});
