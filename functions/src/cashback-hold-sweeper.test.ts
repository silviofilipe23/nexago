import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {attachHoldPayment, holdCashback} from "./athlete-wallet";
import {applyCashbackIntent, cashbackIntentFields, buildCashbackIntent} from "./cashback-intent";
import {DEFAULT_CASHBACK_CONFIG} from "./cashback-config";
import {decideHoldAction, runCashbackHoldSweep} from "./cashback-hold-sweeper";

const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const MIN = 60 * 1000;
const UID = "ath1";
const W = `athleteWallets/${UID}`;
const PROCESSED = "artifacts/p/public/data/asaas_processed_payments";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

describe("decideHoldAction", () => {
  const base = {holdPaymentId: "pay1", holdCreatedAtMs: NOW - 10 * MIN, nowMs: NOW};

  it("reserva sem cobrança ligada: espera 15 min e depois devolve", () => {
    assert.equal(decideHoldAction({...base, sourceType: "booking", holdPaymentId: null, holdCreatedAtMs: NOW - 5 * MIN, tracking: null}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "booking", holdPaymentId: null, holdCreatedAtMs: NOW - 16 * MIN, tracking: null}), "release");
  });

  it("registro sumido ou de outra cobrança devolve", () => {
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: null}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: {asaasPaymentId: "outra", status: "pending_payment"}}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: {asaasPaymentId: null, status: "confirmed", paymentStatus: "split_pending"}}), "release");
  });

  it("inscrição: pago captura, pendente espera, cancelado devolve", () => {
    const t = (status: string) => ({asaasPaymentId: "pay1", status});
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("paid")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("pending")}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("cancelled")}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("expired")}), "release");
  });

  it("reserva: paga ou parcial captura, aguardando espera, cancelada devolve", () => {
    const t = (status: string, paymentStatus: string) => ({asaasPaymentId: "pay1", status, paymentStatus});
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("confirmed", "paid")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("confirmed", "partial")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("pending_payment", "pending")}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("cancelled", "expired")}), "release");
  });

  it("clubinho: confirmado captura, aguardando espera, saiu devolve", () => {
    const t = (status: string) => ({asaasPaymentId: "pay1", status});
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("confirmed")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("pending_payment")}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("expired")}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("canceled_by_arena_refunded")}), "release");
  });
});

describe("runCashbackHoldSweep", () => {
  async function seedHold(
    fake: FakeFirestore,
    db: Firestore,
    trackingPath: string,
    sourceType: "registration" | "booking" | "club",
    createdAtMs: number,
    paymentId: string | null,
  ): Promise<string> {
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 100, sourceType, sourceId: "x",
      trackingPath, label: "Teste", nowMs: createdAtMs,
    });
    if (paymentId) await attachHoldPayment(db, UID, holdId!, paymentId);
    return holdId!;
  }

  it("devolve as mortas, captura as pagas, mantém as abertas e ignora as recém-criadas", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`${W}/lots/l1`, {
      uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: 1000, remainingCents: 1000, status: "available",
      eventAt: Timestamp.fromMillis(NOW - 1e9), releasedAt: Timestamp.fromMillis(NOW - 1e9),
      expiresAt: Timestamp.fromMillis(NOW + 1e10), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW - 1e9),
    });
    fake.seedDoc("t/dead", {asaasPaymentId: "payDead", status: "cancelled"});
    fake.seedDoc("arenaBookings/paid", {asaasPaymentId: "payPaid", status: "confirmed", paymentStatus: "paid"});
    fake.seedDoc("arenaClubSessions/s/clubParticipants/ath1", {asaasPaymentId: "payOpen", status: "pending_payment"});
    fake.seedDoc("t/young", {asaasPaymentId: "payYoung", status: "cancelled"});

    const dead = await seedHold(fake, db, "t/dead", "registration", NOW - 10 * MIN, "payDead");
    const paid = await seedHold(fake, db, "arenaBookings/paid", "booking", NOW - 10 * MIN, "payPaid");
    const open = await seedHold(fake, db, "arenaClubSessions/s/clubParticipants/ath1", "club", NOW - 10 * MIN, "payOpen");
    const young = await seedHold(fake, db, "t/young", "registration", NOW - 1 * MIN, "payYoung");

    const stats = await runCashbackHoldSweep(db, "p", NOW);

    assert.equal(fake.store.get(`${W}/holds/${dead}`)!.status, "released");
    assert.equal(fake.store.get(`${W}/holds/${paid}`)!.status, "captured");
    assert.equal(fake.store.get(`${W}/holds/${open}`)!.status, "open");
    assert.equal(fake.store.get(`${W}/holds/${young}`)!.status, "open");
    assert.equal(stats.released, 1);
    assert.equal(stats.captured, 1);
    assert.equal(stats.kept, 1);
  });

  it("reaplica intenção pendente e desiste depois do limite", async () => {
    const {fake, db} = makeDb();
    const intent = buildCashbackIntent({
      uid: UID, sourceType: "booking", sourceId: "b1", tournamentId: null, arenaId: "a1",
      label: "Reserva", eventAtMs: NOW + 1e9, cashReais: 100, appliedCents: 0, feeReais: 8,
      holdId: null, config: {...DEFAULT_CASHBACK_CONFIG, enabled: true},
    });
    fake.seedDoc(`${PROCESSED}/payOk`, {outcome: "approved", ...cashbackIntentFields(intent)});
    fake.seedDoc(`${PROCESSED}/payStuck`, {
      outcome: "approved",
      ...cashbackIntentFields({...intent, attempts: 10, lastError: "boom"}),
    });

    const stats = await runCashbackHoldSweep(db, "p", NOW);

    assert.equal(fake.store.get(`${PROCESSED}/payOk`)!.cashbackStatus, "done");
    assert.equal(fake.store.get(`${W}/lots/payOk`)!.status, "pending");
    assert.equal(fake.store.get(`${PROCESSED}/payStuck`)!.cashbackStatus, "failed");
    assert.equal(stats.intentsDone, 1);
    assert.equal(stats.intentsGivenUp, 1);
  });

  it("retoma estorno interrompido (cashbackStatus 'reversing') e conta em reversalsRetried", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`${W}/lots/old`, {
      uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: 1000, remainingCents: 1000, status: "available",
      eventAt: Timestamp.fromMillis(NOW - 1e9), releasedAt: Timestamp.fromMillis(NOW - 1e9),
      expiresAt: Timestamp.fromMillis(NOW + 1e10), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW - 1e9),
    });
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 100, sourceType: "club", sourceId: "s1",
      trackingPath: "arenaClubSessions/s1/clubParticipants/ath1", label: "Clubinho", nowMs: NOW,
    });
    const intent = buildCashbackIntent({
      uid: UID, sourceType: "club", sourceId: "s1", tournamentId: null, arenaId: "a1",
      label: "Clubinho", eventAtMs: NOW + 1e9, cashReais: 5, appliedCents: 100, feeReais: 0.75,
      holdId, config: {...DEFAULT_CASHBACK_CONFIG, enabled: true},
    });
    fake.seedDoc(`${PROCESSED}/payStuckReversal`, {outcome: "approved", ...cashbackIntentFields(intent)});
    const ref = db.doc(`${PROCESSED}/payStuckReversal`) as DocumentReference;
    await applyCashbackIntent(db, ref, "payStuckReversal", NOW);
    // Simula o roteador caindo logo depois de marcar "reversing", antes de
    // desfazer lote e saldo.
    await ref.set({cashbackStatus: "reversing"}, {merge: true});

    const stats = await runCashbackHoldSweep(db, "p", NOW);

    assert.equal(fake.store.get(`${W}/lots/payStuckReversal`)!.status, "cancelled");
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "refunded");
    assert.equal(fake.store.get(`${PROCESSED}/payStuckReversal`)!.cashbackStatus, "reversed");
    assert.equal(stats.reversalsRetried, 1);
  });
});
