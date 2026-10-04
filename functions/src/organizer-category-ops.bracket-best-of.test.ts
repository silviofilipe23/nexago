import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {bracketMatchDoc} from "./organizer-category-ops";
import {categoryScoringProfile, matchBestOfFromCategory} from "./match-scoring";
import {legacyScoringProfile} from "./sports/scoring";
import type {MatchDraft} from "./category-bracket-builders";

/**
 * Até aqui `generateCategoryBracket` criava as partidas SEM `bestOf`, e toda
 * superfície (mesa, telão, app, portal) caía no fallback histórico de 3 sets —
 * a escolha "Set único / MD3" da categoria nunca saía do doc do torneio.
 */

const DRAFT: MatchDraft = {
  round: 1,
  matchType: "group",
  poolId: "A",
  teamAId: "team-a",
  teamBId: "team-b",
  isGroupMatch: true,
  matchNumber: 1,
};

function docFor(categoryBestOf: unknown): Record<string, unknown> {
  return bracketMatchDoc(DRAFT, {
    tournamentId: "t1",
    categoryId: "cat-1",
    bestOf: matchBestOfFromCategory(categoryBestOf),
    scoringProfile: legacyScoringProfile(matchBestOfFromCategory(categoryBestOf)),
  });
}

describe("bracketMatchDoc", () => {
  it("grava 1 set quando a categoria é de set único", () => {
    assert.equal(docFor("singleSet").bestOf, 1);
  });

  it("grava 3 sets quando a categoria é MD3", () => {
    assert.equal(docFor("bestOf3").bestOf, 3);
  });

  it("grava 3 sets na categoria de torneio antigo, sem o campo", () => {
    assert.equal(docFor(undefined).bestOf, 3);
  });

  it("não perde os demais campos da partida", () => {
    const doc = docFor("singleSet");
    assert.equal(doc.tournamentId, "t1");
    assert.equal(doc.categoryId, "cat-1");
    assert.equal(doc.matchNumber, 1);
    assert.equal(doc.poolId, "A");
    assert.equal(doc.isGroupMatch, true);
    assert.equal(doc.resultA, "");
  });

  it("mantém os campos opcionais fora do doc quando o draft não os traz", () => {
    const doc = docFor("singleSet");
    assert.equal("winnerAdvance" in doc, false);
    assert.equal("teamADescription" in doc, false);
  });

  it("preserva o avanço da chave quando o draft traz", () => {
    const doc = bracketMatchDoc(
      {...DRAFT, winnerAdvance: {matchNumber: 9, teamSlot: "teamAId", round: 2}},
      {tournamentId: "t1", categoryId: "cat-1", bestOf: 1, scoringProfile: legacyScoringProfile(1)},
    );
    assert.deepEqual(doc.winnerAdvance, {matchNumber: 9, teamSlot: "teamAId", round: 2});
  });
});

describe("perfil de placar carimbado na partida", () => {
  it("bracketMatchDoc grava o perfil recebido", () => {
    const profile = legacyScoringProfile(3);
    const doc = bracketMatchDoc(DRAFT, {tournamentId: "t", categoryId: "c", bestOf: 3, scoringProfile: profile});
    assert.deepEqual(doc.scoringProfile, profile);
  });

  it("vôlei de praia: perfil do catálogo igual à regra histórica, com o bestOf da categoria", () => {
    assert.deepEqual(
      categoryScoringProfile({bestOf: "singleSet"}, "beachVolleyball"),
      {...legacyScoringProfile(3), bestOf: 1},
    );
    assert.deepEqual(categoryScoringProfile({bestOf: "bestOf3"}, "beachVolleyball"), legacyScoringProfile(3));
  });

  it("MD5 continua virando MD3 no carimbo", () => {
    assert.equal(categoryScoringProfile({bestOf: "bestOf5"}, "beachVolleyball").bestOf, 3);
  });

  it("beach tennis usa o perfil de games do catálogo", () => {
    const p = categoryScoringProfile({bestOf: "bestOf3"}, "beachTennis");
    assert.equal(p.kind, "sets_games");
  });

  // O carimbo tem o MESMO formato em qualquer caminho: decisivo 15 mesmo em MD1.
  // Se o fallback carimbasse `legacyScoringProfile(1)` (decisivo 21), a mesa
  // trocando para MD3 no meio da partida faria o 3º set exigir 21.
  it("esporte desconhecido em set único carimba o mesmo formato do catálogo", () => {
    assert.deepEqual(
      categoryScoringProfile({bestOf: "singleSet"}, "xadrez"),
      {...legacyScoringProfile(3), bestOf: 1},
    );
  });

  it("esporte desconhecido usa a regra histórica", () => {
    assert.deepEqual(categoryScoringProfile({bestOf: "bestOf3"}, "xadrez"), legacyScoringProfile(3));
  });

  it("perfil explícito válido na categoria prevalece", () => {
    const explicit = {kind: "sets_points", bestOf: 1, setTarget: 25, decidingSetTarget: 15, winBy: 2, pointCap: null};
    assert.deepEqual(categoryScoringProfile({bestOf: "bestOf3", scoringProfile: explicit}, "beachVolleyball"), explicit);
  });
});
