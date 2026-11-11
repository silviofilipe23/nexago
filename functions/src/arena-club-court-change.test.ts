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
