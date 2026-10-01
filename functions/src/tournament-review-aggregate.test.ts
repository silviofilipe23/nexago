import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {computeReviewAggregate} from "./tournament-review-aggregate";

describe("computeReviewAggregate", () => {
  it("sem avaliações: contagem zero e o resto null", () => {
    assert.deepEqual(computeReviewAggregate([]), {count: 0, average: null, distribution: null, aspects: null});
  });

  it("abaixo de 3 só a contagem sai (o doc é público)", () => {
    assert.deepEqual(computeReviewAggregate([{overall: 1}, {overall: 5}]), {
      count: 2,
      average: null,
      distribution: null,
      aspects: null,
    });
  });

  it("a partir de 3: média, distribuição e só os aspectos que tiveram nota", () => {
    const aggregate = computeReviewAggregate([
      {overall: 5, aspects: {schedule: 2, venue: 4}},
      {overall: 4, aspects: {schedule: 3}},
      {overall: 3, aspects: {}},
    ]);
    assert.deepEqual(aggregate, {
      count: 3,
      average: 4,
      distribution: {"1": 0, "2": 0, "3": 1, "4": 1, "5": 1},
      aspects: {schedule: {count: 2, average: 2.5}, venue: {count: 1, average: 4}},
    });
  });

  it("arredonda a média em duas casas", () => {
    assert.equal(computeReviewAggregate([{overall: 5}, {overall: 5}, {overall: 4}]).average, 4.67);
  });

  it("ignora doc com nota geral inválida e aspecto inválido ou desconhecido", () => {
    const aggregate = computeReviewAggregate([
      {overall: 5, aspects: {schedule: 9, food: 5, venue: 4}},
      {overall: 4},
      {overall: 4},
      {overall: 0},
      {overall: "5"},
    ]);
    assert.equal(aggregate.count, 3);
    assert.deepEqual(aggregate.aspects, {venue: {count: 1, average: 4}});
  });
});
