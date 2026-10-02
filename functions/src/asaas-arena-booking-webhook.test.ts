import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  processArenaBookingAsaasNotification,
  processArenaBookingShareAsaasNotification,
} from "./asaas-arena-booking-webhook";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";
import {holdCashback} from "./athlete-wallet";

const BOOKING_PATH = "arenaBookings/b1";
const PROCESSED_PATH = "artifacts/p/public/data/asaas_processed_payments/orig1";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function processedRefOf(db: Firestore): DocumentReference {
  return db.doc(PROCESSED_PATH) as DocumentReference;
}

function bookingPayment(status: string, value = 100) {
  return {status, value, externalReference: `${ARENA_BOOKING_PAYMENT_REF_PREFIX}b1`};
}

/** Reserva dividida antes da correção: a cobrança da reserva inteira ficou registrada nela. */
function seedSplitBooking(fake: FakeFirestore, overrides: DocData = {}): void {
  fake.seedDoc("arenas/arena1", {name: "Arena X"});
  fake.seedDoc(BOOKING_PATH, {
    athleteId: "owner1",
    arenaId: "arena1",
    paymentChannel: "pix",
    status: "confirmed",
    paymentStatus: "split_pending",
    hasSplitShares: true,
    splitShareCount: 2,
    amountReais: 100,
    amountToPayNowReais: 100,
    amountDueOnsiteReais: 0,
    paymentFraction: 1,
    asaasPaymentId: "orig1",
    ...overrides,
  });
}

function seedPendingBooking(fake: FakeFirestore, overrides: DocData = {}): void {
  fake.seedDoc("arenas/arena1", {name: "Arena X"});
  fake.seedDoc(BOOKING_PATH, {
    athleteId: "owner1",
    arenaId: "arena1",
    paymentChannel: "pix",
    status: "pending_payment",
    paymentStatus: "pending",
    amountReais: 100,
    amountToPayNowReais: 100,
    amountDueOnsiteReais: 0,
    paymentFraction: 1,
    asaasPaymentId: "orig1",
    ...overrides,
  });
}

describe("processArenaBookingAsaasNotification — reserva dividida", () => {
  it("pagamento da cobrança substituída não confirma, não credita e marca estorno", async () => {
    const {fake, db} = makeDb();
    seedSplitBooking(fake);

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED"), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "split_pending");
    assert.equal(booking.amountPaidOnlineReais, undefined);
    assert.equal(fake.store.has("arenaWallets/arena1"), false);

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed.outcome, "stale_charge_after_split");
    assert.equal(processed.refundRequired, true);
    assert.equal(processed.paidValue, 100);
  });

  for (const status of ["OVERDUE", "DELETED"]) {
    it(`${status} da cobrança substituída não cancela a reserva nem grava processado`, async () => {
      const {fake, db} = makeDb();
      seedSplitBooking(fake);

      await processArenaBookingAsaasNotification(
        db, "orig1", bookingPayment(status), processedRefOf(db),
      );

      const booking = fake.store.get(BOOKING_PATH)!;
      assert.equal(booking.status, "confirmed");
      assert.equal(booking.paymentStatus, "split_pending");
      assert.equal(booking.cancelledAt, undefined);
      assert.equal(fake.store.has(PROCESSED_PATH), false);
    });
  }

  it("GET da Asaas pra cobrança removida (status anterior + deleted:true) não cancela nem processa", async () => {
    const {fake, db} = makeDb();
    seedSplitBooking(fake);

    // O GET da Asaas pra cobrança removida não devolve status "DELETED" — ele
    // devolve o último status conhecido (aqui "OVERDUE") mais `deleted: true`.
    await processArenaBookingAsaasNotification(
      db, "orig1",
      {status: "OVERDUE", deleted: true, value: 100, externalReference: `${ARENA_BOOKING_PAYMENT_REF_PREFIX}b1`},
      processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "split_pending");
    assert.equal(fake.store.has(PROCESSED_PATH), false);
  });

  it("RECEIVED tardio depois de OVERDUE ainda cai como estorno", async () => {
    const {fake, db} = makeDb();
    seedSplitBooking(fake);

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("OVERDUE"), processedRefOf(db),
    );
    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED"), processedRefOf(db),
    );

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed.outcome, "stale_charge_after_split");
    assert.equal(processed.refundRequired, true);
    assert.equal(fake.store.get(BOOKING_PATH)!.status, "confirmed");
  });

  it("DELETED da original durante a divisão (marcada como substituída) não cancela a reserva", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {supersededAsaasPaymentIds: ["orig1"]});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("DELETED"), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.status, "pending_payment");
    assert.equal(booking.cancelledAt, undefined);
    assert.equal(fake.store.has(PROCESSED_PATH), false);
  });

  it("cobrança que não está na lista de substituídas segue o fluxo normal", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {supersededAsaasPaymentIds: ["outra"]});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("OVERDUE"), processedRefOf(db),
    );

    assert.equal(fake.store.get(BOOKING_PATH)!.status, "cancelled");
    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "rejected");
  });

  it("pagamento da original durante a divisão segue a confirmação normal", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {supersededAsaasPaymentIds: ["orig1"]});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED"), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "paid");
    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "approved");
    assert.equal(fake.store.has("arenaWallets/arena1"), true);
  });
});

describe("processArenaBookingAsaasNotification — reserva sem divisão (controle)", () => {
  it("RECEIVED confirma a reserva e credita a arena como antes", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake);

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED"), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "paid");
    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "approved");
    assert.equal(fake.store.has("arenaWallets/arena1"), true);
  });

  it("OVERDUE cancela a reserva pendente como antes", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake);

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("OVERDUE"), processedRefOf(db),
    );

    assert.equal(fake.store.get(BOOKING_PATH)!.status, "cancelled");
    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "rejected");
  });
});

describe("processArenaBookingAsaasNotification — cashback", () => {
  const NOW_MS = Date.now();

  function seedSpendableLot(fake: FakeFirestore, cents: number): void {
    fake.seedDoc("athleteWallets/owner1/lots/old", {
      uid: "owner1", sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: cents, remainingCents: cents, status: "available",
      eventAt: Timestamp.fromMillis(NOW_MS - 1000), releasedAt: Timestamp.fromMillis(NOW_MS - 1000),
      expiresAt: Timestamp.fromMillis(NOW_MS + 90 * 86_400_000), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW_MS - 1000),
    });
  }

  function arenaLedger(fake: FakeFirestore): Record<string, unknown>[] {
    return [...fake.store.entries()]
      .filter(([path]) => path.startsWith("arenaWallets/arena1/ledger/"))
      .map(([, data]) => data);
  }

  it("saldo aplicado conta como pago online: reserva paga, arena recebe o bruto", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {date: "2026-10-12", startTime: "19:30", arenaName: "Arena Sol"});
    seedSpendableLot(fake, 3000);
    const {holdId} = await holdCashback(db, {
      uid: "owner1", maxCents: 2000, sourceType: "booking", sourceId: "b1",
      trackingPath: BOOKING_PATH, label: "Reserva", nowMs: NOW_MS,
    });
    fake.seedDoc(BOOKING_PATH, {
      ...fake.store.get(BOOKING_PATH)!, cashbackAppliedCents: 2000, cashbackHoldId: holdId,
    });

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED", 80), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.paymentStatus, "paid");
    assert.equal(booking.amountPaidOnlineReais, 100);
    assert.equal(booking.amountDueOnsiteReais, 0);
    assert.equal(booking.asaasPaidAmount, 80);
    assert.equal(booking.cashbackAppliedReais, 20);
    const credit = arenaLedger(fake).find((e) => e.type === "credit")!;
    assert.equal(credit.grossReais, 100);
    assert.equal(credit.cashbackAppliedReais, 20);
    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${holdId}`)!.status, "captured");
  });

  it("cashback ligado: lote pendente com a data e hora da reserva", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {date: "2026-10-12", startTime: "19:30", arenaName: "Arena Sol"});
    fake.seedDoc("appConfig/cashback", {enabled: true});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED", 100), processedRefOf(db),
    );

    const lot = fake.store.get("athleteWallets/owner1/lots/orig1")!;
    // Taxa sem plano = 8% de R$ 100 = R$ 8,00 → teto R$ 4,00; 2% = R$ 2,00.
    assert.equal(lot.earnedCents, 200);
    assert.equal(lot.label, "Reserva · Arena Sol · 12/10");
    assert.equal((lot.eventAt as Timestamp).toMillis(), Date.UTC(2026, 9, 12, 22, 30, 0));
  });

  it("cota de amigo paga ganha cashback para quem pagou a cota", async () => {
    const {fake, db} = makeDb();
    seedSplitBooking(fake, {date: "2026-10-12", startTime: "19:30", arenaName: "Arena Sol"});
    fake.seedDoc("appConfig/cashback", {enabled: true});
    fake.seedDoc(`${BOOKING_PATH}/paymentShares/s1`, {
      payerAthleteId: "friend1", amountReais: 50, status: "pending", asaasPaymentId: "payS1",
    });

    await processArenaBookingShareAsaasNotification(
      db, "payS1",
      {status: "RECEIVED", value: 50, externalReference: "arenaBookingShare:b1:s1"},
      db.doc("artifacts/p/public/data/asaas_processed_payments/payS1") as DocumentReference,
    );

    const lot = fake.store.get("athleteWallets/friend1/lots/payS1")!;
    assert.equal(lot.status, "pending");
    assert.equal(lot.earnedCents, 100);
  });
});
