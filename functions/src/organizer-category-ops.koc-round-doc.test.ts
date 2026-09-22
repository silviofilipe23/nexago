import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {kocRoundDoc, resolveKocConfig} from "./organizer-category-ops";
import {
  KOC_DEFAULT_ROUND_DURATION_SEC,
  buildKingOfCourtRounds,
  type KocConfig,
  type KocRoundDraft,
} from "./koc-bracket-builders";
import {isDuelMatch} from "./match-status";

/**
 * Contrato do doc da RODADA King of the Court.
 *
 * Ela divide a coleção `matches` com as partidas de duelo do mesmo torneio, e é
 * esse doc que decide se a blindagem da fase 0 funciona na prática: os dois
 * lados têm de sair vazios e o `matchType` tem de ser reconhecido como KOTC.
 */

const config: KocConfig = {
  teamsPerCourt: 4,
  qualifiersPerRound: 2,
  roundDurationSec: KOC_DEFAULT_ROUND_DURATION_SEC,
};

const meta = {tournamentId: "t1", categoryId: "cat-1", config};

function roundsFor(teamCount: number): KocRoundDraft[] {
  const seeds = Array.from({length: teamCount}, (_, i) => `team-${i + 1}`);
  return buildKingOfCourtRounds(seeds, config);
}

describe("kocRoundDoc", () => {
  const drafts = roundsFor(16);
  const classificatoria = kocRoundDoc(drafts[0]!, meta);
  const grandFinal = kocRoundDoc(drafts[drafts.length - 1]!, meta);

  it("grava os dois lados VAZIOS — a rodada não é duelo", () => {
    assert.equal(classificatoria.teamAId, "");
    assert.equal(classificatoria.teamBId, "");
  });

  it("é reconhecida pela blindagem da fase 0", () => {
    for (const doc of [classificatoria, grandFinal]) {
      assert.equal(isDuelMatch(doc.matchType), false, String(doc.matchType));
    }
  });

  it("não finge ser partida de grupo", () => {
    // `poolId` é a QUADRA da fase. `isGroupMatch` falso é o que impede a rodada
    // de entrar na tabela de classificação de grupos da categoria.
    assert.equal(classificatoria.isGroupMatch, false);
    assert.equal(classificatoria.poolId, "C1");
  });

  it("leva o elenco na classificatória", () => {
    assert.deepEqual(classificatoria.kocTeamIds, [
      "team-1",
      "team-8",
      "team-9",
      "team-16",
    ]);
    assert.equal(classificatoria.kocSize, 4);
  });

  it("a final nasce sem elenco, com as vagas descritas para a mesa", () => {
    assert.deepEqual(grandFinal.kocTeamIds, []);
    const qualifiers = grandFinal.kocQualifiers as Array<Record<string, unknown>>;
    assert.equal(qualifiers.length, 4);
    for (const slot of qualifiers) {
      assert.match(String(slot.description), /^[12]º Rodada [12]$/);
      assert.ok(Number(slot.fromMatchNumber) > 0);
    }
  });

  it("carimba a config como SNAPSHOT da geração", () => {
    // O relógio da rodada lê daqui. Se lesse da categoria, mexer na duração
    // padrão no meio do dia mudaria uma rodada já em jogo.
    assert.deepEqual(classificatoria.kocConfig, {
      roundEndMode: "time",
      durationSec: 900,
      teamsPerCourt: 4,
      roundsPerBracket: 1,
      qualifiersPerRound: 2,
      crownScores: false,
    });
  });

  it("não grava bestOf: a rodada tem cronômetro, não sets", () => {
    assert.equal("bestOf" in classificatoria, false);
    assert.equal(classificatoria.resultA, "");
    assert.equal(classificatoria.resultB, "");
  });

  it("usa a fase como round, para a agenda ordenar", () => {
    assert.equal(classificatoria.round, 1);
    assert.equal(classificatoria.kocPhase, 1);
    assert.equal(grandFinal.round, 3);
    assert.equal(grandFinal.kocPhase, 3);
  });
});

describe("resolveKocConfig", () => {
  it("usa os padrões do formato quando nada foi escolhido", () => {
    assert.deepEqual(resolveKocConfig(undefined, undefined), {
      teamsPerCourt: 4,
      roundsPerBracket: 1,
      qualifiersPerRound: 2,
      roundDurationSec: 900,
    });
  });

  it("lê o que o organizador escolheu no wizard", () => {
    assert.deepEqual(
      resolveKocConfig(
        {teamsPerCourt: 5, roundsPerBracket: 2, qualifiersPerRound: 1, roundDurationSec: 1200},
        undefined,
      ),
      {teamsPerCourt: 5, roundsPerBracket: 2, qualifiersPerRound: 1, roundDurationSec: 1200},
    );
  });

  it("cai na categoria quando a chamada não traz config", () => {
    assert.equal(
      resolveKocConfig(undefined, {roundDurationSec: 600}).roundDurationSec,
      600,
    );
  });

  it("ignora valor inválido em vez de derrubar a publicação", () => {
    const resolved = resolveKocConfig(
      {teamsPerCourt: 0, qualifiersPerRound: -3, roundDurationSec: "abc"},
      undefined,
    );
    assert.deepEqual(resolved, {
      teamsPerCourt: 4,
      roundsPerBracket: 1,
      qualifiersPerRound: 2,
      roundDurationSec: 900,
    });
  });

  it("aceita override por fase e descarta fase inválida", () => {
    const resolved = resolveKocConfig(
      {phaseDurationsSec: {"3": 1200, "2": 0, bogus: "x"}},
      undefined,
    );
    assert.deepEqual(resolved.phaseDurationsSec, {"3": 1200});
  });

  it("omite o override quando nenhuma fase tem valor válido", () => {
    const resolved = resolveKocConfig({phaseDurationsSec: {"1": -5}}, undefined);
    assert.equal("phaseDurationsSec" in resolved, false);
  });
});
