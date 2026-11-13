import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  addMinutesHm,
  bookingDurationMinutes,
  bookingTablePrice,
  newSlotProblem,
  parseRescheduleBookingInput,
  rescheduleArenaBookingCore,
  rescheduleBlockReason,
  rescheduledAthletePushBody,
  type RescheduleBookingInput,
} from "./arena-booking-reschedule";
import {computeSlotLockIds} from "./arena-booking-waitlist";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const ARENA = "arena1";
const MANAGER = "mgr";
const ATHLETE = "ath1";
const BOOKING_ID = "bk1";
/** 05/08/2026 (qua) 08:00 em Brasília — 10h antes da reserva das 18h. */
const NOW = Date.parse("2026-08-05T08:00:00-03:00");

function bookingData(overrides: DocData = {}): DocData {
  return {
    athleteId: ATHLETE,
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
    attendanceStatus: "pending",
    pricingLineItems: [
      {startTime: "18:00", endTime: "19:00", finalSlotPriceReais: 60},
      {startTime: "19:00", endTime: "20:00", finalSlotPriceReais: 60},
    ],
    ...overrides,
  };
}

function locksOf(courtId: string, date: string, start: string, end: string): string[] {
  return computeSlotLockIds({arenaId: ARENA, courtId, dateKey: date, startTime: start, endTime: end});
}

function seed(booking: DocData = bookingData(), courtPrice = 60): FakeFirestore {
  const fake = new FakeFirestore();
  fake.seedDoc(`arenas/${ARENA}`, {name: "Arena X", managerUserId: MANAGER});
  fake.seedDoc(`arenas/${ARENA}/courts/court1`, {name: "Quadra 1", types: ["beachTennis"], basePricePerHourReais: courtPrice});
  fake.seedDoc(`arenas/${ARENA}/courts/court2`, {name: "Quadra 2", types: ["beachTennis"], basePricePerHourReais: courtPrice});
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
  for (const id of locksOf(String(booking["courtId"]), String(booking["date"]), String(booking["startTime"]), String(booking["endTime"]))) {
    fake.seedDoc(`arenaSlotLocks/${id}`, {arenaId: ARENA, courtId: booking["courtId"], bookingId: BOOKING_ID});
  }
  return fake;
}

function input(overrides: Partial<RescheduleBookingInput> = {}): RescheduleBookingInput {
  return {bookingId: BOOKING_ID, date: "2026-08-06", startTime: "18:00", courtId: null, as: "athlete", reason: null, ...overrides};
}

async function rejects(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  await assert.rejects(p, (e: Error) => {
    assert.match(e.message, pattern);
    return true;
  });
}

describe("parseRescheduleBookingInput", () => {
  it("normaliza hora e papel", () => {
    const parsed = parseRescheduleBookingInput({bookingId: "b", date: "2026-08-06T00:00", startTime: "7:00", as: "arena"});
    assert.equal(parsed.date, "2026-08-06");
    assert.equal(parsed.startTime, "07:00");
    assert.equal(parsed.as, "arena");
    assert.equal(parsed.courtId, null);
  });
  it("recusa dia e hora inválidos", () => {
    assert.throws(() => parseRescheduleBookingInput({bookingId: "b", date: "06/08", startTime: "18:00"}));
    assert.throws(() => parseRescheduleBookingInput({bookingId: "b", date: "2026-08-06", startTime: "25:00"}));
  });
});

describe("duração e horário", () => {
  it("mantém a duração, com meia-noite como fim", () => {
    assert.equal(bookingDurationMinutes({startTime: "18:00", endTime: "20:00"}), 120);
    assert.equal(bookingDurationMinutes({startTime: "23:00", endTime: "00:00"}), 60);
    assert.equal(addMinutesHm("23:00", 60), "24:00");
    assert.equal(addMinutesHm("23:30", 60), null);
  });
  it("preço de tabela soma as linhas (sem cupom)", () => {
    assert.equal(bookingTablePrice(bookingData({amountReais: 100})), 120);
    assert.equal(bookingTablePrice({amountReais: 80}), 80);
  });
});

describe("rescheduleBlockReason", () => {
  it("avulsa ativa do titular pode", () => {
    assert.equal(rescheduleBlockReason(bookingData(), "athlete", ATHLETE, NOW), null);
  });
  it("só o titular remarca como atleta", () => {
    assert.match(rescheduleBlockReason(bookingData(), "athlete", "outro", NOW)!, /não pode remarcar/);
  });
  it("aula, plano, horário fixo, clubinho e plano livre ficam de fora", () => {
    assert.match(rescheduleBlockReason(bookingData({classSessionId: "c"}), "arena", MANAGER, NOW)!, /aula/);
    assert.match(rescheduleBlockReason(bookingData({scheduleSubscriptionId: "s"}), "arena", MANAGER, NOW)!, /plano/);
    assert.match(rescheduleBlockReason(bookingData({recurringBookingId: "r"}), "athlete", ATHLETE, NOW)!, /Horário fixo/);
    assert.match(rescheduleBlockReason(bookingData({clubSessionId: "x"}), "arena", MANAGER, NOW)!, /clubinho/);
    assert.match(rescheduleBlockReason(bookingData({scheduleFlexMinutes: 60}), "athlete", ATHLETE, NOW)!, /plano/);
  });
  it("cancelada ou com presença registrada não remarca", () => {
    assert.match(rescheduleBlockReason(bookingData({status: "canceled"}), "arena", MANAGER, NOW)!, /ativa/);
    assert.match(rescheduleBlockReason(bookingData({attendanceStatus: "checked_in"}), "arena", MANAGER, NOW)!, /presença/);
  });
  it("atleta: até 6h antes e uma vez só", () => {
    const late = Date.parse("2026-08-05T13:00:00-03:00");
    assert.match(rescheduleBlockReason(bookingData(), "athlete", ATHLETE, late)!, /6h antes/);
    assert.match(rescheduleBlockReason(bookingData({athleteRescheduleCount: 1}), "athlete", ATHLETE, NOW)!, /já foi remarcada/);
  });
  it("arena: até o fim da reserva, sem limite de vezes", () => {
    const during = Date.parse("2026-08-05T19:00:00-03:00");
    assert.equal(rescheduleBlockReason(bookingData({athleteRescheduleCount: 3}), "arena", MANAGER, during), null);
    const after = Date.parse("2026-08-05T20:01:00-03:00");
    assert.match(rescheduleBlockReason(bookingData(), "arena", MANAGER, after)!, /terminou/);
  });
});

describe("newSlotProblem", () => {
  const base = {booking: bookingData(), startTime: "18:00", endTime: "20:00", nowMs: NOW};
  it("horizonte de 34 dias e nada no passado", () => {
    assert.equal(newSlotProblem({...base, dateKey: "2026-09-08"}), null);
    assert.match(newSlotProblem({...base, dateKey: "2026-09-09"})!, /34 dias/);
    assert.match(newSlotProblem({...base, dateKey: "2026-08-04"})!, /a partir de hoje/);
    assert.match(newSlotProblem({...base, dateKey: "2026-08-05", startTime: "07:00"})!, /já passou/);
    assert.match(newSlotProblem({...base, dateKey: "2026-08-06", endTime: null})!, /meia-noite/);
  });
  it("banco de horas fica na mesma semana", () => {
    const booking = bookingData({memberHoursMinutes: 120});
    assert.equal(newSlotProblem({...base, booking, dateKey: "2026-08-09"}), null);
    assert.match(newSlotProblem({...base, booking, dateKey: "2026-08-10"})!, /mesma semana/);
  });
});

describe("rescheduleArenaBookingCore", () => {
  it("atleta remarca: travas, slot e reserva vão para o horário novo", async () => {
    const fake = seed();
    const result = await rescheduleArenaBookingCore(db(fake), ATHLETE, input(), NOW);
    assert.equal(result.date, "2026-08-06");
    assert.equal(result.endTime, "20:00");
    assert.equal(result.courtChanged, false);
    assert.equal(result.tablePriceDiffReais, 0);

    for (const id of locksOf("court1", "2026-08-05", "18:00", "20:00")) {
      assert.equal(fake.store.has(`arenaSlotLocks/${id}`), false, `trava antiga ${id} ficou`);
    }
    for (const id of locksOf("court1", "2026-08-06", "18:00", "20:00")) {
      assert.equal(fake.store.get(`arenaSlotLocks/${id}`)?.["bookingId"], BOOKING_ID);
    }
    const slot = fake.store.get(`arenaSlots/slot_${BOOKING_ID}`)!;
    assert.equal(slot["dateKey"], "2026-08-06");
    const booking = fake.store.get(`arenaBookings/${BOOKING_ID}`)!;
    assert.equal(booking["date"], "2026-08-06");
    assert.equal(booking["amountReais"], 120);
    assert.equal(booking["athleteRescheduleCount"], 1);
    assert.equal(booking["attendanceStatus"], "pending");
    const history = booking["rescheduleHistory"] as DocData[];
    assert.equal(history.length, 1);
    assert.equal(history[0]!["fromDate"], "2026-08-05");
    assert.equal(history[0]!["role"], "athlete");
  });

  it("encosto no próprio horário: a trava em comum fica", async () => {
    const fake = seed();
    await rescheduleArenaBookingCore(db(fake), ATHLETE, input({date: "2026-08-05", startTime: "19:00"}), NOW);
    const [h18, h19] = locksOf("court1", "2026-08-05", "18:00", "20:00");
    const [, h20] = locksOf("court1", "2026-08-05", "19:00", "21:00");
    assert.equal(fake.store.has(`arenaSlotLocks/${h18}`), false);
    assert.equal(fake.store.get(`arenaSlotLocks/${h19}`)?.["bookingId"], BOOKING_ID);
    assert.equal(fake.store.get(`arenaSlotLocks/${h20}`)?.["bookingId"], BOOKING_ID);
  });

  it("horário ocupado por outra reserva é conflito", async () => {
    const fake = seed();
    const [taken] = locksOf("court1", "2026-08-06", "18:00", "20:00");
    fake.seedDoc(`arenaSlotLocks/${taken}`, {arenaId: ARENA, courtId: "court1", bookingId: "outra"});
    await rejects(rescheduleArenaBookingCore(db(fake), ATHLETE, input(), NOW), /acabou de ser reservado/);
    // Nada mudou.
    assert.equal(fake.store.get(`arenaBookings/${BOOKING_ID}`)?.["date"], "2026-08-05");
  });

  it("atleta não troca por horário mais caro pela tabela", async () => {
    const fake = seed(bookingData(), 80);
    await rejects(rescheduleArenaBookingCore(db(fake), ATHLETE, input(), NOW), /custa mais/);
  });

  it("quadra fechada no horário novo é recusada", async () => {
    const fake = seed();
    await rejects(rescheduleArenaBookingCore(db(fake), ATHLETE, input({startTime: "21:00"}), NOW), /não funciona/);
  });

  it("mesmo horário e quadra é recusado", async () => {
    const fake = seed();
    await rejects(rescheduleArenaBookingCore(db(fake), ATHLETE, input({date: "2026-08-05"}), NOW), /diferente do atual/);
  });

  it("arena remarca para outra quadra e vê a diferença de tabela", async () => {
    const fake = seed(bookingData(), 80);
    const result = await rescheduleArenaBookingCore(db(fake), MANAGER, input({as: "arena", courtId: "court2", startTime: "10:00"}), NOW);
    assert.equal(result.courtChanged, true);
    assert.equal(result.courtName, "Quadra 2");
    assert.equal(result.tablePriceDiffReais, 40);
    const booking = fake.store.get(`arenaBookings/${BOOKING_ID}`)!;
    assert.equal(booking["courtId"], "court2");
    assert.equal(booking["amountReais"], 120);
    assert.equal(booking["athleteRescheduleCount"], undefined);
    for (const id of locksOf("court2", "2026-08-06", "10:00", "12:00")) {
      assert.equal(fake.store.get(`arenaSlotLocks/${id}`)?.["courtId"], "court2");
    }
  });

  it("quem não é da equipe não remarca como arena", async () => {
    const fake = seed();
    await assert.rejects(rescheduleArenaBookingCore(db(fake), "estranho", input({as: "arena"}), NOW));
  });

  it("flutuante continua flutuante: o servidor escolhe a quadra livre do horário novo", async () => {
    const fake = seed(bookingData({allocationStatus: "unassigned"}));
    fake.seedDoc(`arenas/${ARENA}`, {
      name: "Arena X",
      managerUserId: MANAGER,
      bookingAllocation: {mode: "capacity", courtIds: ["court1", "court2"], priceBySport: {beachTennis: 60}},
    });
    // Quadra 1 ocupada (reserva comum) no horário novo: vai para a 2, mesmo pedindo a 1.
    for (const id of locksOf("court1", "2026-08-06", "18:00", "20:00")) {
      fake.seedDoc(`arenaSlotLocks/${id}`, {arenaId: ARENA, courtId: "court1", bookingId: "outra"});
    }
    const result = await rescheduleArenaBookingCore(db(fake), ATHLETE, input({courtId: "court1"}), NOW);
    assert.equal(result.courtId, "court2");
    for (const id of locksOf("court2", "2026-08-06", "18:00", "20:00")) {
      assert.equal(fake.store.get(`arenaSlotLocks/${id}`)?.["floating"], true);
    }
    assert.equal(fake.store.get(`arenaBookings/${BOOKING_ID}`)?.["allocationStatus"], "unassigned");
  });

  it("aula do professor acompanha a remarcação", async () => {
    const fake = seed();
    fake.seedDoc(`professorLessons/${BOOKING_ID}`, {date: "2026-08-05", startTime: "18:00", endTime: "20:00"});
    await rescheduleArenaBookingCore(db(fake), ATHLETE, input({startTime: "08:00"}), NOW);
    assert.equal(fake.store.get(`professorLessons/${BOOKING_ID}`)?.["startTime"], "08:00");
  });
});

describe("rescheduledAthletePushBody", () => {
  it("mostra dia, hora e quadra", () => {
    const body = rescheduledAthletePushBody(bookingData({date: "2026-08-06", courtName: "Quadra 2"}), NOW);
    assert.equal(body, "Sua reserva em Arena X agora é qui, 06/08 às 18:00, na Quadra 2.");
  });
});
