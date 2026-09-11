import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  fieldStrengthFromTeamRanks,
  LIVRE_MAX_WEIGHT,
  LIVRE_MIN_WEIGHT,
  teamLevelRank,
  weightFromRank,
} from "./category-field-strength";

describe("teamLevelRank", () => {
  it("dupla vale o integrante MAIS FORTE (convenção da elegibilidade)", () => {
    assert.equal(teamLevelRank([2, 6]), 6);
    assert.equal(teamLevelRank([6, 2]), 6);
    assert.equal(teamLevelRank([0, 0]), 0);
  });

  it("ignora integrante sem degrau conhecido", () => {
    assert.equal(teamLevelRank([null, 3]), 3);
    assert.equal(teamLevelRank([undefined, 4, null]), 4);
  });

  it("dupla sem nenhum degrau conhecido é null", () => {
    assert.equal(teamLevelRank([null, null]), null);
    assert.equal(teamLevelRank([]), null);
    assert.equal(teamLevelRank([Number.NaN]), null);
  });
});

describe("weightFromRank", () => {
  it("ancora na escada de presets fechados", () => {
    assert.equal(weightFromRank(0), 0.125);
    assert.equal(weightFromRank(1), 0.125);
    assert.equal(weightFromRank(2), 0.25);
    assert.equal(weightFromRank(3), 0.25);
    assert.equal(weightFromRank(4), 0.5);
    assert.equal(weightFromRank(5), 0.5);
    assert.equal(weightFromRank(6), 1);
  });

  it("arredonda o degrau médio (Math.round, não piso)", () => {
    assert.equal(weightFromRank(4.2), 0.5);
    assert.equal(weightFromRank(5.4), 0.5);
    // 9 duplas Open + 1 intermediária = 5.6: com piso pagaria 0.5.
    assert.equal(weightFromRank(5.6), 1);
    assert.equal(weightFromRank(1.5), 0.25);
  });

  it("clampa nos dois extremos e sobrevive a valor inválido", () => {
    assert.equal(weightFromRank(-3), LIVRE_MIN_WEIGHT);
    assert.equal(weightFromRank(99), LIVRE_MAX_WEIGHT);
    assert.equal(weightFromRank(Number.NaN), LIVRE_MIN_WEIGHT);
  });
});

describe("fieldStrengthFromTeamRanks", () => {
  it("regressão DESAFIO OPEN - JHON JHON: 5 duplas com Open pesam 0.5", () => {
    const strength = fieldStrengthFromTeamRanks([6, 6, 6, 6, 6, 3, 3, 2, 2, 2]);
    assert.ok(strength);
    assert.equal(strength.measuredTeams, 10);
    assert.equal(strength.fieldRank, 4.2);
    assert.equal(strength.weight, 0.5);
  });

  it("duplas sem degrau ficam fora da média", () => {
    const strength = fieldStrengthFromTeamRanks([6, null, 2]);
    assert.ok(strength);
    assert.equal(strength.measuredTeams, 2);
    assert.equal(strength.fieldRank, 4);
    assert.equal(strength.weight, 0.5);
  });

  it("campo imensurável devolve null (não vira peso zero)", () => {
    assert.equal(fieldStrengthFromTeamRanks([null, null]), null);
    assert.equal(fieldStrengthFromTeamRanks([]), null);
  });
});
