import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  parseRegistrationBillingType,
  resolvePaymentPhases,
} from "./registration-payment-phases";

const FRESH = {alreadyConfirmed: false, alreadyCredited: false};

describe("parseRegistrationBillingType", () => {
  it("trata ausente e desconhecido como PIX (acervo sem o campo)", () => {
    assert.equal(parseRegistrationBillingType(undefined), "PIX");
    assert.equal(parseRegistrationBillingType(null), "PIX");
    assert.equal(parseRegistrationBillingType("BOLETO"), "PIX");
    assert.equal(parseRegistrationBillingType("CREDIT_CARD"), "CREDIT_CARD");
  });
});

describe("resolvePaymentPhases: PIX segue como sempre", () => {
  it("confirma e credita no RECEIVED", () => {
    assert.deepEqual(
      resolvePaymentPhases({billingType: "PIX", status: "RECEIVED", ...FRESH}),
      {confirm: true, credit: true},
    );
  });

  it("não faz nada no CONFIRMED", () => {
    assert.deepEqual(
      resolvePaymentPhases({billingType: "PIX", status: "CONFIRMED", ...FRESH}),
      {confirm: false, credit: false},
    );
  });

  it("aceita RECEIVED_IN_CASH", () => {
    assert.deepEqual(
      resolvePaymentPhases({
        billingType: "PIX",
        status: "RECEIVED_IN_CASH",
        ...FRESH,
      }),
      {confirm: true, credit: true},
    );
  });
});

describe("resolvePaymentPhases: cartão separa autorização de liquidação", () => {
  it("CONFIRMED confirma a inscrição sem creditar a carteira", () => {
    assert.deepEqual(
      resolvePaymentPhases({
        billingType: "CREDIT_CARD",
        status: "CONFIRMED",
        ...FRESH,
      }),
      {confirm: true, credit: false},
    );
  });

  it("RECEIVED depois do CONFIRMED só credita", () => {
    assert.deepEqual(
      resolvePaymentPhases({
        billingType: "CREDIT_CARD",
        status: "RECEIVED",
        alreadyConfirmed: true,
        alreadyCredited: false,
      }),
      {confirm: false, credit: true},
    );
  });

  it("RECEIVED sozinho faz as duas fases (CONFIRMED perdido)", () => {
    assert.deepEqual(
      resolvePaymentPhases({
        billingType: "CREDIT_CARD",
        status: "RECEIVED",
        ...FRESH,
      }),
      {confirm: true, credit: true},
    );
  });

  it("reentrega do mesmo evento não faz nada", () => {
    assert.deepEqual(
      resolvePaymentPhases({
        billingType: "CREDIT_CARD",
        status: "RECEIVED",
        alreadyConfirmed: true,
        alreadyCredited: true,
      }),
      {confirm: false, credit: false},
    );
  });

  it("AWAITING_RISK_ANALYSIS ainda não é nada", () => {
    assert.deepEqual(
      resolvePaymentPhases({
        billingType: "CREDIT_CARD",
        status: "AWAITING_RISK_ANALYSIS",
        ...FRESH,
      }),
      {confirm: false, credit: false},
    );
  });
});
