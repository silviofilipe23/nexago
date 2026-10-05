import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {legacyMercadoPagoChargeReais} from "./mercadopago-endpoints";

describe("Mercado Pago (legado) · valor da inscrição", () => {
  it("parcela da dupla é a metade; taxa inteira em 'full' e na categoria individual", () => {
    assert.equal(legacyMercadoPagoChargeReais({entryFee: 100, amountType: "share", teamSize: 2}), 50);
    assert.equal(legacyMercadoPagoChargeReais({entryFee: 100, amountType: "full", teamSize: 2}), 100);
    assert.equal(legacyMercadoPagoChargeReais({entryFee: 100, amountType: "share", teamSize: 1}), 100);
  });
});
