import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {matchResultFields} from "./organizer-match-ops";
import {categoryScoringProfile} from "./match-scoring";

const BT = {kind: "sets_games", bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: "super_tiebreak", superTiebreakTo: 10};

describe("matchResultFields", () => {
  it("partida histórica: igual a hoje", () => {
    const r = matchResultFields({
      match: {teamAId: "A", teamBId: "B", bestOf: 3},
      rawSets: [{a: 21, b: 18}, {a: 21, b: 19}],
      requestBestOf: undefined,
    });
    assert.equal(r.winnerId, "A");
    assert.deepEqual(r.update.sets, [{a: 21, b: 18}, {a: 21, b: 19}]);
    assert.equal(r.update.bestOf, 3);
    assert.equal(r.update.resultA, "2");
  });

  it("partida de games: decide pelo perfil carimbado e grava o tie-break", () => {
    const r = matchResultFields({
      match: {teamAId: "A", teamBId: "B", bestOf: 3, scoringProfile: BT},
      rawSets: [{a: 7, b: 6, tb: {a: 7, b: 4}}, {a: 6, b: 2}],
      requestBestOf: undefined,
    });
    assert.equal(r.winnerId, "A");
    assert.deepEqual(r.update.sets, [{a: 7, b: 6, tb: {a: 7, b: 4}}, {a: 6, b: 2}]);
  });

  it("tb numa partida de pontos é ignorado", () => {
    const r = matchResultFields({
      match: {teamAId: "A", teamBId: "B", bestOf: 1},
      rawSets: [{a: 21, b: 18, tb: {a: 7, b: 4}}],
      requestBestOf: undefined,
    });
    assert.deepEqual(r.update.sets, [{a: 21, b: 18}]);
  });

  it("bestOf do lançamento rápido sobrescreve o da partida", () => {
    const r = matchResultFields({
      match: {teamAId: "A", teamBId: "B", bestOf: 3},
      rawSets: [{a: 21, b: 18}],
      requestBestOf: 1,
    });
    assert.equal(r.winnerId, "A");
    assert.equal(r.update.bestOf, 1);
  });

  // Mesa troca set único → MD3 no meio da partida: grava `bestOf` no doc, não
  // no perfil carimbado. O resultado tem de sair igual ao de hoje.
  const STAMPED_MD1 = categoryScoringProfile({bestOf: "singleSet"}, undefined);
  const MD3_SETS = [{a: 21, b: 19}, {a: 19, b: 21}, {a: 15, b: 13}];

  it("formato trocado pela mesa e enviado no lançamento: vale o MD3 histórico", () => {
    const r = matchResultFields({
      match: {teamAId: "A", teamBId: "B", bestOf: 3, scoringProfile: STAMPED_MD1},
      rawSets: MD3_SETS,
      requestBestOf: 3,
    });
    assert.equal(r.winnerId, "A");
    assert.equal(r.update.bestOf, 3);
  });

  it("formato trocado pela mesa e não enviado: vale o bestOf do doc, como hoje", () => {
    const r = matchResultFields({
      match: {teamAId: "A", teamBId: "B", bestOf: 3, scoringProfile: STAMPED_MD1},
      rawSets: MD3_SETS,
      requestBestOf: undefined,
    });
    assert.equal(r.winnerId, "A");
    assert.equal(r.update.bestOf, 3);
  });
});
