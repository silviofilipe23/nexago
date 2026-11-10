import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  changeArenaBookingCourtCore,
  courtChangeBlockReason,
  courtChangedPushBody,
  parseChangeBookingCourtInput,
  targetCourtBlockReason,
} from "./arena-booking-court-change";
import {computeSlotLockIds} from "./arena-booking-waitlist";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const ARENA = "arena1";
const MANAGER = "mgr";
const BOOKING_ID = "bk1";
/** 05/08/2026 12:00 em Brasília — antes da reserva das 18h. */
const NOW = Date.parse("2026-08-05T12:00:00-03:00");

function bookingData(overrides: DocData = {}): DocData {
  return {
    athleteId: "ath1",
    arenaId: ARENA,
    arenaName: "Arena X",
    courtId: "court1",
    courtName: "Quadra 1",
    sport: "beachTennis",
    date: "2026-08-05",
    startTime: "18:00",
    endTime: "20:00",
    amountReais: 120,
    status: "active",
    ...overrides,
  };
}

function locksOf(courtId: string, booking: DocData = bookingData()): string[] {
  return computeSlotLockIds({
    arenaId: ARENA,
    courtId,
    dateKey: String(booking["date"]),
    startTime: String(booking["startTime"]),
    endTime: String(booking["endTime"]),
  });
}

/** Arena + duas quadras + a reserva gravada como `createArenaBooking` grava. */
function seed(booking: DocData = bookingData()): FakeFirestore {
  const fake = new FakeFirestore();
  fake.seedDoc(`arenas/${ARENA}`, {name: "Arena X", managerUserId: MANAGER});
  fake.seedDoc(`arenas/${ARENA}/courts/court1`, {name: "Quadra 1", types: ["beachTennis"]});
  fake.seedDoc(`arenas/${ARENA}/courts/court2`, {name: "Quadra 2", types: ["beachTennis"]});
  fake.seedDoc(`arenaBookings/${BOOKING_ID}`, booking);
  fake.seedDoc(`arenaSlots/slot_${BOOKING_ID}`, {
    arenaId: ARENA,
    courtId: booking["courtId"],
    date: booking["date"],
    dateKey: booking["date"],
    startTime: booking["startTime"],
    endTime: booking["endTime"],
    status: "booked",
    bookingId: BOOKING_ID,
  });
  for (const id of locksOf(String(booking["courtId"]), booking)) {
    fake.seedDoc(`arenaSlotLocks/${id}`, {
      arenaId: ARENA,
      courtId: booking["courtId"],
      date: booking["date"],
      bookingId: BOOKING_ID,
      bookingAthleteId: booking["athleteId"],
      recurringBookingId: "series9",
    });
  }
  return fake;
}

function move(fake: FakeFirestore, toCourtId = "court2", uid = MANAGER) {
  return changeArenaBookingCourtCore(db(fake), uid, {bookingId: BOOKING_ID, toCourtId, reason: "chegou cedo"}, NOW);
}

describe("parseChangeBookingCourtInput", () => {
  it("exige reserva e quadra de destino", () => {
    assert.throws(() => parseChangeBookingCourtInput({toCourtId: "c"}), /Reserva inválida/);
    assert.throws(() => parseChangeBookingCourtInput({bookingId: "b"}), /quadra de destino/);
  });

  it("motivo é opcional e cortado", () => {
    const parsed = parseChangeBookingCourtInput({bookingId: " b ", toCourtId: " c ", reason: "x".repeat(400)});
    assert.equal(parsed.bookingId, "b");
    assert.equal(parsed.toCourtId, "c");
    assert.equal(parsed.reason?.length, 300);
    assert.equal(parseChangeBookingCourtInput({bookingId: "b", toCourtId: "c"}).reason, null);
  });
});

describe("courtChangeBlockReason", () => {
  it("reserva avulsa ativa pode trocar", () => {
    assert.equal(courtChangeBlockReason(bookingData(), NOW), null);
    assert.equal(courtChangeBlockReason(bookingData({status: "pending_payment"}), NOW), null);
  });

  it("aula, clubinho e plano trocam pela própria tela", () => {
    assert.match(courtChangeBlockReason(bookingData({isClassSession: true}), NOW) ?? "", /aula/);
    assert.match(courtChangeBlockReason(bookingData({clubSessionId: "s1"}), NOW) ?? "", /clubinho/);
    assert.match(courtChangeBlockReason(bookingData({scheduleSubscriptionId: "sub1"}), NOW) ?? "", /plano/);
  });

  it("cancelada não troca", () => {
    assert.match(courtChangeBlockReason(bookingData({status: "cancelled"}), NOW) ?? "", /ativa/);
  });

  it("em andamento ainda troca; depois do fim não", () => {
    const during = Date.parse("2026-08-05T19:00:00-03:00");
    const after = Date.parse("2026-08-05T20:00:00-03:00");
    assert.equal(courtChangeBlockReason(bookingData(), during), null);
    assert.match(courtChangeBlockReason(bookingData(), after) ?? "", /terminou/);
  });

  it("reserva até meia-noite termina no fim do dia", () => {
    const late = bookingData({startTime: "23:00", endTime: "00:00"});
    assert.equal(courtChangeBlockReason(late, Date.parse("2026-08-05T23:30:00-03:00")), null);
  });
});

describe("targetCourtBlockReason", () => {
  it("manutenção e outro esporte recusam", () => {
    assert.match(targetCourtBlockReason({status: "maintenance"}, null) ?? "", /manutenção/);
    assert.match(targetCourtBlockReason({types: ["beachVolleyball"]}, "beachTennis") ?? "", /esporte/);
  });

  it("quadra sem esporte cadastrado ou reserva sem esporte aceitam", () => {
    assert.equal(targetCourtBlockReason({}, "beachTennis"), null);
    assert.equal(targetCourtBlockReason({types: ["beachVolleyball"]}, null), null);
  });
});

describe("changeArenaBookingCourtCore", () => {
  it("move travas, slot e reserva para a quadra nova", async () => {
    const fake = seed();
    const result = await move(fake);

    assert.deepEqual(result, {changed: true, bookingId: BOOKING_ID, courtId: "court2", courtName: "Quadra 2", assigned: false});
    for (const id of locksOf("court1")) assert.equal(fake.store.has(`arenaSlotLocks/${id}`), false);
    for (const id of locksOf("court2")) {
      const lock = fake.store.get(`arenaSlotLocks/${id}`);
      assert.equal(lock?.["courtId"], "court2");
      assert.equal(lock?.["bookingId"], BOOKING_ID);
      // O que a trava carregava continua lá (o cancelamento da série depende disso).
      assert.equal(lock?.["recurringBookingId"], "series9");
    }
    assert.equal(fake.store.get(`arenaSlots/slot_${BOOKING_ID}`)?.["courtId"], "court2");

    const booking = fake.store.get(`arenaBookings/${BOOKING_ID}`);
    assert.equal(booking?.["courtId"], "court2");
    assert.equal(booking?.["courtName"], "Quadra 2");
    assert.equal(booking?.["amountReais"], 120);
    const history = booking?.["courtHistory"] as DocData[];
    assert.equal(history.length, 1);
    assert.equal(history[0]?.["fromCourtId"], "court1");
    assert.equal(history[0]?.["toCourtId"], "court2");
    assert.equal(history[0]?.["by"], MANAGER);
    assert.equal(history[0]?.["reason"], "chegou cedo");
  });

  it("mesma quadra não faz nada", async () => {
    const fake = seed();
    const result = await move(fake, "court1");
    assert.equal(result.changed, false);
    assert.equal(fake.store.get(`arenaBookings/${BOOKING_ID}`)?.["courtHistory"], undefined);
  });

  it("quadra de destino com trava de outra reserva recusa e não mexe em nada", async () => {
    const fake = seed();
    const busy = locksOf("court2")[1]!;
    fake.seedDoc(`arenaSlotLocks/${busy}`, {arenaId: ARENA, courtId: "court2", bookingId: "other"});

    await assert.rejects(move(fake), /já está reservada/);
    for (const id of locksOf("court1")) assert.equal(fake.store.get(`arenaSlotLocks/${id}`)?.["bookingId"], BOOKING_ID);
    assert.equal(fake.store.get(`arenaSlotLocks/${busy}`)?.["bookingId"], "other");
    assert.equal(fake.store.get(`arenaBookings/${BOOKING_ID}`)?.["courtId"], "court1");
  });

  it("slot reservado sem trava (legado) na quadra de destino recusa", async () => {
    const fake = seed();
    fake.seedDoc("arenaSlots/legacy", {
      arenaId: ARENA, courtId: "court2", date: "2026-08-05",
      startTime: "19:00", endTime: "20:00", status: "booked", bookingId: "old",
    });
    await assert.rejects(move(fake), /já está reservada/);
  });

  it("quadra bloqueada pelo gestor recusa", async () => {
    const fake = seed();
    fake.seedDoc("arenaSlots/block1", {
      arenaId: ARENA, courtId: "court2", date: "2026-08-05",
      startTime: "18:00", endTime: "19:00", status: "blocked",
    });
    await assert.rejects(move(fake), /bloqueada/);
  });

  it("trava de origem que já é de outra reserva não é apagada", async () => {
    const fake = seed();
    const first = locksOf("court1")[0]!;
    fake.seedDoc(`arenaSlotLocks/${first}`, {arenaId: ARENA, courtId: "court1", bookingId: "other"});

    await move(fake);
    assert.equal(fake.store.get(`arenaSlotLocks/${first}`)?.["bookingId"], "other");
    for (const id of locksOf("court2")) assert.equal(fake.store.get(`arenaSlotLocks/${id}`)?.["bookingId"], BOOKING_ID);
  });

  it("quem não é da equipe com escrita na agenda é recusado", async () => {
    const fake = seed();
    await assert.rejects(move(fake, "court2", "stranger"), /não tem acesso/);
    assert.equal(fake.store.get(`arenaBookings/${BOOKING_ID}`)?.["courtId"], "court1");
  });

  it("aula recusa antes de tocar nas travas", async () => {
    const fake = seed(bookingData({isClassSession: true}));
    await assert.rejects(move(fake), /aula/);
    for (const id of locksOf("court1")) assert.equal(fake.store.has(`arenaSlotLocks/${id}`), true);
  });

  it("quadra inexistente ou de outro esporte recusa", async () => {
    const fake = seed();
    await assert.rejects(move(fake, "nope"), /Quadra não encontrada/);
    fake.seedDoc(`arenas/${ARENA}/courts/court3`, {name: "Quadra 3", types: ["beachVolleyball"]});
    await assert.rejects(move(fake, "court3"), /esporte/);
  });

  it("histórico guarda as últimas 20 trocas", async () => {
    const old = Array.from({length: 20}, (_, i) => ({fromCourtId: `c${i}`, toCourtId: `c${i + 1}`}));
    const fake = seed(bookingData({courtHistory: old}));
    await move(fake);
    const history = fake.store.get(`arenaBookings/${BOOKING_ID}`)?.["courtHistory"] as DocData[];
    assert.equal(history.length, 20);
    assert.equal(history[0]?.["fromCourtId"], "c1");
    assert.equal(history[19]?.["toCourtId"], "court2");
  });
});

describe("courtChangedPushBody", () => {
  it("diz horário, arena e quadra nova", () => {
    assert.equal(
      courtChangedPushBody(bookingData(), "Quadra 7"),
      "Sua reserva das 18:00 em Arena X agora é na Quadra 7.",
    );
    assert.equal(
      courtChangedPushBody(bookingData(), "Quadra 7", true),
      "Sua quadra para as 18:00 em Arena X: Quadra 7.",
    );
  });
});
