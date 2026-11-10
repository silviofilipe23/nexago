import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_BOOKING_ALLOCATION,
  OUTDATED_CLIENT_MESSAGE,
  neighborWindows,
  rankCapacityCourts,
  takeFirstFreeCourt,
  parseSetBookingAllocationInput,
  readBookingAllocation,
  resolveAllocationRequest,
  setArenaBookingAllocationCore,
  sportsMissingPrice,
  withCapacityPrice,
  type BookingAllocation,
} from "./arena-booking-allocation";

const CAPACITY: BookingAllocation = {
  mode: "capacity",
  courtIds: ["c1", "c2"],
  priceBySport: {beachTennis: 120},
  revealBeforeArrival: false,
  allowCourtChoice: false,
};

describe("readBookingAllocation", () => {
  it("ausente ou modo court = padrão", () => {
    assert.deepEqual(readBookingAllocation(undefined), DEFAULT_BOOKING_ALLOCATION);
    assert.deepEqual(readBookingAllocation({bookingAllocation: {mode: "court", courtIds: ["c1"]}}), DEFAULT_BOOKING_ALLOCATION);
  });

  it("modo capacity lê quadras, preços válidos e opções", () => {
    const read = readBookingAllocation({bookingAllocation: {
      mode: "capacity", courtIds: ["c1", " ", "c2"], priceBySport: {beachTennis: 120, padel: 0, x: "a"},
      revealBeforeArrival: true, allowCourtChoice: true,
    }});
    assert.deepEqual(read, {
      mode: "capacity", courtIds: ["c1", "c2"], priceBySport: {beachTennis: 120},
      revealBeforeArrival: true, allowCourtChoice: true,
    });
  });
});

describe("resolveAllocationRequest", () => {
  it("arena court: sempre quadra escolhida", () => {
    assert.deepEqual(resolveAllocationRequest(DEFAULT_BOOKING_ALLOCATION, {courtId: "c1"}), {kind: "court"});
    assert.deepEqual(resolveAllocationRequest(DEFAULT_BOOKING_ALLOCATION, {courtId: "c1", allocation: "capacity"}), {kind: "court"});
  });

  it("arena capacity + cliente novo sem quadra: flutuante", () => {
    assert.deepEqual(resolveAllocationRequest(CAPACITY, {allocation: "capacity"}), {kind: "floating"});
  });

  it("arena capacity + app antigo (manda quadra, não manda allocation): atualize o app", () => {
    assert.throws(() => resolveAllocationRequest(CAPACITY, {courtId: "c1"}), {message: OUTDATED_CLIENT_MESSAGE});
    assert.throws(() => resolveAllocationRequest(CAPACITY, {}), {message: OUTDATED_CLIENT_MESSAGE});
  });

  it("arena capacity + cliente novo escolhendo quadra sem modo misto: recusa", () => {
    assert.throws(
      () => resolveAllocationRequest(CAPACITY, {courtId: "c1", allocation: "capacity"}),
      /definida pela equipe/,
    );
  });

  it("modo misto: escolher quadra vale até para app antigo", () => {
    const mixed = {...CAPACITY, allowCourtChoice: true};
    assert.deepEqual(resolveAllocationRequest(mixed, {courtId: "c1"}), {kind: "court"});
    assert.deepEqual(resolveAllocationRequest(mixed, {allocation: "capacity"}), {kind: "floating"});
  });
});

describe("withCapacityPrice", () => {
  it("troca o preço da quadra pelo do horário do esporte", () => {
    const out = withCapacityPrice({name: "Quadra 1", basePricePerHourReais: 90}, CAPACITY, "beachTennis");
    assert.equal(out?.["basePricePerHourReais"], 120);
    assert.equal(out?.["name"], "Quadra 1");
  });

  it("esporte sem preço recusa", () => {
    assert.throws(() => withCapacityPrice({}, CAPACITY, "padel"), /preço do horário/);
    assert.throws(() => withCapacityPrice({}, CAPACITY, null), /preço do horário/);
  });
});

describe("parseSetBookingAllocationInput", () => {
  it("normaliza esporte, arredonda preço e tira quadra repetida", () => {
    const parsed = parseSetBookingAllocationInput({
      arenaId: "a1", mode: "capacity", courtIds: ["c1", "c1", "c2"],
      priceBySport: {"Beach Tennis": 119.999}, revealBeforeArrival: true,
    });
    assert.deepEqual(parsed.courtIds, ["c1", "c2"]);
    assert.deepEqual(parsed.priceBySport, {beachTennis: 120});
    assert.equal(parsed.revealBeforeArrival, true);
    assert.equal(parsed.allowCourtChoice, false);
  });

  it("recusa modo, esporte e preço inválidos", () => {
    assert.throws(() => parseSetBookingAllocationInput({arenaId: "a1", mode: "x"}), /Modo inválido/);
    assert.throws(() => parseSetBookingAllocationInput({arenaId: "a1", mode: "capacity", priceBySport: {xadrez: 10}}), /Esporte inválido/);
    assert.throws(() => parseSetBookingAllocationInput({arenaId: "a1", mode: "capacity", priceBySport: {beachTennis: 0}}), /Preço do horário inválido/);
  });
});

describe("sportsMissingPrice", () => {
  it("lista os esportes das quadras sem preço", () => {
    const courts = [{types: ["beachTennis"]}, {types: ["beachTennis", "beachVolleyball"]}];
    assert.deepEqual(sportsMissingPrice(courts, {beachTennis: 100}), ["beachVolleyball"]);
    assert.deepEqual(sportsMissingPrice(courts, {beachTennis: 100, beachVolleyball: 90}), []);
  });
});

describe("setArenaBookingAllocationCore", () => {
  function seed(): FakeFirestore {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {name: "Arena", managerUserId: "mgr"});
    fake.seedDoc("arenas/a1/courts/c1", {name: "Quadra 1", types: ["beachTennis"]});
    fake.seedDoc("arenas/a1/courts/c2", {name: "Quadra 2", types: ["beachVolleyball"]});
    return fake;
  }
  const db = (fake: FakeFirestore) => fake as unknown as Firestore;
  const input = (over = {}) => ({
    arenaId: "a1", mode: "capacity" as const, courtIds: ["c1"], priceBySport: {beachTennis: 120},
    revealBeforeArrival: false, allowCourtChoice: false, ...over,
  });

  it("liga o modo capacidade com quadras e preços", async () => {
    const fake = seed();
    assert.deepEqual(await setArenaBookingAllocationCore(db(fake), "mgr", input()), {mode: "capacity"});
    const saved = fake.store.get("arenas/a1")?.["bookingAllocation"] as Record<string, unknown>;
    assert.equal(saved["mode"], "capacity");
    assert.deepEqual(saved["courtIds"], ["c1"]);
    assert.deepEqual(saved["priceBySport"], {beachTennis: 120});
    assert.equal(saved["updatedBy"], "mgr");
    assert.deepEqual(readBookingAllocation(fake.store.get("arenas/a1")).courtIds, ["c1"]);
  });

  it("esporte de quadra sem preço, quadra inexistente ou nenhuma quadra recusam", async () => {
    const fake = seed();
    await assert.rejects(setArenaBookingAllocationCore(db(fake), "mgr", input({courtIds: ["c1", "c2"]})), /todos os esportes/);
    await assert.rejects(setArenaBookingAllocationCore(db(fake), "mgr", input({courtIds: ["nope"]})), /não existe/);
    await assert.rejects(setArenaBookingAllocationCore(db(fake), "mgr", input({courtIds: []})), /ao menos uma quadra/);
  });

  it("voltar ao modo court guarda o resto da configuração", async () => {
    const fake = seed();
    await setArenaBookingAllocationCore(db(fake), "mgr", input());
    await setArenaBookingAllocationCore(db(fake), "mgr", input({mode: "court"}));
    const saved = fake.store.get("arenas/a1")?.["bookingAllocation"] as Record<string, unknown>;
    assert.equal(saved["mode"], "court");
    assert.deepEqual(saved["courtIds"], ["c1"]);
    assert.equal(readBookingAllocation(fake.store.get("arenas/a1")).mode, "court");
  });

  it("quem não tem escrita em quadras é recusado", async () => {
    const fake = seed();
    await assert.rejects(setArenaBookingAllocationCore(db(fake), "estranho", input()), /não tem acesso/);
  });
});

describe("neighborWindows", () => {
  it("hora antes e hora depois", () => {
    assert.deepEqual(neighborWindows("18:00", "20:00"), [
      {startTime: "17:00", endTime: "18:00"},
      {startTime: "20:00", endTime: "21:00"},
    ]);
  });
  it("sem vizinha antes da meia-noite / depois das 23h", () => {
    assert.deepEqual(neighborWindows("00:00", "01:00"), [{startTime: "01:00", endTime: "02:00"}]);
    assert.deepEqual(neighborWindows("23:00", "00:00"), [{startTime: "22:00", endTime: "23:00"}]);
  });
});

describe("rankCapacityCourts / takeFirstFreeCourt", () => {
  const DATE = "2026-08-05";
  function seed(): FakeFirestore {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {name: "Arena", managerUserId: "mgr", bookingAllocation: {
      mode: "capacity", courtIds: ["c1", "c2", "c3", "c4"], priceBySport: {beachTennis: 120},
    }});
    for (const id of ["c1", "c2", "c3", "c4"]) {
      fake.seedDoc(`arenas/a1/courts/${id}`, {name: `Quadra ${id.slice(1)}`, types: ["beachTennis"]});
    }
    return fake;
  }
  const lock = (fake: FakeFirestore, court: string, hour: string, extra = {}) =>
    fake.seedDoc(`arenaSlotLocks/a1_${court}_${DATE}_h${hour}`, {bookingId: `b_${court}_${hour}`, ...extra});
  const rank = (fake: FakeFirestore) => rankCapacityCourts(fake as unknown as Firestore, {
    arenaId: "a1", arenaData: fake.store.get("arenas/a1"), sport: "beachTennis",
    dateKey: DATE, startTime: "19:00", endTime: "20:00",
  });

  it("encostada numa reserva vem primeiro; ocupada ou bloqueada sai", async () => {
    const fake = seed();
    lock(fake, "c1", "19"); // ocupada no horário
    lock(fake, "c3", "20"); // encosta depois
    fake.seedDoc("arenaSlots/blk", {arenaId: "a1", courtId: "c4", date: DATE, startTime: "19:00", endTime: "20:00", status: "blocked"});
    assert.deepEqual((await rank(fake)).map((c) => c.id), ["c3", "c2"]);
  });

  it("empate segue a ordem da distribuição", async () => {
    const fake = seed();
    assert.deepEqual((await rank(fake)).map((c) => c.id), ["c1", "c2", "c3", "c4"]);
  });

  it("flutuante já existente ocupa a quadra para a nova", async () => {
    const fake = seed();
    lock(fake, "c1", "19", {floating: true});
    assert.equal((await rank(fake))[0]?.id, "c2");
  });

  it("na transação pega a primeira ainda livre; todas tomadas = null", async () => {
    const fake = seed();
    const courts = await rank(fake);
    lock(fake, "c1", "19"); // tomada entre o ranking e a transação
    const db = fake as unknown as Firestore;
    const params = {arenaId: "a1", dateKey: DATE, startTime: "19:00", endTime: "20:00"};
    const picked = await fake.runTransaction((tx) => takeFirstFreeCourt(tx as never, db, courts, params));
    assert.equal(picked?.court.id, "c2");
    assert.equal(picked?.lockRefs[0]?.path, `arenaSlotLocks/a1_c2_${DATE}_h19`);
    for (const id of ["c2", "c3", "c4"]) lock(fake, id, "19");
    assert.equal(await fake.runTransaction((tx) => takeFirstFreeCourt(tx as never, db, courts, params)), null);
  });
});
