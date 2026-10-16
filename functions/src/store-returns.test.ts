import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RETURNS_CONFIG,
  canSkipReturn,
  daysSinceDelivery,
  nextReturnStatus,
  returnCode,
  returnShipping,
  withReturnsDefaults,
  withinWindow,
} from "./store-returns";

describe("trocas · regras", () => {
  const ctx = {resolution: "troca" as const, skipReturn: false};

  it("fluxo analisar → aprovada → em trânsito → concluída; recusa só na análise", () => {
    assert.equal(nextReturnStatus("analisar", "aprovar", ctx), "aprovada");
    assert.equal(nextReturnStatus("aprovada", "em_transito", ctx), "em_transito");
    assert.equal(nextReturnStatus("em_transito", "receber", ctx), "concluida");
    assert.equal(nextReturnStatus("aprovada", "receber", ctx), "concluida");
    assert.equal(nextReturnStatus("analisar", "recusar", ctx), "recusada");
    assert.equal(nextReturnStatus("aprovada", "recusar", ctx), null);
    assert.equal(nextReturnStatus("concluida", "aprovar", ctx), null);
  });

  it("reenvio por defeito pode pular a volta do produto", () => {
    const skip = {resolution: "reenvio" as const, skipReturn: true};
    assert.equal(nextReturnStatus("aprovada", "concluir", skip), "concluida");
    assert.equal(nextReturnStatus("aprovada", "receber", skip), null);
    assert.equal(nextReturnStatus("aprovada", "concluir", ctx), null);
    assert.equal(canSkipReturn("avaria", "reenvio"), true);
    assert.equal(canSkipReturn("tamanho", "reenvio"), false);
    assert.equal(canSkipReturn("defeito", "reembolso"), false);
  });

  it("prazo conta o dia da entrega como dia 1", () => {
    const now = new Date("2026-10-16T15:00:00Z");
    assert.equal(daysSinceDelivery("2026-10-05", now), 12);
    assert.equal(daysSinceDelivery(null, now), null);
    assert.equal(withinWindow("2026-09-17", now, DEFAULT_RETURNS_CONFIG), true);
    assert.equal(withinWindow("2026-09-16", now, DEFAULT_RETURNS_CONFIG), false);
    assert.equal(withinWindow(null, now, DEFAULT_RETURNS_CONFIG), true);
  });

  it("frete: arena grátis; Correios pago pela loja em defeito/avaria", () => {
    assert.deepEqual(returnShipping("arena", "tamanho", DEFAULT_RETURNS_CONFIG), {costCents: 0, paidBy: "cliente"});
    assert.deepEqual(returnShipping("correios", "tamanho", DEFAULT_RETURNS_CONFIG), {costCents: 2490, paidBy: "cliente"});
    assert.deepEqual(returnShipping("correios", "defeito", DEFAULT_RETURNS_CONFIG), {costCents: 2490, paidBy: "loja"});
  });

  it("config salva completa com o padrão e ignora motivo desconhecido", () => {
    const c = withReturnsDefaults({windowDays: 7, storePaysReasons: ["defeito", "xpto"]});
    assert.equal(c.windowDays, 7);
    assert.equal(c.carrierLabelCents, 2490);
    assert.deepEqual(c.storePaysReasons, ["defeito"]);
    assert.equal(returnCode(31), "TC-031");
  });
});
