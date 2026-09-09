import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {bracketMatchDoc} from "./organizer-category-ops";
import {matchBestOfFromCategory} from "./match-scoring";
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
      {tournamentId: "t1", categoryId: "cat-1", bestOf: 1},
    );
    assert.deepEqual(doc.winnerAdvance, {matchNumber: 9, teamSlot: "teamAId", round: 2});
  });
});
