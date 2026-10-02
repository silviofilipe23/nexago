import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  attachHoldPayment,
  captureHold,
  holdCashback,
  refundCapturedHold,
  releaseHold,
} from "./athlete-wallet";

const UID = "ath1";
const W = `athleteWallets/${UID}`;
const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function seedLot(
  fake: FakeFirestore,
  lotId: string,
  overrides: DocData = {},
): void {
  fake.seedDoc(`${W}/lots/${lotId}`, {
    uid: UID,
    sourceType: "booking",
    sourceId: "b1",
    tournamentId: null,
    arenaId: "arena1",
    label: "Reserva · Arena Sol · 12/10",
    earnedCents: 1000,
    remainingCents: 1000,
    status: "available",
    eventAt: Timestamp.fromMillis(NOW - 30 * DAY),
    releasedAt: Timestamp.fromMillis(NOW - 29 * DAY),
    expiresAt: Timestamp.fromMillis(NOW + 100 * DAY),
    expiryWarnedAt: null,
    createdAt: Timestamp.fromMillis(NOW - 30 * DAY),
    ...overrides,
  });
}

function ledgerOf(fake: FakeFirestore): DocData[] {
  return [...fake.store.entries()]
    .filter(([path]) => path.startsWith(`${W}/ledger/`))
    .map(([, data]) => data);
}

function holdParams(maxCents: number) {
  return {
    uid: UID,
    maxCents,
    sourceType: "booking" as const,
    sourceId: "b9",
    trackingPath: "arenaBookings/b9",
    label: "Reserva · Arena Sol · 20/10",
    nowMs: NOW,
  };
}

describe("holdCashback", () => {
  it("reserva consumindo primeiro o lote que vence primeiro", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "late", {remainingCents: 1000, expiresAt: Timestamp.fromMillis(NOW + 90 * DAY)});
    seedLot(fake, "early", {remainingCents: 300, expiresAt: Timestamp.fromMillis(NOW + 10 * DAY)});

    const r = await holdCashback(db, holdParams(800));

    assert.equal(r.appliedCents, 800);
    assert.ok(r.holdId);
    assert.equal(fake.store.get(`${W}/lots/early`)!.remainingCents, 0);
    assert.equal(fake.store.get(`${W}/lots/early`)!.status, "consumed");
    assert.equal(fake.store.get(`${W}/lots/late`)!.remainingCents, 500);
    const hold = fake.store.get(`${W}/holds/${r.holdId}`)!;
    assert.equal(hold.status, "open");
    assert.deepEqual(hold.allocations, [{lotId: "early", cents: 300}, {lotId: "late", cents: 500}]);
    assert.equal(hold.trackingPath, "arenaBookings/b9");
    const wallet = fake.store.get(W)!;
    assert.equal(wallet.availableCents, 500);
    assert.equal(wallet.heldCents, 800);
  });

  it("limita ao saldo e não cria reserva sem saldo", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 400});
    assert.equal((await holdCashback(db, holdParams(1000))).appliedCents, 400);

    const empty = makeDb();
    const r = await holdCashback(empty.db, holdParams(1000));
    assert.deepEqual(r, {holdId: null, appliedCents: 0});
    assert.equal(empty.fake.store.has(W), false);
  });

  it("lote vencido e ainda não varrido não pode ser gasto", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "old", {remainingCents: 900, expiresAt: Timestamp.fromMillis(NOW - DAY)});
    assert.deepEqual(await holdCashback(db, holdParams(500)), {holdId: null, appliedCents: 0});
  });

  it("duas reservas seguidas não gastam o mesmo saldo", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 1000});
    const a = await holdCashback(db, holdParams(700));
    const b = await holdCashback(db, holdParams(700));
    assert.equal(a.appliedCents, 700);
    assert.equal(b.appliedCents, 300);
    assert.equal(fake.store.get(W)!.availableCents, 0);
    assert.equal(fake.store.get(W)!.heldCents, 1000);
  });

  it("saldo mostrado ignora lote vencido ainda não varrido", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "valid", {remainingCents: 500, expiresAt: Timestamp.fromMillis(NOW + 50 * DAY)});
    seedLot(fake, "expired", {
      remainingCents: 300,
      status: "available",
      expiresAt: Timestamp.fromMillis(NOW - DAY),
    });

    await holdCashback(db, holdParams(100));

    const wallet = fake.store.get(W)!;
    assert.equal(wallet.availableCents, 400);
    assert.equal((wallet.nextExpiryAt as Timestamp).toMillis(), NOW + 50 * DAY);
  });
});

describe("releaseHold", () => {
  it("devolve aos mesmos lotes e é idempotente", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 1000});
    const {holdId} = await holdCashback(db, holdParams(1000));

    assert.equal(await releaseHold(db, UID, holdId!, NOW), true);
    assert.equal(await releaseHold(db, UID, holdId!, NOW), false);

    const lot = fake.store.get(`${W}/lots/l1`)!;
    assert.equal(lot.remainingCents, 1000);
    assert.equal(lot.status, "available");
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
    assert.equal(fake.store.get(W)!.availableCents, 1000);
    assert.equal(fake.store.get(W)!.heldCents, 0);
  });

  it("lote vencido no meio da reserva não volta, e o extrato registra a perda", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 600});
    const {holdId} = await holdCashback(db, holdParams(600));
    fake.seedDoc(`${W}/lots/l1`, {...fake.store.get(`${W}/lots/l1`)!, status: "expired"});

    await releaseHold(db, UID, holdId!, NOW);

    assert.equal(fake.store.get(`${W}/lots/l1`)!.remainingCents, 0);
    assert.equal(fake.store.get(W)!.availableCents, 0);
    const lost = ledgerOf(fake).find((e) => e.type === "expire");
    assert.equal(lost?.amountCents, 600);
  });
});

describe("attachHoldPayment", () => {
  it("grava o id da cobrança na reserva", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1");
    const {holdId} = await holdCashback(db, holdParams(500));
    await attachHoldPayment(db, UID, holdId!, "pay9");
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.asaasPaymentId, "pay9");
  });
});

describe("captureHold", () => {
  it("vira consumo, registra no extrato e é idempotente", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 1000});
    const {holdId} = await holdCashback(db, holdParams(400));

    assert.deepEqual(await captureHold(db, UID, holdId!, NOW), {capturedCents: 400, shortfallCents: 0});
    assert.deepEqual(await captureHold(db, UID, holdId!, NOW), {capturedCents: 400, shortfallCents: 0});

    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "captured");
    const wallet = fake.store.get(W)!;
    assert.equal(wallet.heldCents, 0);
    assert.equal(wallet.availableCents, 600);
    assert.equal(wallet.lifetimeRedeemedCents, 400);
    assert.equal(ledgerOf(fake).filter((e) => e.type === "redeem").length, 1);
  });

  it("pagamento depois de devolver a reserva debita de novo o que houver", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 1000});
    const {holdId} = await holdCashback(db, holdParams(400));
    await releaseHold(db, UID, holdId!, NOW);

    const r = await captureHold(db, UID, holdId!, NOW);

    assert.deepEqual(r, {capturedCents: 400, shortfallCents: 0});
    assert.equal(fake.store.get(`${W}/lots/l1`)!.remainingCents, 600);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.lateCapture, true);
  });

  it("sem saldo suficiente no pagamento tardio, a falta fica registrada e o saldo não fica negativo", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 500});
    const {holdId} = await holdCashback(db, holdParams(500));
    await releaseHold(db, UID, holdId!, NOW);
    // O atleta gastou parte do saldo noutra cobrança antes de o PIX tardio chegar.
    const other = await holdCashback(db, holdParams(300));
    await captureHold(db, UID, other.holdId!, NOW);

    const r = await captureHold(db, UID, holdId!, NOW);

    assert.deepEqual(r, {capturedCents: 200, shortfallCents: 300});
    assert.equal(fake.store.get(W)!.availableCents, 0);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.shortfallCents, 300);
  });
});

describe("refundCapturedHold", () => {
  it("devolve o saldo usado aos lotes de origem, inclusive o consumido", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 500});
    const {holdId} = await holdCashback(db, holdParams(500));
    await captureHold(db, UID, holdId!, NOW);
    assert.equal(fake.store.get(`${W}/lots/l1`)!.status, "consumed");

    assert.equal(await refundCapturedHold(db, UID, holdId!, NOW), 500);

    const lot = fake.store.get(`${W}/lots/l1`)!;
    assert.equal(lot.status, "available");
    assert.equal(lot.remainingCents, 500);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "refunded");
    const wallet = fake.store.get(W)!;
    assert.equal(wallet.availableCents, 500);
    assert.equal(wallet.lifetimeRedeemedCents, 0);
    assert.equal(ledgerOf(fake).find((e) => e.type === "refund")?.amountCents, 500);
    assert.equal(await refundCapturedHold(db, UID, holdId!, NOW), 0);
  });

  it("extrato fecha com o valor cheio mesmo quando o lote de origem já venceu e perdeu o saldo", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 1000});
    const {holdId} = await holdCashback(db, holdParams(500));
    await captureHold(db, UID, holdId!, NOW);
    // A varredura venceu o lote antes do estorno chegar: o saldo restante dele (500) se perde.
    fake.seedDoc(`${W}/lots/l1`, {
      ...fake.store.get(`${W}/lots/l1`)!,
      remainingCents: 0,
      status: "expired",
    });

    const restored = await refundCapturedHold(db, UID, holdId!, NOW);

    assert.equal(restored, 0);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "refunded");
    assert.equal(fake.store.get(W)!.availableCents, 0);
    const entries = ledgerOf(fake);
    assert.equal(entries.find((e) => e.type === "refund")?.amountCents, 500);
    assert.equal(entries.find((e) => e.type === "expire")?.amountCents, 500);
  });

  it("em reserva ainda aberta, só libera — sem lançamento de estorno", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, "l1", {remainingCents: 1000});
    const {holdId} = await holdCashback(db, holdParams(400));

    const restored = await refundCapturedHold(db, UID, holdId!, NOW);

    assert.equal(restored, 400);
    assert.equal(fake.store.get(`${W}/lots/l1`)!.remainingCents, 1000);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
    assert.equal(fake.store.get(W)!.lifetimeRedeemedCents, 0);
    assert.equal(ledgerOf(fake).some((e) => e.type === "refund"), false);
  });
});
