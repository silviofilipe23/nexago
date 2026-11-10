/**
 * Fiação do `claimCourtLocks` nos fluxos que ocupam quadra específica: cada fluxo, com uma
 * reserva flutuante na quadra que ele quer, ocupa a quadra e a flutuante vai para outra livre.
 * (O comportamento do helper em si está em `arena-floating-booking.test.ts`; reposição de plano
 * em `arena-schedule-makeup.test.ts`.)
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {computeSlotLockIds} from "./arena-booking-waitlist";
import {materializeClassSession, type ArenaClassData} from "./arena-class";
import {classSessionId} from "./arena-class-constants";
import {materializeClubSession, type ArenaClubData} from "./arena-club";
import {reacquireArenaBookingSlotHold} from "./arena-booking-slot-release";
import {materializeSeriesOccurrences, occurrenceBookingId, type RecurringSeriesData} from "./arena-recurring-booking";

const ARENA = "arena1";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function lockId(courtId: string, date: string, hour: string): string {
  return `${ARENA}_${courtId}_${date}_h${hour}`;
}

function seedCourts(fake: FakeFirestore, ids: string[]): void {
  fake.seedDoc(`arenas/${ARENA}`, {name: "Arena X", managerUserId: "mgr"});
  ids.forEach((id, i) => fake.seedDoc(`arenas/${ARENA}/courts/${id}`, {name: `Quadra ${i + 1}`, types: ["beachTennis"]}));
}

function seedFloating(
  fake: FakeFirestore,
  id: string,
  opts: {courtId: string; date: string; startTime: string; endTime: string},
): void {
  fake.seedDoc(`arenaBookings/${id}`, {
    arenaId: ARENA,
    courtId: opts.courtId,
    courtName: "Provisória",
    sport: "beachTennis",
    date: opts.date,
    startTime: opts.startTime,
    endTime: opts.endTime,
    status: "active",
    allocationStatus: "unassigned",
  });
  fake.seedDoc(`arenaSlots/slot_${id}`, {
    arenaId: ARENA, courtId: opts.courtId, date: opts.date,
    startTime: opts.startTime, endTime: opts.endTime, status: "booked", bookingId: id,
  });
  for (const lock of computeSlotLockIds({arenaId: ARENA, courtId: opts.courtId, dateKey: opts.date, startTime: opts.startTime, endTime: opts.endTime})) {
    fake.seedDoc(`arenaSlotLocks/${lock}`, {arenaId: ARENA, courtId: opts.courtId, date: opts.date, bookingId: id, floating: true});
  }
}

describe("aula ocupa quadra com reserva flutuante", () => {
  const MONDAY = "2026-10-26";
  const cls: ArenaClassData = {
    arenaId: ARENA, arenaName: "Arena X", name: "Iniciante A", type: "turma", sport: "beachTennis",
    level: "iniciante", teacherId: "t1", teacherUserId: "uT", teacherName: "Thiago", teacherColor: "#FF6A1A",
    weekdays: [1], startTime: "18:00", endTime: "19:30", courtId: "q2", courtName: "Quadra 2", capacity: 6,
    startDate: "2026-10-19", endDate: null, status: "active",
  } as ArenaClassData;

  it("a aula é criada e a flutuante vai para outra quadra", async () => {
    const fake = new FakeFirestore();
    seedCourts(fake, ["q1", "q2"]);
    seedFloating(fake, "flo", {courtId: "q2", date: MONDAY, startTime: "19:00", endTime: "20:00"});

    assert.equal(await materializeClassSession(db(fake), "c1", cls, MONDAY, "series"), "created");
    const sessionId = classSessionId("c1", MONDAY);
    assert.equal(fake.store.get(`arenaSlotLocks/${lockId("q2", MONDAY, "19")}`)?.["bookingId"], sessionId);
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "q1");
    assert.equal(fake.store.get(`arenaSlotLocks/${lockId("q1", MONDAY, "19")}`)?.["bookingId"], "flo");
  });

  it("sem quadra livre para a flutuante, continua conflito", async () => {
    const fake = new FakeFirestore();
    seedCourts(fake, ["q2"]);
    seedFloating(fake, "flo", {courtId: "q2", date: MONDAY, startTime: "19:00", endTime: "20:00"});
    assert.equal(await materializeClassSession(db(fake), "c1", cls, MONDAY, "series"), "conflict");
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "q2");
  });
});

describe("clubinho ocupa quadras com reserva flutuante", () => {
  const DATE = "2026-07-24";
  const club = {
    arenaId: ARENA, arenaName: "Arena X", name: "Clubinho", description: null, weekday: 5,
    startTime: "15:00", endTime: "19:00", courtIds: ["courtA", "courtB"], courtNames: ["Quadra 1", "Quadra 2"],
    capacity: 24, priceReais: 15, cancelWindowHours: 24, allowOnsitePayment: true, status: "active",
    startDate: "2026-07-01", endDate: null, skippedDates: [],
  } as ArenaClubData;

  it("a flutuante sai para uma quadra fora do clubinho, nunca para outra do clubinho", async () => {
    const fake = new FakeFirestore();
    seedCourts(fake, ["courtA", "courtB", "courtC"]);
    seedFloating(fake, "flo", {courtId: "courtA", date: DATE, startTime: "16:00", endTime: "17:00"});

    const result = await materializeClubSession(db(fake), "c1", club, DATE, "series");
    assert.equal(result.outcome, "created");
    assert.deepEqual(result.skippedCourtIds, []);
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "courtC");
    assert.equal(fake.store.get(`arenaSlotLocks/${lockId("courtA", DATE, "16")}`)?.["bookingId"], "club_c1_2026-07-24_courtA");
    assert.equal(fake.store.get(`arenaSlotLocks/${lockId("courtB", DATE, "16")}`)?.["bookingId"], "club_c1_2026-07-24_courtB");
  });

  it("duas flutuantes nas quadras do clubinho não vão para a mesma quadra", async () => {
    const fake = new FakeFirestore();
    seedCourts(fake, ["courtA", "courtB", "courtC", "courtD"]);
    seedFloating(fake, "floA", {courtId: "courtA", date: DATE, startTime: "16:00", endTime: "17:00"});
    seedFloating(fake, "floB", {courtId: "courtB", date: DATE, startTime: "16:00", endTime: "17:00"});

    await materializeClubSession(db(fake), "c1", club, DATE, "series");
    const a = fake.store.get("arenaBookings/floA")?.["courtId"];
    const b = fake.store.get("arenaBookings/floB")?.["courtId"];
    assert.deepEqual([a, b].sort(), ["courtC", "courtD"]);
  });
});

describe("desfazer cancelamento com reserva flutuante no horário", () => {
  it("retoma o horário e empurra a flutuante", async () => {
    const fake = new FakeFirestore();
    seedCourts(fake, ["court1", "court2"]);
    const booking: DocData = {
      athleteId: "ath1", arenaId: ARENA, courtId: "court1", courtName: "Quadra 1",
      date: "2026-08-05", startTime: "18:00", endTime: "20:00", amountReais: 120, status: "active",
    };
    fake.seedDoc("arenaBookings/bk1", booking);
    seedFloating(fake, "flo", {courtId: "court1", date: "2026-08-05", startTime: "19:00", endTime: "20:00"});

    assert.equal(await reacquireArenaBookingSlotHold(db(fake), "bk1", booking), "reacquired");
    assert.equal(fake.store.get(`arenaSlotLocks/${lockId("court1", "2026-08-05", "19")}`)?.["bookingId"], "bk1");
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "court2");
  });
});

describe("horário fixo materializa com reserva flutuante na quadra", () => {
  it("cria a ocorrência e empurra a flutuante", async () => {
    const fake = new FakeFirestore();
    seedCourts(fake, ["q1", "q2"]);
    // 2026-10-27 é terça (ISO 2).
    const series: RecurringSeriesData = {
      arenaId: ARENA, arenaName: "Arena X", courtId: "q1", courtName: "Quadra 1", weekday: 2,
      startTime: "19:00", endTime: "20:00", athleteId: "ath1", customerName: null, amountReais: 100,
      status: "active", startDate: "2026-10-01", endDate: null, skippedDates: [],
    };
    seedFloating(fake, "flo", {courtId: "q1", date: "2026-10-27", startTime: "19:00", endTime: "20:00"});

    const result = await materializeSeriesOccurrences(db(fake), "ser1", series, "2026-10-26", "2026-10-27");
    assert.deepEqual(result.createdDates, ["2026-10-27"]);
    assert.equal(
      fake.store.get(`arenaSlotLocks/${lockId("q1", "2026-10-27", "19")}`)?.["bookingId"],
      occurrenceBookingId("ser1", "2026-10-27"),
    );
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "q2");
  });
});
