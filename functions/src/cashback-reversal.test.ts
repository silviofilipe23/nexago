import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {DEFAULT_CASHBACK_CONFIG} from "./cashback-config";
import {holdCashback} from "./athlete-wallet";
import {applyCashbackIntent, buildCashbackIntent, cashbackIntentFields} from "./cashback-intent";
import {reverseCashbackForPayment} from "./cashback-reversal";

const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const UID = "ath1";
const W = `athleteWallets/${UID}`;
const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/pay1";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
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
