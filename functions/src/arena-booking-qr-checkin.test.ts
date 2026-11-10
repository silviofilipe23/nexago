import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {checkInBookingByCourtQrCore, qrCheckInBlockReason} from "./arena-booking-qr-checkin";
import {computeSlotLockIds} from "./arena-booking-waitlist";

/** Check-in da reserva pelo QR da quadra (`docs/product/reservas-por-capacidade.md`, PR 4c). */
const ARENA = "arena1";
const DATE = "2026-08-05";
const NOW = Date.parse("2026-08-05T17:50:00-03:00");
const ATHLETE = "ath_flo";

const token = (courtId: string) => `tok_${courtId}`.padEnd(22, "x");
const qr = (courtId: string) => `nexago-checkin:v1:${token(courtId)}`;

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function lockId(courtId: string): string {
  return computeSlotLockIds({arenaId: ARENA, courtId, dateKey: DATE, startTime: "18:00", endTime: "19:00"})[0]!;
}

/** Arena com quadras c1..cN, cada uma com o QR impresso. */
function seedArena(courts = 3): FakeFirestore {
  const fake = new FakeFirestore();
  fake.seedDoc(`arenas/${ARENA}`, {name: "Arena X", managerUserId: "mgr"});
  for (let i = 1; i <= courts; i++) {
    fake.seedDoc(`arenas/${ARENA}/courts/c${i}`, {name: `Quadra ${i}`, types: ["beachTennis"]});
    fake.seedDoc(`arenaCourtCheckinCodes/${ARENA}_c${i}`, {
      arenaId: ARENA, courtId: `c${i}`, courtName: `Quadra ${i}`, token: token(`c${i}`),
    });
  }
  return fake;
}

function seedBooking(
  fake: FakeFirestore,
  id: string,
  opts: {courtId: string; floating?: boolean; extra?: DocData},
): void {
  fake.seedDoc(`arenaBookings/${id}`, {
    athleteId: `ath_${id}`,
    arenaId: ARENA,
    arenaName: "Arena X",
    courtId: opts.courtId,
    courtName: `Quadra ${opts.courtId.slice(1)}`,
    sport: "beachTennis",
    date: DATE,
    startTime: "18:00",
    endTime: "19:00",
    status: "active",
    ...(opts.floating ? {allocationStatus: "unassigned", allocationSource: "auto"} : {}),
    ...opts.extra,
  });
  fake.seedDoc(`arenaSlots/slot_${id}`, {
    arenaId: ARENA, courtId: opts.courtId, date: DATE, startTime: "18:00", endTime: "19:00", status: "booked", bookingId: id,
  });
  fake.seedDoc(`arenaSlotLocks/${lockId(opts.courtId)}`, {
    arenaId: ARENA, courtId: opts.courtId, date: DATE, bookingId: id, ...(opts.floating ? {floating: true} : {}),
  });
}

const scan = (fake: FakeFirestore, courtId: string, uid = ATHLETE, bookingId = "flo", now = NOW) =>
  checkInBookingByCourtQrCore(db(fake), uid, {bookingId, qr: qr(courtId)}, now);

async function rejectsWith(p: Promise<unknown>, code: string, reason?: string): Promise<void> {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof HttpsError);
    assert.equal(e.code, code);
    if (reason) assert.equal((e.details as {reason?: string})?.reason, reason);
    return true;
  });
}

describe("qrCheckInBlockReason", () => {
  const booking = {athleteId: "u1", date: DATE, startTime: "18:00", endTime: "19:00", status: "active"};
  const at = (hhmm: string) => Date.parse(`${DATE}T${hhmm}:00-03:00`);

  it("janela: de 20 min antes até o fim", () => {
    assert.match(qrCheckInBlockReason(booking, "u1", at("17:39")) ?? "", /abre 20 min antes/);
    assert.equal(qrCheckInBlockReason(booking, "u1", at("17:40")), null);
    assert.equal(qrCheckInBlockReason(booking, "u1", at("18:59")), null);
    assert.match(qrCheckInBlockReason(booking, "u1", at("19:00")) ?? "", /já terminou/);
  });

  it("só o dono, reserva ativa, sem falta e fora de aula", () => {
    const now = at("18:00");
    assert.match(qrCheckInBlockReason(booking, "u2", now) ?? "", /Só quem fez a reserva/);
    assert.match(qrCheckInBlockReason({...booking, status: "cancelled"}, "u1", now) ?? "", /reserva ativa/);
    assert.match(qrCheckInBlockReason({...booking, attendanceStatus: "no_show"}, "u1", now) ?? "", /falta/);
    assert.match(qrCheckInBlockReason({...booking, isClassSession: true}, "u1", now) ?? "", /aula/);
  });

  it("reserva que vira a meia-noite", () => {
    const late = {...booking, startTime: "23:00", endTime: "00:00"};
    assert.equal(qrCheckInBlockReason(late, "u1", at("23:30")), null);
  });
});

describe("check-in pelo QR numa reserva sem quadra definida", () => {
  it("QR da quadra provisória: vira assigned (qr), trava para de flutuar, check-in feito", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});

    const result = await scan(fake, "c1");
    assert.deepEqual(result, {
      bookingId: "flo", courtId: "c1", courtName: "Quadra 1", assigned: true, moved: false, alreadyCheckedIn: false,
    });
    const booking = fake.store.get("arenaBookings/flo");
    assert.equal(booking?.["allocationStatus"], "assigned");
    assert.equal(booking?.["allocationSource"], "qr");
    assert.equal(booking?.["allocatedBy"], ATHLETE);
    assert.equal(booking?.["attendanceStatus"], "checked_in");
    assert.equal(booking?.["checkInMethod"], "qr");
    assert.equal(booking?.["locationVerified"], true);
    assert.equal("floating" in (fake.store.get(`arenaSlotLocks/${lockId("c1")}`) ?? {}), false);
  });

  it("QR de outra quadra livre: a reserva vai para ela", async () => {
    const fake = seedArena(3);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});

    const result = await scan(fake, "c3");
    assert.equal(result.moved, true);
    assert.equal(result.courtName, "Quadra 3");
    const booking = fake.store.get("arenaBookings/flo");
    assert.equal(booking?.["courtId"], "c3");
    assert.equal(booking?.["courtName"], "Quadra 3");
    assert.equal(booking?.["allocationSource"], "qr");
    assert.equal(booking?.["attendanceStatus"], "checked_in");
    assert.equal(fake.store.has(`arenaSlotLocks/${lockId("c1")}`), false);
    assert.equal(fake.store.get(`arenaSlotLocks/${lockId("c3")}`)?.["bookingId"], "flo");
    assert.equal(fake.store.get("arenaSlots/slot_flo")?.["courtId"], "c3");
  });

  it("quadra lida com outra flutuante: a outra vai para uma livre", async () => {
    const fake = seedArena(3);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});
    seedBooking(fake, "other", {courtId: "c2", floating: true});

    await scan(fake, "c2");
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "c2");
    const other = fake.store.get("arenaBookings/other");
    assert.notEqual(other?.["courtId"], "c2");
    assert.equal(other?.["allocationStatus"], "unassigned");
  });

  it("quadra lida ocupada por reserva definida: recusa e nada muda", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});
    seedBooking(fake, "fixed", {courtId: "c2"});

    await rejectsWith(scan(fake, "c2"), "failed-precondition", "court_taken");
    const booking = fake.store.get("arenaBookings/flo");
    assert.equal(booking?.["courtId"], "c1");
    assert.equal(booking?.["allocationStatus"], "unassigned");
    assert.equal(booking?.["attendanceStatus"], undefined);
  });
});

describe("check-in pelo QR numa reserva com quadra definida", () => {
  it("QR da própria quadra: check-in sem mexer na alocação", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "flo", {courtId: "c1"});

    const result = await scan(fake, "c1");
    assert.equal(result.assigned, false);
    assert.equal(result.moved, false);
    const booking = fake.store.get("arenaBookings/flo");
    assert.equal(booking?.["attendanceStatus"], "checked_in");
    assert.equal(booking?.["allocationStatus"], undefined);
  });

  it("QR de outra quadra: recusa", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "flo", {courtId: "c1", extra: {allocationStatus: "assigned", allocationSource: "staff"}});
    await rejectsWith(scan(fake, "c2"), "failed-precondition", "wrong_court");
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "c1");
  });

  it("leitura repetida na mesma quadra não falha", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});
    await scan(fake, "c1");
    const again = await scan(fake, "c1");
    assert.equal(again.alreadyCheckedIn, true);
  });
});

describe("QR e atleta recusados", () => {
  it("QR que não é do nexaGO, trocado ou de outra arena", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});
    fake.seedDoc("arenaCourtCheckinCodes/arena2_c9", {arenaId: "arena2", courtId: "c9", courtName: "Q9", token: token("c9")});

    await rejectsWith(
      checkInBookingByCourtQrCore(db(fake), ATHLETE, {bookingId: "flo", qr: "https://cardapio.example"}, NOW),
      "invalid-argument", "qr_unknown");
    await rejectsWith(
      checkInBookingByCourtQrCore(db(fake), ATHLETE, {bookingId: "flo", qr: qr("velho")}, NOW),
      "failed-precondition", "qr_invalid");
    await rejectsWith(scan(fake, "c9"), "failed-precondition", "qr_other_arena");
  });

  it("só quem fez a reserva", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});
    await rejectsWith(scan(fake, "c1", "intruso"), "permission-denied");
  });

  it("cedo demais", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});
    await rejectsWith(scan(fake, "c1", ATHLETE, "flo", Date.parse(`${DATE}T17:00:00-03:00`)), "failed-precondition", "not_allowed");
    assert.equal(fake.store.get("arenaBookings/flo")?.["allocationStatus"], "unassigned");
  });
});
