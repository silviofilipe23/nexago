import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {
  bookingSocialInputsChanged,
  bookingSocialUnlock,
  bookingSocialUnlockPatch,
  recordArenaBookingAppPaymentReversal,
  syncBookingSocialUnlock,
} from "./booking-app-payment";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function booking(over: DocData = {}): DocData {
  return {status: "confirmed", amountReais: 120, amountPaidOnlineReais: 0, ...over};
}

describe("bookingSocialUnlock (sobre a regra única de arena-booking-app-payment)", () => {
  it("metade paga pelo app (sinal de 50%) libera; abaixo disso não", () => {
    assert.deepEqual(bookingSocialUnlock(booking({amountPaidOnlineReais: 60})), {
      appPaidReais: 60, totalReais: 120, appPaidShare: 0.5, socialUnlocked: true,
    });
    assert.equal(bookingSocialUnlock(booking({amountPaidOnlineReais: 59.98})).socialUnlocked, true);
    assert.equal(bookingSocialUnlock(booking({amountPaidOnlineReais: 59.9})).socialUnlocked, false);
  });

  it("pagamento na arena (nada online) fica bloqueado", () => {
    const onsite = bookingSocialUnlock(booking({status: "active", paymentChannel: "onsite"}));
    assert.equal(onsite.socialUnlocked, false);
    assert.equal(onsite.appPaidShare, 0);
  });

  it("cancelada ou estornada conta zero", () => {
    for (const over of [{status: "canceled"}, {status: "cancelled"}, {paymentStatus: "refunded"}]) {
      const r = bookingSocialUnlock(booking({amountPaidOnlineReais: 120, ...over}));
      assert.equal(r.appPaidReais, 0, JSON.stringify(over));
      assert.equal(r.socialUnlocked, false, JSON.stringify(over));
    }
  });
});

describe("bookingSocialUnlockPatch e gatilho", () => {
  it("reserva sem nada pago e sem campo não ganha escrita", () => {
    assert.equal(bookingSocialUnlockPatch(booking(), bookingSocialUnlock(booking())), null);
  });

  it("só reescreve o que mudou", () => {
    const paid = booking({amountPaidOnlineReais: 120});
    const computed = bookingSocialUnlock(paid);
    const derived = {appPaidReais: 120, appPaidShare: 1, socialUnlocked: true};
    assert.deepEqual(bookingSocialUnlockPatch(paid, computed), derived);
    assert.equal(bookingSocialUnlockPatch({...paid, ...derived}, computed), null);
  });

  it("só recalcula quando muda o que a regra lê", () => {
    const b = booking({amountPaidOnlineReais: 60});
    assert.equal(bookingSocialInputsChanged(undefined, b), true);
    assert.equal(bookingSocialInputsChanged(b, {...b, attendanceStatus: "checked_in"}), false);
    assert.equal(bookingSocialInputsChanged(b, {...b, amountPaidOnlineReais: 120}), true);
    assert.equal(bookingSocialInputsChanged(b, {...b, paymentStatus: "refunded"}), true);
  });

  it("divisão: libera sozinho quando as fatias pagas somam metade", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking({paymentStatus: "split_pending", amountPaidOnlineReais: 30}));
    assert.notEqual(await syncBookingSocialUnlock(db(fake), "bk1"), null);
    assert.equal(fake.store.get("arenaBookings/bk1")!["socialUnlocked"], false);

    fake.seedDoc("arenaBookings/bk1", {...fake.store.get("arenaBookings/bk1")!, amountPaidOnlineReais: 60});
    await syncBookingSocialUnlock(db(fake), "bk1");
    const doc = fake.store.get("arenaBookings/bk1")!;
    assert.equal(doc["socialUnlocked"], true);
    assert.equal(doc["appPaidShare"], 0.5);
    // Segunda passada (o próprio update do gatilho) não escreve de novo.
    assert.equal(await syncBookingSocialUnlock(db(fake), "bk1"), null);
  });

  it("cancelamento tira a liberação", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking({
      status: "canceled", amountPaidOnlineReais: 120, appPaidReais: 120, appPaidShare: 1, socialUnlocked: true,
    }));
    await syncBookingSocialUnlock(db(fake), "bk1");
    const doc = fake.store.get("arenaBookings/bk1")!;
    assert.equal(doc["socialUnlocked"], false);
    assert.equal(doc["appPaidReais"], 0);
  });
});

describe("recordArenaBookingAppPaymentReversal", () => {
  it("estorno da cobrança da reserva desconta o pago uma vez só e tira a liberação", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking({asaasPaymentId: "pay_1", amountPaidOnlineReais: 120}));
    assert.equal(await recordArenaBookingAppPaymentReversal(db(fake), "pay_1", "arenaBooking:bk1"), true);
    assert.equal(await recordArenaBookingAppPaymentReversal(db(fake), "pay_1", "arenaBooking:bk1"), false);
    const doc = fake.store.get("arenaBookings/bk1")!;
    assert.equal(doc["amountPaidOnlineReais"], 0);
    assert.equal((doc["appPaymentReversals"] as Record<string, DocData>)["pay_1"]["amountReais"], 120);
    await syncBookingSocialUnlock(db(fake), "bk1");
    assert.notEqual(fake.store.get("arenaBookings/bk1")!["socialUnlocked"], true);
  });

  it("cobrança velha (substituída) não mexe na reserva", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking({asaasPaymentId: "pay_2", amountPaidOnlineReais: 120}));
    assert.equal(await recordArenaBookingAppPaymentReversal(db(fake), "pay_old", "arenaBooking:bk1"), false);
    assert.equal(fake.store.get("arenaBookings/bk1")!["amountPaidOnlineReais"], 120);
  });

  it("estorno de uma fatia paga tira só a parte dela", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking({hasSplitShares: true, amountPaidOnlineReais: 90}));
    fake.seedDoc("arenaBookings/bk1/paymentShares/s1", {status: "paid", asaasPaymentId: "pay_s1", asaasPaidAmount: 40});
    assert.equal(await recordArenaBookingAppPaymentReversal(db(fake), "pay_s1", "arenaBookingShare:bk1:s1"), true);
    await syncBookingSocialUnlock(db(fake), "bk1");
    const doc = fake.store.get("arenaBookings/bk1")!;
    assert.equal(doc["amountPaidOnlineReais"], 50);
    assert.equal(doc["appPaidReais"], 50);
    assert.equal(doc["socialUnlocked"], false);
  });

  it("referência de outra coisa é ignorada", async () => {
    const fake = new FakeFirestore();
    assert.equal(await recordArenaBookingAppPaymentReversal(db(fake), "pay_x", "storeOrder:abc"), false);
  });
});
