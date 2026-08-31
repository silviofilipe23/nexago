import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {processTournamentRegistrationAsaasNotification} from "./asaas-tournament-registration-webhook";

process.env.GCLOUD_PROJECT = "p";

const REG_ID = "reg1";
const REG_PATH = `artifacts/p/public/data/inscriptions/${REG_ID}`;
const PENDING_A = `${REG_PATH}/pixPending/uidA`;
const PENDING_B = `${REG_PATH}/pixPending/uidB`;
const PROCESSED_PATH = "artifacts/p/public/data/asaas_processed_payments/pay1";
const TOURNAMENT_PATH = "tournaments/t1";
const CATEGORY = "Masculina A";
const ENTRY_FEE = 100;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc(TOURNAMENT_PATH, {
    name: "Copa Teste",
    categories: [{categoryName: CATEGORY, entryFee: ENTRY_FEE}],
  });
  return {fake, db: fake as unknown as Firestore};
}

function seedRegistration(
  fake: FakeFirestore,
  overrides: Record<string, unknown> = {},
): void {
  fake.seedDoc(REG_PATH, {
    tournamentId: "t1",
    categoryId: CATEGORY,
    player1Id: "uidA",
    participantUids: ["uidA", "uidB"],
    sharePaidUids: [],
    paidAmount: 0,
    isPaid: false,
    ...overrides,
  });
}

function processedRefOf(db: Firestore): DocumentReference {
  return db.doc(PROCESSED_PATH) as DocumentReference;
}

function makeDeps() {
  const cancelled: string[] = [];
  return {
    cancelled,
    deps: {
      cancelCharge: async (paymentId: string) => {
        cancelled.push(paymentId);
      },
    },
  };
}

/** Pagamento do atleta A confirmando a taxa inteira ("integral"). */
const fullPayment = {
  status: "RECEIVED",
  value: ENTRY_FEE,
  externalReference: `tournamentRegistration:${REG_ID}:uidA`,
};

describe("asaas-tournament-registration-webhook: cobrança do parceiro", () => {
  it("cancela o PIX aberto do parceiro quando o integral confirma a inscrição", async () => {
    const {fake, db} = makeDb();
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, {
      status: "pending",
      amountType: "full",
      asaasPaymentId: "payA",
      payerUid: "uidA",
    });
    fake.seedDoc(PENDING_B, {
      status: "pending",
      amountType: "share",
      asaasPaymentId: "payB",
      payerUid: "uidB",
    });
    const {deps, cancelled} = makeDeps();

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", fullPayment, processedRefOf(db), deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    assert.deepEqual(cancelled, ["payB"]);
    assert.equal(fake.store.get(PENDING_B)!["status"], "cancelled");
  });

  it("não mexe em cobrança do parceiro já paga (parcela + parcela)", async () => {
    const {fake, db} = makeDb();
    // B já pagou a parcela dele; A paga a que faltava e a inscrição fecha.
    seedRegistration(fake, {sharePaidUids: ["uidB"], paidAmount: 50});
    fake.seedDoc(PENDING_A, {
      status: "pending",
      amountType: "share",
      asaasPaymentId: "payA",
      payerUid: "uidA",
    });
    fake.seedDoc(PENDING_B, {
      status: "paid",
      amountType: "share",
      asaasPaymentId: "payB",
      payerUid: "uidB",
    });
    const {deps, cancelled} = makeDeps();

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", {...fullPayment, value: 50}, processedRefOf(db), deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    assert.deepEqual(cancelled, []);
    assert.equal(fake.store.get(PENDING_B)!["status"], "paid");
  });
});

describe("asaas-tournament-registration-webhook: pagamento duplicado", () => {
  it("marca o duplicado para estorno com o valor pago", async () => {
    const {fake, db} = makeDb();
    // A já consta como pago (o parceiro pagou o integral antes) e mesmo assim
    // um pagamento dele chega: dinheiro entrou sem crédito, precisa de estorno.
    seedRegistration(fake, {
      sharePaidUids: ["uidA", "uidB"],
      paidAmount: ENTRY_FEE,
      isPaid: true,
    });
    const {deps} = makeDeps();

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", {...fullPayment, value: 50}, processedRefOf(db), deps,
    );

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed["outcome"], "duplicate_payer");
    assert.equal(processed["refundRequired"], true);
    assert.equal(processed["paidValue"], 50);
    // O valor não pode ser creditado de novo na inscrição.
    assert.equal(fake.store.get(REG_PATH)!["paidAmount"], ENTRY_FEE);
  });
});
