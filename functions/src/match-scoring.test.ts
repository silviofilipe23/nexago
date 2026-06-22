import assert from "node:assert/strict";
import {test} from "node:test";

import {
  isSetWon,
  matchWinnerId,
  parseAndValidateSets,
  setsWon,
  targetPointsForSet,
} from "./match-scoring";

test("isSetWon exige vantagem de 2", () => {
  assert.equal(isSetWon(21, 19), true);
  assert.equal(isSetWon(21, 20), false);
  assert.equal(isSetWon(22, 20), true);
});

test("set decisivo usa alvo 15", () => {
  assert.equal(targetPointsForSet(2, 3), 15);
  assert.equal(targetPointsForSet(0, 3), 21);
});

test("setsWon ignora sets incompletos", () => {
  const wins = setsWon([
    {a: 21, b: 3},
    {a: 5, b: 2},
  ]);
  assert.equal(wins.a, 1);
  assert.equal(wins.b, 0);
});

test("matchWinnerId exige sets vencidos pelas regras", () => {
  assert.equal(
    matchWinnerId([{a: 21, b: 3}, {a: 5, b: 2}], "a", "b"),
    null,
  );
  assert.equal(
    matchWinnerId([{a: 21, b: 3}, {a: 21, b: 18}], "a", "b"),
    "a",
  );
});

test("matchWinnerId respeita o alvo 15 no 3º set", () => {
  assert.equal(
    matchWinnerId(
      [{a: 21, b: 18}, {a: 19, b: 21}, {a: 15, b: 12}],
      "a",
      "b",
    ),
    "a",
  );
  assert.equal(
    matchWinnerId(
      [{a: 21, b: 18}, {a: 19, b: 21}, {a: 13, b: 11}],
      "a",
      "b",
    ),
    null,
  );
});

test("parseAndValidateSets rejeita empate, vazio e fora de faixa", () => {
  assert.throws(() => parseAndValidateSets([]));
  assert.throws(() => parseAndValidateSets([{a: 10, b: 10}]));
  assert.throws(() => parseAndValidateSets([{a: -1, b: 5}]));
  assert.throws(() => parseAndValidateSets([{a: 21, b: 2.5}]));
  assert.throws(() =>
    parseAndValidateSets([
      {a: 1, b: 0},
      {a: 1, b: 0},
      {a: 1, b: 0},
      {a: 1, b: 0},
    ]),
  );
});

test("parseAndValidateSets aceita placar válido e normaliza", () => {
  const sets = parseAndValidateSets([
    {a: 21, b: 19},
    {a: 18, b: 21},
  ]);
  assert.deepEqual(sets, [
    {a: 21, b: 19},
    {a: 18, b: 21},
  ]);
});

test("bestOf 1: vitória em um set conclui a partida", () => {
  assert.equal(matchWinnerId([{a: 21, b: 18}], "teamA", "teamB", 1), "teamA");
  assert.deepEqual(setsWon([{a: 21, b: 18}], 1), {a: 1, b: 0});
});

test("bestOf 1: set único vai até 21 (sem tiebreak)", () => {
  assert.equal(targetPointsForSet(0, 1), 21);
});

test("parseAndValidateSets respeita o limite de sets do formato", () => {
  assert.throws(() =>
    parseAndValidateSets([{a: 21, b: 10}, {a: 21, b: 10}], 1),
  );
  assert.doesNotThrow(() => parseAndValidateSets([{a: 21, b: 10}], 1));
});
