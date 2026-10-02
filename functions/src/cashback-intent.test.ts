import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {DEFAULT_CASHBACK_CONFIG} from "./cashback-config";
import {attachHoldPayment, holdCashback} from "./athlete-wallet";
import {
  applyCashbackIntent,
  bookingCashbackLabel,
  buildCashbackIntent,
  cashbackIntentFields,
  intentHasWork,
  readCashbackApplied,
  resolveCashbackForPayment,
} from "./cashback-intent";
import {
  cashbackIdempotencyKey,
  cashbackResponseFields,
  releaseCashbackHoldQuietly,
  reserveCashbackForCharge,
} from "./cashback-checkout";

const UID = "ath1";
const W = `athleteWallets/${UID}`;
const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/pay1";
const ENABLED = {...DEFAULT_CASHBACK_CONFIG, enabled: true};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function seedAvailable(fake: FakeFirestore, lotId: string, cents: number): void {
  fake.seedDoc(`${W}/lots/${lotId}`, {
    uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
    label: "Reserva", earnedCents: cents, remainingCents: cents, status: "available",
    eventAt: Timestamp.fromMillis(NOW - 10 * DAY), releasedAt: Timestamp.fromMillis(NOW - 9 * DAY),
    expiresAt: Timestamp.fromMillis(NOW + 90 * DAY), expiryWarnedAt: null,
    createdAt: Timestamp.fromMillis(NOW - 10 * DAY),
  });
}

function intentFor(overrides: Partial<Parameters<typeof buildCashbackIntent>[0]> = {}) {
  return buildCashbackIntent({
    uid: UID,
    sourceType: "booking",
    sourceId: "b1",
    tournamentId: null,
    arenaId: "a1",
    label: "Reserva · Arena Sol · 12/10",
    eventAtMs: NOW + 2 * DAY,
    cashReais: 120,
    appliedCents: 0,
    feeReais: 9.6,
    holdId: null,
    config: ENABLED,
    ...overrides,
  });
}

describe("buildCashbackIntent", () => {
  it("calcula o ganho com o cashback ligado", () => {
    const intent = intentFor();
    assert.equal(intent.cashCents, 12000);
    assert.equal(intent.feeCents, 960);
    assert.equal(intent.earnCents, 240);
    assert.equal(intent.attempts, 0);
    assert.equal(intent.reversedAtMs, null);
  });

  it("desligado não gera ganho, mas a reserva continua sendo capturada", () => {
    const intent = intentFor({config: DEFAULT_CASHBACK_CONFIG, holdId: "h1"});
    assert.equal(intent.earnCents, 0);
    assert.equal(intentHasWork(intent), true);
    assert.equal(intentHasWork(intentFor({config: DEFAULT_CASHBACK_CONFIG})), false);
    assert.equal(intentHasWork(intentFor({uid: ""})), false);
  });
});

describe("readCashbackApplied", () => {
  it("lê o saldo aplicado e a reserva do registro da cobrança", () => {
    assert.deepEqual(readCashbackApplied({cashbackAppliedCents: 1500, cashbackHoldId: "h1"}), {
      appliedCents: 1500, holdId: "h1",
    });
    assert.deepEqual(readCashbackApplied({}), {appliedCents: 0, holdId: null});
    assert.deepEqual(readCashbackApplied(undefined), {appliedCents: 0, holdId: null});
    assert.deepEqual(readCashbackApplied({cashbackAppliedCents: -5, cashbackHoldId: " "}), {
      appliedCents: 0, holdId: null,
    });
  });
});

describe("resolveCashbackForPayment", () => {
  it("tracking da mesma cobrança usa os campos gravados nela", async () => {
    const {db} = makeDb();
    const result = await resolveCashbackForPayment(db, UID, "pay1", {
      asaasPaymentId: "pay1", cashbackAppliedCents: 500, cashbackHoldId: "h1",
    });
    assert.deepEqual(result, {appliedCents: 500, holdId: "h1"});
  });

  it("tracking de outra cobrança: acha a reserva pelo id do pagamento", async () => {
    const {fake, db} = makeDb();
    seedAvailable(fake, "l1", 2000);
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 1000, sourceType: "registration", sourceId: "reg1",
      trackingPath: "x", label: "Inscrição", nowMs: NOW,
    });
    await attachHoldPayment(db, UID, holdId!, "payOld");
    const result = await resolveCashbackForPayment(db, UID, "payOld", {
      asaasPaymentId: "payNew", cashbackAppliedCents: 999, cashbackHoldId: "outro",
    });
    assert.deepEqual(result, {appliedCents: 1000, holdId});
  });

  it("tracking de outra cobrança e sem reserva encontrada: nada aplicado", async () => {
    const {db} = makeDb();
    const result = await resolveCashbackForPayment(db, UID, "payX", {
      asaasPaymentId: "payNew",
    });
    assert.deepEqual(result, {appliedCents: 0, holdId: null});
  });

  it("uid vazio não busca nada", async () => {
    const {db} = makeDb();
    assert.deepEqual(
      await resolveCashbackForPayment(db, "", "pay1", undefined),
      {appliedCents: 0, holdId: null},
    );
  });
});

describe("bookingCashbackLabel", () => {
  it("usa dia/mês da reserva quando a data é válida", () => {
    assert.equal(bookingCashbackLabel("Arena Sol", "2026-10-12"), "Reserva · Arena Sol · 12/10");
    assert.equal(bookingCashbackLabel("Arena Sol", undefined), "Reserva · Arena Sol");
  });
});

describe("applyCashbackIntent", () => {
  it("captura a reserva, cria o lote pendente e marca feito; depois é no-op", async () => {
    const {fake, db} = makeDb();
    seedAvailable(fake, "l1", 2000);
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 1000, sourceType: "booking", sourceId: "b1",
      trackingPath: "arenaBookings/b1", label: "Reserva", nowMs: NOW,
    });
    const intent = intentFor({holdId, appliedCents: 1000, cashReais: 110});
    fake.seedDoc(PROCESSED, {outcome: "approved", ...cashbackIntentFields(intent)});
    const ref = db.doc(PROCESSED) as DocumentReference;

    assert.equal(await applyCashbackIntent(db, ref, "pay1", NOW), "done");
    assert.equal(await applyCashbackIntent(db, ref, "pay1", NOW), "skipped");

    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get(`${W}/lots/pay1`)!.status, "pending");
    assert.equal(fake.store.get(`${W}/lots/pay1`)!.earnedCents, intent.earnCents);
    assert.equal(fake.store.get(PROCESSED)!.cashbackStatus, "done");
  });

  it("falha conta tentativa e deixa pendente para a varredura", async () => {
    const {fake, db} = makeDb();
    const intent = intentFor({eventAtMs: Number.NaN});
    fake.seedDoc(PROCESSED, {outcome: "approved", ...cashbackIntentFields(intent)});

    const r = await applyCashbackIntent(db, db.doc(PROCESSED) as DocumentReference, "pay1", NOW);

    assert.equal(r, "failed");
    const processed = fake.store.get(PROCESSED)!;
    assert.equal(processed.cashbackStatus, "pending");
    assert.equal((processed.cashback as {attempts: number}).attempts, 1);
  });
});

describe("reserveCashbackForCharge", () => {
  const base = {
    uid: UID, sourceType: "booking" as const, sourceId: "b1",
    trackingPath: "arenaBookings/b1", label: "Reserva", nowMs: NOW,
  };

  it("sem pedido do atleta ou com o recurso desligado não reserva nada", async () => {
    const {fake, db} = makeDb();
    seedAvailable(fake, "l1", 3000);
    assert.deepEqual(
      await reserveCashbackForCharge(db, {...base, useCashback: "true", priceReais: 20}),
      {holdId: null, appliedCents: 0, chargeReais: 20},
    );
    assert.deepEqual(
      await reserveCashbackForCharge(db, {...base, useCashback: true, priceReais: 20}),
      {holdId: null, appliedCents: 0, chargeReais: 20},
    );
  });

  it("abate até deixar o mínimo em dinheiro", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("appConfig/cashback", {enabled: true});
    seedAvailable(fake, "l1", 3000);
    const r = await reserveCashbackForCharge(db, {...base, useCashback: true, priceReais: 20});
    assert.equal(r.appliedCents, 1500);
    assert.equal(r.chargeReais, 5);
    assert.ok(r.holdId);
    assert.deepEqual(cashbackResponseFields(r), {cashbackAppliedReais: 15, chargedReais: 5});
  });

  it("preço abaixo do mínimo não usa saldo; saldo pequeno é usado inteiro", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("appConfig/cashback", {enabled: true});
    seedAvailable(fake, "l1", 300);
    assert.equal(
      (await reserveCashbackForCharge(db, {...base, useCashback: true, priceReais: 4})).appliedCents,
      0,
    );
    const r = await reserveCashbackForCharge(db, {...base, useCashback: true, priceReais: 50});
    assert.equal(r.appliedCents, 300);
    assert.equal(r.chargeReais, 47);
  });
});

describe("releaseCashbackHoldQuietly / cashbackIdempotencyKey", () => {
  it("devolve a reserva e ignora reserva nula", async () => {
    const {fake, db} = makeDb();
    seedAvailable(fake, "l1", 1000);
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 400, sourceType: "booking", sourceId: "b1",
      trackingPath: "arenaBookings/b1", label: "Reserva", nowMs: NOW,
    });
    await releaseCashbackHoldQuietly(db, UID, null, NOW);
    await releaseCashbackHoldQuietly(db, UID, holdId, NOW);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
  });

  it("muda a chave só quando há saldo aplicado", () => {
    assert.equal(cashbackIdempotencyKey("arena-booking-pix-b1", null), "arena-booking-pix-b1");
    assert.equal(cashbackIdempotencyKey("arena-booking-pix-b1", "h9"), "arena-booking-pix-b1-h9");
  });
});
