import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  availableAt,
  costDeviationPercent,
  nextTransferStatus,
  nfKey,
  suggestedTransferQty,
  transferCode,
  unitCostsWithFreight,
  weightedAverageCost,
} from "./store-stock";

describe("weightedAverageCost", () => {
  it("pondera o saldo atual com a entrada", () => {
    // 22 un. a R$ 57,80 + 40 un. a R$ 62,50 → R$ 60,83
    assert.equal(weightedAverageCost(22, 5780, 40, 6250), 6083);
  });

  it("sem custo anterior ou sem saldo, o custo da entrada vira o médio", () => {
    assert.equal(weightedAverageCost(10, null, 5, 1000), 1000);
    assert.equal(weightedAverageCost(0, 5000, 5, 1000), 1000);
  });

  it("saída (ajuste negativo) não mexe no custo médio", () => {
    assert.equal(weightedAverageCost(10, 1500, -2, 900), 1500);
  });
});

describe("unitCostsWithFreight", () => {
  it("rateia o frete pelo valor de cada linha e fecha a soma", () => {
    const lines = [{qty: 40, unitCostCents: 6250}, {qty: 12, unitCostCents: 4820}];
    const out = unitCostsWithFreight(lines, 8500);
    const added = out.reduce((n, c, i) => n + (c - lines[i]!.unitCostCents) * lines[i]!.qty, 0);
    assert.ok(Math.abs(added - 8500) <= lines.length * 40, `rateio ${added}`);
    assert.ok(out[0]! > 6250 && out[1]! > 4820);
  });

  it("sem frete devolve os custos como vieram", () => {
    assert.deepEqual(unitCostsWithFreight([{qty: 2, unitCostCents: 100}], 0), [100]);
  });

  it("custo zero em tudo divide o frete por unidade", () => {
    assert.deepEqual(unitCostsWithFreight([{qty: 2, unitCostCents: 0}, {qty: 2, unitCostCents: 0}], 400), [100, 100]);
  });
});

describe("regras da entrada", () => {
  it("desvio do custo para a última compra", () => {
    assert.equal(Math.round(costDeviationPercent(6250, 5780)!), 8);
    assert.equal(costDeviationPercent(6250, null), null);
  });

  it("NF: mesmo fornecedor e número dão a mesma chave", () => {
    assert.equal(nfKey("Sunline Óculos Ltda.", "8812"), nfKey("sunline oculos ltda", " 8.812 "));
    assert.notEqual(nfKey("Sunline", "8812"), nfKey("Outra", "8812"));
  });
});

describe("transferência", () => {
  it("código com 3 dígitos", () => {
    assert.equal(transferCode(7), "TR-007");
    assert.equal(transferCode(1184), "TR-1184");
  });

  it("transições válidas e inválidas", () => {
    assert.equal(nextTransferStatus("rascunho", "separacao"), "separacao");
    assert.equal(nextTransferStatus("separacao", "em_transito"), "em_transito");
    assert.equal(nextTransferStatus("em_transito", "recebido"), "recebido");
    assert.equal(nextTransferStatus("separacao", "cancelar"), "cancelada");
    assert.equal(nextTransferStatus("em_transito", "cancelar"), null);
    assert.equal(nextTransferStatus("recebido", "em_transito"), null);
  });

  it("disponível desconta o reservado", () => {
    assert.equal(availableAt({stockByLocation: {cd: 10}, reservedByLocation: {cd: 4}}, "cd"), 6);
    assert.equal(availableAt({}, "cd"), 0);
  });

  it("sugerido: giro × 14 + reservados − destino, limitado à origem", () => {
    assert.equal(suggestedTransferQty({dailyOut: 0.5, reservedPending: 2, destQty: 3, originAvailable: 50, threshold: 3}), 6);
    assert.equal(suggestedTransferQty({dailyOut: 2, reservedPending: 0, destQty: 0, originAvailable: 5, threshold: 3}), 5);
    // Sem saídas registradas: só repõe até o alerta.
    assert.equal(suggestedTransferQty({dailyOut: 0, reservedPending: 0, destQty: 1, originAvailable: 9, threshold: 3}), 2);
    assert.equal(suggestedTransferQty({dailyOut: 0, reservedPending: 0, destQty: 8, originAvailable: 9, threshold: 3}), 0);
  });
});
