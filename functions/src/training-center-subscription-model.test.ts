import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BILLING,
  billingDayFor,
  cycleInvoiceId,
  dunningStage,
  firstChargeAfter,
  firstInvoiceCents,
  packFinished,
  planChangeProration,
  readBilling,
  shiftMonths,
} from "./training-center-subscription-model";

describe("recorrência · datas", () => {
  it("primeiro vencimento depois da contratação", () => {
    assert.equal(firstChargeAfter("2026-10-02", 5), "2026-10-05");
    assert.equal(firstChargeAfter("2026-10-05", 5), "2026-11-05");
    assert.equal(firstChargeAfter("2026-10-20", 5), "2026-11-05");
  });

  it("dia 31 em mês curto cai no último dia; dia da matrícula limita a 28", () => {
    assert.equal(shiftMonths("2026-01-31", 1, 31), "2026-02-28");
    assert.equal(billingDayFor({...DEFAULT_BILLING, billingDayMode: "enrollment"}, "2026-10-30"), 28);
  });

  it("proporcional do 1º mês com vencimento fixo", () => {
    // Entrou dia 20/out, vence todo dia 05: 16 dias de 31 (05/out → 05/nov).
    const r = firstInvoiceCents(32000, DEFAULT_BILLING, "2026-10-20");
    assert.deepEqual(r, {cents: Math.round((32000 * 16) / 31), prorated: true, days: 16, cycleDays: 31});
    assert.equal(firstInvoiceCents(32000, {...DEFAULT_BILLING, firstMonth: "full"}, "2026-10-20").cents, 32000);
    assert.equal(firstInvoiceCents(32000, {...DEFAULT_BILLING, billingDayMode: "enrollment"}, "2026-10-20").cents, 32000);
  });

  it("mudar de plano cobra a diferença dos dias restantes; downgrade não devolve", () => {
    // Exemplo do protótipo: 15 de 31 dias, 320 → 420.
    assert.equal(planChangeProration(32000, 42000, "2026-10-21", "2026-11-05", 5).cents, Math.round((10000 * 15) / 31));
    assert.equal(planChangeProration(42000, 32000, "2026-10-21", "2026-11-05", 5).cents, 0);
  });

  it("id do ciclo é fixo (gerar de novo não duplica)", () => {
    assert.equal(cycleInvoiceId("e1", "2026-11"), "sub_e1_2026-11");
  });
});

describe("recorrência · régua", () => {
  it("estágios pelos dias de atraso", () => {
    const b = DEFAULT_BILLING;
    assert.deepEqual([0, 1, 6, 7, 15, 19, 20, 44, 45].map((d) => dunningStage(d, b)), [0, 1, 1, 2, 3, 3, 4, 4, 5]);
    assert.equal(dunningStage(100, {...b, blockAfterDays: 0, suspendAfterDays: 0}), 2);
  });

  it("políticas inválidas caem no padrão", () => {
    assert.deepEqual(readBilling({billingDay: 40, firstMonth: "x", lateFees: false}), {...DEFAULT_BILLING, lateFees: false});
  });
});

describe("pacotes", () => {
  it("vencido pela validade ou sem crédito", () => {
    const c = {planType: "class_pack", validityDays: 30, contractedAt: "2026-09-01"};
    assert.equal(packFinished(c, 3, "2026-10-01"), null);
    assert.equal(packFinished(c, 3, "2026-10-02"), "expired");
    assert.equal(packFinished({...c, validityDays: 60}, 0, "2026-10-02"), "used");
    assert.equal(packFinished({planType: "monthly"}, 0, "2026-10-02"), null);
  });
});
