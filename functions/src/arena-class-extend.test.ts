/**
 * Emendar a aula (+1h): a hora a mais ocupa a quadra como a aula — desconta da capacidade — e,
 * sem vaga, não emenda.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {computeSlotLockIds} from "./arena-booking-waitlist";
import {materializeClassSession, type ArenaClassData} from "./arena-class";
import {classSessionId} from "./arena-class-constants";
import {classExtendBlockReason, extendClassSessionCore} from "./arena-class-extend";

const ARENA = "arena1";
const MONDAY = "2030-10-28";
const BEFORE = new Date("2030-10-28T12:00:00-03:00").getTime();

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function lockId(courtId: string, hour: string): string {
  return `${ARENA}_${courtId}_${MONDAY}_h${hour}`;
}

const cls: ArenaClassData = {
  arenaId: ARENA, arenaName: "Arena X", name: "Iniciante A", type: "turma", sport: "beachTennis",
  level: "iniciante", teacherId: "t1", teacherUserId: "uT", teacherName: "Thiago", teacherColor: "#FF6A1A",
  weekdays: [1], startTime: "18:00", endTime: "19:00", courtId: "q2", courtName: "Quadra 2", capacity: 6,
  startDate: "2030-10-01", endDate: null, status: "active",
} as ArenaClassData;

const SESSION = classSessionId("c1", MONDAY);

async function setup(courts: string[], courtOverrides: Record<string, Record<string, unknown>> = {}) {
  const fake = new FakeFirestore();
  fake.seedDoc(`arenas/${ARENA}`, {name: "Arena X"});
  courts.forEach((id, i) => fake.seedDoc(`arenas/${ARENA}/courts/${id}`, {
    name: `Quadra ${i + 1}`, types: ["beachTennis"], ...(courtOverrides[id] ?? {}),
  }));
  assert.equal(await materializeClassSession(db(fake), "c1", cls, MONDAY, "series"), "created");
  return fake;
}

function seedBooking(fake: FakeFirestore, id: string, courtId: string, floating: boolean): void {
  fake.seedDoc(`arenaBookings/${id}`, {
    arenaId: ARENA, courtId, courtName: "Quadra", sport: "beachTennis", date: MONDAY,
    startTime: "19:00", endTime: "20:00", status: "active",
    ...(floating ? {allocationStatus: "unassigned"} : {}),
  });
  fake.seedDoc(`arenaSlots/slot_${id}`, {
    arenaId: ARENA, courtId, date: MONDAY, startTime: "19:00", endTime: "20:00", status: "booked", bookingId: id,
  });
  for (const lock of computeSlotLockIds({arenaId: ARENA, courtId, dateKey: MONDAY, startTime: "19:00", endTime: "20:00"})) {
    fake.seedDoc(`arenaSlotLocks/${lock}`, {arenaId: ARENA, courtId, date: MONDAY, bookingId: id, ...(floating ? {floating: true} : {})});
  }
}

async function rejects(p: Promise<unknown>, pattern: RegExp): Promise<HttpsError> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof HttpsError, String(e));
    assert.match(e.message, pattern);
    return e;
  }
  assert.fail("devia recusar");
}

describe("emendar aula +1h", () => {
  it("quadra livre: a aula, a reserva da aula e o slot vão até 20:00 e a hora fica travada", async () => {
    const fake = await setup(["q1", "q2"]);
    const result = await extendClassSessionCore(db(fake), SESSION, BEFORE);

    assert.deepEqual(result, {sessionId: SESSION, startTime: "18:00", endTime: "20:00", previousEndTime: "19:00", relocatedBookings: 0});
    assert.equal(fake.store.get(`arenaClassSessions/${SESSION}`)?.["endTime"], "20:00");
    assert.equal(fake.store.get(`arenaBookings/${SESSION}`)?.["endTime"], "20:00");
    assert.equal(fake.store.get(`arenaSlots/${SESSION}`)?.["endTime"], "20:00");
    assert.equal(fake.store.get(`arenaSlotLocks/${lockId("q2", "19")}`)?.["bookingId"], SESSION);
  });

  it("reserva provisória na hora seguinte vai para outra quadra livre", async () => {
    const fake = await setup(["q1", "q2"]);
    seedBooking(fake, "flo", "q2", true);

    const result = await extendClassSessionCore(db(fake), SESSION, BEFORE);
    assert.equal(result.relocatedBookings, 1);
    assert.equal(fake.store.get(`arenaSlotLocks/${lockId("q2", "19")}`)?.["bookingId"], SESSION);
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "q1");
  });

  it("sem vaga (provisória sem outra quadra livre): não emenda e nada muda", async () => {
    const fake = await setup(["q2"]);
    seedBooking(fake, "flo", "q2", true);

    const err = await rejects(extendClassSessionCore(db(fake), SESSION, BEFORE), /Sem vaga das 19:00 às 20:00/);
    assert.deepEqual(err.details, {reason: "no_vacancy"});
    assert.equal(fake.store.get(`arenaClassSessions/${SESSION}`)?.["endTime"], "19:00");
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "q2");
  });

  it("reserva com quadra definida na hora seguinte: sem vaga", async () => {
    const fake = await setup(["q1", "q2"]);
    seedBooking(fake, "fixa", "q2", false);
    await rejects(extendClassSessionCore(db(fake), SESSION, BEFORE), /Sem vaga/);
    assert.equal(fake.store.get(`arenaClassSessions/${SESSION}`)?.["endTime"], "19:00");
  });

  it("bloqueio (torneio, manutenção) na hora seguinte: sem vaga", async () => {
    const fake = await setup(["q1", "q2"]);
    fake.seedDoc("arenaSlots/bloq", {
      arenaId: ARENA, courtId: "q2", date: new Date(`${MONDAY}T19:00:00-03:00`), dateKey: MONDAY,
      startTime: "19:00", endTime: "20:00", status: "blocked", blockReason: "torneio",
    });
    await rejects(extendClassSessionCore(db(fake), SESSION, BEFORE), /Sem vaga/);
  });

  it("quadra em manutenção: não emenda", async () => {
    const fake = await setup(["q1", "q2"]);
    fake.seedDoc(`arenas/${ARENA}/courts/q2`, {name: "Quadra 2", status: "maintenance"});
    await rejects(extendClassSessionCore(db(fake), SESSION, BEFORE), /manutenção/);
  });

  it("emenda de novo a partir do fim novo", async () => {
    const fake = await setup(["q1", "q2"]);
    await extendClassSessionCore(db(fake), SESSION, BEFORE);
    const again = await extendClassSessionCore(db(fake), SESSION, BEFORE);
    assert.equal(again.endTime, "21:00");
    assert.equal(fake.store.get(`arenaSlotLocks/${lockId("q2", "20")}`)?.["bookingId"], SESSION);
  });
});

describe("classExtendBlockReason", () => {
  const base = {status: "scheduled", date: MONDAY, startTime: "18:00", endTime: "19:00"};
  it("aula futura pode", () => assert.equal(classExtendBlockReason(base, BEFORE), null));
  it("cancelada, fechada, terminada e meia-noite não", () => {
    assert.match(classExtendBlockReason({...base, status: "canceled"}, BEFORE)!, /cancelada/);
    assert.match(classExtendBlockReason({...base, status: "completed"}, BEFORE)!, /chamada/);
    assert.match(classExtendBlockReason(base, new Date("2030-10-28T19:00:00-03:00").getTime())!, /terminou/);
    assert.match(classExtendBlockReason({...base, startTime: "23:00", endTime: "00:00"}, BEFORE)!, /meia-noite/);
  });
  it("durante a aula ainda pode", () => {
    assert.equal(classExtendBlockReason(base, new Date("2030-10-28T18:40:00-03:00").getTime()), null);
  });
});
