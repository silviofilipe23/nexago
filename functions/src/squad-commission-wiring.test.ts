/**
 * Fiação da comissão do Squad no pagamento real: passa pelo processador do webhook do Asaas
 * (`processTournamentRegistrationAsaasNotification`), não só pelas funções do ciclo.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {processTournamentRegistrationAsaasNotification} from "./asaas-tournament-registration-webhook";
import {cancelRegistrationCommissions, recordCommissionForCharge} from "./squad-commission-lifecycle";
import type {ResolvedAttribution} from "./squad-attribution";

process.env.GCLOUD_PROJECT = "p";

const REG_PATH = "artifacts/p/public/data/inscriptions/reg1";
const PENDING_A = `${REG_PATH}/pixPending/uidA`;
const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/pay1";
const COMMISSION = "squadCommissions/reg1_uidA";
const NOW = new Date("2026-10-17T15:00:00Z");

const JOAO: ResolvedAttribution = {
  ambassador: {uid: "jv", displayName: "João Victor", tier: "amb", code: "JOAO10", commissionPct: 10, followerDiscountPct: 10, rulesVersion: 2},
  origin: "code",
};

const deps = {cancelCharge: async () => undefined};

async function setup(overrides: Record<string, unknown> = {}) {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  fake.seedDoc("users/uidA", {fullName: "Lucas Martins"});
  fake.seedDoc("users/uidB", {fullName: "Ana Paula"});
  fake.seedDoc("tournaments/t1", {name: "Copa Teste", categories: [{categoryName: "Masculina A", entryFee: 100}]});
  fake.seedDoc(REG_PATH, {
    tournamentId: "t1",
    categoryId: "Masculina A",
    player1Id: "uidA",
    participantUids: ["uidA", "uidB"],
    sharePaidUids: [],
    paidAmount: 0,
    isPaid: false,
    ...overrides,
  });
  fake.seedDoc(PENDING_A, {status: "pending", amountType: "full", asaasPaymentId: "pay1", payerUid: "uidA"});
  await recordCommissionForCharge(db, {
    attribution: JOAO,
    registrationId: "reg1",
    tournamentId: "t1",
    tournamentName: "Copa Teste",
    categoryName: "Masculina A",
    teamName: null,
    paymentId: "pay1",
    payerUid: "uidA",
    convertedUids: ["uidA", "uidB"],
    grossCents: 100_00,
  }, NOW);
  return {fake, db, processedRef: db.doc(PROCESSED) as DocumentReference};
}

const payment = {status: "RECEIVED", value: 100, netValue: 99.01, externalReference: "tournamentRegistration:reg1:uidA"};

describe("comissão do Squad no webhook do Asaas", () => {
  it("a cobrança cria a pendente com o rótulo da dupla paga inteira", async () => {
    const {fake} = await setup();
    const c = fake.store.get(COMMISSION)!;
    assert.equal(c["status"], "pending");
    assert.equal(c["convertedLabel"], "Lucas M. + 1 atl.");
    assert.deepEqual(c["convertedAthleteIds"], ["uidA", "uidB"]);
    assert.equal(c["amountCents"], 10_00);
  });

  it("PIX recebido confirma a inscrição e libera a comissão com o líquido do Asaas", async () => {
    const {fake, db, processedRef} = await setup();
    await processTournamentRegistrationAsaasNotification(db, "pay1", payment, processedRef, deps);
    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    const c = fake.store.get(COMMISSION)!;
    assert.equal(c["status"], "released");
    assert.equal(c["netCents"], 99_01);
    assert.equal(c["feeCents"], 99);
    assert.equal(c["amountCents"], 9_90);

    // Reentrega do mesmo webhook: nada muda.
    await processTournamentRegistrationAsaasNotification(db, "pay1", payment, processedRef, deps);
    assert.equal((fake.store.get(COMMISSION)!["timeline"] as unknown[]).length, 2);
  });

  it("PIX vencido antes de pagar cancela como pagamento não concluído", async () => {
    const {fake, db, processedRef} = await setup();
    await processTournamentRegistrationAsaasNotification(db, "pay1", {...payment, status: "OVERDUE"}, processedRef, deps);
    const c = fake.store.get(COMMISSION)!;
    assert.equal(c["status"], "canceled");
    assert.equal(c["cancelReason"], "payment_failed");
  });

  it("estorno depois de confirmar cancela a comissão liberada", async () => {
    const {fake, db, processedRef} = await setup();
    await processTournamentRegistrationAsaasNotification(db, "pay1", payment, processedRef, deps);
    await processTournamentRegistrationAsaasNotification(db, "pay1", {...payment, status: "REFUNDED"}, processedRef, deps);
    const c = fake.store.get(COMMISSION)!;
    assert.equal(c["status"], "canceled");
    assert.equal(c["cancelReason"], "refund");
  });

  it("chargeback de comissão já paga vira ajuste negativo no próximo repasse", async () => {
    const {fake, db, processedRef} = await setup();
    await processTournamentRegistrationAsaasNotification(db, "pay1", payment, processedRef, deps);
    fake.seedDoc(COMMISSION, {...fake.store.get(COMMISSION)!, status: "paid", payoutId: "2026-10-20"});
    await processTournamentRegistrationAsaasNotification(
      db, "pay1", {...payment, status: "CHARGEBACK_REQUESTED"}, processedRef, deps,
    );
    assert.equal(fake.store.get(COMMISSION)!["cancelReason"], "chargeback");
    assert.equal(fake.store.get("squadCommissionAdjustments/reg1_uidA_pay1_chargeback")!["amountCents"], -9_90);
  });

  it("pagador duplicado (estorno manual) nunca libera a comissão", async () => {
    const {fake, db, processedRef} = await setup({sharePaidUids: ["uidA", "uidB"], paidAmount: 100, isPaid: true});
    await processTournamentRegistrationAsaasNotification(db, "pay1", payment, processedRef, deps);
    assert.equal(fake.store.get(COMMISSION)!["status"], "canceled");
    assert.equal(fake.store.get(COMMISSION)!["cancelReason"], "payment_failed");
  });

  it("inscrição removida cancela a comissão", async () => {
    const {fake, db, processedRef} = await setup();
    await processTournamentRegistrationAsaasNotification(db, "pay1", payment, processedRef, deps);
    fake.store.delete(REG_PATH);
    assert.equal(await cancelRegistrationCommissions(db, "reg1", NOW), 1);
    assert.equal(fake.store.get(COMMISSION)!["status"], "canceled");
    assert.equal(fake.store.get(COMMISSION)!["cancelReason"], "refund");
  });
});

describe("desconto do seguidor no crédito do organizador", () => {
  async function pay(withDiscountDoc: boolean, discountCents: number) {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    fake.seedDoc("users/uidA", {fullName: "Lucas Martins"});
    fake.seedDoc("tournaments/t1", {
      name: "Copa Teste",
      managerId: "org1",
      categories: [{categoryName: "Masculina A", entryFee: 100}],
    });
    fake.seedDoc(REG_PATH, {
      tournamentId: "t1", categoryId: "Masculina A", player1Id: "uidA", participantUids: ["uidA", "uidB"],
      sharePaidUids: [], paidAmount: 0, isPaid: false,
    });
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "full", asaasPaymentId: "pay1", payerUid: "uidA", squadDiscountCents: discountCents,
    });
    if (withDiscountDoc && discountCents > 0) {
      fake.seedDoc("squadChargeDiscounts/pay1", {paymentId: "pay1", cents: discountCents, pct: 10});
    }
    const paid = 100 - discountCents / 100;
    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: paid, netValue: paid - 0.99, externalReference: "tournamentRegistration:reg1:uidA"},
      db.doc(PROCESSED) as DocumentReference, deps,
    );
    return fake;
  }

  it("o organizador recebe o mesmo líquido com ou sem o desconto (a nexaGO banca)", async () => {
    const sem = await pay(false, 0);
    const com = await pay(true, 10_00);
    assert.equal(sem.store.get("tournamentWallets/t1")!["availableReais"], 92);
    assert.equal(com.store.get("tournamentWallets/t1")!["availableReais"], 92);
    assert.equal(com.store.get(REG_PATH)!["isPaid"], true);
    assert.equal(com.store.get(REG_PATH)!["paidAmount"], 100);

    const ledger = [...com.store.entries()].find(([k]) => k.startsWith("tournamentWallets/t1/ledger/"))![1];
    assert.equal(ledger["grossReais"], 100);
    assert.equal(ledger["platformFeeReais"], 8);
    assert.equal(ledger["squadDiscountReais"], 10);
  });

  it("sem o registro por paymentId, usa o desconto gravado no pendente desta cobrança", async () => {
    const com = await pay(false, 10_00);
    assert.equal(com.store.get("tournamentWallets/t1")!["availableReais"], 92);
  });
});

