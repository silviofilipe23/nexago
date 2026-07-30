import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  isBookingRestoredTransition,
  releaseArenaBookingSlotHold,
  reacquireArenaBookingSlotHold,
} from "./arena-booking-slot-release";
import {computeSlotLockIds} from "./arena-booking-waitlist";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const BOOKING_ID = "bk1";

function bookingData(overrides: DocData = {}): DocData {
  return {
    athleteId: "ath1",
    arenaId: "arena1",
    arenaName: "Arena X",
    courtId: "court1",
    courtName: "Quadra 1",
    date: "2026-08-05",
    startTime: "18:00",
    endTime: "20:00",
    amountReais: 120,
    status: "canceled",
    ...overrides,
  };
}

/** Semeia booking + slot + locks como `createArenaBooking` grava. */
function seedBookedState(
  fake: FakeFirestore,
  bookingId: string,
  booking: DocData,
): string[] {
  fake.seedDoc(`arenaBookings/${bookingId}`, booking);
  fake.seedDoc(`arenaSlots/slot_${bookingId}`, {
    arenaId: booking["arenaId"],
    courtId: booking["courtId"],
    date: booking["date"],
    dateKey: booking["date"],
    startTime: booking["startTime"],
    endTime: booking["endTime"],
    status: "booked",
    bookingAthleteId: booking["athleteId"],
    bookingId,
    priceReais: booking["amountReais"],
  });
  const lockIds = computeSlotLockIds({
    arenaId: String(booking["arenaId"]),
    courtId: String(booking["courtId"]),
    dateKey: String(booking["date"]),
    startTime: String(booking["startTime"]),
    endTime: String(booking["endTime"]),
  });
  for (const lockId of lockIds) {
    fake.seedDoc(`arenaSlotLocks/${lockId}`, {
      arenaId: booking["arenaId"],
      courtId: booking["courtId"],
      date: booking["date"],
      bookingId,
      bookingAthleteId: booking["athleteId"],
    });
  }
  return lockIds;
}

describe("isBookingRestoredTransition", () => {
  it("canceled → active é restore", () => {
    assert.equal(
      isBookingRestoredTransition({status: "canceled"}, {status: "active"}),
      true,
    );
  });

  it("cancelled → pending_payment é restore", () => {
    assert.equal(
      isBookingRestoredTransition({status: "cancelled"}, {status: "pending_payment"}),
      true,
    );
  });

  it("canceled → cancelled NÃO é restore (segue cancelado)", () => {
    assert.equal(
      isBookingRestoredTransition({status: "canceled"}, {status: "cancelled"}),
      false,
    );
  });

  it("active → canceled NÃO é restore", () => {
    assert.equal(
      isBookingRestoredTransition({status: "active"}, {status: "canceled"}),
      false,
    );
  });

  it("canceled → expired NÃO é restore", () => {
    assert.equal(
      isBookingRestoredTransition({status: "canceled"}, {status: "expired"}),
      false,
    );
  });

  it("sem before NÃO é restore", () => {
    assert.equal(isBookingRestoredTransition(undefined, {status: "active"}), false);
  });
});

describe("releaseArenaBookingSlotHold", () => {
  it("apaga os locks do próprio booking e o doc em arenaSlots", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData();
    const lockIds = seedBookedState(fake, BOOKING_ID, booking);
    assert.equal(lockIds.length, 2); // 18:00–20:00 → h18 e h19

    const result = await releaseArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(result.deletedLocks, 2);
    assert.equal(result.deletedSlots, 1);
    for (const lockId of lockIds) {
      assert.equal(fake.store.has(`arenaSlotLocks/${lockId}`), false);
    }
    assert.equal(fake.store.has(`arenaSlots/slot_${BOOKING_ID}`), false);
    // O doc da reserva em si não é tocado pelo release.
    assert.equal(fake.store.has(`arenaBookings/${BOOKING_ID}`), true);
  });

  it("NÃO apaga lock que já pertence a outra reserva (retry após re-reserva)", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData();
    const lockIds = seedBookedState(fake, BOOKING_ID, booking);
    // Outro atleta reservou o mesmo horário depois do cancelamento: o lock
    // agora pertence a bk2. Um retry do trigger não pode derrubá-lo.
    fake.seedDoc(`arenaSlotLocks/${lockIds[0]}`, {
      arenaId: booking["arenaId"],
      courtId: booking["courtId"],
      date: booking["date"],
      bookingId: "bk2",
      bookingAthleteId: "ath2",
    });

    const result = await releaseArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(result.deletedLocks, 1);
    assert.equal(fake.store.has(`arenaSlotLocks/${lockIds[0]}`), true);
    assert.equal(fake.store.has(`arenaSlotLocks/${lockIds[1]}`), false);
  });

  it("não toca em slots de outras reservas nem em bloqueios do gestor", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData();
    seedBookedState(fake, BOOKING_ID, booking);
    fake.seedDoc("arenaSlots/other", {
      arenaId: booking["arenaId"],
      courtId: booking["courtId"],
      date: booking["date"],
      status: "booked",
      bookingId: "bk2",
    });
    fake.seedDoc("arenaSlots/blockedByManager", {
      arenaId: booking["arenaId"],
      courtId: booking["courtId"],
      date: booking["date"],
      status: "blocked",
    });

    await releaseArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(fake.store.has("arenaSlots/other"), true);
    assert.equal(fake.store.has("arenaSlots/blockedByManager"), true);
  });

  it("libera lock da última hora quando endTime é 00:00 (meia-noite)", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData({startTime: "23:00", endTime: "00:00"});
    const lockIds = seedBookedState(fake, BOOKING_ID, booking);
    assert.equal(lockIds.length, 1); // h23

    const result = await releaseArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(result.deletedLocks, 1);
    assert.equal(fake.store.has(`arenaSlotLocks/${lockIds[0]}`), false);
  });

  it("é idempotente: segunda execução não falha e não apaga nada novo", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData();
    seedBookedState(fake, BOOKING_ID, booking);

    await releaseArenaBookingSlotHold(db(fake), BOOKING_ID, booking);
    const second = await releaseArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(second.deletedLocks, 0);
    assert.equal(second.deletedSlots, 0);
  });

  it("com dados de horário inválidos ainda remove os docs de arenaSlots", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData({startTime: "", endTime: ""});
    fake.seedDoc(`arenaBookings/${BOOKING_ID}`, booking);
    fake.seedDoc(`arenaSlots/slot_${BOOKING_ID}`, {
      arenaId: booking["arenaId"],
      courtId: booking["courtId"],
      status: "booked",
      bookingId: BOOKING_ID,
    });

    const result = await releaseArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(result.deletedLocks, 0);
    assert.equal(result.deletedSlots, 1);
    assert.equal(fake.store.has(`arenaSlots/slot_${BOOKING_ID}`), false);
  });
});

describe("reacquireArenaBookingSlotHold", () => {
  it("recria locks e doc de arenaSlots quando o horário segue livre", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData({status: "active"});
    fake.seedDoc(`arenaBookings/${BOOKING_ID}`, booking);

    const outcome = await reacquireArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(outcome, "reacquired");
    const lockIds = computeSlotLockIds({
      arenaId: "arena1",
      courtId: "court1",
      dateKey: "2026-08-05",
      startTime: "18:00",
      endTime: "20:00",
    });
    for (const lockId of lockIds) {
      const lock = fake.store.get(`arenaSlotLocks/${lockId}`);
      assert.ok(lock, `lock ${lockId} deveria existir`);
      assert.equal(lock["bookingId"], BOOKING_ID);
      assert.equal(lock["bookingAthleteId"], "ath1");
    }
    const slot = fake.store.get(`arenaSlots/${BOOKING_ID}`);
    assert.ok(slot, "doc de arenaSlots deveria ser recriado");
    assert.equal(slot["status"], "booked");
    assert.equal(slot["bookingId"], BOOKING_ID);
    assert.equal(slot["date"], "2026-08-05");
    assert.equal(slot["startTime"], "18:00");
    assert.equal(slot["endTime"], "20:00");
  });

  it("mantém sucesso quando os locks já pertencem ao próprio booking (retry)", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData({status: "active"});
    fake.seedDoc(`arenaBookings/${BOOKING_ID}`, booking);
    const lockIds = computeSlotLockIds({
      arenaId: "arena1",
      courtId: "court1",
      dateKey: "2026-08-05",
      startTime: "18:00",
      endTime: "20:00",
    });
    fake.seedDoc(`arenaSlotLocks/${lockIds[0]!}`, {bookingId: BOOKING_ID});

    const outcome = await reacquireArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(outcome, "reacquired");
  });

  it("conflito: horário tomado por outra reserva → reverte para cancelado", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData({status: "active"});
    fake.seedDoc(`arenaBookings/${BOOKING_ID}`, booking);
    const lockIds = computeSlotLockIds({
      arenaId: "arena1",
      courtId: "court1",
      dateKey: "2026-08-05",
      startTime: "18:00",
      endTime: "20:00",
    });
    fake.seedDoc(`arenaSlotLocks/${lockIds[1]!}`, {bookingId: "bk2"});

    const outcome = await reacquireArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(outcome, "conflict");
    const reverted = fake.store.get(`arenaBookings/${BOOKING_ID}`);
    assert.ok(reverted);
    assert.equal(reverted["status"], "canceled");
    assert.equal(reverted["restoreFailedReason"], "slot_taken");
    // Nada foi criado: nem o lock livre, nem o doc de slot.
    assert.equal(fake.store.has(`arenaSlotLocks/${lockIds[0]!}`), false);
    assert.equal(fake.store.has(`arenaSlots/${BOOKING_ID}`), false);
    // O lock da outra reserva permanece intacto.
    assert.equal(fake.store.get(`arenaSlotLocks/${lockIds[1]!}`)?.["bookingId"], "bk2");
  });

  it("propaga isRecurring/recurringBookingId ao recriar o slot", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData({
      status: "active",
      isRecurring: true,
      recurringBookingId: "serie1",
    });
    fake.seedDoc(`arenaBookings/${BOOKING_ID}`, booking);

    const outcome = await reacquireArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(outcome, "reacquired");
    const slot = fake.store.get(`arenaSlots/${BOOKING_ID}`);
    assert.ok(slot);
    assert.equal(slot["isRecurring"], true);
    assert.equal(slot["recurringBookingId"], "serie1");
  });

  it("horário inválido não cria nada e não falha", async () => {
    const fake = new FakeFirestore();
    const booking = bookingData({status: "active", startTime: "", endTime: ""});
    fake.seedDoc(`arenaBookings/${BOOKING_ID}`, booking);

    const outcome = await reacquireArenaBookingSlotHold(db(fake), BOOKING_ID, booking);

    assert.equal(outcome, "reacquired");
    assert.equal(fake.store.has(`arenaSlots/${BOOKING_ID}`), false);
  });
});
