import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {arenaBookingAppPayment, isArenaBookingInactive, isArenaBookingPaidByApp} from "./arena-booking-app-payment";

const confirmed = {status: "confirmed", paymentStatus: "paid", amountReais: 120, amountPaidOnlineReais: 120};

describe("pagamento confirmado pelo app", () => {
  it("integral pelo app: tudo confirmado", () => {
    assert.deepEqual(arenaBookingAppPayment(confirmed), {confirmedReais: 120, totalReais: 120, share: 1, cancelled: false});
    assert.equal(isArenaBookingPaidByApp(confirmed), true);
  });

  it("sinal de 50% pelo app: conta, com share 0,5", () => {
    const b = {...confirmed, paymentStatus: "partial", amountPaidOnlineReais: 60, amountDueOnsiteReais: 60};
    assert.equal(arenaBookingAppPayment(b).share, 0.5);
    assert.equal(isArenaBookingPaidByApp(b), true);
  });

  it("rateio parcial: só as fatias pagas", () => {
    const b = {...confirmed, paymentStatus: "split_pending", hasSplitShares: true, amountPaidOnlineReais: 30};
    assert.equal(arenaBookingAppPayment(b).share, 0.25);
  });

  it("presencial, pendente e crédito de chuva: nada pago pelo app", () => {
    assert.equal(isArenaBookingPaidByApp({status: "active", paymentStatus: "none", amountReais: 120, amountPaidOnlineReais: 0}), false);
    assert.equal(isArenaBookingPaidByApp({status: "pending_payment", paymentStatus: "pending", amountReais: 120}), false);
    assert.equal(isArenaBookingPaidByApp({status: "active", paymentStatus: "paid", paymentChannel: "weather_credit", amountReais: 120, amountPaidOnlineReais: 0}), false);
  });

  it("cancelada, expirada ou estornada depois de paga: não vale", () => {
    for (const extra of [{status: "canceled"}, {status: "Cancelled"}, {status: "expired"}, {status: "refunded"}, {paymentStatus: "refunded"}, {refundedAt: new Date()}]) {
      const r = arenaBookingAppPayment({...confirmed, ...extra});
      assert.equal(r.confirmedReais, 0, JSON.stringify(extra));
      assert.equal(r.cancelled, true);
      assert.equal(r.share, 0);
    }
    assert.equal(isArenaBookingInactive({status: "no_show"}), false);
  });

  it("valores inválidos viram 0 e o share não passa de 1", () => {
    assert.deepEqual(arenaBookingAppPayment({status: "confirmed", amountPaidOnlineReais: "100"}),
      {confirmedReais: 0, totalReais: 0, share: 0, cancelled: false});
    assert.equal(arenaBookingAppPayment({...confirmed, amountPaidOnlineReais: 130}).share, 1);
  });
});
