import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  buildArenaBookingShareExternalReference,
  expireArenaBookingPaymentShareIfDue,
  finalizeArenaBookingIfAllSharesResolved,
  normalizeOriginalChargeStatus,
  parseArenaBookingShareExternalReference,
  splitArenaBookingPaymentCore,
  validateSplitShares,
  type CreateShareChargeFn,
  type OriginalChargeOps,
} from "./arena-booking-split";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";
import {attachHoldPayment, holdCashback} from "./athlete-wallet";

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

function stubOriginalCharge(opts: {
  status?: string;
  /** Respostas sucessivas de `getStatus` (1ª chamada → `statuses[0]`, 2ª → `statuses[1]`, ...; repete a última). */
  statuses?: string[];
  statusError?: Error;
  /** `statusError` só nesta chamada (1ª = 1); as demais seguem `statuses`/`status`. Default: todas. */
  statusErrorOnCall?: number;
  cancelError?: Error;
  onCancel?: () => void;
} = {}): {
  ops: OriginalChargeOps;
  calls: {getStatus: string[]; cancelOrThrow: string[]; cancelIfOpen: string[]};
} {
  const calls = {
    getStatus: [] as string[],
    cancelOrThrow: [] as string[],
    cancelIfOpen: [] as string[],
  };
  let statusCallCount = 0;
  const ops: OriginalChargeOps = {
    getStatus: async (paymentId) => {
      calls.getStatus.push(paymentId);
      statusCallCount += 1;
      if (
        opts.statusError &&
        (opts.statusErrorOnCall === undefined || opts.statusErrorOnCall === statusCallCount)
      ) {
        throw opts.statusError;
      }
      if (opts.statuses) {
        const idx = Math.min(statusCallCount - 1, opts.statuses.length - 1);
        return opts.statuses[idx];
      }
      return opts.status ?? "PENDING";
    },
    cancelOrThrow: async (paymentId) => {
      calls.cancelOrThrow.push(paymentId);
      opts.onCancel?.();
      if (opts.cancelError) throw opts.cancelError;
    },
    cancelIfOpen: async (paymentId) => {
      calls.cancelIfOpen.push(paymentId);
    },
  };
  return {ops, calls};
}

/** Cria a 1ª cobrança e falha na 2ª — simula o Asaas caindo no meio da divisão. */
function createChargeFailingOnSecond(): CreateShareChargeFn {
  let counter = 0;
  return async ({athleteId}) => {
    counter += 1;
    if (counter === 2) throw new Error("asaas fora do ar");
    return {paymentId: `pay-${athleteId}-${counter}`, qrCode: "qr", qrCodeBase64: "b64"};
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
      stubOriginalCharge().ops,
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
        stubOriginalCharge().ops,
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
        stubOriginalCharge().ops,
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
        stubOriginalCharge().ops,
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
        stubOriginalCharge().ops,
        now,
      ),
      "failed-precondition",
    );
  });

  it("não consulta o Asaas quando a reserva não tem cobrança da reserva inteira", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1");
    const original = stubOriginalCharge();

    await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
      stubCreateCharge(), original.ops, now,
    );

    assert.deepEqual(original.calls.getStatus, []);
    assert.deepEqual(original.calls.cancelOrThrow, []);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.supersededAsaasPaymentIds, undefined);
  });

  it("cancela a cobrança original aberta depois das fatias e tira ela da reserva", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1", pixCopyPaste: "qr-orig"});
    const original = stubOriginalCharge({status: "PENDING"});

    const result = await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
      stubCreateCharge(), original.ops, now,
    );

    assert.equal(result.shareIds.length, 2);
    assert.deepEqual(original.calls.getStatus, ["orig1"]);
    assert.deepEqual(original.calls.cancelOrThrow, ["orig1"]);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.asaasPaymentId, null);
    assert.equal(booking.pixCopyPaste, null);
    assert.deepEqual(booking.supersededAsaasPaymentIds, ["orig1"]);
    assert.equal(booking.paymentStatus, "split_pending");
  });

  it("recusa dividir quando o PIX da reserva inteira já foi pago", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({status: "RECEIVED"});
    let chargesCreated = 0;
    const countingCharge: CreateShareChargeFn = async (p) => {
      chargesCreated += 1;
      return stubCreateCharge()(p);
    };

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
        countingCharge, original.ops, now,
      ),
      "failed-precondition",
    );

    assert.equal(chargesCreated, 0);
    assert.deepEqual(original.calls.cancelOrThrow, []);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.status, "pending_payment");
    assert.equal(booking.asaasPaymentId, "orig1");
  });

  it("cobrança original já removida no Asaas não bloqueia a divisão", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({status: "DELETED"});

    await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
      stubCreateCharge(), original.ops, now,
    );

    assert.deepEqual(original.calls.cancelOrThrow, []);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.asaasPaymentId, null);
    assert.deepEqual(booking.supersededAsaasPaymentIds, ["orig1"]);
  });

  it("falha ao consultar a cobrança original recusa com unavailable e não cria fatias", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({statusError: new Error("timeout")});

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
        stubCreateCharge(), original.ops, now,
      ),
      "unavailable",
    );

    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
  });

  it("falha ao cancelar a original desfaz as fatias (Asaas e docs) e deixa a reserva intacta", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({status: "PENDING", cancelError: new Error("asaas 500")});

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
        stubCreateCharge(), original.ops, now,
      ),
      "unavailable",
    );

    assert.deepEqual(original.calls.cancelIfOpen.sort(), ["pay-a-1", "pay-b-2"]);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.status, "pending_payment");
    assert.equal(booking.asaasPaymentId, "orig1");
    assert.equal(booking.hasSplitShares, undefined);
    assert.deepEqual(booking.supersededAsaasPaymentIds, []);
  });

  it("falha na 2ª fatia cancela no Asaas a cobrança da 1ª e não toca na original", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({status: "PENDING"});

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
        createChargeFailingOnSecond(), original.ops, now,
      ),
      "internal",
    );

    assert.deepEqual(original.calls.cancelIfOpen, ["pay-a-1"]);
    assert.deepEqual(original.calls.cancelOrThrow, []);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
    assert.equal(fake.store.get("arenaBookings/b1")!.asaasPaymentId, "orig1");
  });

  it("marca a original como substituída antes de cancelar", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    let supersededAtCancelTime: unknown;
    const original = stubOriginalCharge({
      status: "PENDING",
      onCancel: () => {
        supersededAtCancelTime = fake.store.get("arenaBookings/b1")!.supersededAsaasPaymentIds;
      },
    });

    await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
      stubCreateCharge(), original.ops, now,
    );

    assert.deepEqual(supersededAtCancelTime, ["orig1"]);
  });

  it("cancelamento que falhou mas apagou a original segue a divisão", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({
      statuses: ["PENDING", "DELETED"],
      cancelError: new Error("timeout"),
    });

    const result = await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
      stubCreateCharge(), original.ops, now,
    );

    assert.equal(result.shareIds.length, 2);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 2);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.paymentStatus, "split_pending");
    assert.equal(booking.asaasPaymentId, null);
    assert.deepEqual(booking.supersededAsaasPaymentIds, ["orig1"]);
    assert.deepEqual(original.calls.cancelIfOpen, []);
  });

  it("acumula supersededAsaasPaymentIds", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {
      asaasPaymentId: "orig1",
      supersededAsaasPaymentIds: ["old"],
    });
    const original = stubOriginalCharge({status: "PENDING"});

    await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
      stubCreateCharge(), original.ops, now,
    );

    const booking = fake.store.get("arenaBookings/b1")!;
    assert.deepEqual(booking.supersededAsaasPaymentIds, ["old", "orig1"]);
  });

  it("recusa dividir quando a original está CONFIRMED", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({status: "CONFIRMED"});

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
        stubCreateCharge(), original.ops, now,
      ),
      "failed-precondition",
    );

    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
  });

  it("original paga durante a janela do cancelamento recusa com mensagem de já pago", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({
      statuses: ["PENDING", "RECEIVED"],
      cancelError: new Error("timeout"),
    });

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
        stubCreateCharge(), original.ops, now,
      ),
      "failed-precondition",
    );

    assert.deepEqual(original.calls.cancelIfOpen.sort(), ["pay-a-1", "pay-b-2"]);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.status, "pending_payment");
    assert.equal(booking.asaasPaymentId, "orig1");
    assert.deepEqual(booking.supersededAsaasPaymentIds, []);
  });

  it("cancelamento falha e a reconferência de status também falha: rollback com unavailable", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({
      statuses: ["PENDING"],
      cancelError: new Error("asaas 500"),
      statusError: new Error("timeout na reconferência"),
      statusErrorOnCall: 2,
    });

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
        stubCreateCharge(), original.ops, now,
      ),
      "unavailable",
    );

    assert.deepEqual(original.calls.cancelIfOpen.sort(), ["pay-a-1", "pay-b-2"]);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.status, "pending_payment");
    assert.equal(booking.asaasPaymentId, "orig1");
    assert.deepEqual(booking.supersededAsaasPaymentIds, []);
  });

  it("restaura supersededAsaasPaymentIds preservando entradas anteriores quando o cancelamento falha", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {
      asaasPaymentId: "orig1",
      supersededAsaasPaymentIds: ["old"],
    });
    const original = stubOriginalCharge({status: "PENDING", cancelError: new Error("asaas 500")});

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
        stubCreateCharge(), original.ops, now,
      ),
      "unavailable",
    );

    const booking = fake.store.get("arenaBookings/b1")!;
    assert.deepEqual(booking.supersededAsaasPaymentIds, ["old"]);
  });

  it("reserva cancelada durante a divisão (cron/atleta) não volta como confirmada", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({
      status: "PENDING",
      onCancel: () => {
        // Simula o cron de expiração ou o cancelamento do atleta cancelando a
        // reserva no Firestore enquanto o cancelamento na Asaas está em voo.
        fake.seedDoc("arenaBookings/b1", {
          ...fake.store.get("arenaBookings/b1")!,
          status: "cancelled",
        });
      },
    });

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
        stubCreateCharge(), original.ops, now,
      ),
      "failed-precondition",
    );

    assert.deepEqual(original.calls.cancelIfOpen.sort(), ["pay-a-1", "pay-b-2"]);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.status, "cancelled");
    assert.equal(booking.hasSplitShares, undefined);
  });

  it("reserva cancelada durante a criação das fatias (sem original) não volta como confirmada", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1");
    const original = stubOriginalCharge();
    let counter = 0;
    const createChargeThenCancel: CreateShareChargeFn = async ({athleteId}) => {
      counter += 1;
      if (counter === 2) {
        // Simula o cron/atleta cancelando a reserva entre a criação da 1ª e
        // da 2ª fatia.
        fake.seedDoc("arenaBookings/b1", {
          ...fake.store.get("arenaBookings/b1")!,
          status: "cancelled",
        });
      }
      return {paymentId: `pay-${athleteId}-${counter}`, qrCode: "qr", qrCodeBase64: "b64"};
    };

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
        createChargeThenCancel, original.ops, now,
      ),
      "failed-precondition",
    );

    assert.deepEqual(original.calls.cancelIfOpen.sort(), ["pay-a-1", "pay-b-2"]);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.status, "cancelled");
    assert.equal(booking.hasSplitShares, undefined);
  });

  it("devolve o saldo reservado pelo PIX da reserva inteira ao dividir", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("athleteWallets/owner1/lots/old", {
      uid: "owner1", sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: 2000, remainingCents: 2000, status: "available",
      eventAt: Timestamp.fromMillis(now - 1000), releasedAt: Timestamp.fromMillis(now - 1000),
      expiresAt: Timestamp.fromMillis(now + 90 * 86_400_000), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(now - 1000),
    });
    const {holdId} = await holdCashback(db(fake), {
      uid: "owner1", maxCents: 1500, sourceType: "booking", sourceId: "b1",
      trackingPath: "arenaBookings/b1", label: "Reserva", nowMs: now,
    });
    await attachHoldPayment(db(fake), "owner1", holdId!, "orig1");
    seedPendingPixBooking(fake, "b1", {
      asaasPaymentId: "orig1", cashbackAppliedCents: 1500, cashbackHoldId: holdId,
    });

    await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
      stubCreateCharge(), stubOriginalCharge({status: "PENDING"}).ops, now,
    );

    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${holdId}`)!.status, "released");
    assert.equal(fake.store.get("athleteWallets/owner1/lots/old")!.remainingCents, 2000);
  });

  it("cashbackHoldId forjado na reserva: a divisão não devolve a reserva de saldo de outra cobrança", async () => {
    // A reserva de quadra é gravável pelo atleta dono: o id da reserva de
    // saldo nunca vem dela. Devolver a reserva de outra cobrança ainda viva
    // deixaria o atleta pagar aquela cobrança com desconto e gastar o saldo de novo.
    const fake = new FakeFirestore();
    fake.seedDoc("athleteWallets/owner1/lots/old", {
      uid: "owner1", sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: 2000, remainingCents: 2000, status: "available",
      eventAt: Timestamp.fromMillis(now - 1000), releasedAt: Timestamp.fromMillis(now - 1000),
      expiresAt: Timestamp.fromMillis(now + 90 * 86_400_000), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(now - 1000),
    });
    const {holdId: otherHoldId} = await holdCashback(db(fake), {
      uid: "owner1", maxCents: 1500, sourceType: "booking", sourceId: "b2",
      trackingPath: "arenaBookings/b2", label: "Reserva", nowMs: now,
    });
    await attachHoldPayment(db(fake), "owner1", otherHoldId!, "payB2");
    seedPendingPixBooking(fake, "b1", {
      asaasPaymentId: "orig1", cashbackAppliedCents: 1500, cashbackHoldId: otherHoldId,
    });

    await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
      stubCreateCharge(), stubOriginalCharge({status: "PENDING"}).ops, now,
    );

    assert.equal(fake.store.get(`athleteWallets/owner1/holds/${otherHoldId}`)!.status, "open");
    assert.equal(fake.store.get("athleteWallets/owner1/lots/old")!.remainingCents, 500);
  });
});

describe("normalizeOriginalChargeStatus", () => {
  it("devolve DELETED para cobrança removida, mesmo com status antigo", () => {
    assert.equal(normalizeOriginalChargeStatus({status: "PENDING", deleted: true}), "DELETED");
  });

  it("devolve o status em maiúsculas quando a cobrança existe", () => {
    assert.equal(normalizeOriginalChargeStatus({status: "received"}), "RECEIVED");
    assert.equal(normalizeOriginalChargeStatus({}), "");
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
