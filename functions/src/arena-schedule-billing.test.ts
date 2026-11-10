import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {
  dueReminder,
  inAutopayWindow,
  isPastRelease,
  registerSchedulePaymentCore,
  runScheduleSubscriptionsDaily,
} from "./arena-schedule-billing";
import {createSubscriptionCore} from "./arena-schedule-subscriptions";
import {ARENA, MANAGER, docsIn, holder, makeDb, pushes, seedArena, today, weekdayIn} from "./arena-schedule.test-helper";

describe("atraso (puro)", () => {
  it("passa do prazo quando vencimento + dias de liberação <= hoje", () => {
    const charge = {status: "open", dueDate: "2026-11-05"};
    assert.equal(isPastRelease(charge, 3, "2026-11-07"), false);
    assert.equal(isPastRelease(charge, 3, "2026-11-08"), true);
    assert.equal(isPastRelease({...charge, status: "paid"}, 3, "2026-12-01"), false);
  });

  it("lembretes no vencimento, +1 e +3, sem repetir", () => {
    const charge = {status: "open", dueDate: "2026-11-05", remindersSent: [] as number[]};
    assert.equal(dueReminder(charge, "2026-11-04"), null);
    assert.equal(dueReminder(charge, "2026-11-05"), 0);
    assert.equal(dueReminder({...charge, remindersSent: [0]}, "2026-11-05"), null);
    assert.equal(dueReminder({...charge, remindersSent: [0]}, "2026-11-06"), 1);
    assert.equal(dueReminder({...charge, remindersSent: [0, 1]}, "2026-11-07"), null);
    assert.equal(dueReminder({...charge, remindersSent: [0, 1]}, "2026-11-08"), 3);
    // Agendador parado uns dias: manda só o marco mais recente.
    assert.equal(dueReminder(charge, "2026-11-20"), 3);
    assert.equal(dueReminder({...charge, remindersSent: [0, 1, 3]}, "2026-11-20"), null);
  });
});

describe("régua de atraso e janela do débito automático", () => {
  async function runWith(autopayState: string) {
    const {fake, db} = makeDb();
    seedArena(fake);
    const todayKey = today();
    const {subscriptionId} = await createSubscriptionCore(db, {
      arenaId: ARENA, planId: "p1", holder: holder("u1"), memberAthleteIds: [], weekdays: [weekdayIn(2)],
      startTime: "19:00", preferredCourtId: null, strictCourt: false, cycle: "monthly", paymentMethod: "onsite",
      startDate: todayKey, source: "athlete", createdByUid: "u1", audience: "athlete",
    }, todayKey, Date.now());
    fake.seedDoc(`arenaScheduleSubscriptions/${subscriptionId}`, {
      ...fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!, planSnapshot: {overdueReleaseDays: 1},
    });
    fake.seedDoc(`arenaScheduleCharges/${subscriptionId}_1999-01_0`, {
      arenaId: ARENA, subscriptionId, planName: "Fixo 1x", period: "1999-01", status: "open", payerAthleteId: "u1",
      amountReais: 300, dueDate: addDaysToDateKey(todayKey, -1), remindersSent: [], billingMode: "asaas",
      autopay: {state: autopayState, scheduledFor: todayKey, attempts: 1},
    });
    pushes.length = 0;
    const run = await runScheduleSubscriptionsDaily(db, todayKey, Date.now());
    return {run, status: fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!["status"]};
  }

  it("no reminder and no suspension inside the debit window", async () => {
    for (const state of ["scheduled", "retry", "charging"]) {
      const {run, status} = await runWith(state);
      assert.equal(run.reminders, 0, state);
      assert.equal(run.suspended, 0, state);
      assert.equal(status, "active", state);
      assert.ok(!pushes.some((p) => p.type === "schedule_plan_charge_reminder"), state);
    }
    for (const state of ["failed", "skipped"]) {
      const {run, status} = await runWith(state);
      assert.equal(run.reminders, 1, state);
      assert.equal(run.suspended, 1, state);
      assert.equal(status, "suspended", state);
      assert.ok(pushes.some((p) => p.type === "schedule_plan_charge_reminder"), state);
    }
  });

  it("inAutopayWindow is pure on the state", () => {
    assert.equal(inAutopayWindow({autopay: {state: "retry"}}), true);
    assert.equal(inAutopayWindow({autopay: {state: "failed"}}), false);
    assert.equal(inAutopayWindow({}), false);
    assert.equal(dueReminder({status: "open", dueDate: "2000-01-01", autopay: {state: "scheduled"}}, "2000-01-02"), null);
    assert.equal(isPastRelease({status: "open", dueDate: "2000-01-01", autopay: {state: "charging"}}, 1, "2000-01-05"), false);
  });
});

describe("suspensão por atraso e reativação na baixa", () => {
  it("agendador suspende e libera a agenda; baixa que zera o atraso reativa", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const todayKey = today();
    const {subscriptionId} = await createSubscriptionCore(db, {
      arenaId: ARENA, planId: "p1", holder: holder("u1"), memberAthleteIds: [], weekdays: [weekdayIn(2)],
      startTime: "19:00", preferredCourtId: null, strictCourt: false, cycle: "monthly", paymentMethod: "onsite",
      startDate: todayKey, source: "athlete", createdByUid: "u1", audience: "athlete",
    }, todayKey, Date.now());
    // Mensalidade aberta vencida há 3 dias (plano libera após 3).
    const lateId = `${subscriptionId}_1999-01_0`;
    fake.seedDoc(`arenaScheduleCharges/${lateId}`, {
      arenaId: ARENA, subscriptionId, planName: "Fixo 1x", period: "1999-01", status: "open", payerAthleteId: "u1",
      amountReais: 300, dueDate: addDaysToDateKey(todayKey, -3), remindersSent: [0, 1],
    });
    pushes.length = 0;

    const run = await runScheduleSubscriptionsDaily(db, todayKey, Date.now());
    assert.equal(run.suspended, 1);
    assert.equal(run.reminders, 1);
    assert.deepEqual(fake.store.get(`arenaScheduleCharges/${lateId}`)!["remindersSent"], [0, 1, 3]);
    assert.ok(pushes.some((p) => p.type === "schedule_plan_suspended" && p.userId === "u1"));
    const sub = fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!;
    assert.equal(sub["status"], "suspended");
    const seriesId = (sub["slots"] as Array<{seriesId: string}>)[0]!.seriesId;
    assert.equal(fake.store.get(`arenaRecurringBookings/${seriesId}`)!["status"], "paused");
    assert.equal(docsIn(fake, `arenaBookings/rec_${seriesId}_`).filter(([, b]) => b["status"] === "active").length, 0);

    // Idempotente: rodar de novo não suspende nem lembra outra vez.
    const again = await runScheduleSubscriptionsDaily(db, todayKey, Date.now());
    assert.equal(again.suspended, 0);
    assert.equal(again.reminders, 0);

    const paid = await registerSchedulePaymentCore(db, MANAGER, lateId, "pix", null, todayKey);
    assert.deepEqual(paid, {status: "paid", reactivated: true});
    assert.equal(fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!["status"], "active");
    assert.equal(fake.store.get(`arenaRecurringBookings/${seriesId}`)!["status"], "active");
    assert.ok(docsIn(fake, `arenaBookings/rec_${seriesId}_`).some(([, b]) => b["status"] === "active"));
    const charge = fake.store.get(`arenaScheduleCharges/${lateId}`)!;
    assert.equal(charge["paymentMethod"], "pix");
    assert.equal(charge["registeredByUid"], MANAGER);
  });

  it("baixa não reativa enquanto houver outra atrasada além do prazo", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const todayKey = today();
    fake.seedDoc("arenaScheduleSubscriptions/s1", {
      arenaId: ARENA, status: "suspended", slots: [], planSnapshot: {overdueReleaseDays: 1}, holderAthleteId: "u1",
    });
    for (const k of [0, 1]) {
      fake.seedDoc(`arenaScheduleCharges/s1_1999-0${k + 1}_0`, {
        arenaId: ARENA, subscriptionId: "s1", status: "open", dueDate: addDaysToDateKey(todayKey, -5),
      });
    }
    const out = await registerSchedulePaymentCore(db, MANAGER, "s1_1999-01_0", "cash", null, todayKey);
    assert.deepEqual(out, {status: "paid", reactivated: false});
    assert.equal(fake.store.get("arenaScheduleSubscriptions/s1")!["status"], "suspended");
  });

  it("gera a mensalidade do mês por pagador e não fatura pausada", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const todayKey = today();
    const members = [
      {athleteId: "u1", name: "A", photoUrl: null, shareReais: 150, role: "holder"},
      {athleteId: "u2", name: "B", photoUrl: null, shareReais: 150, role: "member"},
    ];
    const base = {
      arenaId: ARENA, planName: "Fixo", holderName: "A", holderAthleteId: "u1", members, monthlyPriceReais: 300,
      dueDay: 5, startDate: "2026-01-10", billedThrough: "2026-01", slots: [], endsOn: null,
    };
    fake.seedDoc("arenaScheduleSubscriptions/act", {...base, status: "active"});
    fake.seedDoc("arenaScheduleSubscriptions/pau", {...base, status: "paused", pausedUntil: "2099-01-01"});
    await runScheduleSubscriptionsDaily(db, todayKey, Date.now());
    const month = todayKey.slice(0, 7);
    assert.equal(fake.store.get(`arenaScheduleCharges/act_${month}_0`)!["amountReais"], 150);
    assert.equal(fake.store.get(`arenaScheduleCharges/act_${month}_1`)!["payerAthleteId"], "u2");
    assert.equal(fake.store.get(`arenaScheduleCharges/act_2026-02_0`)!["kind"], "monthly");
    assert.equal(docsIn(fake, "arenaScheduleCharges/pau_").length, 0);
  });
});
