import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {BRACKET_DEFINITIONS} from "./bracket-definitions/bracket-definitions";
import {
  buildMatchesFromDefinition,
  type BracketAdvanceSlot,
  type MatchDraft,
} from "./category-bracket-builders";
import {
  bracketContextFromMatches,
  resolveLeaguePlacementsFromMatch,
  type LeaguePlacementAward,
} from "./league-ranking";

/**
 * Colocações de dupla eliminação nas plantas REAIS do NexaGO.
 *
 * Todas elas têm disputa de 3º lugar (perdedor da final da WB × perdedor da
 * final da LB), então o pódio sai só dessa partida — nenhum jogo da LB pode
 * conceder 3º ou 4º por conta própria.
 */

/** Simula a partida: o time do slot A sempre vence (resultado determinístico). */
function matchDoc(draft: MatchDraft): Record<string, unknown> {
  return {
    status: "Completed",
    matchType: draft.matchType,
    round: draft.round,
    isGroupMatch: draft.isGroupMatch,
    teamAId: draft.teamAId,
    teamBId: draft.teamBId,
    winnerId: draft.teamAId,
  };
}

interface PlayedBracket {
  drafts: MatchDraft[];
  /** Colocação final de cada equipe (último prêmio recebido, como no upsert). */
  placements: Map<string, LeaguePlacementAward>;
  maxLbRound: number;
}

/**
 * Joga a planta inteira em ordem cronológica (`matchNumber`), propagando
 * vencedor/perdedor pela fiação e acumulando os prêmios com a mesma regra dos
 * agregadores (`upsertStageResult`/`awardGlobalPlacement`): o último prêmio
 * concedido à equipe é o que vale.
 */
function playBracket(numTeams: number): PlayedBracket {
  const definition = BRACKET_DEFINITIONS[numTeams];
  assert.ok(definition, `sem planta para ${numTeams} equipes`);

  const teamIds = Array.from({length: numTeams}, (_, i) => `t${i + 1}`);
  const drafts = buildMatchesFromDefinition(definition, teamIds);
  const byNumber = new Map(drafts.map((draft) => [draft.matchNumber, draft]));
  const context = bracketContextFromMatches(
    drafts.map((draft) => ({matchType: draft.matchType, round: draft.round})),
  );
  assert.equal(context.isDoubleElimination, true);
  assert.equal(context.hasThirdPlaceMatch, true);

  const advance = (slot: BracketAdvanceSlot | undefined, teamId: string): void => {
    if (!slot) return;
    const dest = byNumber.get(slot.matchNumber);
    if (dest) dest[slot.teamSlot] = teamId;
  };

  const placements = new Map<string, LeaguePlacementAward>();
  for (const draft of [...drafts].sort((a, b) => a.matchNumber - b.matchNumber)) {
    assert.ok(
      draft.teamAId && draft.teamBId,
      `#${draft.matchNumber} (${draft.matchType}) começou sem os dois times`,
    );
    for (const award of resolveLeaguePlacementsFromMatch(matchDoc(draft), context)) {
      placements.set(award.teamId, award);
    }
    advance(draft.winnerAdvance, draft.teamAId);
    advance(draft.loserAdvance, draft.teamBId);
  }

  return {drafts, placements, maxLbRound: context.maxLbRound};
}

function draftByType(drafts: MatchDraft[], matchType: string): MatchDraft {
  const found = drafts.find((draft) => draft.matchType === matchType);
  assert.ok(found, `planta sem partida "${matchType}"`);
  return found;
}

/**
 * Classificação verdadeira da planta: só a grande final e a disputa de 3º
 * lugar definem pódio; todo o resto foi eliminado antes dele.
 */
function expectedPlacements(played: PlayedBracket, numTeams: number) {
  const grandFinal = draftByType(played.drafts, "Final");
  const thirdPlace = draftByType(played.drafts, "Third Place");
  const expected = new Map<string, LeaguePlacementAward>([
    [grandFinal.teamAId, {teamId: grandFinal.teamAId, place: 1}],
    [grandFinal.teamBId, {teamId: grandFinal.teamBId, place: 2}],
    [thirdPlace.teamAId, {teamId: thirdPlace.teamAId, place: 3}],
    [thirdPlace.teamBId, {teamId: thirdPlace.teamBId, place: 4}],
  ]);
  for (let i = 1; i <= numTeams; i++) {
    const teamId = `t${i}`;
    if (!expected.has(teamId)) {
      expected.set(teamId, {teamId, bucket: "quarters"});
    }
  }
  return expected;
}

for (const numTeams of [4, 8, 16]) {
  describe(`dupla eliminação · planta de ${numTeams} equipes`, () => {
    it("dá a cada equipe exatamente a colocação real da chave", () => {
      const played = playBracket(numTeams);
      assert.deepEqual(
        played.placements,
        expectedPlacements(played, numTeams),
      );
    });

    it("tem um único 3º e um único 4º lugar", () => {
      const {placements} = playBracket(numTeams);
      const countOf = (place: number) =>
        [...placements.values()].filter((award) => award.place === place).length;
      assert.equal(countOf(1), 1);
      assert.equal(countOf(2), 1);
      assert.equal(countOf(3), 1);
      assert.equal(countOf(4), 1);
      assert.equal(placements.size, numTeams);
    });

    it("põe no balde 'quarters' quem perde na LB sem chegar à disputa de 3º", () => {
      const played = playBracket(numTeams);
      const thirdPlace = draftByType(played.drafts, "Third Place");
      const podium = new Set([thirdPlace.teamAId, thirdPlace.teamBId]);

      const eliminatedInLb = played.drafts
        .filter((draft) => draft.matchType === "LB")
        .map((draft) => draft.teamBId)
        .filter((teamId) => !podium.has(teamId));

      // Todo mundo fora do pódio (grande final + disputa de 3º) caiu na LB.
      // Na planta de 4 os dois eliminados da LB são justamente os que disputam
      // o 3º lugar, então a lista fica vazia.
      assert.equal(eliminatedInLb.length, numTeams - 4);
      for (const teamId of eliminatedInLb) {
        assert.deepEqual(played.placements.get(teamId), {
          teamId,
          bucket: "quarters",
        });
      }
    });
  });
}

describe("dupla eliminação · semifinal da LB não é 4º lugar", () => {
  // Regressão: a penúltima rodada da LB (`maxLbRound − 1`) dava place 4 mesmo
  // com disputa de 3º na chave — em 8 e 16 equipes esses times nem jogam o
  // pódio, então a categoria terminava com três "4º lugar".
  for (const numTeams of [8, 16]) {
    it(`planta de ${numTeams}: perdedores da penúltima rodada da LB ficam em 'quarters'`, () => {
      const played = playBracket(numTeams);
      const penultimate = played.drafts.filter(
        (draft) =>
          draft.matchType === "LB" && draft.round === played.maxLbRound - 1,
      );

      assert.ok(penultimate.length > 0, "planta sem penúltima rodada de LB");
      for (const draft of penultimate) {
        assert.deepEqual(played.placements.get(draft.teamBId), {
          teamId: draft.teamBId,
          bucket: "quarters",
        });
      }
    });
  }
});
