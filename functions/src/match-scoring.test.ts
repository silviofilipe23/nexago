import assert from "node:assert/strict";
import {test} from "node:test";

import {
  isSetWon,
  matchBestOfFromCategory,
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

test("matchBestOfFromCategory: categoria de set único gera partida de 1 set", () => {
  assert.equal(matchBestOfFromCategory("singleSet"), 1);
});

test("matchBestOfFromCategory: MD3 e MD5 geram partida de 3 sets", () => {
  assert.equal(matchBestOfFromCategory("bestOf3"), 3);
  // MD5 não é suportado no placar (mesa, telão e app leem só 1 ou 3), então
  // continua valendo como MD3 — que é como já era jogado antes deste campo.
  assert.equal(matchBestOfFromCategory("bestOf5"), 3);
});

test("matchBestOfFromCategory: categoria sem o campo mantém MD3 (torneio antigo)", () => {
  assert.equal(matchBestOfFromCategory(undefined), 3);
  assert.equal(matchBestOfFromCategory(null), 3);
  assert.equal(matchBestOfFromCategory(""), 3);
  assert.equal(matchBestOfFromCategory(3), 3);
});

test("futevôlei: set fecha em 18 com 2 de diferença e decisivo em 15", () => {
  assert.equal(targetPointsForSet(0, 3, "footvolley"), 18);
  assert.equal(targetPointsForSet(1, 3, "footvolley"), 18);
  assert.equal(targetPointsForSet(2, 3, "footvolley"), 15);
  assert.equal(targetPointsForSet(0, 1, "footvolley"), 18);
  // Sem esporte / outros esportes: regra histórica de vôlei de praia.
  assert.equal(targetPointsForSet(0, 3), 21);
  assert.equal(targetPointsForSet(0, 3, "beachVolleyball"), 21);
});

test("futevôlei: 18x16 fecha o set, 18x17 não; vence com 2 sets", () => {
  const closed = [{a: 18, b: 16}, {a: 18, b: 10}];
  assert.equal(matchWinnerId(closed, "A", "B", 3, "footvolley"), "A");
  // Na regra de vôlei de praia esses sets nem fecham.
  assert.equal(matchWinnerId(closed, "A", "B", 3), null);

  const open = [{a: 18, b: 17}, {a: 17, b: 18}];
  assert.equal(setsWon(open, 3, "footvolley").a, 0);
  assert.equal(setsWon([{a: 20, b: 18}], 3, "footvolley").a, 1);
});

test("futevôlei: 1x1 vai ao 3º set de 15", () => {
  const sets = [{a: 18, b: 12}, {a: 9, b: 18}, {a: 15, b: 13}];
  assert.equal(matchWinnerId(sets, "A", "B", 3, "footvolley"), "A");
  assert.equal(
    matchWinnerId([{a: 18, b: 12}, {a: 9, b: 18}, {a: 15, b: 14}], "A", "B", 3, "footvolley"),
    null,
  );
});
