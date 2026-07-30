import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_FEE_PERCENT,
  TOURNAMENT_FEE_PERCENT,
  CLUB_FEE_PERCENT,
  FEE_FLOOR_REAIS,
  computePlatformFeeReais,
} from "./platform-fees";

describe("platform-fees.computePlatformFeeReais", () => {
  it("aplica o percentual quando acima do piso", () => {
    // 8% de 100 = 8 (> piso 1.5) — BOOKING_FEE_PERCENT agora é starter (8%)
    assert.equal(computePlatformFeeReais(100, BOOKING_FEE_PERCENT), 8);
    // 8% de 100 = 8
    assert.equal(computePlatformFeeReais(100, TOURNAMENT_FEE_PERCENT), 8);
  });

  it("usa o piso mínimo quando o percentual fica abaixo", () => {
    // 8% de 20 = 1.6 (< piso 1.5? não, é > 1.5) — deixa 1.6
    // 8% de 15 = 1.2 (< piso 1.5) -> piso
    assert.equal(computePlatformFeeReais(15, BOOKING_FEE_PERCENT), FEE_FLOOR_REAIS);
  });

  it("nunca excede o valor (deixa ao menos R$0,01)", () => {
    // valor 1.00, piso 1.5 -> limita a 0.99
    assert.equal(computePlatformFeeReais(1, BOOKING_FEE_PERCENT), 0.99);
  });

  it("arredonda para centavos", () => {
    // 8% de 33.33 = 2.6664 -> 2.67
    assert.equal(computePlatformFeeReais(33.33, BOOKING_FEE_PERCENT), 2.67);
  });

  it("retorna 0 para valores ou percentuais não positivos", () => {
    assert.equal(computePlatformFeeReais(0, BOOKING_FEE_PERCENT), 0);
    assert.equal(computePlatformFeeReais(-10, BOOKING_FEE_PERCENT), 0);
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
