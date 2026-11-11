/** Trocar a quadra de uma sessão do clubinho pela Agenda de quadras (`changeArenaBookingCourt`). */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {type ArenaClubData, clubBlockBookingId, clubSessionId, materializeClubSession} from "./arena-club";
import {
  changeArenaBookingCourtCore,
  clubCourtChangedPushBody,
  clubSessionCourtsAfterMove,
} from "./arena-booking-court-change";
import {computeSlotLockIds} from "./arena-booking-waitlist";
import {claimCourtLocks, relocateFloatingOffCourt} from "./arena-floating-booking";

const ARENA = "arena1";
const MANAGER = "mgr";
const DATE = "2030-07-26";
const NOW = Date.parse("2030-07-20T12:00:00-03:00");

const club: ArenaClubData = {
  arenaId: ARENA, arenaName: "Arena Sol", name: "Clubinho de sexta", description: null, weekday: 5,
  startTime: "15:00", endTime: "17:00", courtIds: ["courtA", "courtB"], courtNames: ["Quadra 1", "Quadra 2"],
  capacity: 24, priceReais: 15, cancelWindowHours: 24, allowOnsitePayment: true, status: "active",
  startDate: "2030-07-01", endDate: null, skippedDates: [],
};

async function setup(): Promise<{fake: FakeFirestore; db: Firestore}> {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  fake.seedDoc(`arenas/${ARENA}`, {name: "Arena Sol", managerUserId: MANAGER});
  for (const [id, name] of [["courtA", "Quadra 1"], ["courtB", "Quadra 2"], ["courtC", "Quadra 3"]]) {
    fake.seedDoc(`arenas/${ARENA}/courts/${id}`, {name, status: "active"});
  }
  await materializeClubSession(db, "c1", club, DATE, "series");
  return {fake, db};
}

const bookingId = clubBlockBookingId("c1", DATE, "courtA");
const sessionPath = `arenaClubSessions/${clubSessionId("c1", DATE)}`;

describe("clubinho: trocar quadra pela agenda", () => {
  it("move o bloqueio, as travas e a quadra da sessão", async () => {
    const {fake, db} = await setup();
    const result = await changeArenaBookingCourtCore(db, MANAGER, {bookingId, toCourtId: "courtC", reason: "rede"}, NOW);
    assert.equal(result.changed, true);
    assert.equal(result.courtName, "Quadra 3");
    assert.equal(result.fromCourtName, "Quadra 1");

    const booking = fake.store.get(`arenaBookings/${bookingId}`)!;
    assert.equal(booking["courtId"], "courtC");
    assert.equal(fake.store.get(`arenaSlots/${bookingId}`)!["courtId"], "courtC");
    const session = fake.store.get(sessionPath)!;
    assert.deepEqual(session["courtIds"], ["courtC", "courtB"]);
    assert.deepEqual(session["courtNames"], ["Quadra 3", "Quadra 2"]);

    const lockIds = (courtId: string) =>
      computeSlotLockIds({arenaId: ARENA, courtId, dateKey: DATE, startTime: "15:00", endTime: "17:00"});
    for (const id of lockIds("courtC")) {
      const lock = fake.store.get(`arenaSlotLocks/${id}`);
      assert.equal(lock?.["bookingId"], bookingId);
      assert.equal(lock?.["clubSessionId"], clubSessionId("c1", DATE));
    }
    for (const id of lockIds("courtA")) assert.equal(fake.store.get(`arenaSlotLocks/${id}`), undefined);
  });

  it("não troca para a outra quadra da própria sessão (ocupada)", async () => {
    const {db} = await setup();
    await assert.rejects(
      changeArenaBookingCourtCore(db, MANAGER, {bookingId, toCourtId: "courtB", reason: null}, NOW),
      (e: unknown) => e instanceof HttpsError && e.code === "already-exists",
    );
  });

  it("sessão cancelada não troca", async () => {
    const {fake, db} = await setup();
    fake.seedDoc(sessionPath, {...fake.store.get(sessionPath)!, status: "canceled"});
    await assert.rejects(
      changeArenaBookingCourtCore(db, MANAGER, {bookingId, toCourtId: "courtC", reason: null}, NOW),
      (e: unknown) => e instanceof HttpsError && /encerrada/.test(e.message),
    );
  });

  it("quem não é da arena não troca", async () => {
    const {db} = await setup();
    await assert.rejects(changeArenaBookingCourtCore(db, "intruso", {bookingId, toCourtId: "courtC", reason: null}, NOW));
  });

  it("quadras da sessão e texto do aviso", () => {
    assert.deepEqual(
      clubSessionCourtsAfterMove({courtIds: ["a", "b"], courtNames: ["Q1", "Q2"]}, "b", "c", "Q3"),
      {courtIds: ["a", "c"], courtNames: ["Q1", "Q3"]},
    );
    assert.equal(
      clubCourtChangedPushBody({clubName: "Clubinho de sexta", date: "2030-07-26"}, "Quadra 1", "Quadra 3"),
      "Clubinho de sexta de 26/07: Quadra 1 mudou para Quadra 3.",
    );
  });
});

describe("clubinho provisório (arena que define a quadra)", () => {
  async function capacitySetup(): Promise<{fake: FakeFirestore; db: Firestore}> {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    fake.seedDoc(`arenas/${ARENA}`, {
      name: "Arena Sol", managerUserId: MANAGER,
      bookingAllocation: {mode: "capacity", courtIds: ["courtA", "courtB", "courtC", "courtD"], priceBySport: {}},
    });
    for (const [id, name] of [["courtA", "Quadra 1"], ["courtB", "Quadra 2"], ["courtC", "Quadra 3"], ["courtD", "Quadra 4"]]) {
      fake.seedDoc(`arenas/${ARENA}/courts/${id}`, {name, status: "active"});
    }
    await materializeClubSession(db, "c1", club, DATE, "series");
    return {fake, db};
  }
  const locksOf = (courtId: string) =>
    computeSlotLockIds({arenaId: ARENA, courtId, dateKey: DATE, startTime: "15:00", endTime: "17:00"});

  it("nasce provisório: reserva `unassigned` e travas flutuantes", async () => {
    const {fake} = await capacitySetup();
    const booking = fake.store.get(`arenaBookings/${bookingId}`)!;
    assert.equal(booking["allocationStatus"], "unassigned");
    for (const id of locksOf("courtA")) assert.equal(fake.store.get(`arenaSlotLocks/${id}`)?.["floating"], true);
  });

  it("arena em que o atleta escolhe a quadra: segue fixo", async () => {
    const {fake} = await setup();
    assert.equal(fake.store.get(`arenaBookings/${bookingId}`)!["allocationStatus"], undefined);
    for (const id of locksOf("courtA")) assert.equal(fake.store.get(`arenaSlotLocks/${id}`)?.["floating"], undefined);
  });

  it("a equipe troca e ele continua provisório", async () => {
    const {fake, db} = await capacitySetup();
    const result = await changeArenaBookingCourtCore(db, MANAGER, {bookingId, toCourtId: "courtC", reason: null}, NOW);
    assert.equal(result.assigned, false);
    const booking = fake.store.get(`arenaBookings/${bookingId}`)!;
    assert.equal(booking["courtId"], "courtC");
    assert.equal(booking["allocationStatus"], "unassigned");
    for (const id of locksOf("courtC")) assert.equal(fake.store.get(`arenaSlotLocks/${id}`)?.["floating"], true);
    assert.deepEqual(fake.store.get(sessionPath)!["courtIds"], ["courtC", "courtB"]);

    // Confirmar na própria quadra não fixa o clubinho.
    const same = await changeArenaBookingCourtCore(db, MANAGER, {bookingId, toCourtId: "courtC", reason: null}, NOW);
    assert.equal(same.changed, false);
    assert.equal(fake.store.get(`arenaBookings/${bookingId}`)!["allocationStatus"], "unassigned");
  });

  it("quadra em manutenção empurra o clubinho e a sessão acompanha", async () => {
    const {fake, db} = await capacitySetup();
    fake.seedDoc(`arenas/${ARENA}/courts/courtA`, {name: "Quadra 1", status: "maintenance"});
    await relocateFloatingOffCourt(db, ARENA, "courtA", "2030-07-01", NOW);
    const booking = fake.store.get(`arenaBookings/${bookingId}`)!;
    assert.equal(booking["courtId"], "courtC");
    assert.deepEqual(fake.store.get(sessionPath)!["courtIds"], ["courtC", "courtB"]);
    assert.deepEqual(fake.store.get(sessionPath)!["courtNames"], ["Quadra 3", "Quadra 2"]);
  });

  it("duas quadras da mesma sessão empurradas na mesma transação: a sessão fica com as duas novas", async () => {
    const {fake, db} = await capacitySetup();
    await db.runTransaction(async (tx) => {
      const taken = new Set<string>();
      const refs = (courtId: string) => locksOf(courtId).map((id) => db.collection("arenaSlotLocks").doc(id));
      const a = await claimCourtLocks(tx, db, {arenaId: ARENA, courtId: "courtA", lockRefs: refs("courtA")},
        {takenLockPaths: taken, flowWritesTargetLocks: false, nowMs: NOW});
      const b = await claimCourtLocks(tx, db, {arenaId: ARENA, courtId: "courtB", lockRefs: refs("courtB")},
        {takenLockPaths: taken, flowWritesTargetLocks: false, nowMs: NOW});
      assert.ok(a.ok && b.ok);
      if (a.ok) a.commit(tx);
      if (b.ok) b.commit(tx);
    });
    const courts = (fake.store.get(sessionPath)!["courtIds"] as string[]).slice().sort();
    assert.deepEqual(courts, ["courtC", "courtD"]);
  });
});
