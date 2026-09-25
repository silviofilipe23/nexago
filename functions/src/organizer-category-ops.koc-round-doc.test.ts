import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {kocLegacyRoundFields, kocRoundDoc, resolveKocConfig} from "./organizer-category-ops";
import {
  KOC_DEFAULT_ROUND_DURATION_SEC,
  KOC_LEGACY_MAX_TEAMS_PER_ROUND,
  buildKingOfCourtRounds,
  kocProposePlan,
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
      // A config da CATEGORIA na geração — aqui igual à da fase porque o campo
      // divide certo em quadras de 4; em 6 duplas elas divergem, e é por isso
      // que a origem existe separada.
      source: {
        teamsPerCourt: 4,
        roundsPerBracket: 1,
        qualifiersPerRound: 2,
        hasPlan: false,
      },
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

  // Fix round 1/5 na Task 6: o portal (`tournaments-repository.ts`) grava o plano
  // no doc da categoria como `kocPhases`/`kocMaxTeamsPerRound` (prefixado — o
  // mesmo doc também modela ligas com etapas, e `phases`/`maxTeamsPerRound` sem
  // prefixo seriam genéricos demais ali). Sem este caso, toda geração que cai no
  // doc da categoria em vez do `bracketConfig` — o app da loja e o publish do
  // Sorteio Ao Vivo, nenhum dos dois manda `phases` — ficava cega para o plano
  // que o organizador acabou de aprovar na tela e gerava com as regras antigas,
  // sem erro nenhum.
  const planFromCategory = [
    {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
  ];

  it("lê kocPhases/kocMaxTeamsPerRound do doc da categoria — a forma que o portal grava", () => {
    const cfg = resolveKocConfig(undefined, {kocPhases: planFromCategory, kocMaxTeamsPerRound: 6});
    assert.deepEqual(cfg.phases, planFromCategory);
    assert.equal(cfg.maxTeamsPerRound, 6);
  });

  it("também lê a forma sem prefixo — mesma tolerância que o Sorteio Ao Vivo já tinha", () => {
    const cfg = resolveKocConfig(undefined, {phases: planFromCategory, maxTeamsPerRound: 6});
    assert.deepEqual(cfg.phases, planFromCategory);
    assert.equal(cfg.maxTeamsPerRound, 6);
  });

  it("bracketConfig ganha das duas grafias do doc da categoria, não só da sem prefixo", () => {
    const fromScreen = [
      {bracketSizes: [3], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
    ];
    const cfg = resolveKocConfig(
      {phases: fromScreen, maxTeamsPerRound: 3},
      {kocPhases: planFromCategory, kocMaxTeamsPerRound: 6},
    );
    assert.deepEqual(cfg.phases, fromScreen);
    assert.equal(cfg.maxTeamsPerRound, 3);
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

describe("kocRoundDoc congela a ORIGEM da config, não só o plano", () => {
  const teams = (n: number): string[] =>
    Array.from({length: n}, (_, i) => `t${i + 1}`);

  /**
   * A rodada já guardava o plano resolvido; faltava a config de que ele saiu.
   * Sem ela o portal não distingue "plano que o organizador montou" de "plano
   * derivado dos três números", e os campos legados da rodada são os da FASE
   * (6 duplas em quadras de 4 congelam `teamsPerCourt: 3`), então compará-los
   * com a categoria acusa divergência onde ninguém mexeu em nada.
   */
  it("plano montado na tela: `hasPlan` verdadeiro e os números da categoria", () => {
    const plan = kocProposePlan(10, 6, () => 900);
    const config = resolveKocConfig(
      {phases: plan, maxTeamsPerRound: 6, roundDurationSec: 900},
      {teamsPerCourt: 4, roundsPerBracket: 1, qualifiersPerRound: 2},
    );
    const drafts = buildKingOfCourtRounds(teams(10), config, {plan});
    const doc = kocRoundDoc(drafts[0]!, {
      tournamentId: "T", categoryId: "C", config, plan,
    }) as Record<string, any>;

    assert.equal(doc.kocConfig.source.hasPlan, true);
    assert.equal(doc.kocConfig.source.teamsPerCourt, 4);
    assert.equal(doc.kocConfig.source.roundsPerBracket, 1);
    assert.equal(doc.kocConfig.source.qualifiersPerRound, 2);
  });

  it("plano derivado: `hasPlan` falso, e a origem NÃO são os números da fase", () => {
    // 6 duplas em quadras de 4: a fase 1 vira duas chaves de 3, então o campo
    // legado da rodada congela `teamsPerCourt: 3`. A origem tem que dizer 4.
    const config = resolveKocConfig(undefined, {
      teamsPerCourt: 4, roundsPerBracket: 1, qualifiersPerRound: 2,
    });
    const plan = kocResolvePlan(6, config);
    const drafts = buildKingOfCourtRounds(teams(6), config, {plan});
    const doc = kocRoundDoc(drafts[0]!, {
      tournamentId: "T", categoryId: "C", config, plan,
    }) as Record<string, any>;

    assert.equal(doc.kocConfig.source.hasPlan, false);
    assert.equal(doc.kocConfig.source.teamsPerCourt, 4);
    assert.notEqual(doc.kocConfig.source.teamsPerCourt, doc.kocConfig.teamsPerCourt);
  });
});

/**
 * Precedência do teto: `bracketConfig` → `kocMaxTeamsPerRound` →
 * `maxTeamsPerRound`, nessa ordem.
 *
 * Só `phases` tinha teste de precedência, e esta família de campos já rendeu
 * dois defeitos nesta branch, em direções opostas: o portal gravando a grafia
 * prefixada enquanto o servidor lia só a sem prefixo (o plano da categoria
 * ficava invisível para o app e para o publish do sorteio), e depois o payload
 * perdendo para a categoria. Cada elo abaixo é testado sozinho: tirar um da
 * cadeia `??` deixa exatamente um `it` vermelho.
 */
describe("resolveKocConfig · precedência de maxTeamsPerRound", () => {
  it("o payload da geração ganha das DUAS grafias do doc da categoria", () => {
    const cfg = resolveKocConfig(
      {maxTeamsPerRound: 3},
      {kocMaxTeamsPerRound: 6, maxTeamsPerRound: 5},
    );
    assert.equal(cfg.maxTeamsPerRound, 3);
  });

  it("sem payload, a grafia prefixada (a que o portal grava) ganha da sem prefixo", () => {
    const cfg = resolveKocConfig(undefined, {kocMaxTeamsPerRound: 6, maxTeamsPerRound: 4});
    assert.equal(cfg.maxTeamsPerRound, 6);
  });

  it("a grafia sem prefixo ainda é lida quando é a única que existe", () => {
    assert.equal(resolveKocConfig(undefined, {maxTeamsPerRound: 4}).maxTeamsPerRound, 4);
  });

  it("payload ausente do OBJETO (não nulo) continua caindo para a categoria", () => {
    // `??` só pula `null`/`undefined`: um `bracketConfig` que existe mas não
    // traz o campo tem que deixar a categoria mandar — é o caso do app da loja
    // e do publish do sorteio, que mandam `bracketConfig` sem teto nenhum.
    const cfg = resolveKocConfig({teamsPerCourt: 4}, {kocMaxTeamsPerRound: 6});
    assert.equal(cfg.maxTeamsPerRound, 6);
  });

  it("nada em lugar nenhum cai no teto de sempre, não no teto novo", () => {
    assert.equal(
      resolveKocConfig(undefined, undefined).maxTeamsPerRound,
      KOC_LEGACY_MAX_TEAMS_PER_ROUND,
    );
  });

  it("teto fora da faixa do formato é saneado, não propagado", () => {
    // `kocClampMaxPerRound` já é testado sozinho; aqui prova-se que a
    // precedência entrega o valor ESCOLHIDO para ele — 9 vira o teto duro 6,
    // não o teto legado, que é o que sairia se o elo tivesse sido ignorado.
    assert.equal(resolveKocConfig({maxTeamsPerRound: 9}, undefined).maxTeamsPerRound, 6);
    assert.equal(resolveKocConfig({maxTeamsPerRound: 1}, undefined).maxTeamsPerRound, 3);
  });
});

/**
 * A tradução "fase do plano → três números da forma velha", agora sozinha.
 *
 * Era um trecho inline no meio de `kocRoundDoc`, coberto só pelo `deepEqual`
 * do doc inteiro — teste que falha por qualquer motivo e não diz qual regra
 * quebrou. A regra cara aqui é a última: na final, `qualifiersPerRound` do
 * plano é 0 de propósito, e gravar esse 0 apaga a tabela do pódio no app que
 * já está na loja.
 */
describe("kocLegacyRoundFields", () => {
  const config: KocConfig = {
    teamsPerCourt: 4,
    roundsPerBracket: 1,
    qualifiersPerRound: 2,
    roundDurationSec: 900,
  };

  it("a chave mais CHEIA da fase é o `teamsPerCourt` da forma velha", () => {
    // Fase com chaves desiguais: a média (4) e a menor (3) também seriam
    // números plausíveis — o contrato é o maior.
    const fields = kocLegacyRoundFields(
      {size: 5},
      {bracketSizes: [5, 4, 4], roundsPerBracket: 2, qualifiersPerRound: 1, durationSec: 900},
      config,
    );
    assert.equal(fields.teamsPerCourt, 5);
    assert.equal(fields.roundsPerBracket, 2);
    assert.equal(fields.qualifiersPerRound, 1);
  });

  it("os números são os DESTA fase, não os da categoria", () => {
    const fields = kocLegacyRoundFields(
      {size: 6},
      {bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900},
      config,
    );
    assert.notEqual(fields.teamsPerCourt, config.teamsPerCourt);
    assert.notEqual(fields.roundsPerBracket, config.roundsPerBracket);
    assert.notEqual(fields.qualifiersPerRound, config.qualifiersPerRound);
  });

  it("na FINAL grava o tamanho da própria rodada, nunca 0 — 0 apaga o pódio no app da loja", () => {
    const fields = kocLegacyRoundFields(
      {size: 4},
      {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
      config,
    );
    assert.equal(fields.qualifiersPerRound, 4);
    assert.notEqual(fields.qualifiersPerRound, 0);
  });

  it("sem fase no plano volta para a config da categoria — o comportamento de antes do plano", () => {
    const fields = kocLegacyRoundFields({size: 4}, undefined, config);
    assert.deepEqual(fields, {teamsPerCourt: 4, roundsPerBracket: 1, qualifiersPerRound: 2});
  });

  it("sem fase e sem `roundsPerBracket` na categoria, a forma velha ainda diz 1", () => {
    const semRounds: KocConfig = {teamsPerCourt: 4, qualifiersPerRound: 2, roundDurationSec: 900};
    assert.equal(kocLegacyRoundFields({size: 4}, undefined, semRounds).roundsPerBracket, 1);
  });

  it("é a MESMA tradução que o doc da rodada grava — não uma segunda cópia", () => {
    // Pino contra a extração se soltar do doc: se `kocRoundDoc` voltasse a
    // calcular os três números por conta própria, esta igualdade é o que
    // acusaria, não os testes de valor acima.
    const plan = kocProposePlan(10, 6, () => 900);
    const cfg = resolveKocConfig({phases: plan, maxTeamsPerRound: 6}, undefined);
    const drafts = buildKingOfCourtRounds(
      Array.from({length: 10}, (_, i) => `t${i + 1}`),
      cfg,
      {plan},
    );
    for (const draft of drafts) {
      const doc = kocRoundDoc(draft, {
        tournamentId: "T", categoryId: "C", config: cfg, plan,
      }) as Record<string, any>;
      const fields = kocLegacyRoundFields(draft, plan[draft.phase - 1], cfg);
      assert.equal(doc.kocConfig.teamsPerCourt, fields.teamsPerCourt);
      assert.equal(doc.kocConfig.roundsPerBracket, fields.roundsPerBracket);
      assert.equal(doc.kocConfig.qualifiersPerRound, fields.qualifiersPerRound);
    }
  });
});
