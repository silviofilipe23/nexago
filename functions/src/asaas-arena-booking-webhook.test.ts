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
import {attachHoldPayment, captureHold, holdCashback} from "./athlete-wallet";
import {reverseCashbackForPayment} from "./cashback-reversal";

const BOOKING_PATH = "arenaBookings/b1";
const PROCESSED_PATH = "artifacts/p/public/data/asaas_processed_payments/orig1";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  // Contas vivas: a intenção de cashback de conta excluída é encerrada sem ganho.
  fake.seedDoc("users/owner1", {fullName: "Atleta"});
  fake.seedDoc("users/friend1", {fullName: "Atleta"});
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

describe("processArenaBookingAsaasNotification — pagamento depois do cancelamento", () => {
  // O app cancelava `pending_payment` com escrita direta ('canceled'), deixando o PIX
  // aberto na Asaas; o trigger de slot já liberou locks e horário. As functions gravam
  // 'cancelled' — as duas grafias valem.
  for (const status of ["canceled", "cancelled"]) {
    it(`RECEIVED em reserva '${status}' não confirma, não credita e marca estorno`, async () => {
      const {fake, db} = makeDb();
      seedPendingBooking(fake, {status, attendanceStatus: "canceled"});

      await processArenaBookingAsaasNotification(
        db, "orig1", bookingPayment("RECEIVED"), processedRefOf(db),
      );

      const booking = fake.store.get(BOOKING_PATH)!;
      assert.equal(booking.status, status);
      assert.equal(booking.paymentStatus, "pending");
      assert.equal(booking.amountPaidOnlineReais, undefined);
      assert.equal(fake.store.has("arenaWallets/arena1"), false);

      const processed = fake.store.get(PROCESSED_PATH)!;
      assert.equal(processed.outcome, "paid_after_cancel");
      assert.equal(processed.refundRequired, true);
      assert.equal(processed.paidValue, 100);
      assert.equal(processed.bookingStatus, status);
    });
  }

  it("não devolve o horário: slot ainda não liberado pelo trigger segue sem 'booked'", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {status: "canceled"});
    fake.seedDoc("arenaSlots/b1", {bookingId: "b1", status: "held"});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED_IN_CASH"), processedRefOf(db),
    );

    assert.equal(fake.store.get("arenaSlots/b1")!.status, "held");
    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "paid_after_cancel");
  });

  it("pagamento da original durante a divisão em reserva já cancelada também vira estorno", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {status: "cancelled", supersededAsaasPaymentIds: ["orig1"]});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED"), processedRefOf(db),
    );

    assert.equal(fake.store.get(BOOKING_PATH)!.status, "cancelled");
    assert.equal(fake.store.has("arenaWallets/arena1"), false);
    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "paid_after_cancel");
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

  it("sinal pago fecha como parcial pelo total do servidor, mesmo com amountReais adulterado", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {
      amountReais: 50,
      amountToPayNowReais: 50,
      paymentFraction: 0.5,
    });
    fake.seedDoc("arenaBookingPricing/b1", {amountReais: 100});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED", 50), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "partial");
    assert.equal(booking.amountPaidOnlineReais, 50);
    assert.equal(booking.amountDueOnsiteReais, 50);
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
    await attachHoldPayment(db, "owner1", holdId!, "orig1");
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

  it("saldo aplicado nesta cobrança parcial: bruto bate com o fracionamento, hold é capturado", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {
      paymentFraction: 0.5, amountReais: 100, amountToPayNowReais: 50, amountDueOnsiteReais: 50,
    });
    seedSpendableLot(fake, 3000);
    const {holdId} = await holdCashback(db, {
      uid: "owner1", maxCents: 2000, sourceType: "booking", sourceId: "b1",
      trackingPath: BOOKING_PATH, label: "Reserva", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "owner1", holdId!, "orig1");
    fake.seedDoc(BOOKING_PATH, {
      ...fake.store.get(BOOKING_PATH)!, cashbackAppliedCents: 2000, cashbackHoldId: holdId,
    });

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED", 30), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.paymentStatus, "partial");
    assert.equal(booking.amountPaidOnlineReais, 50);
    assert.equal(booking.amountDueOnsiteReais, 50);
    assert.equal(booking.asaasPaidAmount, 30);
    assert.equal(booking.cashbackAppliedReais, 20);
    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${holdId}`)!.status, "captured");
  });

  it("cobrança substituída: pagamento tardio usa o saldo e o hold DESTA cobrança, não da nova", async () => {
    const {fake, db} = makeDb();
    // Sem hasSplitShares/supersededAsaasPaymentIds: isola a resolução do saldo pelo
    // paymentId do guard de divisão (fase 0), que já tem cobertura própria acima.
    seedPendingBooking(fake, {asaasPaymentId: "payNew"});
    seedSpendableLot(fake, 5000);

    const {holdId: holdOldId} = await holdCashback(db, {
      uid: "owner1", maxCents: 1000, sourceType: "booking", sourceId: "b1",
      trackingPath: BOOKING_PATH, label: "Reserva", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "owner1", holdOldId!, "payOld");

    const {holdId: holdNewId} = await holdCashback(db, {
      uid: "owner1", maxCents: 1500, sourceType: "booking", sourceId: "b1",
      trackingPath: BOOKING_PATH, label: "Reserva", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "owner1", holdNewId!, "payNew");

    // O booking foi reescrito pra cobrança nova: o tracking aponta pro hold novo.
    fake.seedDoc(BOOKING_PATH, {
      ...fake.store.get(BOOKING_PATH)!, cashbackAppliedCents: 1500, cashbackHoldId: holdNewId,
    });

    const processedRefOld =
      db.doc("artifacts/p/public/data/asaas_processed_payments/payOld") as DocumentReference;
    await processArenaBookingAsaasNotification(
      db, "payOld", bookingPayment("RECEIVED", 40), processedRefOld,
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    // 40 em dinheiro + R$ 10 (1000 centavos) do hold antigo — NÃO os R$ 15 do hold novo.
    assert.equal(booking.amountPaidOnlineReais, 50);
    assert.equal(booking.cashbackAppliedReais, 10);
    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${holdOldId}`)!.status, "captured");
    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${holdNewId}`)!.status, "open");
  });

  /** `appConfig/cashback` ilegível (Firestore instável): a leitura lança. */
  function breakCashbackConfig(fake: FakeFirestore): void {
    const original = fake.doc.bind(fake);
    fake.doc = ((path: string) => {
      const ref = original(path);
      if (path === "appConfig/cashback") {
        ref.get = async () => {
          throw new Error("appConfig indisponível");
        };
      }
      return ref;
    }) as typeof fake.doc;
  }

  it("leitura de appConfig/cashback falha: reserva confirmada, arena creditada, reserva de saldo capturada", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake);
    seedSpendableLot(fake, 3000);
    const {holdId} = await holdCashback(db, {
      uid: "owner1", maxCents: 2000, sourceType: "booking", sourceId: "b1",
      trackingPath: BOOKING_PATH, label: "Reserva", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "owner1", holdId!, "orig1");
    breakCashbackConfig(fake);

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED", 80), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "paid");
    assert.equal(booking.amountPaidOnlineReais, 100);
    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "approved");
    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.has("athleteWallets/owner1/lots/orig1"), false);
    assert.equal(arenaLedger(fake).find((e) => e.type === "credit")!.grossReais, 100);
  });

  it("leitura de appConfig/cashback falha na cota de amigo: cota paga e arena creditada", async () => {
    const {fake, db} = makeDb();
    seedSplitBooking(fake);
    fake.seedDoc(`${BOOKING_PATH}/paymentShares/s1`, {
      payerAthleteId: "friend1", amountReais: 50, status: "pending", asaasPaymentId: "payS1",
    });
    breakCashbackConfig(fake);
    const shareProcessed = "artifacts/p/public/data/asaas_processed_payments/payS1";

    await processArenaBookingShareAsaasNotification(
      db, "payS1",
      {status: "RECEIVED", value: 50, externalReference: "arenaBookingShare:b1:s1"},
      db.doc(shareProcessed) as DocumentReference,
    );

    assert.equal(fake.store.get(`${BOOKING_PATH}/paymentShares/s1`)!.status, "paid");
    assert.equal(fake.store.get(shareProcessed)!.outcome, "approved");
    assert.equal(fake.store.has("athleteWallets/friend1/lots/payS1"), false);
    assert.equal(arenaLedger(fake).find((e) => e.type === "credit")!.grossReais, 50);
  });

  // C1: a reserva de quadra é gravável pelo atleta dono e pela equipe da
  // arena — saldo aplicado e reserva NUNCA vêm dela, só da reserva do servidor.
  it("cashbackAppliedCents forjado sem reserva de saldo: arena recebe só o que o Asaas recebeu", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake, {amountReais: 120, amountToPayNowReais: 120, cashbackAppliedCents: 11500});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED", 5), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.amountPaidOnlineReais, 5);
    assert.equal(booking.amountDueOnsiteReais, 115);
    assert.equal(booking.paymentStatus, "partial");
    assert.equal(booking.cashbackAppliedReais, 0);
    const credit = arenaLedger(fake).find((e) => e.type === "credit")!;
    assert.equal(credit.grossReais, 5);
    assert.equal(credit.cashbackAppliedReais ?? 0, 0);
  });

  it("cashbackHoldId forjado apontando pra reserva aberta de outra cobrança: não a captura", async () => {
    const {fake, db} = makeDb();
    seedSpendableLot(fake, 3000);
    const {holdId: otherHoldId} = await holdCashback(db, {
      uid: "owner1", maxCents: 2000, sourceType: "booking", sourceId: "b2",
      trackingPath: "arenaBookings/b2", label: "Reserva", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "owner1", otherHoldId!, "payOther");
    seedPendingBooking(fake, {cashbackAppliedCents: 2000, cashbackHoldId: otherHoldId});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED", 100), processedRefOf(db),
    );

    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${otherHoldId}`)!.status, "open");
    assert.equal(fake.store.get(BOOKING_PATH)!.cashbackAppliedReais, 0);
    const intent = fake.store.get(PROCESSED_PATH)!.cashback as {holdId?: unknown} | undefined;
    assert.equal(intent?.holdId ?? null, null);
  });

  it("cashbackHoldId forjado apontando pra reserva já capturada: o estorno deste pagamento não a devolve", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("appConfig/cashback", {enabled: true});
    seedSpendableLot(fake, 3000);
    const {holdId: otherHoldId} = await holdCashback(db, {
      uid: "owner1", maxCents: 2000, sourceType: "booking", sourceId: "b2",
      trackingPath: "arenaBookings/b2", label: "Reserva", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "owner1", otherHoldId!, "payOther");
    await captureHold(db, "owner1", otherHoldId!, NOW_MS);
    seedPendingBooking(fake, {cashbackAppliedCents: 2000, cashbackHoldId: otherHoldId});

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED", 100), processedRefOf(db),
    );
    // PAYMENT_REFUNDED deste pagamento (o roteador chama o estorno).
    await reverseCashbackForPayment(db, processedRefOf(db), "orig1", NOW_MS);

    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${otherHoldId}`)!.status, "captured");
    assert.equal(fake.store.get("athleteWallets/owner1/lots/old")!.remainingCents, 1000);
    assert.equal(fake.store.get("athleteWallets/owner1/lots/orig1")!.status, "cancelled");
  });
});
