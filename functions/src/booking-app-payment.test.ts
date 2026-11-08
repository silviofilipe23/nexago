import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {
  bookingAppPaymentInputsChanged,
  bookingAppPaymentPatch,
  computeBookingAppPayment,
  isBookingAppPaymentConfirmed,
  recordArenaBookingAppPaymentReversal,
  syncBookingAppPayment,
} from "./booking-app-payment";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const PRICING = {amountReais: 120, weatherCreditReais: 0};

function booking(over: DocData = {}): DocData {
  return {status: "confirmed", amountReais: 120, amountPaidOnlineReais: 0, ...over};
}

describe("computeBookingAppPayment", () => {
  it("metade paga pelo app (sinal de 50%) libera; abaixo disso não", () => {
    const half = computeBookingAppPayment(booking({amountPaidOnlineReais: 60}), PRICING);
    assert.deepEqual(half, {appPaidReais: 60, totalReais: 120, appPaidShare: 0.5, socialUnlocked: true});
    assert.equal(computeBookingAppPayment(booking({amountPaidOnlineReais: 59.98}), PRICING).socialUnlocked, true);
    assert.equal(computeBookingAppPayment(booking({amountPaidOnlineReais: 59.9}), PRICING).socialUnlocked, false);
  });

  it("pagamento na arena (nada online) fica bloqueado", () => {
    const onsite = computeBookingAppPayment(booking({status: "active", paymentChannel: "onsite"}), PRICING);
    assert.equal(onsite.socialUnlocked, false);
    assert.equal(onsite.appPaidShare, 0);
  });

  it("vale o preço do servidor, não o amountReais do doc", () => {
    const tampered = booking({amountReais: 2, amountPaidOnlineReais: 2});
    assert.equal(computeBookingAppPayment(tampered, PRICING).socialUnlocked, false);
    // Reserva legada sem doc de preço cai no doc.
    assert.equal(computeBookingAppPayment(tampered, null).socialUnlocked, true);
  });

  it("crédito de chuva conta como pago pelo app", () => {
    const r = computeBookingAppPayment(
      booking({amountPaidOnlineReais: 20}),
      {amountReais: 120, weatherCreditReais: 40},
    );
    assert.equal(r.appPaidReais, 60);
    assert.equal(r.socialUnlocked, true);
  });

  it("cancelada ou esperando o Pix conta zero", () => {
    for (const status of ["canceled", "cancelled", "pending_payment"]) {
      const r = computeBookingAppPayment(booking({status, amountPaidOnlineReais: 120}), PRICING);
      assert.equal(r.appPaidReais, 0, status);
      assert.equal(r.socialUnlocked, false, status);
    }
  });

  it("estorno sai do pago e pode tirar a liberação", () => {
    const r = computeBookingAppPayment(booking({
      amountPaidOnlineReais: 90,
      appPaymentReversals: {pay_a: {amountReais: 40}},
    }), PRICING);
    assert.equal(r.appPaidReais, 50);
    assert.equal(r.socialUnlocked, false);
  });

  it("isBookingAppPaymentConfirmed: qualquer valor pago pelo app numa reserva de pé", () => {
    assert.equal(isBookingAppPaymentConfirmed(booking({amountPaidOnlineReais: 10})), true);
    assert.equal(isBookingAppPaymentConfirmed(booking()), false);
    assert.equal(isBookingAppPaymentConfirmed(booking({status: "canceled", amountPaidOnlineReais: 10})), false);
  });
});

describe("bookingAppPaymentPatch e gatilho", () => {
  it("reserva sem nada pago e sem campo não ganha escrita", () => {
    assert.equal(bookingAppPaymentPatch(booking(), computeBookingAppPayment(booking(), PRICING)), null);
  });

  it("só reescreve o que mudou", () => {
    const paid = booking({amountPaidOnlineReais: 120});
    const computed = computeBookingAppPayment(paid, PRICING);
    const derived = {appPaidReais: 120, appPaidShare: 1, socialUnlocked: true};
    assert.deepEqual(bookingAppPaymentPatch(paid, computed), derived);
    assert.equal(bookingAppPaymentPatch({...paid, ...derived}, computed), null);
  });

  it("só recalcula quando muda status, pago, crédito, estorno ou valor", () => {
    const b = booking({amountPaidOnlineReais: 60});
    assert.equal(bookingAppPaymentInputsChanged(undefined, b), true);
    assert.equal(bookingAppPaymentInputsChanged(b, {...b, attendanceStatus: "checked_in"}), false);
    assert.equal(bookingAppPaymentInputsChanged(b, {...b, amountPaidOnlineReais: 120}), true);
    assert.equal(bookingAppPaymentInputsChanged(b, {...b, appPaymentReversals: {p: {amountReais: 1}}}), true);
  });

  it("divisão: libera sozinho quando as fatias pagas somam metade", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookingPricing/bk1", {amountReais: 120});
    fake.seedDoc("arenaBookings/bk1", booking({paymentStatus: "split_pending", amountPaidOnlineReais: 30}));
    assert.equal(await syncBookingAppPayment(db(fake), "bk1") === null, false);
    assert.equal(fake.store.get("arenaBookings/bk1")!["socialUnlocked"], false);

    fake.seedDoc("arenaBookings/bk1", {...fake.store.get("arenaBookings/bk1")!, amountPaidOnlineReais: 60});
    await syncBookingAppPayment(db(fake), "bk1");
    const doc = fake.store.get("arenaBookings/bk1")!;
    assert.equal(doc["socialUnlocked"], true);
    assert.equal(doc["appPaidShare"], 0.5);
    // Segunda passada (o próprio update do gatilho) não escreve de novo.
    assert.equal(await syncBookingAppPayment(db(fake), "bk1"), null);
  });

  it("cancelamento tira a liberação", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookingPricing/bk1", {amountReais: 120});
    fake.seedDoc("arenaBookings/bk1", booking({
      status: "canceled", amountPaidOnlineReais: 120, appPaidReais: 120, appPaidShare: 1, socialUnlocked: true,
    }));
    await syncBookingAppPayment(db(fake), "bk1");
    const doc = fake.store.get("arenaBookings/bk1")!;
    assert.equal(doc["socialUnlocked"], false);
    assert.equal(doc["appPaidReais"], 0);
  });
});

describe("recordArenaBookingAppPaymentReversal", () => {
  it("estorno da cobrança da reserva registra o valor pago uma vez só", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking({asaasPaymentId: "pay_1", amountPaidOnlineReais: 120}));
    assert.equal(await recordArenaBookingAppPaymentReversal(db(fake), "pay_1", "arenaBooking:bk1"), true);
    assert.equal(await recordArenaBookingAppPaymentReversal(db(fake), "pay_1", "arenaBooking:bk1"), false);
    const reversals = fake.store.get("arenaBookings/bk1")!["appPaymentReversals"] as Record<string, DocData>;
    assert.equal(reversals["pay_1"]["amountReais"], 120);
    await syncBookingAppPayment(db(fake), "bk1");
    assert.equal(fake.store.get("arenaBookings/bk1")!["socialUnlocked"] === true, false);
  });

  it("cobrança velha (substituída) não mexe na reserva", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/bk1", booking({asaasPaymentId: "pay_2", amountPaidOnlineReais: 120}));
    assert.equal(await recordArenaBookingAppPaymentReversal(db(fake), "pay_old", "arenaBooking:bk1"), false);
    assert.equal(fake.store.get("arenaBookings/bk1")!["appPaymentReversals"], undefined);
  });

  it("estorno de uma fatia paga tira só a parte dela", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookingPricing/bk1", {amountReais: 120});
    fake.seedDoc("arenaBookings/bk1", booking({hasSplitShares: true, amountPaidOnlineReais: 90}));
    fake.seedDoc("arenaBookings/bk1/paymentShares/s1", {status: "paid", asaasPaymentId: "pay_s1", asaasPaidAmount: 40});
    assert.equal(await recordArenaBookingAppPaymentReversal(db(fake), "pay_s1", "arenaBookingShare:bk1:s1"), true);
    await syncBookingAppPayment(db(fake), "bk1");
    const doc = fake.store.get("arenaBookings/bk1")!;
    assert.equal(doc["appPaidReais"], 50);
    assert.equal(doc["socialUnlocked"], false);
  });

  it("referência de outra coisa é ignorada", async () => {
    const fake = new FakeFirestore();
    assert.equal(await recordArenaBookingAppPaymentReversal(db(fake), "pay_x", "storeOrder:abc"), false);
  });
});
