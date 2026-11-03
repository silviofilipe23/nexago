import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {Timestamp} from "firebase-admin/firestore";
import {
  acceptWaitlistOfferCore,
  addWaitlistCore,
  expireWaitlistOffersCore,
  offerNextForPlan,
  queuePosition,
  removeWaitlistCore,
} from "./arena-schedule-waitlist";
import {createSubscriptionCore, endSubscriptionCore} from "./arena-schedule-subscriptions";
import {getMySubscriptionsCore} from "./arena-schedule-athlete";
import {ARENA, MANAGER, holder, makeDb, pushes, seedArena, today, weekdayIn} from "./arena-schedule.test-helper";

const HOUR = 3_600_000;

describe("queuePosition", () => {
  it("conta só as entradas abertas, pela ordem de chegada", () => {
    const e = (id: string, ms: number, status = "waiting") => ({id, data: {status, createdAt: Timestamp.fromMillis(ms)}});
    const queue = [e("b", 2), e("a", 1), e("c", 3, "removed"), e("d", 4, "offered")];
    assert.equal(queuePosition(queue, "a"), 1);
    assert.equal(queuePosition(queue, "d"), 3);
    assert.equal(queuePosition(queue, "x"), 4);
  });
});

describe("lista de espera", () => {
  it("oferta ao 1º → expira → próximo; aceitar assina pela fila; encerrar oferece de novo", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {plan: {capacity: 1}});
    const weekday = weekdayIn(2);
    const now = Date.now();

    // Plano lotado: u1 assina, u2/u3/u4 entram na fila.
    const first = await createSubscriptionCore(db, {
      arenaId: ARENA, planId: "p1", holder: holder("u1"), memberAthleteIds: [], weekdays: [weekday], startTime: "19:00",
      preferredCourtId: null, strictCourt: false, cycle: "monthly", paymentMethod: "onsite", startDate: today(),
      source: "athlete", createdByUid: "u1", audience: "athlete",
    }, today(), now);
    const e2 = await addWaitlistCore(db, "u2", {arenaId: ARENA, planId: "p1", weekdays: [weekday], startTime: "19:00"}, now);
    const e3 = await addWaitlistCore(db, "u3", {arenaId: ARENA, planId: "p1", weekdays: [weekday], startTime: "19:00"}, now + 1);
    const e4 = await addWaitlistCore(db, "u4", {arenaId: ARENA, planId: "p1", weekdays: [weekday], startTime: "20:00"}, now + 2);
    assert.deepEqual([e2.position, e3.position, e4.position], [1, 2, 3]);
    await assert.rejects(addWaitlistCore(db, "u2", {arenaId: ARENA, planId: "p1", weekdays: [weekday], startTime: "19:00"}, now),
      (e: unknown) => e instanceof HttpsError && e.code === "already-exists");
    assert.equal(fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!["waitingCount"], 3);

    // Sem vaga, nada é oferecido.
    assert.equal(await offerNextForPlan(db, ARENA, "p1", now), null);

    // Gestor encerra u1 hoje → vaga livre vai para u2 automaticamente.
    pushes.length = 0;
    await endSubscriptionCore(db, MANAGER, first.subscriptionId, today(), null, today(), now);
    const offered = fake.store.get(`arenaScheduleWaitlist/${e2.entryId}`)!;
    assert.equal(offered["status"], "offered");
    assert.equal((offered["offer"] as {courtId: string}).courtId, "q1");
    assert.ok(pushes.some((p) => p.userId === "u2" && p.type === "schedule_plan_waitlist_offer"));

    // A oferta segura a vaga: ninguém mais recebe e ninguém assina por fora.
    assert.equal(await offerNextForPlan(db, ARENA, "p1", now), null);
    await assert.rejects(createSubscriptionCore(db, {
      arenaId: ARENA, planId: "p1", holder: holder("u4"), memberAthleteIds: [], weekdays: [weekday], startTime: "08:00",
      preferredCourtId: null, strictCourt: false, cycle: "monthly", paymentMethod: "onsite", startDate: today(),
      source: "athlete", createdByUid: "u4", audience: "athlete",
    }, today(), now), (e: unknown) => e instanceof HttpsError && e.code === "resource-exhausted");

    // "Meu plano" do u2 mostra a oferta.
    const mine = await getMySubscriptionsCore(db, "u2", today(), now);
    assert.deepEqual(mine.offers.map((o) => o.entryId), [e2.entryId]);

    // Venceu (24h) → expira e passa para u3.
    const sweep = await expireWaitlistOffersCore(db, now + 25 * HOUR);
    assert.deepEqual(sweep, {expired: 1, reoffered: 1});
    assert.equal(fake.store.get(`arenaScheduleWaitlist/${e2.entryId}`)!["status"], "expired");
    assert.equal(fake.store.get(`arenaScheduleWaitlist/${e3.entryId}`)!["status"], "offered");
    await assert.rejects(acceptWaitlistOfferCore(db, "u2", {entryId: e2.entryId, cycle: "monthly", paymentMethod: "onsite"}, today(), now + 25 * HOUR),
      (e: unknown) => e instanceof HttpsError);
    await assert.rejects(acceptWaitlistOfferCore(db, "u4", {entryId: e3.entryId, cycle: "monthly", paymentMethod: "onsite"}, today(), now + 25 * HOUR),
      (e: unknown) => e instanceof HttpsError && e.code === "permission-denied");

    // u3 aceita: assina com source waitlist na quadra ofertada.
    const accepted = await acceptWaitlistOfferCore(db, "u3", {entryId: e3.entryId, cycle: "monthly", paymentMethod: "pix_auto"}, today(), now + 25 * HOUR);
    assert.equal(accepted.courtName, "Quadra 1");
    const sub = fake.store.get(`arenaScheduleSubscriptions/${accepted.subscriptionId}`)!;
    assert.equal(sub["source"], "waitlist");
    assert.equal(fake.store.get(`arenaScheduleWaitlist/${e3.entryId}`)!["status"], "accepted");
    const plan = fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!;
    assert.equal(plan["occupiedCount"], 1);
    assert.equal(plan["waitingCount"], 1);

    // "Meu plano" do u3: a assinatura com as próximas ocorrências e a mensalidade dele.
    const u3 = await getMySubscriptionsCore(db, "u3", today(), now);
    assert.equal(u3.subscriptions.length, 1);
    const view = u3.subscriptions[0]!;
    assert.ok(view.occurrences.length > 0);
    assert.ok(view.occurrences.every((o) => o.status === "next" || o.status === "today"));
    assert.equal(view.charges.length, 1);
    assert.equal((view.charges[0] as Record<string, unknown>)["kind"], "first");

    // u4 sai da fila.
    await removeWaitlistCore(db, "u4", e4.entryId, now);
    assert.equal(fake.store.get(`arenaScheduleWaitlist/${e4.entryId}`)!["status"], "removed");
    assert.equal(fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!["waitingCount"], 0);
  });

  it("gestor adiciona pelo nome; atleta só sai da própria entrada", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const weekday = weekdayIn(2);
    const {entryId} = await addWaitlistCore(db, MANAGER, {
      arenaId: ARENA, planId: "p1", weekdays: [weekday], startTime: "19:00", name: "Carla", phone: "62 9999-0000", playersCount: 2,
    }, Date.now());
    const entry = fake.store.get(`arenaScheduleWaitlist/${entryId}`)!;
    assert.equal(entry["athleteId"], null);
    assert.equal(entry["name"], "Carla");
    assert.equal(entry["playersCount"], 2);
    await assert.rejects(removeWaitlistCore(db, "u1", entryId, Date.now()),
      (e: unknown) => e instanceof HttpsError && e.code === "permission-denied");
    await removeWaitlistCore(db, MANAGER, entryId, Date.now());
    assert.equal(fake.store.get(`arenaScheduleWaitlist/${entryId}`)!["status"], "removed");
  });
});
