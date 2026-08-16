import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {computeBreakEven, monthlyEquivalentCents} from "./backoffice-finance";

describe("backoffice-finance.monthlyEquivalentCents", () => {
  it("mensal usa o valor cheio do plano", () => {
    assert.equal(monthlyEquivalentCents("starter", "monthly"), 9900);
    assert.equal(monthlyEquivalentCents("pro", "monthly"), 24900);
  });

  it("anual é rateado por 12", () => {
    assert.equal(monthlyEquivalentCents("starter", "yearly"), Math.round(108000 / 12));
    assert.equal(monthlyEquivalentCents("elite", "yearly"), Math.round(548400 / 12));
  });
});

describe("backoffice-finance.computeBreakEven", () => {
  it("MRR >= custos: break-even alcançado, sem plano de ação", () => {
    const result = computeBreakEven(500000, 500000, "starter");
    assert.equal(result.achieved, true);
    assert.equal(result.gapCents, 0);
    assert.equal(result.plansNeeded, 0);
  });

  it("MRR > custos também conta como alcançado", () => {
    const result = computeBreakEven(600000, 500000, "starter");
    assert.equal(result.achieved, true);
    assert.equal(result.plansNeeded, 0);
  });

  it("gap exato em múltiplos do plano de entrada", () => {
    // Gap de R$198 = exatamente 2 planos Starter (R$99).
    const result = computeBreakEven(0, 19800, "starter");
    assert.equal(result.achieved, false);
    assert.equal(result.gapCents, 19800);
    assert.equal(result.plansNeeded, 2);
  });

  it("gap não-múltiplo arredonda pra cima", () => {
    // Gap de R$100 precisa de 2 Starters (R$198) pra fechar — 1 não cobre.
    const result = computeBreakEven(0, 10000, "starter");
    assert.equal(result.plansNeeded, 2);
  });

  it("usa o valor mensal do tier de entrada informado", () => {
    const result = computeBreakEven(0, 49800, "pro");
    assert.equal(result.entryPlanMonthlyCents, 24900);
    assert.equal(result.plansNeeded, 2);
  });
});
