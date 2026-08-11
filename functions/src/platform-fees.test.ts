import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  TOURNAMENT_FEE_PERCENT,
  CLUB_FEE_PERCENT,
  FEE_FLOOR_REAIS,
  MAX_COMMISSION_PERCENT,
  computePlatformFeeReais,
  isValidCommissionPercent,
  resolveOrganizerTournamentFeePercent,
} from "./platform-fees";

describe("platform-fees.computePlatformFeeReais", () => {
  it("aplica o percentual quando acima do piso", () => {
    // 5% de 100 = 5 (> piso 1.5)
    assert.equal(computePlatformFeeReais(100, 5), 5);
    // 8% de 100 = 8
    assert.equal(computePlatformFeeReais(100, TOURNAMENT_FEE_PERCENT), 8);
  });

  it("usa o piso mínimo quando o percentual fica abaixo", () => {
    // 5% de 20 = 1 (< piso 1.5) -> piso
    assert.equal(computePlatformFeeReais(20, 5), FEE_FLOOR_REAIS);
  });

  it("nunca excede o valor (deixa ao menos R$0,01)", () => {
    // valor 1.00, piso 1.5 -> limita a 0.99
    assert.equal(computePlatformFeeReais(1, 5), 0.99);
  });

  it("arredonda para centavos", () => {
    // 5% de 33.33 = 1.6665 -> 1.67
    assert.equal(computePlatformFeeReais(33.33, 5), 1.67);
  });

  it("retorna 0 para valores ou percentuais não positivos", () => {
    assert.equal(computePlatformFeeReais(0, 5), 0);
    assert.equal(computePlatformFeeReais(-10, 5), 0);
    assert.equal(computePlatformFeeReais(100, 0), 0);
  });

  it("clubinho: 5% sem piso em tickets baixos", () => {
    // 5% de 15 = 0.75 (piso zerado — sem ele seria 1.50)
    assert.equal(computePlatformFeeReais(15, CLUB_FEE_PERCENT, {floorReais: 0}), 0.75);
    // 5% de 10 = 0.50
    assert.equal(computePlatformFeeReais(10, CLUB_FEE_PERCENT, {floorReais: 0}), 0.5);
  });

  it("floorReais omitido mantém o piso padrão (retrocompatível)", () => {
    assert.equal(computePlatformFeeReais(15, CLUB_FEE_PERCENT), FEE_FLOOR_REAIS);
    assert.equal(computePlatformFeeReais(15, CLUB_FEE_PERCENT, {}), FEE_FLOOR_REAIS);
  });
});

describe("platform-fees.resolveOrganizerTournamentFeePercent", () => {
  it("usa a comissão negociada no cadastro do organizador", () => {
    assert.equal(resolveOrganizerTournamentFeePercent({commissionPercent: 6}), 6);
    assert.equal(resolveOrganizerTournamentFeePercent({commissionPercent: 5}), 5);
  });

  it("aceita comissão zero (isenção negociada)", () => {
    assert.equal(resolveOrganizerTournamentFeePercent({commissionPercent: 0}), 0);
  });

  it("organizador sem cadastro mantém o padrão de hoje", () => {
    assert.equal(resolveOrganizerTournamentFeePercent(null), TOURNAMENT_FEE_PERCENT);
    assert.equal(resolveOrganizerTournamentFeePercent(undefined), TOURNAMENT_FEE_PERCENT);
    assert.equal(resolveOrganizerTournamentFeePercent({}), TOURNAMENT_FEE_PERCENT);
  });

  it("valor corrompido ou fora da faixa cai no padrão, nunca no lixo", () => {
    assert.equal(resolveOrganizerTournamentFeePercent({commissionPercent: -1}), TOURNAMENT_FEE_PERCENT);
    assert.equal(
      resolveOrganizerTournamentFeePercent({commissionPercent: MAX_COMMISSION_PERCENT + 1}),
      TOURNAMENT_FEE_PERCENT,
    );
    assert.equal(resolveOrganizerTournamentFeePercent({commissionPercent: "6"}), TOURNAMENT_FEE_PERCENT);
    assert.equal(resolveOrganizerTournamentFeePercent({commissionPercent: NaN}), TOURNAMENT_FEE_PERCENT);
    assert.equal(resolveOrganizerTournamentFeePercent({commissionPercent: null}), TOURNAMENT_FEE_PERCENT);
  });

  it("a comissão resolvida entra no cálculo da taxa", () => {
    // 6% de 200 = 12, contra 16 do padrão de 8%.
    const percent = resolveOrganizerTournamentFeePercent({commissionPercent: 6});
    assert.equal(computePlatformFeeReais(200, percent), 12);
  });
});

describe("platform-fees.isValidCommissionPercent", () => {
  it("aceita a faixa 0–20", () => {
    assert.equal(isValidCommissionPercent(0), true);
    assert.equal(isValidCommissionPercent(8), true);
    assert.equal(isValidCommissionPercent(MAX_COMMISSION_PERCENT), true);
  });

  it("recusa fora da faixa e não-números", () => {
    assert.equal(isValidCommissionPercent(-0.1), false);
    assert.equal(isValidCommissionPercent(MAX_COMMISSION_PERCENT + 0.1), false);
    assert.equal(isValidCommissionPercent(Infinity), false);
    assert.equal(isValidCommissionPercent("8"), false);
    assert.equal(isValidCommissionPercent(undefined), false);
  });
});
