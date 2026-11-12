import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {addDaysToDateKey, assertNotSchedulePlanSeries, parseRecurringSeriesData} from "./arena-recurring-booking";
import {
  ATHLETE_EXIT_REASON,
  athleteExitDate,
  buildPayerCharges,
  cancelMySubscriptionCore,
  createSubscriptionCore,
  endSubscriptionCore,
  fullyPausedMonths,
  pauseSubscriptionCore,
  planFirstCharge,
  resumeSubscriptionCore,
  type CreateSubscriptionRequest,
} from "./arena-schedule-subscriptions";
import {getPlanAvailabilityCore} from "./arena-schedule-plans";
import {nextMonthKey} from "./arena-class-billing";
import {monthKeyOf} from "./arena-class-ledger";
import {ARENA, MANAGER, docsIn, holder, makeDb, planData, seedArena, today, weekdayIn} from "./arena-schedule.test-helper";

async function rejects(p: Promise<unknown>, codeExpected: string, message?: RegExp): Promise<void> {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof HttpsError, String(e));
    assert.equal(e.code, codeExpected);
    if (message) assert.match(e.message, message);
    return true;
  });
}

function request(overrides: Partial<CreateSubscriptionRequest> = {}): CreateSubscriptionRequest {
  return {
    arenaId: ARENA,
    planId: "p1",
    holder: holder("u1"),
    memberAthleteIds: [],
    weekdays: [weekdayIn(2)],
    startTime: "19:00",
    preferredCourtId: null,
    strictCourt: false,
    cycle: "monthly",
    paymentMethod: "onsite",
    startDate: today(),
    source: "athlete",
    createdByUid: "u1",
    audience: "athlete",
    ...overrides,
  };
}

describe("1ª mensalidade proporcional e rateio", () => {
  it("proporcional às ocorrências que sobram no mês, vence no 1º jogo", () => {
    // Novembro/2026: segundas 2, 9, 16, 23, 30. Assinando terça 03 → sobram 4 de 5.
    assert.deepEqual(planFirstCharge(300, [1], "2026-11-03", 5), {
      period: "2026-11", totalReais: 240, dueDate: "2026-11-09", billedThrough: "2026-11", months: 1,
    });
  });

  it("sem ocorrência no mês, a 1ª é o mês seguinte cheio no vencimento", () => {
    // 30/11 é segunda; nenhuma terça sobra em novembro.
    assert.deepEqual(planFirstCharge(300, [2], "2026-11-30", 5), {
      period: "2026-12", totalReais: 300, dueDate: "2026-12-05", billedThrough: "2026-12", months: 1,
    });
  });

  it("uma mensalidade por pagador, resto no titular, visível ao pagador e ao titular", () => {
    const members = [
      {athleteId: "h", name: "H", photoUrl: null, shareReais: 33.34, role: "holder" as const},
      {athleteId: "m1", name: "M1", photoUrl: null, shareReais: 33.33, role: "member" as const},
      {athleteId: null, name: "Sem conta", photoUrl: null, shareReais: 33.33, role: "member" as const},
    ];
    const charges = buildPayerCharges(
      {id: "s1", arenaId: ARENA, planName: "P", holderName: "H", holderAthleteId: "h", members}, "2026-12", "monthly", 100, "2026-12-05",
    );
    assert.deepEqual(charges.map((c) => c.id), ["s1_2026-12_0", "s1_2026-12_1", "s1_2026-12_2"]);
    assert.deepEqual(charges.map((c) => c.data["amountReais"]), [33.34, 33.33, 33.33]);
    assert.deepEqual(charges[1]!.data["visibleTo"], ["m1", "h"]);
    assert.deepEqual(charges[2]!.data["visibleTo"], ["h"]);
  });
});

describe("createSubscriptionCore", () => {
  it("vencimento escolhido pelo assinante entre as opções do plano (5, 15, 25)", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    fake.seedDoc(`arenas/${ARENA}/schedulePlans/p1`, planData({
      billing: {methods: ["pix_auto", "card", "onsite"], dueDay: 5, dueDayOptions: [5, 15, 25], overdueReleaseDays: 3},
    }));
    const result = await createSubscriptionCore(db, request({dueDay: 15}), today(), Date.now());
    const sub = fake.store.get(`arenaScheduleSubscriptions/${result.subscriptionId}`)!;
    assert.equal(sub["dueDay"], 15);
    assert.equal((sub["planSnapshot"] as {dueDay: number}).dueDay, 15);
    await rejects(createSubscriptionCore(db, request({holder: holder("u2"), dueDay: 10}), today(), Date.now()),
      "invalid-argument", /dia 5, 15, 25/);
    // Sem escolher: o padrão do plano (a 1ª opção).
    const plain = await createSubscriptionCore(db, request({holder: holder("u3")}), today(), Date.now());
    assert.equal(fake.store.get(`arenaScheduleSubscriptions/${plain.subscriptionId}`)!["dueDay"], 5);
  });

  it("escolhe a 1ª quadra livre (série e turma sobrepostas), cria séries, mensalidade e ocupa a vaga", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const weekday = weekdayIn(2);
    fake.seedDoc("arenaRecurringBookings/old1", {
      arenaId: ARENA, status: "active", weekday, startTime: "18:30", endTime: "19:30", courtId: "q1", endDate: null,
    });
    // Série já encerrada na q3 não ocupa.
    fake.seedDoc("arenaRecurringBookings/old2", {
      arenaId: ARENA, status: "active", weekday, startTime: "19:00", endTime: "20:00", courtId: "q3", endDate: "2020-01-01",
    });
    fake.seedDoc("arenaClasses/c1", {
      arenaId: ARENA, status: "active", weekdays: [weekday], startTime: "19:30", endTime: "20:30", courtId: "q2", endDate: null,
    });

    const result = await createSubscriptionCore(db, request({memberAthleteIds: ["u2"]}), today(), Date.now());
    assert.equal(result.courtName, "Quadra 3");

    const sub = fake.store.get(`arenaScheduleSubscriptions/${result.subscriptionId}`)!;
    assert.equal(sub["status"], "active");
    assert.deepEqual(sub["memberAthleteIds"], ["u1", "u2"]);
    assert.deepEqual((sub["members"] as Array<{shareReais: number}>).map((m) => m.shareReais), [150, 150]);
    const slots = sub["slots"] as Array<{courtId: string; seriesId: string}>;
    assert.equal(slots.length, 1);
    assert.equal(slots[0]!.courtId, "q3");

    const series = fake.store.get(`arenaRecurringBookings/${slots[0]!.seriesId}`)!;
    assert.equal(series["scheduleSubscriptionId"], result.subscriptionId);
    assert.equal(series["schedulePlanId"], "p1");
    assert.equal(parseRecurringSeriesData(series).scheduleSubscriptionId, result.subscriptionId);
    assert.throws(() => assertNotSchedulePlanSeries(series), /Planos de horário/);

    // Ocorrência materializada já paga pelo plano.
    const occurrence = docsIn(fake, `arenaBookings/rec_${slots[0]!.seriesId}_`)[0]?.[1];
    assert.ok(occurrence, "ocorrência materializada");
    assert.equal(occurrence["coveredByPlan"], true);
    assert.equal(occurrence["scheduleSubscriptionId"], result.subscriptionId);
    assert.equal(occurrence["amountDueOnsiteReais"], 0);
    assert.equal(occurrence["paymentChannel"], "onsite");
    assert.equal(occurrence["paymentStatus"], "none");

    const charges = docsIn(fake, `arenaScheduleCharges/${result.subscriptionId}_`);
    assert.equal(charges.length, 2);
    assert.equal(fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!["occupiedCount"], 1);
  });

  it("recusa plano lotado, duplicado e arena sem Pro", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {plan: {capacity: 1}});
    await createSubscriptionCore(db, request(), today(), Date.now());
    await rejects(createSubscriptionCore(db, request({holder: holder("u2")}), today(), Date.now()), "resource-exhausted", /lotado/);

    const other = makeDb();
    seedArena(other.fake);
    await createSubscriptionCore(other.db, request(), today(), Date.now());
    await rejects(createSubscriptionCore(other.db, request({startTime: "08:00"}), today(), Date.now()), "already-exists");

    const noPro = makeDb();
    seedArena(noPro.fake);
    noPro.fake.seedDoc(`arenas/${ARENA}`, {name: "Arena", managerUserId: MANAGER});
    await rejects(createSubscriptionCore(noPro.db, request(), today(), Date.now()), "permission-denied");
  });

  it("limite do horário nobre: horas-quadra de plano no nobre ÷ capacidade do nobre", async () => {
    const {fake, db} = makeDb();
    const weekday = weekdayIn(2);
    seedArena(fake, {courts: ["q1", "q2"], plan: {courtIds: ["q1", "q2"], courtNames: ["Quadra 1", "Quadra 2"]}});
    // Nobre: só o dia escolhido, 18–20 (2 quadras × 120 min = 240); limite 50% = 120 min.
    fake.seedDoc(`arenas/${ARENA}/scheduleSettings/rules`, {
      primeWindows: [{weekday, startTime: "18:00", endTime: "20:00"}], primeCapPercent: 50,
    });
    await createSubscriptionCore(db, request({holder: holder("u1"), startTime: "18:00"}), today(), Date.now());
    await createSubscriptionCore(db, request({holder: holder("u2"), startTime: "18:00"}), today(), Date.now());
    await rejects(
      createSubscriptionCore(db, request({holder: holder("u3"), startTime: "19:00"}), today(), Date.now()),
      "resource-exhausted", /nobre/,
    );
    // Fora do nobre passa.
    await createSubscriptionCore(db, request({holder: holder("u3"), startTime: "20:00"}), today(), Date.now());
  });

  it("disponibilidade conta quadras livres, fila e nobre", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const weekday = weekdayIn(2);
    fake.seedDoc("arenaRecurringBookings/old1", {
      arenaId: ARENA, status: "paused", weekday, startTime: "19:00", endTime: "20:00", courtId: "q1", endDate: null,
    });
    fake.seedDoc("arenaScheduleWaitlist/w1", {
      arenaId: ARENA, planId: "p1", status: "waiting", weekdays: [weekday], startTime: "19:00",
    });
    const out = await getPlanAvailabilityCore(db, "u1", ARENA, "p1", today(), Date.now());
    const day = out.days.find((d) => d.weekday === weekday)!;
    const at19 = day.times.find((t) => t.startTime === "19:00")!;
    assert.equal(at19.freeCourts, 2);
    assert.equal(at19.waitlistCount, 1);
    assert.equal(at19.prime, weekday <= 5);
    assert.equal(day.times.find((t) => t.startTime === "07:00")!.freeCourts, 3);
    assert.equal(out.seatsLeft, 10);
  });
});

describe("pausa", () => {
  it("meses inteiros dentro da pausa não faturam", () => {
    assert.deepEqual(fullyPausedMonths("2026-11-20", "2027-01-10"), ["2026-12"]);
    assert.deepEqual(fullyPausedMonths("2026-12-01", "2027-01-01"), ["2026-12"]);
    assert.deepEqual(fullyPausedMonths("2026-11-03", "2026-11-20"), []);
  });

  it("respeita o limite de dias no ano, libera a agenda e devolve dias na volta antecipada", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {subscriptionId} = await createSubscriptionCore(db, request(), today(), Date.now());
    const subPath = `arenaScheduleSubscriptions/${subscriptionId}`;
    fake.seedDoc(subPath, {...fake.store.get(subPath)!, pauseDaysUsed: {year: today().slice(0, 4), days: 20}});

    await rejects(pauseSubscriptionCore(db, "u1", subscriptionId, addDaysToDateKey(today(), 15), today()), "failed-precondition", /mais 10 dia/);
    await rejects(pauseSubscriptionCore(db, "u9", subscriptionId, addDaysToDateKey(today(), 5), today()), "permission-denied");

    const paused = await pauseSubscriptionCore(db, "u1", subscriptionId, addDaysToDateKey(today(), 10), today());
    assert.equal(paused.daysLeft, 0);
    const sub = fake.store.get(subPath)!;
    assert.equal(sub["status"], "paused");
    const seriesId = (sub["slots"] as Array<{seriesId: string}>)[0]!.seriesId;
    assert.equal(fake.store.get(`arenaRecurringBookings/${seriesId}`)!["status"], "paused");
    const live = docsIn(fake, `arenaBookings/rec_${seriesId}_`).filter(([, b]) => b["status"] === "active");
    assert.equal(live.length, 0);

    await resumeSubscriptionCore(db, "u1", subscriptionId, today());
    const resumed = fake.store.get(subPath)!;
    assert.equal(resumed["status"], "active");
    assert.deepEqual(resumed["pauseDaysUsed"], {year: today().slice(0, 4), days: 20});
    assert.equal(fake.store.get(`arenaRecurringBookings/${seriesId}`)!["status"], "active");
    const back = docsIn(fake, `arenaBookings/rec_${seriesId}_`).filter(([, b]) => b["status"] === "active");
    assert.ok(back.length > 0, "rematerializou");
  });
});

describe("encerrar", () => {
  it("hoje: libera séries, devolve a vaga e cancela mensalidade de mês futuro", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {subscriptionId} = await createSubscriptionCore(db, request(), today(), Date.now());
    fake.seedDoc(`arenaScheduleCharges/${subscriptionId}_2099-01_0`, {
      subscriptionId, arenaId: ARENA, period: "2099-01", status: "open", dueDate: "2099-01-05",
    });
    await rejects(endSubscriptionCore(db, "u1", subscriptionId, today(), null, today(), Date.now()), "permission-denied");
    const out = await endSubscriptionCore(db, MANAGER, subscriptionId, today(), "mudou de cidade", today(), Date.now());
    assert.equal(out.status, "canceled");
    const sub = fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!;
    assert.equal(sub["status"], "canceled");
    assert.equal(sub["cancelReason"], "mudou de cidade");
    assert.equal(fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!["occupiedCount"], 0);
    assert.equal(fake.store.get(`arenaScheduleCharges/${subscriptionId}_2099-01_0`)!["status"], "canceled");
    const seriesId = (sub["slots"] as Array<{seriesId: string}>)[0]!.seriesId;
    assert.equal(fake.store.get(`arenaRecurringBookings/${seriesId}`)!["status"], "canceled");
  });

  it("data futura: marca a saída e corta a série na véspera", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {subscriptionId} = await createSubscriptionCore(db, request(), today(), Date.now());
    const endsOn = addDaysToDateKey(today(), 8);
    const out = await endSubscriptionCore(db, MANAGER, subscriptionId, endsOn, null, today(), Date.now());
    assert.deepEqual(out, {status: "active", endsOn});
    const sub = fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!;
    const seriesId = (sub["slots"] as Array<{seriesId: string}>)[0]!.seriesId;
    assert.equal(fake.store.get(`arenaRecurringBookings/${seriesId}`)!["endDate"], addDaysToDateKey(endsOn, -1));
    const after = docsIn(fake, `arenaBookings/rec_${seriesId}_`)
      .filter(([, b]) => String(b["date"]) >= endsOn && b["status"] === "active");
    assert.equal(after.length, 0);
    assert.equal(fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!["occupiedCount"], 1);
  });
});

describe("cancelar pelo titular", () => {
  it("sai no fim do mês corrente, do último mês pago ou da fidelidade — o que vier depois", () => {
    assert.equal(athleteExitDate("2026-11-03", [], null), "2026-12-01");
    assert.equal(athleteExitDate("2026-11-30", ["2026-11"], null), "2026-12-01");
    assert.equal(athleteExitDate("2026-11-25", ["2026-11", "2026-12"], null), "2027-01-01");
    assert.equal(athleteExitDate("2026-11-03", [], "2027-02-15"), "2027-03-01");
    assert.equal(athleteExitDate("2026-11-03", [], "2027-02-01"), "2027-02-01");
    assert.equal(athleteExitDate("2026-11-03", [], "2026-10-15"), "2026-12-01", "fidelidade vencida não conta");
  });

  it("só o titular; marca a saída no 1º dia do mês seguinte e cancela a mensalidade aberta depois dela", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {subscriptionId} = await createSubscriptionCore(db, request({memberAthleteIds: ["u2"]}), today(), Date.now());
    const next = nextMonthKey(monthKeyOf(today()));
    const nextCharge = `arenaScheduleCharges/${subscriptionId}_${next}_9`;
    fake.seedDoc(nextCharge, {subscriptionId, arenaId: ARENA, period: next, status: "open", dueDate: `${next}-05`});

    await rejects(cancelMySubscriptionCore(db, "u2", subscriptionId, today()), "permission-denied", /titular/);
    await rejects(cancelMySubscriptionCore(db, MANAGER, subscriptionId, today()), "permission-denied", /não participa/);

    const out = await cancelMySubscriptionCore(db, "u1", subscriptionId, today());
    const endsOn = `${next}-01`;
    assert.deepEqual(out, {endsOn});
    const sub = fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!;
    assert.equal(sub["status"], "active", "segue jogando até a saída");
    assert.equal(sub["endsOn"], endsOn);
    assert.equal(sub["cancelReason"], ATHLETE_EXIT_REASON);
    assert.equal(sub["endRequestedBy"], "athlete");
    assert.equal(fake.store.get(nextCharge)!["status"], "canceled");
    const seriesId = (sub["slots"] as Array<{seriesId: string}>)[0]!.seriesId;
    assert.equal(fake.store.get(`arenaRecurringBookings/${seriesId}`)!["endDate"], addDaysToDateKey(endsOn, -1));
    const after = docsIn(fake, `arenaBookings/rec_${seriesId}_`)
      .filter(([, b]) => String(b["date"]) >= endsOn && b["status"] === "active");
    assert.equal(after.length, 0);
    assert.equal(fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!["occupiedCount"], 1, "vaga só volta no encerramento");

    await rejects(cancelMySubscriptionCore(db, "u1", subscriptionId, today()), "failed-precondition", /já termina/);
  });

  it("mês seguinte já pago: vai até o fim dele, sem estorno", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {subscriptionId} = await createSubscriptionCore(db, request(), today(), Date.now());
    const next = nextMonthKey(monthKeyOf(today()));
    const paid = `arenaScheduleCharges/${subscriptionId}_${next}_0`;
    fake.seedDoc(paid, {subscriptionId, arenaId: ARENA, period: next, status: "paid", dueDate: `${next}-05`});
    const out = await cancelMySubscriptionCore(db, "u1", subscriptionId, today());
    assert.equal(out.endsOn, `${nextMonthKey(next)}-01`);
    assert.equal(fake.store.get(paid)!["status"], "paid");
  });
});
