import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  cancelOpenPixChargesOrThrow,
  cancelOpenPixPendingCharges,
} from "./tournament-registration-pix-cancel";

const REG_PATH = "artifacts/p/public/data/inscriptions/reg1";
const PENDING_A = `${REG_PATH}/pixPending/uidA`;
const PENDING_B = `${REG_PATH}/pixPending/uidB`;
const REASON = "registrationAlreadyPaid";

function makeDb(): {fake: FakeFirestore; ref: DocumentReference} {
  const fake = new FakeFirestore();
  fake.seedDoc(REG_PATH, {tournamentId: "t1"});
  const db = fake as unknown as Firestore;
  return {fake, ref: db.doc(REG_PATH) as DocumentReference};
}

function openCharge(payerUid: string, asaasPaymentId: string) {
  return {status: "pending", amountType: "share", asaasPaymentId, payerUid};
}

function makeCanceller() {
  const cancelled: string[] = [];
  return {
    cancelled,
    cancelCharge: async (paymentId: string) => {
      cancelled.push(paymentId);
    },
  };
}

describe("cancelOpenPixPendingCharges", () => {
  it("mata a cobrança aberta e marca o documento com o motivo", async () => {
    const {fake, ref} = makeDb();
    fake.seedDoc(PENDING_B, openCharge("uidB", "payB"));
    const {cancelled, cancelCharge} = makeCanceller();

    const uids = await cancelOpenPixPendingCharges({
      registrationRef: ref,
      reason: REASON,
      cancelCharge,
    });

    assert.deepEqual(uids, ["uidB"]);
    assert.deepEqual(cancelled, ["payB"]);
    const doc = fake.store.get(PENDING_B)!;
    assert.equal(doc["status"], "cancelled");
    assert.equal(doc["cancelledReason"], REASON);
  });

  it("preserva a cobrança do atleta indicado em skipUid", async () => {
    const {fake, ref} = makeDb();
    fake.seedDoc(PENDING_A, openCharge("uidA", "payA"));
    fake.seedDoc(PENDING_B, openCharge("uidB", "payB"));
    const {cancelled, cancelCharge} = makeCanceller();

    await cancelOpenPixPendingCharges({
      registrationRef: ref,
      reason: REASON,
      skipUid: "uidA",
      cancelCharge,
    });

    assert.deepEqual(cancelled, ["payB"]);
    assert.equal(fake.store.get(PENDING_A)!["status"], "pending");
  });

  it("nunca toca em cobrança já liquidada", async () => {
    const {fake, ref} = makeDb();
    fake.seedDoc(PENDING_B, {...openCharge("uidB", "payB"), status: "paid"});
    const {cancelled, cancelCharge} = makeCanceller();

    const uids = await cancelOpenPixPendingCharges({
      registrationRef: ref,
      reason: REASON,
      cancelCharge,
    });

    assert.deepEqual(uids, []);
    assert.deepEqual(cancelled, []);
    assert.equal(fake.store.get(PENDING_B)!["status"], "paid");
  });

  it("não marca como cancelada quando o gateway recusa o cancelamento", async () => {
    const {fake, ref} = makeDb();
    fake.seedDoc(PENDING_B, openCharge("uidB", "payB"));

    const uids = await cancelOpenPixPendingCharges({
      registrationRef: ref,
      reason: REASON,
      cancelCharge: async () => {
        throw new Error("asaas fora do ar");
      },
    });

    // A cobrança pode seguir viva: marcar "cancelled" mentiria sobre o estado.
    assert.deepEqual(uids, []);
    assert.equal(fake.store.get(PENDING_B)!["status"], "pending");
  });

  it("restringe a um atleta só quando onlyUid é informado", async () => {
    const {fake, ref} = makeDb();
    fake.seedDoc(PENDING_A, openCharge("uidA", "payA"));
    fake.seedDoc(PENDING_B, openCharge("uidB", "payB"));
    const {cancelled, cancelCharge} = makeCanceller();

    const uids = await cancelOpenPixPendingCharges({
      registrationRef: ref,
      reason: REASON,
      onlyUid: "uidA",
      cancelCharge,
    });

    assert.deepEqual(uids, ["uidA"]);
    assert.deepEqual(cancelled, ["payA"]);
    assert.equal(fake.store.get(PENDING_B)!["status"], "pending");
  });
});

/** Doc `pixPending` no formato que o chamador já tem em mãos (snapshot lido). */
function pendingDoc(id: string, data: Record<string, unknown>) {
  return {id, data: () => data};
}

describe("cancelOpenPixChargesOrThrow", () => {
  it("mata todas as cobranças abertas da inscrição", async () => {
    const {cancelled, cancelCharge} = makeCanceller();

    await cancelOpenPixChargesOrThrow({
      registrationId: "reg1",
      pendingDocs: [
        pendingDoc("uidA", openCharge("uidA", "payA")),
        pendingDoc("uidB", openCharge("uidB", "payB")),
      ],
      cancelCharge,
    });

    assert.deepEqual(cancelled, ["payA", "payB"]);
  });

  it("ignora cobrança já liquidada e doc sem cobrança no gateway", async () => {
    const {cancelled, cancelCharge} = makeCanceller();

    await cancelOpenPixChargesOrThrow({
      registrationId: "reg1",
      pendingDocs: [
        pendingDoc("uidA", {...openCharge("uidA", "payA"), status: "paid"}),
        pendingDoc("uidB", {status: "pending", payerUid: "uidB"}),
      ],
      cancelCharge,
    });

    assert.deepEqual(cancelled, []);
  });

  it("aborta a operação quando o gateway falha", async () => {
    // Aqui a cobrança NÃO pode sobreviver ao documento: seguir com o delete
    // deixaria um QR pagável sem inscrição para creditar.
    await assert.rejects(
      () => cancelOpenPixChargesOrThrow({
        registrationId: "reg1",
        pendingDocs: [pendingDoc("uidB", openCharge("uidB", "payB"))],
        cancelCharge: async () => {
          throw new Error("asaas fora do ar");
        },
      }),
      (err: unknown) => (err as {code?: string}).code === "unavailable",
    );
  });
});
