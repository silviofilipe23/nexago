import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  cardChargeBlockReason,
  cardPaymentDeadline,
  decideCardChargeBeforeRelease,
} from "./arena-booking-card";

const MIN = 60_000;

describe("cardPaymentDeadline", () => {
  const criada = new Date("2026-10-19T20:00:00Z");

  it("cartão ganha até 15 min desde a criação da reserva", () => {
    const pix = new Date(criada.getTime() + 5 * MIN);
    assert.equal(
      cardPaymentDeadline(criada, pix).toISOString(),
      new Date(criada.getTime() + 15 * MIN).toISOString(),
    );
  });

  it("gerar de novo não estica: o prazo é ancorado na criação", () => {
    const jaEstendido = new Date(criada.getTime() + 15 * MIN);
    assert.equal(cardPaymentDeadline(criada, jaEstendido).getTime(), jaEstendido.getTime());
  });

  it("prazo atual maior que o do cartão fica como está", () => {
    const maior = new Date(criada.getTime() + 30 * MIN);
    assert.equal(cardPaymentDeadline(criada, maior).getTime(), maior.getTime());
  });

  it("sem data de criação, estica o prazo atual em 10 min", () => {
    const atual = new Date(criada.getTime() + 5 * MIN);
    assert.equal(cardPaymentDeadline(null, atual).getTime(), atual.getTime() + 10 * MIN);
  });
});

describe("decideCardChargeBeforeRelease", () => {
  it("aprovado ou liquidado: reconcilia (confirma a reserva), nunca libera o horário", () => {
    for (const s of ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH", "confirmed"]) {
      assert.equal(decideCardChargeBeforeRelease(s), "reconcile", s);
    }
  });

  it("em análise de risco: espera", () => {
    assert.equal(decideCardChargeBeforeRelease("AWAITING_RISK_ANALYSIS"), "wait");
  });

  it("pendente, vencido ou já removido: apaga e libera", () => {
    for (const s of ["PENDING", "OVERDUE", "DELETED", ""]) {
      assert.equal(decideCardChargeBeforeRelease(s), "delete", s);
    }
  });
});

describe("cardChargeBlockReason", () => {
  it("reserva comum aceita cartão", () => {
    assert.equal(cardChargeBlockReason({status: "pending_payment"}), null);
  });

  it("reserva dividida (ou em divisão) segue só PIX", () => {
    assert.match(cardChargeBlockReason({hasSplitShares: true}) ?? "", /PIX/);
    assert.match(cardChargeBlockReason({supersededAsaasPaymentIds: ["p1"]}) ?? "", /PIX/);
  });
});
