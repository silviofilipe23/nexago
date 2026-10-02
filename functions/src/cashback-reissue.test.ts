/**
 * Reemissão de cobrança (R1): PIX/cartão da inscrição gerado de novo e
 * entrada refeita no clubinho. A reserva de saldo da cobrança anterior só
 * volta com prova de que a cobrança morreu — senão o atleta pagaria a antiga
 * com desconto enquanto a nova reserva o mesmo saldo de novo.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {AsaasApiError} from "./asaas-client";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";
import {attachHoldPayment, holdCashback} from "./athlete-wallet";
import {retirePreviousCharge, type PreviousChargeOps} from "./cashback-checkout";
import {cancelExistingPixPending} from "./tournament-registration-pix";

const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const UID = "ath1";
const W = `athleteWallets/${UID}`;
const REG_ID = "reg1";
const PENDING_PATH = `artifacts/p/public/data/inscriptions/${REG_ID}/pixPending/${UID}`;
const PARTICIPANT_PATH = `arenaClubSessions/s1/clubParticipants/${UID}`;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc(`${W}/lots/l1`, {
    uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
    label: "Reserva", earnedCents: 1000, remainingCents: 1000, status: "available",
    eventAt: Timestamp.fromMillis(NOW - 1e9), releasedAt: Timestamp.fromMillis(NOW - 1e9),
    expiresAt: Timestamp.fromMillis(NOW + 1e10), expiryWarnedAt: null,
    createdAt: Timestamp.fromMillis(NOW - 1e9),
  });
  return {fake, db: fake as unknown as Firestore};
}

/** DELETE e GET de mentira; Error = falha daquela chamada. */
function stubOps(opts: {
  deleteError?: Error;
  payment?: AsaasPaymentDetails | Error;
}): {ops: PreviousChargeOps; calls: {delete: string[]; get: string[]}} {
  const calls = {delete: [] as string[], get: [] as string[]};
  return {
    calls,
    ops: {
      deletePayment: async (id) => {
        calls.delete.push(id);
        if (opts.deleteError) throw opts.deleteError;
      },
      getPayment: async (id) => {
        calls.get.push(id);
        if (opts.payment instanceof Error) throw opts.payment;
        return opts.payment ?? {status: "PENDING"};
      },
    },
  };
}

async function seedH1(db: Firestore, trackingPath: string, paymentId: string): Promise<string> {
  const {holdId} = await holdCashback(db, {
    uid: UID, maxCents: 600, sourceType: "registration", sourceId: REG_ID,
    trackingPath, label: "Inscrição", nowMs: NOW,
  });
  await attachHoldPayment(db, UID, holdId!, paymentId);
  return holdId!;
}

/** A cobrança nova reserva o que sobrou — nunca o saldo ainda preso na antiga. */
async function reserveAgain(db: Firestore, trackingPath: string): Promise<number> {
  const {appliedCents} = await holdCashback(db, {
    uid: UID, maxCents: 5000, sourceType: "registration", sourceId: REG_ID,
    trackingPath, label: "Inscrição", nowMs: NOW,
  });
  return appliedCents;
}

describe("inscrição: cancelExistingPixPending na reemissão (R1)", () => {
  function seedPending(fake: FakeFirestore, holdId: string): void {
    fake.seedDoc(PENDING_PATH, {
      status: "pending", asaasPaymentId: "P1", payerUid: UID,
      cashbackAppliedCents: 600, cashbackHoldId: holdId,
    });
  }

  it("cobrança anterior já recebida (DELETE recusado): a reserva dela fica, e a nova não reserva o mesmo saldo", async () => {
    const {fake, db} = makeDb();
    const h1 = await seedH1(db, PENDING_PATH, "P1");
    seedPending(fake, h1);
    const {ops, calls} = stubOps({
      deleteError: new AsaasApiError("não pode remover cobrança recebida", 400),
      payment: {status: "RECEIVED"},
    });

    await cancelExistingPixPending(db, "p", REG_ID, UID, ops);

    assert.deepEqual(calls.delete, ["P1"]);
    assert.equal(fake.store.get(`${W}/holds/${h1}`)!.status, "open");
    assert.equal(fake.store.has(PENDING_PATH), false);
    assert.equal(await reserveAgain(db, PENDING_PATH), 400);
  });

  it("cobrança anterior apagada agora: a reserva dela volta e a nova reserva o saldo inteiro", async () => {
    const {fake, db} = makeDb();
    const h1 = await seedH1(db, PENDING_PATH, "P1");
    seedPending(fake, h1);
    const {ops} = stubOps({});

    await cancelExistingPixPending(db, "p", REG_ID, UID, ops);

    assert.equal(fake.store.get(`${W}/holds/${h1}`)!.status, "released");
    assert.equal(await reserveAgain(db, PENDING_PATH), 1000);
  });

  it("DELETE falha sem resposta e o GET também: incerteza mantém a reserva", async () => {
    const {fake, db} = makeDb();
    const h1 = await seedH1(db, PENDING_PATH, "P1");
    seedPending(fake, h1);
    const {ops} = stubOps({deleteError: new Error("timeout"), payment: new Error("timeout")});

    await cancelExistingPixPending(db, "p", REG_ID, UID, ops);

    assert.equal(fake.store.get(`${W}/holds/${h1}`)!.status, "open");
  });
});

describe("retirePreviousCharge (inscrição e clubinho)", () => {
  it("DELETE falha mas o GET diz removida (deleted: true): devolve", async () => {
    const {fake, db} = makeDb();
    const h1 = await seedH1(db, PARTICIPANT_PATH, "P1");
    const {ops} = stubOps({deleteError: new Error("400"), payment: {status: "PENDING", deleted: true}});

    assert.equal(await retirePreviousCharge(db, {uid: UID, trackingPath: PARTICIPANT_PATH, paymentId: "P1"}, NOW, ops), true);
    assert.equal(fake.store.get(`${W}/holds/${h1}`)!.status, "released");
  });

  it("DELETE falha e o GET dá 404: cobrança não existe, devolve", async () => {
    const {fake, db} = makeDb();
    const h1 = await seedH1(db, PARTICIPANT_PATH, "P1");
    const {ops} = stubOps({deleteError: new Error("400"), payment: new AsaasApiError("not found", 404)});

    assert.equal(await retirePreviousCharge(db, {uid: UID, trackingPath: PARTICIPANT_PATH, paymentId: "P1"}, NOW, ops), true);
    assert.equal(fake.store.get(`${W}/holds/${h1}`)!.status, "released");
  });

  it("clubinho: entrada refeita com a cobrança anterior paga mantém a reserva; sem cobrança anterior não faz nada", async () => {
    const {fake, db} = makeDb();
    const h1 = await seedH1(db, PARTICIPANT_PATH, "P1");
    const paid = stubOps({deleteError: new Error("recebida"), payment: {status: "CONFIRMED"}});

    assert.equal(await retirePreviousCharge(db, {uid: UID, trackingPath: PARTICIPANT_PATH, paymentId: "P1"}, NOW, paid.ops), false);
    assert.equal(fake.store.get(`${W}/holds/${h1}`)!.status, "open");

    const none = stubOps({});
    assert.equal(await retirePreviousCharge(db, {uid: UID, trackingPath: PARTICIPANT_PATH, paymentId: ""}, NOW, none.ops), false);
    assert.deepEqual(none.calls.delete, []);
  });

  it("cobrança apagada de outro registro: a reserva não é deste registro, fica", async () => {
    const {fake, db} = makeDb();
    const h1 = await seedH1(db, "arenaClubSessions/s2/clubParticipants/ath1", "P1");
    const {ops} = stubOps({});

    await retirePreviousCharge(db, {uid: UID, trackingPath: PARTICIPANT_PATH, paymentId: "P1"}, NOW, ops);

    assert.equal(fake.store.get(`${W}/holds/${h1}`)!.status, "open");
  });
});
