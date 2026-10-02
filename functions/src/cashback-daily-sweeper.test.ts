import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {DEFAULT_CASHBACK_CONFIG} from "./cashback-config";
import {runCashbackDailySweep} from "./cashback-daily-sweeper";

const NOW = Date.UTC(2026, 9, 10, 13, 0, 0); // 10/10/2026 10h em São Paulo
const DAY = 24 * 60 * 60 * 1000;
const UID = "ath1";
const W = `athleteWallets/${UID}`;
const INSCRIPTIONS = "artifacts/p/public/data/inscriptions";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function pendingLot(fake: FakeFirestore, lotId: string, overrides: DocData): void {
  fake.seedDoc(`${W}/lots/${lotId}`, {
    uid: UID, sourceType: "booking", sourceId: "b1", tournamentId: null, arenaId: "a1",
    label: "Reserva", earnedCents: 240, remainingCents: 0, status: "pending",
    eventAt: Timestamp.fromMillis(NOW - DAY), releasedAt: null, expiresAt: null,
    expiryWarnedAt: null, createdAt: Timestamp.fromMillis(NOW - 3 * DAY),
    ...overrides,
  });
}

function availableLot(fake: FakeFirestore, lotId: string, overrides: DocData): void {
  fake.seedDoc(`${W}/lots/${lotId}`, {
    uid: UID, sourceType: "booking", sourceId: "b1", tournamentId: null, arenaId: "a1",
    label: "Reserva", earnedCents: 500, remainingCents: 500, status: "available",
    eventAt: Timestamp.fromMillis(NOW - 100 * DAY), releasedAt: Timestamp.fromMillis(NOW - 99 * DAY),
    expiresAt: Timestamp.fromMillis(NOW + 90 * DAY), expiryWarnedAt: null,
    createdAt: Timestamp.fromMillis(NOW - 100 * DAY),
    ...overrides,
  });
}

function notifySpy() {
  const sent: Array<{userId: string; type: string; body: string; data: Record<string, string>}> = [];
  return {
    sent,
    notify: async (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => {
      sent.push({userId: input.userId, type: input.type, body: input.body, data: input.data});
    },
  };
}

describe("runCashbackDailySweep — liberação", () => {
  it("reserva que aconteceu libera e avisa uma vez por atleta", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaBookings/b1", {status: "confirmed", date: "2026-10-08", startTime: "19:00"});
    fake.seedDoc("arenaBookings/b2", {status: "confirmed", date: "2026-10-09", startTime: "08:00"});
    pendingLot(fake, "p1", {sourceId: "b1"});
    pendingLot(fake, "p2", {sourceId: "b2", earnedCents: 60});
    const spy = notifySpy();

    const stats = await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, spy.notify);

    assert.equal(fake.store.get(`${W}/lots/p1`)!.status, "available");
    assert.equal(fake.store.get(`${W}/lots/p2`)!.status, "available");
    assert.equal(stats.released, 2);
    assert.equal(spy.sent.length, 1);
    assert.equal(spy.sent[0].type, "cashback_released");
    assert.match(spy.sent[0].body, /R\$ 3,00/);
    assert.deepEqual(spy.sent[0].data, {url: "/cashback", webUrl: "/cashback"});
  });

  it("reserva cancelada cancela o lote; reserva remarcada para o futuro só move a data", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaBookings/b1", {status: "cancelled", date: "2026-10-08", startTime: "19:00"});
    fake.seedDoc("arenaBookings/b2", {status: "confirmed", date: "2026-10-20", startTime: "19:00"});
    pendingLot(fake, "p1", {sourceId: "b1"});
    pendingLot(fake, "p2", {sourceId: "b2"});

    const stats = await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, notifySpy().notify);

    assert.equal(fake.store.get(`${W}/lots/p1`)!.status, "cancelled");
    const moved = fake.store.get(`${W}/lots/p2`)!;
    assert.equal(moved.status, "pending");
    assert.equal((moved.eventAt as Timestamp).toMillis(), Date.UTC(2026, 9, 20, 22, 0, 0));
    assert.equal(stats.cancelled, 1);
    assert.equal(stats.rescheduled, 1);
  });

  it("inscrição: pedido de cancelamento pendente espera; torneio cancelado cancela; inscrição apagada cancela", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("tournaments/t1", {startAt: Timestamp.fromMillis(NOW - DAY)});
    fake.seedDoc("tournaments/t2", {startAt: Timestamp.fromMillis(NOW - DAY), listingStatus: "cancelled"});
    fake.seedDoc(`${INSCRIPTIONS}/r1`, {tournamentId: "t1", cancellationRequest: {status: "pending"}});
    fake.seedDoc(`${INSCRIPTIONS}/r2`, {tournamentId: "t2"});
    pendingLot(fake, "p1", {sourceType: "registration", sourceId: "r1", tournamentId: "t1"});
    pendingLot(fake, "p2", {sourceType: "registration", sourceId: "r2", tournamentId: "t2"});
    pendingLot(fake, "p3", {sourceType: "registration", sourceId: "rApagada", tournamentId: "t1"});

    const stats = await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, notifySpy().notify);

    assert.equal(fake.store.get(`${W}/lots/p1`)!.status, "pending");
    assert.equal(fake.store.get(`${W}/lots/p2`)!.status, "cancelled");
    assert.equal(fake.store.get(`${W}/lots/p3`)!.status, "cancelled");
    assert.equal(stats.waiting, 1);
  });

  it("torneio adiado espera pela data nova", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("tournaments/t1", {startAt: Timestamp.fromMillis(NOW + 7 * DAY)});
    fake.seedDoc(`${INSCRIPTIONS}/r1`, {tournamentId: "t1"});
    pendingLot(fake, "p1", {sourceType: "registration", sourceId: "r1", tournamentId: "t1"});

    await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, notifySpy().notify);

    const lot = fake.store.get(`${W}/lots/p1`)!;
    assert.equal(lot.status, "pending");
    assert.equal((lot.eventAt as Timestamp).toMillis(), NOW + 7 * DAY);
  });

  it("clubinho: quem saiu com estorno tem o lote cancelado", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaClubSessions/s1", {status: "completed", startAt: Timestamp.fromMillis(NOW - DAY)});
    fake.seedDoc(`arenaClubSessions/s1/clubParticipants/${UID}`, {status: "canceled_refunded"});
    pendingLot(fake, "p1", {sourceType: "club", sourceId: "s1"});

    await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, notifySpy().notify);

    assert.equal(fake.store.get(`${W}/lots/p1`)!.status, "cancelled");
  });
});

describe("runCashbackDailySweep — vencimento e aviso", () => {
  it("vence o lote vencido", async () => {
    const {fake, db} = makeDb();
    availableLot(fake, "v1", {expiresAt: Timestamp.fromMillis(NOW - 1000), remainingCents: 320});

    const stats = await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, notifySpy().notify);

    assert.equal(fake.store.get(`${W}/lots/v1`)!.status, "expired");
    assert.equal(stats.expired, 1);
  });

  it("avisa uma vez sobre o que vence nos próximos 15 dias", async () => {
    const {fake, db} = makeDb();
    availableLot(fake, "soon", {expiresAt: Timestamp.fromMillis(NOW + 10 * DAY), remainingCents: 320});
    availableLot(fake, "later", {expiresAt: Timestamp.fromMillis(NOW + 40 * DAY)});
    const spy = notifySpy();

    await runCashbackDailySweep(db, "p", NOW, DEFAULT_CASHBACK_CONFIG, spy.notify);
    await runCashbackDailySweep(db, "p", NOW + 60_000, DEFAULT_CASHBACK_CONFIG, spy.notify);

    assert.equal(spy.sent.length, 1);
    assert.equal(spy.sent[0].type, "cashback_expiring");
    assert.match(spy.sent[0].body, /R\$ 3,20/);
    assert.match(spy.sent[0].body, /20\/10/);
    assert.ok(fake.store.get(`${W}/lots/soon`)!.expiryWarnedAt);
    assert.equal(fake.store.get(`${W}/lots/later`)!.expiryWarnedAt, null);
  });
});
