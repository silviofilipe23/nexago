/**
 * Cartão na reserva: o "a liberar" da arena e o crédito idempotente pelo doc
 * do pagamento (`asaas_processed_payments`), sobre `FakeFirestore`.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  arenaBookingNetReais,
  creditArenaWalletFromBookingPayment,
  holdArenaAwaitingSettlement,
  releaseArenaAwaitingSettlement,
} from "./arena-wallet";

const WALLET = "arenaWallets/arena1";
const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/pay_c1";

function makeDb() {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  const processedRef = db.doc(PROCESSED) as unknown as DocumentReference;
  return {fake, db, processedRef};
}

function ledger(fake: FakeFirestore) {
  return [...fake.store.entries()]
    .filter(([path]) => path.startsWith(`${WALLET}/ledger/`))
    .map(([, data]) => data);
}

const credit = (processedRef: DocumentReference) => ({
  arenaId: "arena1",
  bookingId: "b1",
  paymentId: "pay_c1",
  grossReais: 100,
  platformFeeReais: 8,
  gatewayFeeReais: 3.48,
  processedRef,
});

describe("arenaBookingNetReais", () => {
  it("bruto − taxa da plataforma − taxa do cartão; PIX sem taxa de gateway", () => {
    assert.equal(arenaBookingNetReais({grossReais: 100, platformFeeReais: 8, gatewayFeeReais: 3.48}), 88.52);
    assert.equal(arenaBookingNetReais({grossReais: 100, platformFeeReais: 8}), 92);
  });
});

describe("a liberar da arena", () => {
  it("cartão aprovado soma o líquido previsto uma vez só", async () => {
    const {fake, db, processedRef} = makeDb();
    fake.seedDoc(WALLET, {arenaId: "arena1", availableReais: 10, pendingReais: 0});

    assert.equal(await holdArenaAwaitingSettlement(db, processedRef, {arenaId: "arena1", netReais: 88.52}), true);
    assert.equal(await holdArenaAwaitingSettlement(db, processedRef, {arenaId: "arena1", netReais: 88.52}), false);

    assert.equal(fake.store.get(WALLET)?.awaitingSettlementReais, 88.52);
    assert.equal(fake.store.get(WALLET)?.availableReais, 10, "disponível intocado");
  });

  it("estorno antes da liquidação tira do a liberar", async () => {
    const {fake, db, processedRef} = makeDb();
    await holdArenaAwaitingSettlement(db, processedRef, {arenaId: "arena1", netReais: 50});

    assert.equal(await releaseArenaAwaitingSettlement(db, processedRef, "REFUNDED"), 50);
    assert.equal(await releaseArenaAwaitingSettlement(db, processedRef, "REFUNDED"), 0);
    assert.equal(fake.store.get(WALLET)?.awaitingSettlementReais, 0);
  });

  it("carteira nova nasce com os saldos zerados", async () => {
    const {fake, db, processedRef} = makeDb();
    await holdArenaAwaitingSettlement(db, processedRef, {arenaId: "arena1", netReais: 20});
    const wallet = fake.store.get(WALLET) ?? {};
    assert.equal(wallet.availableReais, 0);
    assert.equal(wallet.pendingReais, 0);
  });
});

describe("creditArenaWalletFromBookingPayment", () => {
  it("credita o líquido com a taxa do cartão e abate o a liberar no mesmo lançamento", async () => {
    const {fake, db, processedRef} = makeDb();
    fake.seedDoc(WALLET, {arenaId: "arena1", availableReais: 10, pendingReais: 0});
    await holdArenaAwaitingSettlement(db, processedRef, {arenaId: "arena1", netReais: 88.52});

    assert.equal(await creditArenaWalletFromBookingPayment(db, credit(processedRef)), true);

    const wallet = fake.store.get(WALLET) ?? {};
    assert.equal(wallet.availableReais, 98.52);
    assert.equal(wallet.awaitingSettlementReais, 0);
    const entries = ledger(fake);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.gatewayFeeReais, 3.48);
    assert.equal(entries[0]!.netReais, 88.52);
    assert.equal(entries[0]!.asaasPaymentId, "pay_c1");
    assert.ok(fake.store.get(PROCESSED)?.walletCreditedAt);
  });

  it("reentrega do RECEIVED não credita de novo", async () => {
    const {fake, db, processedRef} = makeDb();

    await creditArenaWalletFromBookingPayment(db, credit(processedRef));
    assert.equal(await creditArenaWalletFromBookingPayment(db, credit(processedRef)), false);

    assert.equal(fake.store.get(WALLET)?.availableReais, 88.52);
    assert.equal(ledger(fake).length, 1);
  });

  it("crédito já feito não volta para o a liberar", async () => {
    const {fake, db, processedRef} = makeDb();
    await creditArenaWalletFromBookingPayment(db, credit(processedRef));

    assert.equal(await holdArenaAwaitingSettlement(db, processedRef, {arenaId: "arena1", netReais: 88.52}), false);
    assert.equal(fake.store.get(WALLET)?.awaitingSettlementReais ?? 0, 0);
  });
});
