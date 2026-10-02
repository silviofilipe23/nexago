import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {DEFAULT_CASHBACK_CONFIG} from "./cashback-config";
import {attachHoldPayment, captureHold, holdCashback} from "./athlete-wallet";
import {applyCashbackIntent, buildCashbackIntent, cashbackIntentFields} from "./cashback-intent";
import {reverseCashbackForPayment} from "./cashback-reversal";

const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const UID = "ath1";
const W = `athleteWallets/${UID}`;
const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/pay1";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc(`users/${UID}`, {fullName: "Atleta"});
  fake.seedDoc(`${W}/lots/old`, {
    uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
    label: "Reserva", earnedCents: 2000, remainingCents: 2000, status: "available",
    eventAt: Timestamp.fromMillis(NOW - 1e9), releasedAt: Timestamp.fromMillis(NOW - 1e9),
    expiresAt: Timestamp.fromMillis(NOW + 1e10), expiryWarnedAt: null,
    createdAt: Timestamp.fromMillis(NOW - 1e9),
  });
  return {fake, db: fake as unknown as Firestore};
}

async function seedAppliedIntent(fake: FakeFirestore, db: Firestore, apply: boolean) {
  const {holdId} = await holdCashback(db, {
    uid: UID, maxCents: 1000, sourceType: "club", sourceId: "s1",
    trackingPath: "arenaClubSessions/s1/clubParticipants/ath1", label: "Clubinho", nowMs: NOW,
  });
  const intent = buildCashbackIntent({
    uid: UID, sourceType: "club", sourceId: "s1", tournamentId: null, arenaId: "a1",
    label: "Clubinho", eventAtMs: NOW + 1e9, cashReais: 5, appliedCents: 1000, feeReais: 0.75,
    holdId, config: {...DEFAULT_CASHBACK_CONFIG, enabled: true},
  });
  fake.seedDoc(PROCESSED, {outcome: "approved", ...cashbackIntentFields(intent)});
  const ref = db.doc(PROCESSED) as DocumentReference;
  if (apply) await applyCashbackIntent(db, ref, "pay1", NOW);
  return {holdId: holdId!, ref};
}

describe("reverseCashbackForPayment", () => {
  it("estorno do clubinho: cancela o lote pendente e devolve o saldo usado", async () => {
    const {fake, db} = makeDb();
    const {holdId, ref} = await seedAppliedIntent(fake, db, true);

    assert.equal(await reverseCashbackForPayment(db, ref, "pay1", NOW), "reversed");

    assert.equal(fake.store.get(`${W}/lots/pay1`)!.status, "cancelled");
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "refunded");
    assert.equal(fake.store.get(`${W}/lots/old`)!.remainingCents, 2000);
    assert.equal(fake.store.get(PROCESSED)!.cashbackStatus, "reversed");
    assert.equal((fake.store.get(PROCESSED)!.cashback as {reversedAtMs: number}).reversedAtMs, NOW);
    assert.equal(await reverseCashbackForPayment(db, ref, "pay1", NOW), "skipped");
  });

  it("retomada: doc preso em 'reversing' (sem reversedAtMs) é concluído, e de novo vira skip", async () => {
    const {fake, db} = makeDb();
    const {holdId, ref} = await seedAppliedIntent(fake, db, true);
    // Simula o roteador caindo logo depois de marcar "reversing", antes de
    // desfazer lote e saldo — a intenção continua sem `reversedAtMs`.
    await ref.set({cashbackStatus: "reversing"}, {merge: true});

    assert.equal(await reverseCashbackForPayment(db, ref, "pay1", NOW), "reversed");

    assert.equal(fake.store.get(`${W}/lots/pay1`)!.status, "cancelled");
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "refunded");
    assert.equal(fake.store.get(`${W}/lots/old`)!.remainingCents, 2000);
    assert.equal(fake.store.get(PROCESSED)!.cashbackStatus, "reversed");

    // Rodar de novo não duplica o efeito: as operações já estavam feitas.
    assert.equal(await reverseCashbackForPayment(db, ref, "pay1", NOW), "skipped");
    assert.equal(fake.store.get(`${W}/lots/old`)!.remainingCents, 2000);
  });

  it("estorno antes de a intenção ser aplicada: a varredura não captura nem cria lote depois", async () => {
    const {fake, db} = makeDb();
    const {holdId, ref} = await seedAppliedIntent(fake, db, false);

    await reverseCashbackForPayment(db, ref, "pay1", NOW);
    assert.equal(await applyCashbackIntent(db, ref, "pay1", NOW), "skipped");

    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
    assert.equal(fake.store.has(`${W}/lots/pay1`), false);
    assert.equal(fake.store.get(`${W}/lots/old`)!.remainingCents, 2000);
  });

  it("pagamento sem cashback é ignorado", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(PROCESSED, {outcome: "approved"});
    assert.equal(
      await reverseCashbackForPayment(db, db.doc(PROCESSED) as DocumentReference, "pay1", NOW),
      "skipped",
    );
  });
});

describe("reverseCashbackForPayment — sem intenção (R2)", () => {
  /** Reserva do pagamento capturada pela varredura de 5 min: sem webhook, sem intenção. */
  async function seedSweeperCapturedHold(db: Firestore, paymentId: string): Promise<string> {
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 800, sourceType: "club", sourceId: "s1",
      trackingPath: "arenaClubSessions/s1/clubParticipants/ath1", label: "Clubinho", nowMs: NOW,
    });
    await attachHoldPayment(db, UID, holdId!, paymentId);
    await captureHold(db, UID, holdId!, NOW);
    return holdId!;
  }

  function refundEntries(fake: FakeFirestore): Array<Record<string, unknown>> {
    return [...fake.store.entries()]
      .filter(([path, data]) => path.startsWith(`${W}/ledger/`) && data.type === "refund")
      .map(([, data]) => data);
  }

  const refOf = (db: Firestore, paymentId: string) =>
    db.doc(`artifacts/p/public/data/asaas_processed_payments/${paymentId}`) as DocumentReference;

  it("clubinho: devolve a reserva achada pelo pagamento uma vez só e não cria o processado", async () => {
    const {fake, db} = makeDb();
    const holdId = await seedSweeperCapturedHold(db, "payX");
    const opts = {externalReference: "arenaClubSession:s1:ath1"};

    assert.equal(await reverseCashbackForPayment(db, refOf(db, "payX"), "payX", NOW, opts), "reversed");
    assert.equal(await reverseCashbackForPayment(db, refOf(db, "payX"), "payX", NOW, opts), "skipped");

    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "refunded");
    assert.equal(fake.store.get(`${W}/lots/old`)!.remainingCents, 2000);
    assert.equal(refundEntries(fake).length, 1);
    assert.equal(refundEntries(fake)[0].amountCents, 800);
    // Um processado criado aqui faria o handler tratar um pagamento futuro como "já processado".
    assert.equal(fake.store.has("artifacts/p/public/data/asaas_processed_payments/payX"), false);
  });

  it("inscrição e reserva de quadra: o pagador sai da referência (ou da reserva)", async () => {
    const {fake, db} = makeDb();
    const regHold = await seedSweeperCapturedHold(db, "payReg");
    const bookingHold = await seedSweeperCapturedHold(db, "payBooking");
    fake.seedDoc("arenaBookings/b1", {athleteId: UID});

    await reverseCashbackForPayment(db, refOf(db, "payReg"), "payReg", NOW, {
      externalReference: `tournamentRegistration:reg1:${UID}`,
    });
    await reverseCashbackForPayment(db, refOf(db, "payBooking"), "payBooking", NOW, {
      externalReference: "arenaBooking:b1",
    });

    assert.equal(fake.store.get(`${W}/holds/${regHold}`)!.status, "refunded");
    assert.equal(fake.store.get(`${W}/holds/${bookingHold}`)!.status, "refunded");
    assert.equal(refundEntries(fake).length, 2);
  });

  it("sem referência: usa o pagador gravado no processado (estorno automático do webhook)", async () => {
    const {fake, db} = makeDb();
    const holdId = await seedSweeperCapturedHold(db, "payY");
    fake.seedDoc("artifacts/p/public/data/asaas_processed_payments/payY", {
      kind: "arenaClubSession", outcome: "refunded_session_full", participantId: UID,
    });

    await reverseCashbackForPayment(db, refOf(db, "payY"), "payY", NOW);

    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "refunded");
  });
});
