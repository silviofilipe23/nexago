import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  buildArenaBookingShareExternalReference,
  expireArenaBookingPaymentShareIfDue,
  finalizeArenaBookingIfAllSharesResolved,
  parseArenaBookingShareExternalReference,
  splitArenaBookingPaymentCore,
  validateSplitShares,
  type CreateShareChargeFn,
} from "./arena-booking-split";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";

const HOUR_MS = 60 * 60 * 1000;
const now = Date.UTC(2026, 6, 25, 12, 0, 0);
const gameTime = now + 4 * HOUR_MS;

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

function seedPendingPixBooking(
  fake: FakeFirestore,
  bookingId: string,
  overrides: DocData = {},
): void {
  fake.seedDoc(`arenaBookings/${bookingId}`, {
    athleteId: "owner1",
    arenaId: "arena1",
    arenaName: "Arena X",
    courtName: "Quadra 1",
    date: "2026-07-25",
    startTime: "16:00",
    paymentChannel: "pix",
    status: "pending_payment",
    paymentStatus: "pending",
    amountReais: 100,
    amountToPayNowReais: 100,
    amountDueOnsiteReais: 0,
    confirmationDeadline: Timestamp.fromMillis(gameTime - 2 * HOUR_MS),
    ...overrides,
  });
}

function stubCreateCharge(): CreateShareChargeFn {
  let counter = 0;
  return async ({athleteId}) => {
    counter += 1;
    return {
      paymentId: `pay-${athleteId}-${counter}`,
      qrCode: `qr-${athleteId}`,
      qrCodeBase64: `b64-${athleteId}`,
    };
  };
}

describe("buildArenaBookingShareExternalReference / parse", () => {
  it("faz round-trip e não colide com o prefixo da reserva única", () => {
    const ref = buildArenaBookingShareExternalReference("b1", "s1");
    assert.equal(ref, "arenaBookingShare:b1:s1");
    assert.deepEqual(parseArenaBookingShareExternalReference(ref), {
      bookingId: "b1",
      shareId: "s1",
    });
    // "arenaBookingShare:" não deve casar com o prefixo mais curto da reserva única.
    assert.equal(ref.startsWith(ARENA_BOOKING_PAYMENT_REF_PREFIX), false);
  });

  it("retorna null para referência sem o prefixo ou incompleta", () => {
    assert.equal(parseArenaBookingShareExternalReference("arenaBooking:b1"), null);
    assert.equal(parseArenaBookingShareExternalReference("arenaBookingShare:semShareId"), null);
    assert.equal(parseArenaBookingShareExternalReference(""), null);
  });
});

describe("validateSplitShares", () => {
  it("aceita quando a soma bate exatamente com o esperado", () => {
    const shares = validateSplitShares(
      [{athleteId: "a", amountReais: 30}, {athleteId: "b", amountReais: 70}],
      100,
    );
    assert.equal(shares.length, 2);
  });

  it("tolera diferença de arredondamento até 2 centavos", () => {
    const shares = validateSplitShares(
      [{athleteId: "a", amountReais: 33.33}, {athleteId: "b", amountReais: 33.33}, {athleteId: "c", amountReais: 33.34}],
      100,
    );
    assert.equal(shares.length, 3);
  });

  it("rejeita quando a soma não bate", () => {
    assert.throws(
      () => validateSplitShares([{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 40}], 100),
      (err: {code?: string}) => err.code === "failed-precondition",
    );
  });

  it("rejeita atleta duplicado", () => {
    assert.throws(
      () => validateSplitShares([{athleteId: "a", amountReais: 50}, {athleteId: "a", amountReais: 50}], 100),
      (err: {code?: string}) => err.code === "invalid-argument",
    );
  });

  it("rejeita lista vazia", () => {
    assert.throws(
      () => validateSplitShares([], 100),
      (err: {code?: string}) => err.code === "invalid-argument",
    );
  });
});

describe("splitArenaBookingPaymentCore", () => {
  it("cria uma fatia por convidado quando a soma bate com amountToPayNowReais", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1");

    const result = await splitArenaBookingPaymentCore(
      db(fake),
      "owner1",
      "Dono da Reserva",
      {
        bookingId: "b1",
        shares: [
          {athleteId: "a", amountReais: 40},
          {athleteId: "b", amountReais: 60},
        ],
      },
      stubCreateCharge(),
      now,
    );

    assert.equal(result.bookingId, "b1");
    assert.equal(result.shareIds.length, 2);
    assert.equal(result.notifications.length, 2);
    assert.deepEqual(
      result.notifications.map((n) => n.userId).sort(),
      ["a", "b"],
    );

    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.hasSplitShares, true);
    assert.equal(booking.splitShareCount, 2);
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "split_pending");

    for (const shareId of result.shareIds) {
      const share = fake.store.get(`arenaBookings/b1/paymentShares/${shareId}`)!;
      assert.equal(share.status, "pending");
      assert.ok(typeof share.asaasPaymentId === "string" && share.asaasPaymentId.length > 0);
      assert.ok(share.expiresAt instanceof Timestamp);
    }
  });

  it("rejeita quando a soma das fatias diverge do valor a pagar agora", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1");

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake),
        "owner1",
        "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 40}]},
        stubCreateCharge(),
        now,
      ),
      "failed-precondition",
    );

    // Nenhuma fatia deve ter sido criada.
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
  });

  it("rejeita quando quem chama não é o dono da reserva", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1");

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake),
        "intruder",
        "Intruso",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
        stubCreateCharge(),
        now,
      ),
      "permission-denied",
    );
  });

  it("rejeita reserva que não é PIX ou que já não está pending_payment", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {paymentChannel: "onsite"});

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake),
        "owner1",
        "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
        stubCreateCharge(),
        now,
      ),
      "failed-precondition",
    );
  });

  it("rejeita split duplicado (reserva já tem fatias em andamento)", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1");
    fake.seedDoc("arenaBookings/b1/paymentShares/existing", {
      payerAthleteId: "a",
      amountReais: 100,
      status: "pending",
    });

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake),
        "owner1",
        "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
        stubCreateCharge(),
        now,
      ),
      "failed-precondition",
    );
  });
});

describe("expireArenaBookingPaymentShareIfDue", () => {
  it("transfere o valor da fatia vencida para amountDueOnsiteReais do dono", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {amountDueOnsiteReais: 20});
    fake.seedDoc("arenaBookings/b1/paymentShares/s1", {
      payerAthleteId: "friend1",
      amountReais: 50,
      status: "pending",
      asaasPaymentId: "pay-friend1-1",
      expiresAt: Timestamp.fromMillis(gameTime - 2 * HOUR_MS - 1),
    });

    const result = await expireArenaBookingPaymentShareIfDue(db(fake), "b1", "s1", gameTime);

    assert.equal(result.expired, true);
    assert.equal(result.amountReais, 50);
    assert.equal(result.asaasPaymentId, "pay-friend1-1");

    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.amountDueOnsiteReais, 70);

    const share = fake.store.get("arenaBookings/b1/paymentShares/s1")!;
    assert.equal(share.status, "covered_by_organizer");
  });

  it("não faz nada se a fatia ainda não venceu", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {amountDueOnsiteReais: 20});
    fake.seedDoc("arenaBookings/b1/paymentShares/s1", {
      payerAthleteId: "friend1",
      amountReais: 50,
      status: "pending",
      expiresAt: Timestamp.fromMillis(gameTime + HOUR_MS),
    });

    const result = await expireArenaBookingPaymentShareIfDue(db(fake), "b1", "s1", gameTime);
    assert.equal(result.expired, false);
    assert.equal(fake.store.get("arenaBookings/b1")!.amountDueOnsiteReais, 20);
  });

  it("não faz nada se a fatia já não está pending (idempotente)", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {amountDueOnsiteReais: 20});
    fake.seedDoc("arenaBookings/b1/paymentShares/s1", {
      payerAthleteId: "friend1",
      amountReais: 50,
      status: "paid",
      expiresAt: Timestamp.fromMillis(gameTime - HOUR_MS),
    });

    const result = await expireArenaBookingPaymentShareIfDue(db(fake), "b1", "s1", gameTime);
    assert.equal(result.expired, false);
    assert.equal(fake.store.get("arenaBookings/b1")!.amountDueOnsiteReais, 20);
  });
});

describe("finalizeArenaBookingIfAllSharesResolved", () => {
  it("marca a reserva como paid quando todas as fatias foram pagas", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {status: "confirmed", paymentStatus: "split_pending"});
    fake.seedDoc("arenaBookings/b1/paymentShares/s1", {status: "paid", amountReais: 50});
    fake.seedDoc("arenaBookings/b1/paymentShares/s2", {status: "paid", amountReais: 50});

    await finalizeArenaBookingIfAllSharesResolved(db(fake), "b1");

    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "paid");
  });

  it("marca a reserva como partial quando alguma fatia virou conta do dono", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {status: "confirmed", paymentStatus: "split_pending"});
    fake.seedDoc("arenaBookings/b1/paymentShares/s1", {status: "paid", amountReais: 50});
    fake.seedDoc("arenaBookings/b1/paymentShares/s2", {status: "covered_by_organizer", amountReais: 50});

    await finalizeArenaBookingIfAllSharesResolved(db(fake), "b1");

    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.paymentStatus, "partial");
  });

  it("não altera nada enquanto houver fatia pending", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {status: "confirmed", paymentStatus: "split_pending"});
    fake.seedDoc("arenaBookings/b1/paymentShares/s1", {status: "paid", amountReais: 50});
    fake.seedDoc("arenaBookings/b1/paymentShares/s2", {status: "pending", amountReais: 50});

    await finalizeArenaBookingIfAllSharesResolved(db(fake), "b1");

    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.paymentStatus, "split_pending");
  });
});
