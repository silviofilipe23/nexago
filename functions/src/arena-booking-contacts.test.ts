import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {bookingPlayerUids, getArenaBookingContactsCore} from "./arena-booking-contacts";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava ${code}, veio ${err.code}`);
    return true;
  });
}

function seed(): FakeFirestore {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/arena1", {managerUserId: "owner", name: "Arena Sol", planTier: "pro", planStatus: "active"});
  fake.seedDoc("arenas/arena1/staff/rec", {status: "active", role: "recepcao"});
  fake.seedDoc("arenas/arena1/staff/man", {status: "active", role: "manutencao"});
  fake.seedDoc("arenas/arena1/staff/fin", {status: "active", role: "financeiro"});
  fake.seedDoc("arenas/arena2", {managerUserId: "other"});
  fake.seedDoc("users/u1", {fullName: "Rafael Moura", phoneNumber: "(62) 98241-5530", email: "r@x.com"});
  fake.seedDoc("users/u2", {fullName: "Bia", phoneNumber: "+55 62 99999-0000"});
  fake.seedDoc("users/u3", {fullName: "Sem Telefone"});
  fake.seedDoc("users/u4", {fullName: "Telefone curto", phoneNumber: "1234"});
  fake.seedDoc("arenaBookings/b1", {
    arenaId: "arena1",
    athleteId: "u1",
    participants: [{uid: "u2", name: "Bia"}, {uid: "u3", name: "Sem"}, {uid: "u4"}, {uid: "u2"}, null],
  });
  fake.seedDoc("arenaBookings/walkin", {arenaId: "arena1", customerName: "Balcão"});
  fake.seedDoc("arenaBookings/foreign", {arenaId: "arena2", athleteId: "u1"});
  return fake;
}

describe("bookingPlayerUids", () => {
  it("dono primeiro, convidados depois, sem repetir nem lixo", () => {
    assert.deepEqual(bookingPlayerUids({athleteId: "u1", participants: [{uid: "u2"}, {uid: "u1"}, {uid: " "}, "x", null]}), ["u1", "u2"]);
    assert.deepEqual(bookingPlayerUids({}), []);
  });
});

describe("getArenaBookingContactsCore", () => {
  it("devolve só o WhatsApp de quem tem telefone válido, pronto pro wa.me", async () => {
    const out = await getArenaBookingContactsCore(db(seed()), "owner", {bookingId: "b1"});
    assert.deepEqual(out, {
      contacts: [
        {uid: "u1", whatsapp: "5562982415530"},
        {uid: "u2", whatsapp: "5562999990000"},
      ],
    });
  });

  it("recepção e manutenção (leem a agenda) podem; financeiro não", async () => {
    assert.equal((await getArenaBookingContactsCore(db(seed()), "rec", {bookingId: "b1"})).contacts.length, 2);
    assert.equal((await getArenaBookingContactsCore(db(seed()), "man", {bookingId: "b1"})).contacts.length, 2);
    await rejectsWith(getArenaBookingContactsCore(db(seed()), "fin", {bookingId: "b1"}), "permission-denied");
  });

  it("quem não é da arena da reserva não vê nada", async () => {
    await rejectsWith(getArenaBookingContactsCore(db(seed()), "stranger", {bookingId: "b1"}), "permission-denied");
    await rejectsWith(getArenaBookingContactsCore(db(seed()), "owner", {bookingId: "foreign"}), "permission-denied");
  });

  it("reserva de balcão (sem atleta) volta vazia; entrada inválida e reserva inexistente falham", async () => {
    assert.deepEqual(await getArenaBookingContactsCore(db(seed()), "owner", {bookingId: "walkin"}), {contacts: []});
    await rejectsWith(getArenaBookingContactsCore(db(seed()), "owner", {}), "invalid-argument");
    await rejectsWith(getArenaBookingContactsCore(db(seed()), "owner", {bookingId: "nope"}), "not-found");
  });
});
