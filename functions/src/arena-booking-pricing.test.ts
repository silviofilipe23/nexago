import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  arenaBookingAmountsPatch,
  normalizeArenaBookingPaymentFraction,
  resolveAndSyncArenaBookingChargeAmounts,
  resolveArenaBookingChargeAmounts,
} from "./arena-booking-pricing";

/** Doc como createArenaBooking grava para PIX integral de R$ 120. */
const honestBooking = {
  amountReais: 120,
  amountToPayNowReais: 120,
  amountDueOnsiteReais: 0,
  paymentFraction: 1,
};

/** O mesmo doc depois de o dono reescrever os valores pelo cliente. */
const forgedBooking = {
  amountReais: 1,
  amountToPayNowReais: 1,
  amountDueOnsiteReais: 0,
  paymentFraction: 1,
};

describe("normalizeArenaBookingPaymentFraction", () => {
  it("aceita só sinal (0.5) e integral (1)", () => {
    assert.equal(normalizeArenaBookingPaymentFraction(0.5), 0.5);
    assert.equal(normalizeArenaBookingPaymentFraction("1"), 1);
    assert.equal(normalizeArenaBookingPaymentFraction(0.01), null);
    assert.equal(normalizeArenaBookingPaymentFraction(undefined), null);
  });
});

describe("resolveArenaBookingChargeAmounts", () => {
  it("cobra pelo total do servidor, ignorando o valor forjado no doc", () => {
    const amounts = resolveArenaBookingChargeAmounts({serverAmountReais: 120, booking: forgedBooking});
    assert.deepEqual(amounts, {
      amountReais: 120,
      paymentFraction: 1,
      amountToPayNowReais: 120,
      amountDueOnsiteReais: 0,
      source: "server",
    });
  });

  it("sinal pedido agora vira metade do total do servidor", () => {
    const amounts = resolveArenaBookingChargeAmounts({
      serverAmountReais: 120,
      booking: forgedBooking,
      requestedFraction: 0.5,
    });
    assert.equal(amounts.amountToPayNowReais, 60);
    assert.equal(amounts.amountDueOnsiteReais, 60);
  });

  it("fração fora de {0.5, 1} gravada no doc não é usada", () => {
    const amounts = resolveArenaBookingChargeAmounts({
      serverAmountReais: 120,
      booking: {...forgedBooking, paymentFraction: 0.01},
      requestedFraction: 0.01,
    });
    assert.equal(amounts.paymentFraction, 1);
    assert.equal(amounts.amountToPayNowReais, 120);
  });

  it("reserva legada (sem arenaBookingPricing) cai no total do próprio doc", () => {
    const amounts = resolveArenaBookingChargeAmounts({
      serverAmountReais: null,
      booking: {...honestBooking, paymentFraction: 0.5, amountToPayNowReais: 60},
    });
    assert.equal(amounts.source, "booking_doc");
    assert.equal(amounts.amountToPayNowReais, 60);
  });
});

describe("arenaBookingAmountsPatch", () => {
  it("devolve só os campos que divergem", () => {
    const amounts = resolveArenaBookingChargeAmounts({serverAmountReais: 120, booking: honestBooking});
    assert.deepEqual(arenaBookingAmountsPatch(honestBooking, amounts), {});
    assert.deepEqual(arenaBookingAmountsPatch(forgedBooking, amounts), {
      amountReais: 120,
      amountToPayNowReais: 120,
    });
  });
});

describe("resolveAndSyncArenaBookingChargeAmounts", () => {
  it("lê arenaBookingPricing e regrava no doc os valores adulterados", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/b1", {status: "pending_payment", ...forgedBooking});
    fake.seedDoc("arenaBookingPricing/b1", {amountReais: 120});

    const amounts = await resolveAndSyncArenaBookingChargeAmounts(
      fake as unknown as Firestore,
      "b1",
      fake.store.get("arenaBookings/b1")!,
    );

    assert.equal(amounts.amountToPayNowReais, 120);
    const stored = fake.store.get("arenaBookings/b1")!;
    assert.equal(stored.amountReais, 120);
    assert.equal(stored.amountToPayNowReais, 120);
    assert.equal(stored.status, "pending_payment");
  });

  it("troca para sinal grava fração e valores no doc", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/b1", {...honestBooking});
    fake.seedDoc("arenaBookingPricing/b1", {amountReais: 120});

    await resolveAndSyncArenaBookingChargeAmounts(
      fake as unknown as Firestore,
      "b1",
      fake.store.get("arenaBookings/b1")!,
      0.5,
    );

    const stored = fake.store.get("arenaBookings/b1")!;
    assert.equal(stored.paymentFraction, 0.5);
    assert.equal(stored.amountToPayNowReais, 60);
    assert.equal(stored.amountDueOnsiteReais, 60);
  });

  it("doc íntegro e legado: não escreve nada", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/b1", {...honestBooking});
    const before = {...fake.store.get("arenaBookings/b1")!};

    const amounts = await resolveAndSyncArenaBookingChargeAmounts(
      fake as unknown as Firestore,
      "b1",
      before,
    );

    assert.equal(amounts.source, "booking_doc");
    assert.deepEqual(fake.store.get("arenaBookings/b1"), before);
  });
});
