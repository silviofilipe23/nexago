import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  ARENA_POPULAR_TIMES,
  POPULAR_TIMES_MIN_BOOKINGS,
  buildArenaPopularTimes,
  popularTimesWindow,
  refreshArenaPopularTimesCore,
  weekdayOfDateKey,
  type PopularTimesBooking,
} from "./arena-popular-times";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function booking(overrides: Partial<PopularTimesBooking> = {}): PopularTimesBooking & Record<string, unknown> {
  return {
    arenaId: "a1",
    date: "2030-11-04", // segunda
    startTime: "19:00",
    endTime: "20:00",
    status: "confirmed",
    ...overrides,
  };
}

function many(n: number, overrides: Partial<PopularTimesBooking> = {}): PopularTimesBooking[] {
  return Array.from({length: n}, () => booking(overrides));
}

const range = {fromDateKey: "2030-09-09", toDateKey: "2030-11-03", weeks: 8};

describe("weekdayOfDateKey", () => {
  it("é ISO: segunda 1, domingo 7", () => {
    assert.equal(weekdayOfDateKey("2030-11-04"), 1);
    assert.equal(weekdayOfDateKey("2030-11-10"), 7);
    assert.equal(weekdayOfDateKey("lixo"), null);
  });
});

describe("popularTimesWindow", () => {
  it("vai de 8 semanas atrás até ontem, no dia de São Paulo", () => {
    // 2030-11-05 02:00 UTC = 04/11 23:00 em SP.
    const win = popularTimesWindow(Date.UTC(2030, 10, 5, 2, 0));
    assert.deepEqual(win, {fromDateKey: "2030-09-09", toDateKey: "2030-11-03", weeks: 8});
  });
});

describe("buildArenaPopularTimes", () => {
  it("abaixo do mínimo de reservas não publica o desenho", () => {
    const out = buildArenaPopularTimes("a1", many(POPULAR_TIMES_MIN_BOOKINGS - 1), range);
    assert.equal(out.bookingsCount, POPULAR_TIMES_MIN_BOOKINGS - 1);
    assert.equal(out.byWeekday, null);
  });

  it("normaliza pelo horário mais cheio da semana (0 a 100)", () => {
    const out = buildArenaPopularTimes("a1", [
      ...many(20, {startTime: "19:00", endTime: "20:00"}),
      ...many(10, {startTime: "08:00", endTime: "09:00"}),
      ...many(5, {date: "2030-11-09", startTime: "10:00", endTime: "11:00"}), // sábado
    ], range);
    assert.ok(out.byWeekday);
    assert.equal(out.byWeekday["1"][19], 100);
    assert.equal(out.byWeekday["1"][8], 50);
    assert.equal(out.byWeekday["6"][10], 25);
    assert.equal(out.byWeekday["2"].every((v) => v === 0), true);
    assert.equal(out.byWeekday["1"].length, 24);
  });

  it("reserva de 2h conta nas duas horas; meia hora conta na hora em que começa", () => {
    const out = buildArenaPopularTimes("a1", [
      ...many(20, {startTime: "18:00", endTime: "20:00"}),
      ...many(20, {startTime: "21:30", endTime: "22:00"}),
    ], range);
    assert.ok(out.byWeekday);
    assert.equal(out.byWeekday["1"][18], 100);
    assert.equal(out.byWeekday["1"][19], 100);
    assert.equal(out.byWeekday["1"][20], 0);
    assert.equal(out.byWeekday["1"][21], 100);
  });

  it("termina à meia-noite sem estourar o dia", () => {
    const out = buildArenaPopularTimes("a1", many(20, {startTime: "23:00", endTime: "00:00"}), range);
    assert.ok(out.byWeekday);
    assert.equal(out.byWeekday["1"][23], 100);
  });

  it("ignora cancelada, expirada, estornada e dado torto", () => {
    const out = buildArenaPopularTimes("a1", [
      ...many(20),
      booking({status: "cancelled"}),
      booking({status: "canceled"}),
      booking({status: "expired"}),
      booking({status: "refunded"}),
      booking({date: "ontem"}),
      booking({startTime: "xx"}),
    ], range);
    assert.equal(out.bookingsCount, 20);
  });
});

describe("athletesCount", () => {
  it("conta atletas distintos: dono da reserva e convidados que entraram", () => {
    const out = buildArenaPopularTimes("a1", [
      booking({athleteId: "u1", participantUids: ["u2", "u3"]}),
      booking({athleteId: "u2", participantUids: ["u1"]}),
      booking({athleteId: "u4"}),
    ], range);
    assert.equal(out.athletesCount, 4);
  });

  it("não conta reserva inválida, balcão sem conta nem lixo", () => {
    const out = buildArenaPopularTimes("a1", [
      booking({athleteId: "u1"}),
      booking({athleteId: "u9", status: "cancelled"}),
      booking({athleteId: "", participantUids: [7, "", " u5 "]}),
      booking({athleteId: "u8", date: "lixo"}),
    ], range);
    assert.equal(out.athletesCount, 2);
  });

  it("sai mesmo abaixo do mínimo do desenho", () => {
    const out = buildArenaPopularTimes("a1", [booking({athleteId: "u1"})], range);
    assert.equal(out.byWeekday, null);
    assert.equal(out.athletesCount, 1);
  });
});

describe("refreshArenaPopularTimesCore", () => {
  it("grava um resumo por arena e zera a arena que ficou sem reservas", async () => {
    const fake = new FakeFirestore();
    for (let i = 0; i < 25; i++) {
      fake.seedDoc(`arenaBookings/a1-${i}`, booking({date: "2030-11-03"}));
    }
    fake.seedDoc("arenaBookings/a2-1", booking({arenaId: "a2", date: "2030-11-03"}));
    fake.seedDoc("arenaBookings/velha", booking({date: "2030-01-01"}));
    fake.seedDoc("arenaBookings/hoje", booking({date: "2030-11-04"}));
    fake.seedDoc(`${ARENA_POPULAR_TIMES}/a3`, {arenaId: "a3", bookingsCount: 40, byWeekday: {"1": []}});

    const written = await refreshArenaPopularTimesCore(db(fake), Date.UTC(2030, 10, 4, 15, 0));

    assert.equal(written, 3);
    const a1 = fake.store.get(`${ARENA_POPULAR_TIMES}/a1`);
    assert.equal(a1?.["bookingsCount"], 25);
    assert.equal(a1?.["athletesCount"], 0);
    assert.ok(a1?.["byWeekday"]);
    const a2 = fake.store.get(`${ARENA_POPULAR_TIMES}/a2`);
    assert.equal(a2?.["bookingsCount"], 1);
    assert.equal(a2?.["byWeekday"], null);
    const a3 = fake.store.get(`${ARENA_POPULAR_TIMES}/a3`);
    assert.equal(a3?.["bookingsCount"], 0);
    assert.equal(a3?.["byWeekday"], null);
    assert.equal(a3?.["athletesCount"], 0);
  });
});
