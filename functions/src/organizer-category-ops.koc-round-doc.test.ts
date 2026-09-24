import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {kocRoundDoc, resolveKocConfig} from "./organizer-category-ops";
import {
  KOC_DEFAULT_ROUND_DURATION_SEC,
  KOC_LEGACY_MAX_TEAMS_PER_ROUND,
  buildKingOfCourtRounds,
  kocResolvePlan,
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

// `plan` congela o que `buildKingOfCourtRounds` já resolveu para esta mesma
// config — meta.plan e as rodadas têm de vir do MESMO cálculo, senão os testes
// abaixo não validariam o contrato real (gerador e doc divergindo do plano).
const meta = {tournamentId: "t1", categoryId: "cat-1", config, plan: kocResolvePlan(16, config)};

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
      // Forma nova: o plano inteiro congelado.
      phases: meta.plan,
      maxTeamsPerRound: KOC_LEGACY_MAX_TEAMS_PER_ROUND,
      // Forma velha, para quem ainda não conhece `phases`.
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
      maxTeamsPerRound: KOC_LEGACY_MAX_TEAMS_PER_ROUND,
    });
  });

  it("lê o que o organizador escolheu no wizard", () => {
    assert.deepEqual(
      resolveKocConfig(
        {teamsPerCourt: 5, roundsPerBracket: 2, qualifiersPerRound: 1, roundDurationSec: 1200},
        undefined,
      ),
      {
        teamsPerCourt: 5,
        roundsPerBracket: 2,
        qualifiersPerRound: 1,
        roundDurationSec: 1200,
        maxTeamsPerRound: KOC_LEGACY_MAX_TEAMS_PER_ROUND,
      },
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
      maxTeamsPerRound: KOC_LEGACY_MAX_TEAMS_PER_ROUND,
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

describe("kocRoundDoc com plano de fases", () => {
  const plan = [
    {bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
    {bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900},
    {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 1200},
  ];

  it("grava a bateria e as DUAS formas da config", () => {
    const config = resolveKocConfig({phases: plan, maxTeamsPerRound: 6}, undefined);
    const drafts = buildKingOfCourtRounds(
      Array.from({length: 10}, (_, i) => `t${i + 1}`),
      config,
    );
    const semi = drafts.find((d) => d.phase === 2 && d.batteryLabel === 2)!;
    const doc = kocRoundDoc(semi, {
      tournamentId: "T", categoryId: "C", config, plan,
    }) as Record<string, any>;

    assert.equal(doc.kocBatteryLabel, 2);
    // Forma nova.
    assert.deepEqual(doc.kocConfig.phases, plan);
    assert.equal(doc.kocConfig.maxTeamsPerRound, 6);
    // Forma velha, com os números DESTA fase — é o que o app da loja lê.
    assert.equal(doc.kocConfig.teamsPerCourt, 6);
    assert.equal(doc.kocConfig.roundsPerBracket, 4);
    assert.equal(doc.kocConfig.qualifiersPerRound, 1);
  });

  it("na final a forma velha não zera classificadas — o app leria 0 e sumiria com a tabela", () => {
    const config = resolveKocConfig({phases: plan, maxTeamsPerRound: 6}, undefined);
    const drafts = buildKingOfCourtRounds(
      Array.from({length: 10}, (_, i) => `t${i + 1}`),
      config,
    );
    // `.at(-1)` pede lib ES2022; o projeto compila em es2017 — índice direto
    // tem o mesmo efeito.
    const final = drafts[drafts.length - 1]!;
    const doc = kocRoundDoc(final, {
      tournamentId: "T", categoryId: "C", config, plan,
    }) as Record<string, any>;
    assert.equal(doc.kocConfig.qualifiersPerRound, 4);
  });
});

describe("resolveKocConfig com plano", () => {
  it("teto ausente vale o de sempre, não o novo", () => {
    const cfg = resolveKocConfig(undefined, {teamsPerCourt: 4});
    assert.equal(cfg.maxTeamsPerRound, KOC_LEGACY_MAX_TEAMS_PER_ROUND);
    assert.equal(cfg.phases, undefined);
  });

  it("bracketConfig ganha do doc da categoria, como no resto da função", () => {
    const cfg = resolveKocConfig(
      {phases: [{bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}]},
      {phases: [{bracketSizes: [3], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}]},
    );
    assert.deepEqual(cfg.phases?.[0]?.bracketSizes, [4]);
  });

  it("plano malformado é descartado em vez de derrubar a publicação", () => {
    const cfg = resolveKocConfig({phases: [{bracketSizes: "x"}]}, undefined);
    assert.equal(cfg.phases, undefined);
  });
});

describe("kocRoundDoc · plano congelado não diverge do que gerou as rodadas (achado da Task 3)", () => {
  it("uma resolução só alimenta o gerador (por opts.plan) E o doc — nunca duas", () => {
    // Mesmo wiring de `runGenerateCategoryBracket`: config legada (sem
    // `phases`), `teamsPerCourt: 3`, 19 duplas — a config exata do achado.
    // Resolve UMA vez e entrega o MESMO plano ao gerador, por `opts.plan`
    // (nunca por `config.phases` — reinjetar ali faria `buildKingOfCourtRounds`
    // julgar de novo, via `assertPlan`, um plano que já é de confiança), e ao
    // doc da rodada.
    const config = resolveKocConfig({teamsPerCourt: 3, qualifiersPerRound: 2}, undefined);
    const plan = kocResolvePlan(19, config);
    const drafts = buildKingOfCourtRounds(
      Array.from({length: 19}, (_, i) => `t${i + 1}`),
      config,
      {plan},
    );
    assert.ok(drafts.length > 0);
    for (const draft of drafts) {
      const doc = kocRoundDoc(draft, {
        tournamentId: "T", categoryId: "C", config, plan,
      }) as Record<string, any>;
      // Mesmo array em TODA rodada — é o congelamento de uma resolução só. Um
      // futuro refactor que volte a resolver duas vezes quebraria esta
      // igualdade de referência antes de quebrar qualquer teste de valor.
      assert.equal(doc.kocConfig.phases, plan);
    }
  });
});
