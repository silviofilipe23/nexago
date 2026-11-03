/** Regressões da revisão do backend de Planos de horário (um bloco por item). */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {addDaysToDateKey, isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {DEFAULT_PLAN_RULES, occurrenceStartMs} from "./arena-schedule-plan-constants";
import {
  changeSubscriptionSlotsCore,
  createSubscriptionCore,
  effectiveStartDate,
  endSubscriptionCore,
  endSubscriptionForRemovedCourt,
  type CreateSubscriptionRequest,
} from "./arena-schedule-subscriptions";
import {cancelScheduleChargeCore, generateMonthlyChargesFor, runScheduleSubscriptionsDaily} from "./arena-schedule-billing";
import {applyHolidayCore, getMakeupOptionsCore, grantManualMakeupCore, skipOccurrenceCore, useMakeupCore} from "./arena-schedule-makeup";
import {acceptWaitlistOfferCore, addWaitlistCore, offerNextForPlan, offerWaitlistManualCore} from "./arena-schedule-waitlist";
import {ARENA, MANAGER, docsIn, holder, makeDb, pushes, seedArena, today, weekdayIn} from "./arena-schedule.test-helper";

function request(overrides: Partial<CreateSubscriptionRequest> = {}): CreateSubscriptionRequest {
  return {
    arenaId: ARENA, planId: "p1", holder: holder("u1"), memberAthleteIds: [], weekdays: [weekdayIn(2)], startTime: "19:00",
    preferredCourtId: null, strictCourt: false, cycle: "monthly", paymentMethod: "onsite", startDate: today(),
    source: "athlete", createdByUid: "u1", audience: "athlete", ...overrides,
  };
}

const isHttps = (code: string) => (e: unknown) => e instanceof HttpsError && e.code === code;

describe("1. volta antecipada da pausa não dá mês grátis", () => {
  it("mensalidade cancelada pela pausa renasce no gerador; cancelada pelo gestor não", async () => {
    const {fake, db} = makeDb();
    const sub = {
      arenaId: ARENA, planName: "Fixo", holderName: "A", holderAthleteId: "u1", monthlyPriceReais: 300, dueDay: 5,
      startDate: "2026-10-01", billedThrough: "2026-11", endsOn: null, slots: [],
      members: [{athleteId: "u1", name: "A", photoUrl: null, shareReais: 300, role: "holder"}],
    };
    fake.seedDoc("arenaScheduleSubscriptions/s1", {...sub, status: "active"});
    fake.seedDoc("arenaScheduleSubscriptions/s2", {...sub, status: "active"});
    fake.seedDoc("arenaScheduleCharges/s1_2026-12_0", {subscriptionId: "s1", period: "2026-12", status: "canceled", cancelReason: "paused"});
    fake.seedDoc("arenaScheduleCharges/s2_2026-12_0", {subscriptionId: "s2", period: "2026-12", status: "canceled"});
    // 26/11: a 10 dias do vencimento de dezembro.
    assert.equal(await generateMonthlyChargesFor(db, "s1", sub, "2026-11-26"), 1);
    assert.equal(await generateMonthlyChargesFor(db, "s2", sub, "2026-11-26"), 0);
    assert.equal(fake.store.get("arenaScheduleCharges/s1_2026-12_0")!["status"], "open");
    assert.equal(fake.store.get("arenaScheduleCharges/s1_2026-12_0")!["amountReais"], 300);
    assert.equal(fake.store.get("arenaScheduleCharges/s2_2026-12_0")!["status"], "canceled");
  });
});

describe("2. reposição respeita horário fixo além das travas e o horizonte", () => {
  it("não oferece nem reserva a quadra de outro fixo; data pulada libera; >35 dias recusa", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {plan: {
      windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({weekday, startTime: "18:00", endTime: "20:00"})),
      rules: {...DEFAULT_PLAN_RULES, makeup: {...DEFAULT_PLAN_RULES.makeup, validityDays: 90}},
    }});
    const {subscriptionId} = await createSubscriptionCore(db, request({startTime: "18:00"}), today(), Date.now());
    const {creditId} = await grantManualMakeupCore(db, MANAGER, subscriptionId, null, today());
    const date = addDaysToDateKey(today(), 4);
    const weekday = isoWeekdayOfDateKey(date);
    // Fixo de outro (sem reserva materializada nessa data) na q1 19h; fixo na q3 18h que pulou a data.
    fake.seedDoc("arenaRecurringBookings/other", {
      arenaId: ARENA, status: "active", weekday, startTime: "19:00", endTime: "20:00", courtId: "q1", startDate: "2026-01-01", skippedDates: [],
    });
    fake.seedDoc("arenaRecurringBookings/skip", {
      arenaId: ARENA, status: "active", weekday, startTime: "18:00", endTime: "19:00", courtId: "q3", startDate: "2026-01-01", skippedDates: [date],
    });
    const {options} = await getMakeupOptionsCore(db, "u1", creditId, date, today(), Date.now());
    const keys = options.map((o) => `${o.courtId}@${o.startTime}`);
    assert.equal(keys.includes("q1@19:00"), false);
    assert.equal(keys.includes("q3@18:00"), true);
    await assert.rejects(useMakeupCore(db, "u1", {creditId, date, courtId: "q1", startTime: "19:00"}, today(), Date.now()),
      isHttps("failed-precondition"));
    await assert.rejects(getMakeupOptionsCore(db, "u1", creditId, addDaysToDateKey(today(), 36), today(), Date.now()),
      isHttps("invalid-argument"));
    const ok = await useMakeupCore(db, "u1", {creditId, date, courtId: "q3", startTime: "18:00"}, today(), Date.now());
    assert.equal(ok.bookingId, `mk_${creditId}`);
  });
});

describe("3. trocar horário com saída marcada", () => {
  it("séries novas terminam na véspera do endsOn", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {subscriptionId} = await createSubscriptionCore(db, request(), today(), Date.now());
    const endsOn = addDaysToDateKey(today(), 20);
    await endSubscriptionCore(db, MANAGER, subscriptionId, endsOn, null, today(), Date.now());
    await changeSubscriptionSlotsCore(db, "u1", subscriptionId, [weekdayIn(3)], "08:00", today(), Date.now());
    const sub = fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!;
    const seriesId = (sub["slots"] as Array<{seriesId: string}>)[0]!.seriesId;
    assert.equal(fake.store.get(`arenaRecurringBookings/${seriesId}`)!["endDate"], addDaysToDateKey(endsOn, -1));
    assert.equal(docsIn(fake, `arenaBookings/rec_${seriesId}_`).filter(([, b]) => String(b["date"]) >= endsOn).length, 0);
  });
});

describe("4/5. fila: oferta manual em plano cheio, só oferta automática a quem tem conta, gestor converte", () => {
  it("oferta manual com o plano cheio pode ser aceita", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {plan: {capacity: 1}});
    await createSubscriptionCore(db, request(), today(), Date.now());
    const {entryId} = await addWaitlistCore(db, "u2", {arenaId: ARENA, planId: "p1", weekdays: [weekdayIn(2)], startTime: "19:00"}, Date.now());
    await offerWaitlistManualCore(db, MANAGER, entryId, Date.now());
    const out = await acceptWaitlistOfferCore(db, "u2", {entryId, cycle: "monthly", paymentMethod: "onsite"}, today(), Date.now());
    assert.equal(out.courtName, "Quadra 2");
    assert.equal(fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!["occupiedCount"], 2);
  });

  it("oferta automática pula a entrada só com nome; o gestor converte ela em assinatura", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {plan: {capacity: 1}});
    const now = Date.now();
    const byName = await addWaitlistCore(db, MANAGER, {arenaId: ARENA, planId: "p1", weekdays: [weekdayIn(2)], startTime: "19:00", name: "Carla"}, now);
    const athlete = await addWaitlistCore(db, "u2", {arenaId: ARENA, planId: "p1", weekdays: [weekdayIn(2)], startTime: "19:00"}, now + 1);
    assert.equal(await offerNextForPlan(db, ARENA, "p1", now), athlete.entryId);
    assert.equal(fake.store.get(`arenaScheduleWaitlist/${byName.entryId}`)!["status"], "waiting");

    const other = makeDb();
    seedArena(other.fake);
    const entry = await addWaitlistCore(other.db, MANAGER, {arenaId: ARENA, planId: "p1", weekdays: [weekdayIn(2)], startTime: "19:00", name: "Carla"}, now);
    const sub = await createSubscriptionCore(other.db, request({
      holder: {athleteId: null, name: "Carla", phone: null, photoUrl: null}, audience: "manager", source: "arena",
      createdByUid: MANAGER, waitlistEntryId: entry.entryId,
    }), today(), now);
    const converted = other.fake.store.get(`arenaScheduleWaitlist/${entry.entryId}`)!;
    assert.equal(converted["status"], "accepted");
    assert.equal(converted["subscriptionId"], sub.subscriptionId);
    assert.equal(other.fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!["waitingCount"], 0);
  });
});

describe("6. assinar depois do horário de hoje", () => {
  it("começa amanhã: sem reserva no passado e 1ª mensalidade no 1º jogo de verdade", async () => {
    assert.equal(effectiveStartDate("2026-11-03", "19:00", "2026-11-03", Date.parse("2026-11-03T19:00:00-03:00")), "2026-11-04");
    assert.equal(effectiveStartDate("2026-11-03", "19:00", "2026-11-03", Date.parse("2026-11-03T18:59:00-03:00")), "2026-11-03");
    assert.equal(effectiveStartDate("2026-11-05", "19:00", "2026-11-03", Date.parse("2026-11-03T20:00:00-03:00")), "2026-11-05");

    const {fake, db} = makeDb();
    seedArena(fake);
    const nowMs = occurrenceStartMs(today(), "08:00");
    const out = await createSubscriptionCore(db, request({weekdays: [weekdayIn(0)], startTime: "07:00"}), today(), nowMs);
    const sub = fake.store.get(`arenaScheduleSubscriptions/${out.subscriptionId}`)!;
    assert.equal(sub["startDate"], addDaysToDateKey(today(), 1));
    const seriesId = (sub["slots"] as Array<{seriesId: string}>)[0]!.seriesId;
    assert.equal(fake.store.has(`arenaBookings/rec_${seriesId}_${today()}`), false);
    assert.ok(out.firstCharge.dueDate > today());
  });
});

describe("7. feriado não dá crédito em cima de falta já creditada", () => {
  it("ocorrência já desmarcada (com crédito) não ganha crédito de feriado", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {subscriptionId} = await createSubscriptionCore(db, request(), today(), Date.now());
    const sub = fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!;
    const seriesId = (sub["slots"] as Array<{seriesId: string}>)[0]!.seriesId;
    const date = addDaysToDateKey(today(), 9);
    const bookingId = `rec_${seriesId}_${date}`;
    assert.ok(fake.store.has(`arenaBookings/${bookingId}`));
    assert.equal((await skipOccurrenceCore(db, "u1", bookingId, Date.now())).reason, "granted");
    assert.deepEqual(await applyHolidayCore(db, MANAGER, ARENA, date, today()), {canceled: 0, credits: 0});
    assert.equal(fake.store.has(`arenaScheduleCredits/hol_${subscriptionId}_${date}`), false);
    assert.equal(fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!["makeupBalance"], 1);
  });
});

describe("8. quadra excluída encerra a assinatura", () => {
  it("encerra hoje, devolve a vaga, cancela mensalidade futura e não oferece à fila", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {plan: {capacity: 1}});
    const {subscriptionId} = await createSubscriptionCore(db, request(), today(), Date.now());
    fake.seedDoc(`arenaScheduleCharges/${subscriptionId}_2099-01_0`, {subscriptionId, period: "2099-01", status: "open", dueDate: "2099-01-05"});
    const {entryId} = await addWaitlistCore(db, "u2", {arenaId: ARENA, planId: "p1", weekdays: [weekdayIn(2)], startTime: "19:00"}, Date.now());
    pushes.length = 0;
    assert.equal(await endSubscriptionForRemovedCourt(db, subscriptionId, today(), Date.now()), true);
    const sub = fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!;
    assert.equal(sub["status"], "canceled");
    assert.equal(sub["cancelReason"], "court_removed");
    assert.equal(fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!["occupiedCount"], 0);
    assert.equal(fake.store.get(`arenaScheduleCharges/${subscriptionId}_2099-01_0`)!["status"], "canceled");
    assert.equal(fake.store.get(`arenaScheduleWaitlist/${entryId}`)!["status"], "waiting");
    assert.ok(pushes.some((p) => p.userId === "u1" && p.type === "schedule_plan_ended"));
    assert.equal(await endSubscriptionForRemovedCourt(db, subscriptionId, today(), Date.now()), false);
  });
});

describe("9. liberação de agenda que ficou pela metade", () => {
  it("o agendador libera as ocorrências de séries fora de jogo marcadas como pendentes", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {subscriptionId} = await createSubscriptionCore(db, request(), today(), Date.now());
    const subPath = `arenaScheduleSubscriptions/${subscriptionId}`;
    const sub = fake.store.get(subPath)!;
    const seriesId = (sub["slots"] as Array<{seriesId: string}>)[0]!.seriesId;
    // Queda logo depois da transação da pausa: status gravado, agenda ainda ocupada.
    fake.seedDoc(subPath, {
      ...sub, status: "paused", pausedUntil: "2099-01-01", releasePending: true, pendingReleaseSeriesIds: [seriesId],
    });
    fake.seedDoc(`arenaRecurringBookings/${seriesId}`, {...fake.store.get(`arenaRecurringBookings/${seriesId}`)!, status: "paused"});
    assert.ok(docsIn(fake, `arenaBookings/rec_${seriesId}_`).some(([, b]) => b["status"] === "active"));
    const run = await runScheduleSubscriptionsDaily(db, today(), Date.now());
    assert.ok(run.released > 0);
    assert.equal(docsIn(fake, `arenaBookings/rec_${seriesId}_`).filter(([, b]) => b["status"] === "active").length, 0);
    assert.equal(fake.store.get(subPath)!["releasePending"], false);
  });
});

describe("10. cancelar mensalidade", () => {
  it("paga não cancela; aberta cancela", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    fake.seedDoc("arenaScheduleCharges/c_paid", {arenaId: ARENA, subscriptionId: "none", status: "paid"});
    fake.seedDoc("arenaScheduleCharges/c_open", {arenaId: ARENA, subscriptionId: "none", status: "open"});
    await assert.rejects(cancelScheduleChargeCore(db, MANAGER, "c_paid", today()), isHttps("failed-precondition"));
    assert.deepEqual(await cancelScheduleChargeCore(db, MANAGER, "c_open", today()), {status: "canceled"});
    assert.equal(fake.store.get("arenaScheduleCharges/c_open")!["status"], "canceled");
    assert.equal(fake.store.get("arenaScheduleCharges/c_paid")!["status"], "paid");
  });
});
