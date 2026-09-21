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
import type {EliminationTierMap} from "./bracket-placement-tiers";

/**
 * Colocações de dupla eliminação nas plantas REAIS do NexaGO.
 *
 * Todas elas têm disputa de 3º lugar (perdedor da final da WB × perdedor da
 * final da LB), então o pódio sai só dessa partida — nenhum jogo da LB pode
 * conceder 3º ou 4º por conta própria, nem degrau de eliminação a quem ainda
 * vai jogar o pódio.
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
    // A fiação é o que distingue "perdeu e caiu" de "perdeu e ainda joga o
    // pódio". Ela viaja no doc da partida (`organizer-category-ops.ts`), então
    // o simulador precisa entregá-la ao resolvedor como o Firestore entrega.
    winnerAdvance: draft.winnerAdvance ?? null,
    loserAdvance: draft.loserAdvance ?? null,
  };
}

interface PlayedBracket {
  drafts: MatchDraft[];
  /** Colocação final de cada equipe (último prêmio recebido, como no upsert). */
  placements: Map<string, LeaguePlacementAward>;
  /** TODOS os prêmios de cada equipe, na ordem — expõe prêmio concedido cedo. */
  awards: Map<string, LeaguePlacementAward[]>;
  maxLbRound: number;
  tiers: EliminationTierMap | undefined;
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
  // Contexto montado a partir dos MESMOS docs que o motor lê em produção,
  // fiação inclusa: sem ela `placementTiersFromMatches` devolve mapas vazios e
  // a escada de degraus (r32/r16/quartas) fica desligada no teste inteiro.
  const context = bracketContextFromMatches(drafts.map(matchDoc));
  assert.equal(context.isDoubleElimination, true);
  assert.equal(context.hasThirdPlaceMatch, true);

  const advance = (slot: BracketAdvanceSlot | undefined, teamId: string): void => {
    if (!slot) return;
    const dest = byNumber.get(slot.matchNumber);
    if (dest) dest[slot.teamSlot] = teamId;
  };

  const placements = new Map<string, LeaguePlacementAward>();
  const awards = new Map<string, LeaguePlacementAward[]>();
  for (const draft of [...drafts].sort((a, b) => a.matchNumber - b.matchNumber)) {
    assert.ok(
      draft.teamAId && draft.teamBId,
      `#${draft.matchNumber} (${draft.matchType}) começou sem os dois times`,
    );
    for (const award of resolveLeaguePlacementsFromMatch(matchDoc(draft), context)) {
      placements.set(award.teamId, award);
      awards.set(award.teamId, [...(awards.get(award.teamId) ?? []), award]);
    }
    advance(draft.winnerAdvance, draft.teamAId);
    advance(draft.loserAdvance, draft.teamBId);
  }

  return {
    drafts,
    placements,
    awards,
    maxLbRound: context.maxLbRound,
    tiers: context.tiers,
  };
}

function draftByType(drafts: MatchDraft[], matchType: string): MatchDraft {
  const found = drafts.find((draft) => draft.matchType === matchType);
  assert.ok(found, `planta sem partida "${matchType}"`);
  return found;
}

/** Todas as plantas de dupla eliminação publicadas. */
const DE_BRACKETS = Object.keys(BRACKET_DEFINITIONS)
  .map(Number)
  .filter((n) => BRACKET_DEFINITIONS[n]?.some((m) => m.bracket === "LB"))
  .sort((a, b) => a - b);

/**
 * Classificação verdadeira da planta: só a grande final e a disputa de 3º
 * lugar definem pódio; todo o resto foi eliminado antes dele, no degrau da
 * rodada em que caiu (`tiers.lb`), não num balde fixo.
 */
function expectedPlacements(played: PlayedBracket) {
  const grandFinal = draftByType(played.drafts, "Final");
  const thirdPlace = draftByType(played.drafts, "Third Place");
  const expected = new Map<string, LeaguePlacementAward>([
    [grandFinal.teamAId, {teamId: grandFinal.teamAId, place: 1}],
    [grandFinal.teamBId, {teamId: grandFinal.teamBId, place: 2}],
    [thirdPlace.teamAId, {teamId: thirdPlace.teamAId, place: 3}],
    [thirdPlace.teamBId, {teamId: thirdPlace.teamBId, place: 4}],
  ]);
  // Quem não está no pódio caiu numa partida da LB que ELIMINA (sem
  // `loserAdvance`); o degrau é o da rodada dessa partida.
  for (const draft of played.drafts) {
    if (draft.matchType !== "LB" || draft.loserAdvance != null) continue;
    const teamId = draft.teamBId;
    if (expected.has(teamId)) continue;
    expected.set(teamId, {
      teamId,
      bucket: played.tiers?.lb[draft.round] ?? "quarters",
    });
  }
  return expected;
}

for (const numTeams of DE_BRACKETS) {
  describe(`dupla eliminação · planta de ${numTeams} equipes`, () => {
    it("dá a cada equipe exatamente a colocação real da chave", () => {
      const played = playBracket(numTeams);
      assert.equal(played.placements.size, numTeams);
      assert.deepEqual(played.placements, expectedPlacements(played));
    });

    it("tem um único 1º, 2º, 3º e 4º lugar", () => {
      const {placements} = playBracket(numTeams);
      const countOf = (place: number) =>
        [...placements.values()].filter((award) => award.place === place).length;
      assert.equal(countOf(1), 1);
      assert.equal(countOf(2), 1);
      assert.equal(countOf(3), 1);
      assert.equal(countOf(4), 1);
    });

    // Regressão: a final da LB (e, na planta de 10, o cruzamento #16 tipado
    // "LB") tem `loserAdvance` para a disputa de 3º, então sua rodada não
    // ELIMINA ninguém e `tiers.lb[rodada]` não existe. O resolvedor caía no
    // balde legado de quartas e premiava 5º-8º a quem ainda ia jogar o pódio —
    // prêmio que só era desfeito quando a disputa de 3º fechava, e que ficava
    // de pé para sempre se ela não fosse jogada.
    it("não premia ninguém que ainda vai jogar o pódio", () => {
      const {awards} = playBracket(numTeams);
      for (const [teamId, list] of awards) {
        assert.equal(
          list.length,
          1,
          `${teamId} recebeu ${list.length} prêmios: ` +
            list.map((a) => (a.place != null ? `place ${a.place}` : `bucket ${a.bucket}`)).join(" -> "),
        );
      }
    });

    // O perdedor da final da WB e o da final da LB chegam à disputa de 3º pela
    // mesma porta; nenhum dos dois pode sair dali com degrau antes de jogá-la.
    it("trata os dois lados da disputa de 3º do mesmo jeito", () => {
      const played = playBracket(numTeams);
      const thirdPlace = draftByType(played.drafts, "Third Place");
      for (const teamId of [thirdPlace.teamAId, thirdPlace.teamBId]) {
        const list = played.awards.get(teamId) ?? [];
        assert.equal(list.length, 1, `${teamId} premiado antes do pódio`);
        assert.ok(
          list[0].place === 3 || list[0].place === 4,
          `${teamId} devia sair com 3º ou 4º`,
        );
      }
    });
  });
}

describe("dupla eliminação · semifinal da LB não é 4º lugar", () => {
  // Regressão: a penúltima rodada da LB (`maxLbRound − 1`) dava place 4 mesmo
  // com disputa de 3º na chave — em 8 e 16 equipes esses times nem jogam o
  // pódio, então a categoria terminava com três "4º lugar".
  for (const numTeams of [8, 16]) {
    it(`planta de ${numTeams}: perdedores da penúltima rodada da LB não vão ao pódio`, () => {
      const played = playBracket(numTeams);
      const penultimate = played.drafts.filter(
        (draft) =>
          draft.matchType === "LB" && draft.round === played.maxLbRound - 1,
      );

      assert.ok(penultimate.length > 0, "planta sem penúltima rodada de LB");
      for (const draft of penultimate) {
        assert.deepEqual(played.placements.get(draft.teamBId), {
          teamId: draft.teamBId,
          bucket: played.tiers?.lb[draft.round] ?? "quarters",
        });
      }
    });
  }
});
