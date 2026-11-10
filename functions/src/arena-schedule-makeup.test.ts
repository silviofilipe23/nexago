import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {addDaysToDateKey, isoWeekdayOfDateKey, lockRefsForOccurrence} from "./arena-recurring-booking";
import type {Firestore} from "firebase-admin/firestore";
import {DEFAULT_PLAN_RULES} from "./arena-schedule-plan-constants";
import {
  applyHolidayCore,
  decideSkipCredit,
  getMakeupOptionsCore,
  grantArenaCanceledOccurrenceCredit,
  grantManualMakeupCore,
  skipOccurrenceCore,
  useMakeupCore,
} from "./arena-schedule-makeup";
import {ARENA, MANAGER, makeDb, seedArena, today} from "./arena-schedule.test-helper";
import type {FakeFirestore} from "./fake-firestore.test-helper";

const HOUR = 3_600_000;

describe("decideSkipCredit", () => {
  const rules = {enabled: true, perMonth: 2, validityDays: 30, noticeHours: 24};
  const now = Date.parse("2026-11-03T12:00:00-03:00");
  it("crédito com aviso no prazo e dentro do limite do mês", () => {
    assert.equal(decideSkipCredit({rules, startMs: now + 24 * HOUR, nowMs: now, grantedThisMonth: 1}), "granted");
  });
  it("em cima da hora, limite do mês ou regra desligada não dão crédito", () => {
    assert.equal(decideSkipCredit({rules, startMs: now + 23 * HOUR, nowMs: now, grantedThisMonth: 0}), "late_notice");
    assert.equal(decideSkipCredit({rules, startMs: now + 48 * HOUR, nowMs: now, grantedThisMonth: 2}), "monthly_limit");
    assert.equal(decideSkipCredit({rules: {...rules, enabled: false}, startMs: now + 48 * HOUR, nowMs: now, grantedThisMonth: 0}), "disabled");
  });
});

/** Assinatura ativa com uma série e ocorrências materializadas à mão nas datas pedidas. */
function seedSubscription(fake: FakeFirestore, db: Firestore, opts: {dates: string[]; startTime?: string; rules?: object; holiday?: string}) {
  const startTime = opts.startTime ?? "19:00";
  const endTime = `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:${startTime.slice(3)}`;
  const weekday = isoWeekdayOfDateKey(opts.dates[0]!);
  fake.seedDoc("arenaScheduleSubscriptions/s1", {
    arenaId: ARENA, arenaName: "Arena CFC", planId: "p1", planName: "Fixo 1x", status: "active",
    holderAthleteId: "u1", holderName: "Atleta u1", memberAthleteIds: ["u1", "u2"], startDate: "2026-01-01", endsOn: null,
    planSnapshot: {
      timesPerWeek: 1, durationMinutes: 60, overdueReleaseDays: 3, dueDay: 5,
      rules: {...DEFAULT_PLAN_RULES, ...(opts.holiday ? {holiday: opts.holiday} : {}), makeup: {...DEFAULT_PLAN_RULES.makeup, ...(opts.rules ?? {})}},
    },
    slots: [{weekday, startTime, endTime, courtId: "q1", courtName: "Quadra 1", seriesId: "ser1"}],
    makeupBalance: 0,
  });
  fake.seedDoc("arenaRecurringBookings/ser1", {
    arenaId: ARENA, status: "active", weekday, startTime, endTime, courtId: "q1", skippedDates: [], scheduleSubscriptionId: "s1",
  });
  for (const date of opts.dates) {
    const id = `rec_ser1_${date}`;
    fake.seedDoc(`arenaBookings/${id}`, {
      arenaId: ARENA, courtId: "q1", date, startTime, endTime, status: "active", athleteId: "u1",
      recurringBookingId: "ser1", scheduleSubscriptionId: "s1", coveredByPlan: true,
    });
    fake.seedDoc(`arenaSlots/${id}`, {bookingId: id});
    for (const lock of lockRefsForOccurrence(db, {arenaId: ARENA, courtId: "q1", startTime, endTime}, date)) {
      fake.seedDoc(lock.ref.path, {bookingId: id});
    }
  }
}

function lockPath(db: Firestore, date: string, startTime: string, endTime: string, courtId = "q1"): string {
  return lockRefsForOccurrence(db, {arenaId: ARENA, courtId, startTime, endTime}, date)[0]!.ref.path;
}

describe("skipOccurrenceCore", () => {
  it("membro desmarca com antecedência: cancela, libera a quadra e gera crédito até o limite do mês", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const d1 = addDaysToDateKey(today(), 7);
    const d2 = addDaysToDateKey(today(), 14);
    seedSubscription(fake, db, {dates: [d1, d2], rules: {perMonth: 1}});

    const first = await skipOccurrenceCore(db, "u2", `rec_ser1_${d1}`, Date.now());
    assert.deepEqual(first, {creditId: `rec_ser1_${d1}`, reason: "granted"});
    assert.equal(fake.store.get(`arenaBookings/rec_ser1_${d1}`)!["status"], "cancelled");
    assert.equal(fake.store.has(`arenaSlots/rec_ser1_${d1}`), false);
    assert.equal(fake.store.has(lockPath(db, d1, "19:00", "20:00")), false);
    assert.deepEqual(fake.store.get("arenaRecurringBookings/ser1")!["skippedDates"], [d1]);
    const credit = fake.store.get(`arenaScheduleCredits/rec_ser1_${d1}`)!;
    assert.equal(credit["reason"], "skip");
    assert.equal(credit["expiresOn"], addDaysToDateKey(d1, 30));
    assert.deepEqual(credit["athleteIds"], ["u1", "u2"]);
    assert.equal(fake.store.get("arenaScheduleSubscriptions/s1")!["makeupBalance"], 1);

    const second = await skipOccurrenceCore(db, "u1", `rec_ser1_${d2}`, Date.now());
    assert.deepEqual(second, {creditId: null, reason: "monthly_limit"});
    assert.equal(fake.store.get(`arenaBookings/rec_ser1_${d2}`)!["status"], "cancelled");
    assert.equal(fake.store.has(`arenaScheduleCredits/rec_ser1_${d2}`), false);
  });

  it("em cima da hora cancela sem crédito; quem não é do plano não desmarca", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const d1 = addDaysToDateKey(today(), 7);
    seedSubscription(fake, db, {dates: [d1]});
    const start = Date.parse(`${d1}T19:00:00-03:00`);
    await assert.rejects(skipOccurrenceCore(db, "u9", `rec_ser1_${d1}`, start - 48 * HOUR),
      (e: unknown) => e instanceof HttpsError && e.code === "permission-denied");
    const out = await skipOccurrenceCore(db, "u1", `rec_ser1_${d1}`, start - 2 * HOUR);
    assert.deepEqual(out, {creditId: null, reason: "late_notice"});
  });

  it("cancelamento pela agenda vira crédito `arena` fora do limite do mês", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const d1 = addDaysToDateKey(today(), 7);
    seedSubscription(fake, db, {dates: [d1], rules: {perMonth: 0}});
    const booking = fake.store.get(`arenaBookings/rec_ser1_${d1}`)!;
    assert.equal(await grantArenaCanceledOccurrenceCredit(db, `rec_ser1_${d1}`, booking), `rec_ser1_${d1}`);
    assert.equal(fake.store.get(`arenaScheduleCredits/rec_ser1_${d1}`)!["reason"], "arena");
    // Idempotente.
    assert.equal(await grantArenaCanceledOccurrenceCredit(db, `rec_ser1_${d1}`, booking), null);
    assert.equal(fake.store.get("arenaScheduleSubscriptions/s1")!["makeupBalance"], 1);
  });
});

describe("usar a reposição", () => {
  it("lista horários livres nas quadras do plano e reserva com travas", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {plan: {windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({weekday, startTime: "18:00", endTime: "20:00"}))}});
    const d1 = addDaysToDateKey(today(), 7);
    seedSubscription(fake, db, {dates: [d1]});
    const {creditId} = await grantManualMakeupCore(db, MANAGER, "s1", "chuva", today());
    assert.match(creditId, /^man_/);

    const date = addDaysToDateKey(today(), 3);
    fake.seedDoc(lockPath(db, date, "18:00", "19:00", "q2"), {bookingId: "outra"});
    const {options} = await getMakeupOptionsCore(db, "u2", creditId, date, today(), Date.now());
    assert.deepEqual(options.map((o) => `${o.courtId}@${o.startTime}`), [
      "q1@18:00", "q3@18:00", "q1@19:00", "q2@19:00", "q3@19:00",
    ]);

    await assert.rejects(useMakeupCore(db, "u2", {creditId, date, courtId: "q2", startTime: "18:00"}, today(), Date.now()),
      (e: unknown) => e instanceof HttpsError && e.code === "failed-precondition");
    await assert.rejects(useMakeupCore(db, "u2", {creditId, date, courtId: "q1", startTime: "19:30"}, today(), Date.now()),
      (e: unknown) => e instanceof HttpsError && e.code === "invalid-argument");

    const {bookingId} = await useMakeupCore(db, "u2", {creditId, date, courtId: "q1", startTime: "19:00"}, today(), Date.now());
    assert.equal(bookingId, `mk_${creditId}`);
    const booking = fake.store.get(`arenaBookings/${bookingId}`)!;
    assert.equal(booking["athleteId"], "u2");
    assert.equal(booking["amountReais"], 0);
    assert.equal(booking["scheduleSubscriptionId"], "s1");
    assert.equal(booking["scheduleMakeupCreditId"], creditId);
    assert.equal(fake.store.get(lockPath(db, date, "19:00", "20:00"))!["bookingId"], bookingId);
    assert.equal(fake.store.get(`arenaScheduleCredits/${creditId}`)!["status"], "used");
    assert.equal(fake.store.get("arenaScheduleSubscriptions/s1")!["makeupBalance"], 0);
    await assert.rejects(useMakeupCore(db, "u2", {creditId, date, courtId: "q3", startTime: "19:00"}, today(), Date.now()),
      (e: unknown) => e instanceof HttpsError && e.code === "failed-precondition");
  });
});

describe("reposição com reserva flutuante na quadra", () => {
  it("a opção continua na lista e, ao usar, a flutuante vai para outra quadra", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {plan: {windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({weekday, startTime: "18:00", endTime: "20:00"}))}});
    const d1 = addDaysToDateKey(today(), 7);
    seedSubscription(fake, db, {dates: [d1]});
    const {creditId} = await grantManualMakeupCore(db, MANAGER, "s1", "chuva", today());

    const date = addDaysToDateKey(today(), 3);
    fake.seedDoc("arenaBookings/flo", {
      arenaId: ARENA, courtId: "q1", courtName: "Quadra 1", date, startTime: "19:00", endTime: "20:00",
      status: "active", allocationStatus: "unassigned",
    });
    fake.seedDoc(lockPath(db, date, "19:00", "20:00"), {arenaId: ARENA, courtId: "q1", date, bookingId: "flo", floating: true});

    const {options} = await getMakeupOptionsCore(db, "u2", creditId, date, today(), Date.now());
    assert.ok(options.some((o) => o.courtId === "q1" && o.startTime === "19:00"));

    const {bookingId} = await useMakeupCore(db, "u2", {creditId, date, courtId: "q1", startTime: "19:00"}, today(), Date.now());
    assert.equal(fake.store.get(lockPath(db, date, "19:00", "20:00"))!["bookingId"], bookingId);
    assert.equal(fake.store.get("arenaBookings/flo")!["courtId"], "q2");
    assert.equal(fake.store.get(lockPath(db, date, "19:00", "20:00", "q2"))!["bookingId"], "flo");
  });
});

describe("feriado", () => {
  it("cancela a ocorrência e dá crédito `holiday` no plano `makeup`; plano `play` não muda", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const date = addDaysToDateKey(today(), 7);
    seedSubscription(fake, db, {dates: [date]});
    fake.seedDoc("arenaScheduleSubscriptions/s2", {
      ...fake.store.get("arenaScheduleSubscriptions/s1")!,
      planSnapshot: {rules: {...DEFAULT_PLAN_RULES, holiday: "play"}},
      slots: [{weekday: isoWeekdayOfDateKey(date), seriesId: "ser2"}],
    });
    fake.seedDoc(`arenaBookings/rec_ser2_${date}`, {arenaId: ARENA, date, status: "active", startTime: "08:00", endTime: "09:00", courtId: "q2"});

    await assert.rejects(applyHolidayCore(db, "u1", ARENA, date, today()),
      (e: unknown) => e instanceof HttpsError && e.code === "permission-denied");
    const out = await applyHolidayCore(db, MANAGER, ARENA, date, today());
    assert.deepEqual(out, {canceled: 1, credits: 1});
    assert.equal(fake.store.get(`arenaBookings/rec_ser1_${date}`)!["status"], "cancelled");
    assert.equal(fake.store.get(`arenaScheduleCredits/hol_s1_${date}`)!["reason"], "holiday");
    assert.equal(fake.store.get(`arenaBookings/rec_ser2_${date}`)!["status"], "active");
    assert.deepEqual(fake.store.get(`arenas/${ARENA}/scheduleSettings/rules`)!["appliedHolidays"], [date]);
    // Reaplicar não duplica crédito.
    assert.deepEqual(await applyHolidayCore(db, MANAGER, ARENA, date, today()), {canceled: 0, credits: 0});
  });
});
