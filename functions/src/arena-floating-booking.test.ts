import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  claimCourtLocks,
  floatingCandidateCourts,
  SYSTEM_ACTOR,
  type TxReader,
  type TxWriter,
} from "./arena-floating-booking";
import {changeArenaBookingCourtCore} from "./arena-booking-court-change";
import {computeSlotLockIds} from "./arena-booking-waitlist";

const ARENA = "arena1";
const DATE = "2026-08-05";
const NOW = Date.parse("2026-08-05T12:00:00-03:00");

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function lockIds(courtId: string, startTime: string, endTime: string): string[] {
  return computeSlotLockIds({arenaId: ARENA, courtId, dateKey: DATE, startTime, endTime});
}

function lockRefs(fake: FakeFirestore, courtId: string, startTime: string, endTime: string): DocumentReference[] {
  return lockIds(courtId, startTime, endTime)
    .map((id) => db(fake).collection("arenaSlotLocks").doc(id));
}

/** Arena com quadras de beach tennis c1..cN (nomes "Quadra N"). */
function seedArena(courts = 3, arena: DocData = {}): FakeFirestore {
  const fake = new FakeFirestore();
  fake.seedDoc(`arenas/${ARENA}`, {name: "Arena X", managerUserId: "mgr", ...arena});
  for (let i = 1; i <= courts; i++) {
    fake.seedDoc(`arenas/${ARENA}/courts/c${i}`, {name: `Quadra ${i}`, types: ["beachTennis"]});
  }
  return fake;
}

/** Reserva gravada como o motor grava: booking + slot + travas (flutuantes ou não). */
function seedBooking(
  fake: FakeFirestore,
  id: string,
  opts: {courtId: string; startTime?: string; endTime?: string; floating?: boolean; extra?: DocData},
): void {
  const startTime = opts.startTime ?? "18:00";
  const endTime = opts.endTime ?? "19:00";
  fake.seedDoc(`arenaBookings/${id}`, {
    athleteId: `ath_${id}`,
    arenaId: ARENA,
    arenaName: "Arena X",
    courtId: opts.courtId,
    courtName: `Quadra ${opts.courtId.slice(1)}`,
    sport: "beachTennis",
    date: DATE,
    startTime,
    endTime,
    status: "active",
    ...(opts.floating ? {allocationStatus: "unassigned"} : {}),
    ...opts.extra,
  });
  fake.seedDoc(`arenaSlots/slot_${id}`, {
    arenaId: ARENA, courtId: opts.courtId, date: DATE, startTime, endTime, status: "booked", bookingId: id,
  });
  for (const lockId of lockIds(opts.courtId, startTime, endTime)) {
    fake.seedDoc(`arenaSlotLocks/${lockId}`, {
      arenaId: ARENA,
      courtId: opts.courtId,
      date: DATE,
      bookingId: id,
      ...(opts.floating ? {floating: true} : {}),
    });
  }
}

/** Roda o claim dentro de uma transação do fake e grava as travas do "fluxo" como os fluxos gravam. */
async function claimAndWrite(
  fake: FakeFirestore,
  courtId: string,
  startTime: string,
  endTime: string,
  ownBookingId = "new",
) {
  return fake.runTransaction(async (rawTx) => {
    const tx = rawTx as TxReader & TxWriter;
    const refs = lockRefs(fake, courtId, startTime, endTime);
    const claim = await claimCourtLocks(tx, db(fake), {arenaId: ARENA, courtId, lockRefs: refs}, {
      ownBookingId,
      reason: "Aula na quadra",
      nowMs: NOW,
    });
    if (!claim.ok) return claim;
    claim.commit(tx);
    for (const ref of refs) tx.set(ref, {arenaId: ARENA, courtId, date: DATE, bookingId: ownBookingId});
    return claim;
  });
}

describe("floatingCandidateCourts", () => {
  const courts = [
    {id: "c10", data: {name: "Quadra 10", types: ["beachTennis"]}},
    {id: "c2", data: {name: "Quadra 2", types: ["beachTennis"]}},
    {id: "c3", data: {name: "Quadra 3", types: ["beachVolleyball"]}},
    {id: "c4", data: {name: "Quadra 4", status: "maintenance"}},
  ];

  it("sem configuração: todas por nome (numérico), tirando outro esporte e manutenção", () => {
    assert.deepEqual(floatingCandidateCourts({}, courts, "beachTennis", []).map((c) => c.id), ["c2", "c10"]);
  });

  it("com configuração: só as da distribuição, na ordem gravada", () => {
    const arena = {bookingAllocation: {courtIds: ["c10", "c3", "c2", "ghost"]}};
    assert.deepEqual(floatingCandidateCourts(arena, courts, "beachTennis", []).map((c) => c.id), ["c10", "c2"]);
  });

  it("tira as excluídas", () => {
    assert.deepEqual(floatingCandidateCourts({}, courts, "beachTennis", ["c2"]).map((c) => c.id), ["c10"]);
  });
});

describe("claimCourtLocks", () => {
  it("quadra livre: ok, sem deslocamento", async () => {
    const fake = seedArena();
    const claim = await claimAndWrite(fake, "c1", "18:00", "19:00");
    assert.equal(claim.ok, true);
    if (claim.ok) assert.equal(claim.relocations.length, 0);
  });

  it("trava comum de outra reserva continua sendo conflito", async () => {
    const fake = seedArena();
    seedBooking(fake, "fixed", {courtId: "c1"});
    const claim = await claimAndWrite(fake, "c1", "18:00", "19:00");
    assert.deepEqual(claim, {ok: false, blockingBookingIds: ["fixed"]});
    assert.equal(fake.store.get(`arenaSlotLocks/${lockIds("c1", "18:00", "19:00")[0]}`)?.["bookingId"], "fixed");
  });

  it("trava da própria reserva não é conflito", async () => {
    const fake = seedArena();
    seedBooking(fake, "new", {courtId: "c1"});
    const claim = await claimAndWrite(fake, "c1", "18:00", "19:00", "new");
    assert.equal(claim.ok, true);
  });

  it("flutuante é empurrada para a próxima quadra livre, inteira", async () => {
    const fake = seedArena();
    seedBooking(fake, "flo", {courtId: "c1", startTime: "18:00", endTime: "20:00", floating: true});

    // O fluxo quer só as 19h da quadra 1.
    const claim = await claimAndWrite(fake, "c1", "19:00", "20:00");
    assert.equal(claim.ok, true);

    const booking = fake.store.get("arenaBookings/flo");
    assert.equal(booking?.["courtId"], "c2");
    assert.equal(booking?.["courtName"], "Quadra 2");
    assert.equal(booking?.["allocationStatus"], "unassigned");
    const history = booking?.["courtHistory"] as DocData[];
    assert.equal(history[0]?.["by"], SYSTEM_ACTOR);
    assert.equal(history[0]?.["reason"], "Aula na quadra");
    assert.equal(fake.store.get("arenaSlots/slot_flo")?.["courtId"], "c2");

    // As duas horas foram para a quadra 2, ainda flutuantes.
    for (const id of lockIds("c2", "18:00", "20:00")) {
      const lock = fake.store.get(`arenaSlotLocks/${id}`);
      assert.equal(lock?.["bookingId"], "flo");
      assert.equal(lock?.["floating"], true);
    }
    // 18h da quadra 1 ficou livre; 19h é do fluxo.
    assert.equal(fake.store.has(`arenaSlotLocks/${lockIds("c1", "18:00", "19:00")[0]}`), false);
    assert.equal(fake.store.get(`arenaSlotLocks/${lockIds("c1", "19:00", "20:00")[0]}`)?.["bookingId"], "new");
  });

  it("pula quadra ocupada (até por outra flutuante), bloqueada, em manutenção ou de outro esporte", async () => {
    const fake = seedArena(6);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});
    seedBooking(fake, "other", {courtId: "c2"});
    seedBooking(fake, "flo2", {courtId: "c3", floating: true});
    fake.seedDoc("arenaSlots/block4", {
      arenaId: ARENA, courtId: "c4", date: DATE, startTime: "17:00", endTime: "19:00", status: "blocked",
    });
    fake.seedDoc(`arenas/${ARENA}/courts/c5`, {name: "Quadra 5", status: "maintenance"});

    const claim = await claimAndWrite(fake, "c1", "18:00", "19:00");
    assert.equal(claim.ok, true);
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "c6");
    assert.equal(fake.store.get("arenaBookings/flo2")?.["courtId"], "c3");
  });

  it("sem quadra livre para a flutuante: conflito, nada muda", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});
    seedBooking(fake, "other", {courtId: "c2"});

    const claim = await claimAndWrite(fake, "c1", "18:00", "19:00");
    assert.deepEqual(claim, {ok: false, blockingBookingIds: ["flo"]});
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "c1");
    assert.equal(fake.store.get(`arenaSlotLocks/${lockIds("c1", "18:00", "19:00")[0]}`)?.["bookingId"], "flo");
  });

  it("duas flutuantes na mesma disputa vão para quadras diferentes", async () => {
    const fake = seedArena(3);
    seedBooking(fake, "floA", {courtId: "c1", startTime: "18:00", endTime: "19:00", floating: true});
    seedBooking(fake, "floB", {courtId: "c1", startTime: "19:00", endTime: "20:00", floating: true});
    // floB não cabe na quadra 2 às 19h.
    seedBooking(fake, "other", {courtId: "c2", startTime: "19:00", endTime: "20:00"});

    const claim = await claimAndWrite(fake, "c1", "18:00", "20:00");
    assert.equal(claim.ok, true);
    assert.equal(fake.store.get("arenaBookings/floA")?.["courtId"], "c2");
    assert.equal(fake.store.get("arenaBookings/floB")?.["courtId"], "c3");
  });

  it("respeita as quadras da distribuição configurada", async () => {
    const fake = seedArena(3, {bookingAllocation: {mode: "capacity", courtIds: ["c1", "c3"]}});
    seedBooking(fake, "flo", {courtId: "c1", floating: true});
    await claimAndWrite(fake, "c1", "18:00", "19:00");
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "c3");
  });

  it("trava comum + flutuante na mesma disputa: conflito sem mover a flutuante", async () => {
    const fake = seedArena(3);
    seedBooking(fake, "flo", {courtId: "c1", startTime: "18:00", endTime: "19:00", floating: true});
    seedBooking(fake, "fixed", {courtId: "c1", startTime: "19:00", endTime: "20:00"});
    const claim = await claimAndWrite(fake, "c1", "18:00", "20:00");
    assert.deepEqual(claim, {ok: false, blockingBookingIds: ["fixed"]});
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "c1");
  });
});

describe("troca de quadra pelo gestor com reserva flutuante", () => {
  const move = (fake: FakeFirestore, bookingId: string, toCourtId: string) =>
    changeArenaBookingCourtCore(db(fake), "mgr", {bookingId, toCourtId, reason: null}, NOW);

  it("destino com flutuante: ela vai para outra quadra livre", async () => {
    const fake = seedArena(3);
    seedBooking(fake, "a", {courtId: "c1"});
    seedBooking(fake, "flo", {courtId: "c2", floating: true});

    await move(fake, "a", "c2");
    assert.equal(fake.store.get("arenaBookings/a")?.["courtId"], "c2");
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "c3");
    assert.equal(fake.store.get(`arenaSlotLocks/${lockIds("c2", "18:00", "19:00")[0]}`)?.["bookingId"], "a");
    assert.equal(fake.store.get(`arenaSlotLocks/${lockIds("c3", "18:00", "19:00")[0]}`)?.["bookingId"], "flo");
    assert.equal(fake.store.has(`arenaSlotLocks/${lockIds("c1", "18:00", "19:00")[0]}`), false);
  });

  it("só sobra a quadra que a reserva deixa: as duas trocam de lugar", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "a", {courtId: "c1"});
    seedBooking(fake, "flo", {courtId: "c2", floating: true});

    await move(fake, "a", "c2");
    assert.equal(fake.store.get("arenaBookings/a")?.["courtId"], "c2");
    assert.equal(fake.store.get("arenaBookings/flo")?.["courtId"], "c1");
    const c1 = fake.store.get(`arenaSlotLocks/${lockIds("c1", "18:00", "19:00")[0]}`);
    const c2 = fake.store.get(`arenaSlotLocks/${lockIds("c2", "18:00", "19:00")[0]}`);
    assert.equal(c1?.["bookingId"], "flo");
    assert.equal(c1?.["floating"], true);
    assert.equal(c2?.["bookingId"], "a");
  });

  it("gestor definindo a quadra de uma flutuante: vira assigned e a trava para de flutuar", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "flo", {courtId: "c1", floating: true});

    await move(fake, "flo", "c2");
    const booking = fake.store.get("arenaBookings/flo");
    assert.equal(booking?.["courtId"], "c2");
    assert.equal(booking?.["allocationStatus"], "assigned");
    assert.equal(booking?.["allocationSource"], "staff");
    assert.equal(booking?.["allocatedBy"], "mgr");
    const lock = fake.store.get(`arenaSlotLocks/${lockIds("c2", "18:00", "19:00")[0]}`);
    assert.equal(lock?.["bookingId"], "flo");
    assert.equal("floating" in (lock ?? {}), false);
  });

  it("reserva comum trocada continua sem campos de alocação", async () => {
    const fake = seedArena(2);
    seedBooking(fake, "a", {courtId: "c1"});
    await move(fake, "a", "c2");
    assert.equal(fake.store.get("arenaBookings/a")?.["allocationStatus"], undefined);
  });
});
