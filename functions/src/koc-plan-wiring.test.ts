import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  KOC_LEGACY_MAX_TEAMS_PER_ROUND,
  KocBracketError,
  buildKingOfCourtRounds,
  kocProposePlan,
  kocResolvePlan,
  kocSnakeDistribute,
  type KocConfig,
  type KocRoundDraft,
} from "./koc-bracket-builders";
import {buildKocCategoryDocs, resolveKocConfig} from "./organizer-category-ops";

/**
 * Função pura testada sozinha não pega config que nunca chega na chamada — as
 * duas fiações que já quebraram nesta branch (portal gravando `kocPhases`
 * enquanto `resolveKocConfig` lia `phases`; plano derivado reinjetado por
 * `config.phases` e recusado por uma validação que era para plano de fora)
 * passaram por todo teste de unidade individual.
 *
 * Este arquivo percorre o caminho real, ponta a ponta:
 *   `bracketConfig`/categoria → `resolveKocConfig` → `kocResolvePlan` →
 *   `buildKingOfCourtRounds` (plano por `opts.plan`) → `kocRoundDoc`.
 *
 * E percorre CHAMANDO a produção: `buildKocCategoryDocs` é a mesma função que
 * `runGenerateCategoryBracket` chama — não uma sequência reescrita aqui.
 * Espelhar a sequência era o furo: reverter a fiação na produção deixava este
 * arquivo inteiro verde, porque ele nunca passava pela montagem da config nem
 * pela ordem das chamadas, que é exatamente onde os dois bugs moravam.
 *
 * `generateViaRealWiring` só traduz o vocabulário do teste (elenco da fase 1
 * como lista de listas) para o da produção (`groupsPreview`, que é como o
 * sorteio ao vivo entrega as chaves já reveladas).
 */
function generateViaRealWiring(
  teamIds: string[],
  bracketConfig: Record<string, unknown> | undefined,
  categoryMeta: Record<string, unknown> | undefined,
  phaseOneRosters?: readonly (readonly string[])[],
) {
  const {config, plan, drafts, docs} = buildKocCategoryDocs({
    teamIds,
    bracketConfig,
    categoryMeta,
    groupsPreview: (phaseOneRosters ?? []).map((roster, i) => ({
      id: `C${i + 1}`,
      teamIds: [...roster],
    })),
    tournamentId: "T",
    categoryId: "C",
  });
  return {config, plan, drafts, docs: docs as Array<Record<string, any>>};
}

/**
 * Compara os drafts ignorando a ORDEM do elenco dentro de cada rodada — o
 * único jeito de os três caminhos legitimamente divergirem é o sorteio ao
 * vivo impor uma ordem de elenco diferente da serpentina interna (mesmas
 * duplas, mesma chave, ordem de assento diferente). Tudo o mais — fase,
 * poolId, matchNumber, roundLabel, batteryLabel, tamanho, qualifiers,
 * crossoverIndex — tem que bater byte a byte, porque nada disso depende do
 * CONTEÚDO do elenco, só do FORMATO do plano.
 */
function withoutRosterOrder(drafts: readonly KocRoundDraft[]) {
  return drafts.map((d) => ({...d, teamIds: [...d.teamIds].sort()}));
}

/** Mesma normalização, para os docs já gravados (`kocTeamIds`). */
function withoutDocRosterOrder(docs: readonly Record<string, any>[]) {
  return docs.map((d) => ({...d, kocTeamIds: [...(d.kocTeamIds ?? [])].sort()}));
}

describe("fiação: os três caminhos que geram chave concordam", () => {
  // Campo com folga suficiente para produzir 4 fases (classificatória, duas
  // rodadas intermediárias e final) — é onde a divergência entre caminhos
  // apareceria, não num campo de fase única.
  const teamCount = 20;
  const teamIds = Array.from({length: teamCount}, (_, i) => `t${i + 1}`);
  const maxTeamsPerRound = 6;
  const roundDurationSec = 900;
  const plan = kocProposePlan(teamCount, maxTeamsPerRound, () => roundDurationSec);
  // NÃO pode ser a mesma partição que `buildKingOfCourtRounds` monta sozinho
  // quando `phaseOneRosters` não é passado (a serpentina abaixo) — se fosse,
  // a equivalência não discriminaria entre "o sorteio foi de fato usado" e
  // "o sorteio foi ignorado e caiu na serpentina interna" (um bug que
  // derrubasse o branch `opts.phaseOneRosters` passaria despercebido).
  // Mesma partição por chave — `assertPhaseOneRosters` continua aceitando —
  // mas ordem invertida dentro de cada chave: diferente da serpentina em
  // toda chave com 3+ duplas (o piso do formato), então a diferença é
  // garantida, não incidental.
  const snakeRosters = kocSnakeDistribute(teamIds, plan[0]!.bracketSizes);
  const phaseOneRosters = snakeRosters.map((roster) => [...roster].reverse());

  // Caminho 1: tela de gerar chave do portal (seeds.component.ts) — manda o
  // plano dentro do próprio `bracketConfig`.
  const portal = generateViaRealWiring(
    teamIds,
    {phases: plan, maxTeamsPerRound, roundDurationSec},
    undefined,
  );

  // Caminho 2: app Flutter — nunca manda `phases`; o plano só existe no doc da
  // categoria, sob o prefixo `koc` (`kocPhases`/`kocMaxTeamsPerRound`).
  const app = generateViaRealWiring(
    teamIds,
    {teamsPerCourt: 4, qualifiersPerRound: 2, roundDurationSec},
    {kocPhases: plan, kocMaxTeamsPerRound: maxTeamsPerRound},
  );

  // Caminho 3: publish do sorteio ao vivo — sem `bracketConfig` nenhum (mesmo
  // fallback de categoria do app), e o elenco da fase 1 vem das caixas já
  // reveladas ao público em vez da serpentina.
  const draw = generateViaRealWiring(
    teamIds,
    undefined,
    {kocPhases: plan, kocMaxTeamsPerRound: maxTeamsPerRound},
    phaseOneRosters,
  );

  it("resolvem o mesmo plano", () => {
    assert.deepEqual(portal.plan, plan);
    assert.deepEqual(app.plan, plan);
    assert.deepEqual(draw.plan, plan);
  });

  it(
    "concordam na FORMA das rodadas (fase, chave, bateria, tamanho, classificação) " +
      "— o sorteio pode diferir só na ORDEM do elenco dentro da chave",
    () => {
      assert.deepEqual(withoutRosterOrder(portal.drafts), withoutRosterOrder(app.drafts));
      assert.deepEqual(withoutRosterOrder(app.drafts), withoutRosterOrder(draw.drafts));
    },
  );

  it("gravam o mesmo doc de rodada nos três caminhos, a menos da ordem do elenco sorteado", () => {
    assert.deepEqual(withoutDocRosterOrder(portal.docs), withoutDocRosterOrder(app.docs));
    assert.deepEqual(withoutDocRosterOrder(app.docs), withoutDocRosterOrder(draw.docs));
  });

  it(
    "o elenco da fase 1 do sorteio é exatamente o que foi sorteado — não a " +
      "serpentina interna",
    () => {
      const drawPhaseOne = draw.drafts
        .filter((d) => d.phase === 1 && d.batteryLabel === 1)
        .map((d) => d.teamIds);
      // `opts.phaseOneRosters` tem que chegar intacto ao draft — é o que prova
      // que o sorteio ao vivo de fato impõe o elenco, em vez de a chave nascer
      // com uma ordem qualquer que por acaso serve.
      assert.deepEqual(drawPhaseOne, phaseOneRosters);
      // E tem que ser DIFERENTE do que a serpentina interna teria produzido —
      // senão um bug que ignorasse `opts.phaseOneRosters` e caísse no
      // fallback (`kocSnakeDistribute`) passaria despercebido por esta suite.
      assert.notDeepEqual(drawPhaseOne, snakeRosters);
    },
  );

  it("o plano congelado em kocConfig é o mesmo que gerou as rodadas, nos três caminhos", () => {
    for (const {docs} of [portal, app, draw]) {
      for (const doc of docs) {
        assert.deepEqual(doc.kocConfig.phases, plan);
        assert.equal(doc.kocConfig.maxTeamsPerRound, maxTeamsPerRound);
      }
    }
  });
});

describe("fiação: o plano do portal chega inteiro na chave publicada (10 duplas, teto 6)", () => {
  // Caso concreto do brief original: prova a semi de várias baterias e a
  // final recebendo as classificadas certas, com o plano passando por
  // `opts.plan` (a forma real — `{...config, phases: plan}` é a fiação que já
  // regrediu, ver describe abaixo).
  const teamIds = Array.from({length: 10}, (_, i) => `t${i + 1}`);
  const roundDurationSec = 900;
  const plan = kocProposePlan(10, 6, () => roundDurationSec);
  const {docs} = generateViaRealWiring(
    teamIds,
    {phases: plan, maxTeamsPerRound: 6, roundDurationSec},
    undefined,
  );

  it("tem 11 rodadas: 3 baterias × 4 chaves na classificatória, 4 baterias na semi, 1 final", () => {
    assert.equal(docs.length, 11);
  });

  it("a semi tem 6 duplas na bateria 1 e roda 4 baterias", () => {
    const semi = docs.filter((d) => d.matchType === "koc_semifinal");
    assert.equal(semi.length, 4);
    assert.equal(semi[0]!.kocSize, 6);
    assert.equal(semi[0]!.kocBatteryLabel, 1);
    assert.equal(semi[3]!.kocBatteryLabel, 4);
  });

  it("a final recebe as 4 vencedoras da semi", () => {
    const final = docs[docs.length - 1]!;
    assert.equal(final.matchType, "koc_final");
    assert.equal(final.kocQualifiers.length, 4);
  });

  it("o plano ficou congelado em todas as rodadas", () => {
    for (const doc of docs) {
      assert.deepEqual(doc.kocConfig.phases, plan);
      assert.equal(doc.kocConfig.maxTeamsPerRound, 6);
    }
  });
});

describe(
  "fiação: kocRoundDoc grava os números de CADA fase, não da primeira " +
    "(20 duplas, teto 6 — 4 fases)",
  () => {
    const teamCount = 20;
    const teamIds = Array.from({length: teamCount}, (_, i) => `t${i + 1}`);
    const roundDurationSec = 900;
    const plan = kocProposePlan(teamCount, 6, () => roundDurationSec);
    // Este plano fecha em 4 fases distintas — é o que garante que o teste
    // exercite fase 1, fase intermediária E final, não só as pontas.
    assert.equal(plan.length, 4, "pré-condição do teste: precisa de 4 fases");
    const {docs} = generateViaRealWiring(
      teamIds,
      {phases: plan, maxTeamsPerRound: 6, roundDurationSec},
      undefined,
    );

    it("fase 1 grava os números da fase 1, não os da categoria", () => {
      const fase1 = docs.find((d) => d.kocPhase === 1)!;
      assert.equal(fase1.kocConfig.teamsPerCourt, Math.max(...plan[0]!.bracketSizes));
      assert.equal(fase1.kocConfig.roundsPerBracket, plan[0]!.roundsPerBracket);
      assert.equal(fase1.kocConfig.qualifiersPerRound, plan[0]!.qualifiersPerRound);
    });

    it("uma rodada da fase 2 grava os números da fase 2 — não os da fase 1", () => {
      const fase2 = docs.find((d) => d.kocPhase === 2)!;
      const teamsPerCourtFase2 = Math.max(...plan[1]!.bracketSizes);
      assert.equal(fase2.kocConfig.teamsPerCourt, teamsPerCourtFase2);
      assert.equal(fase2.kocConfig.roundsPerBracket, plan[1]!.roundsPerBracket);
      assert.equal(fase2.kocConfig.qualifiersPerRound, plan[1]!.qualifiersPerRound);
      // Prova que NÃO é a fase 1 vazando: os dois planos têm teto de chave
      // diferente (fase 1 é 5, fase 2 é 6 — ver plano montado acima).
      assert.notEqual(teamsPerCourtFase2, Math.max(...plan[0]!.bracketSizes));
    });

    it(
      "a final grava qualifiersPerRound = tamanho da rodada (o pódio), não 0 — " +
        "0 apagaria a tabela na tela antiga",
      () => {
        const final = docs[docs.length - 1]!;
        assert.equal(final.matchType, "koc_final");
        const lastSpec = plan[plan.length - 1]!;
        assert.equal(lastSpec.qualifiersPerRound, 0); // a forma nova é 0 de propósito
        assert.equal(final.kocConfig.qualifiersPerRound, final.kocSize);
        assert.notEqual(final.kocConfig.qualifiersPerRound, 0);
      },
    );
  },
);

describe("fiação: sem plano no payload, o doc da categoria manda", () => {
  it("categoria com `phases` (grafia sem prefixo) ainda é lida", () => {
    const config = resolveKocConfig(
      {roundDurationSec: 900},
      {phases: kocProposePlan(10, 6, () => 900), maxTeamsPerRound: 6},
    );
    const plan = kocResolvePlan(10, config);
    assert.equal(plan.length, 3);
    assert.deepEqual(plan[1]!.bracketSizes, [6]);
  });

  it("categoria com `kocPhases` (grafia com prefixo, a que o portal grava) é lida", () => {
    const config = resolveKocConfig(
      {roundDurationSec: 900},
      {kocPhases: kocProposePlan(10, 6, () => 900), kocMaxTeamsPerRound: 6},
    );
    const plan = kocResolvePlan(10, config);
    assert.equal(plan.length, 3);
    assert.deepEqual(plan[1]!.bracketSizes, [6]);
  });

  it("`bracketConfig` explícito ganha de qualquer grafia gravada na categoria", () => {
    const fromPortal = kocProposePlan(10, 6, () => 900);
    const fromCategoryStale = kocProposePlan(10, 5, () => 900); // teto diferente, teria que perder
    const config = resolveKocConfig(
      {phases: fromPortal, maxTeamsPerRound: 6, roundDurationSec: 900},
      {kocPhases: fromCategoryStale, kocMaxTeamsPerRound: 5},
    );
    assert.deepEqual(config.phases, fromPortal);
    assert.equal(config.maxTeamsPerRound, 6);
  });
});

describe("fiação: sem plano em lugar nenhum, a chave é a de antes desta entrega", () => {
  it("16 duplas, config legada (sem phases): 3 fases de 4, exatamente como antes", () => {
    const config = resolveKocConfig(undefined, {
      teamsPerCourt: 4,
      qualifiersPerRound: 2,
      roundDurationSec: 900,
    });
    const plan = kocResolvePlan(16, config);
    assert.deepEqual(plan.map((p) => p.bracketSizes), [[4, 4, 4, 4], [4, 4], [4]]);
  });

  it("sem bracketConfig e sem categoria: phases fica indefinido e o teto cai no de sempre (5)", () => {
    const config = resolveKocConfig(undefined, undefined);
    assert.equal(config.phases, undefined);
    assert.equal(config.maxTeamsPerRound, KOC_LEGACY_MAX_TEAMS_PER_ROUND);
    assert.equal(config.maxTeamsPerRound, 5);
  });
});

describe("fiação: plano que não fecha vira KocBracketError com reason, não um throw cru", () => {
  it("campo abaixo do piso (2 duplas) é recusado com reason koc_field_too_small", () => {
    const config = resolveKocConfig(undefined, undefined);
    assert.throws(
      () => kocResolvePlan(2, config),
      (err: unknown) => err instanceof KocBracketError && err.reason === "koc_field_too_small",
    );
  });

  it(
    "config que não reduz o campo (qualifiersPerRound alto demais) é recusada com " +
      "reason koc_phase_does_not_reduce",
    () => {
      const config = resolveKocConfig(
        {teamsPerCourt: 4, qualifiersPerRound: 4, roundDurationSec: 900},
        undefined,
      );
      assert.throws(
        () => kocResolvePlan(20, config),
        (err: unknown) =>
          err instanceof KocBracketError && err.reason === "koc_phase_does_not_reduce",
      );
    },
  );
});

/**
 * A segunda das duas fiações que já quebraram nesta branch: um plano
 * DERIVADO internamente (config legada, sem `phases`) que, reinjetado por
 * `config.phases`, passa a ser tratado como plano de FORA e cai na checagem
 * de round-trip (`assertPlan`) — pensada para plano vindo do organizador, não
 * para o que `kocLegacyPlan` acabou de produzir. `teamsPerCourt: 3` com 19
 * duplas é o caso concreto: fecha em `[4,3,3,3,3,3]`, que não sobrevive à ida
 * e volta pelo tamanho (`ceil(19/4) = 5`, não 6).
 *
 * A fiação real (`opts.plan`) não tem esse problema porque pula `assertPlan`
 * de propósito — é exatamente o contraste que prova por quê.
 */
describe("fiação: opts.plan bypassa a revalidação; reinjetar por config.phases quebra config legada", () => {
  const teamIds = Array.from({length: 19}, (_, i) => `t${i + 1}`);
  const config: KocConfig = {teamsPerCourt: 3, qualifiersPerRound: 2, roundDurationSec: 900};
  const plan = kocResolvePlan(19, config);

  it("o plano derivado não fecha uma divisão que sobrevive à ida e volta pelo tamanho", () => {
    assert.deepEqual(plan[0]!.bracketSizes, [4, 3, 3, 3, 3, 3]);
  });

  it("a fiação real (plano por opts.plan) gera a chave normalmente", () => {
    assert.doesNotThrow(() => buildKingOfCourtRounds(teamIds, config, {plan}));
  });

  it("e a PRODUÇÃO gera essa mesma config legada sem recusar", () => {
    // Direto pela função que a callable chama: é o que pina a escolha de
    // `opts.plan` na produção. Provar só com `buildKingOfCourtRounds` deixava
    // a produção livre para voltar a reinjetar por `config.phases` — a
    // regressão que já aconteceu — com toda a suite verde.
    assert.doesNotThrow(() =>
      generateViaRealWiring(
        teamIds,
        {teamsPerCourt: 3, qualifiersPerRound: 2, roundDurationSec: 900},
        undefined,
      ),
    );
  });

  it("reinjetar o MESMO plano por config.phases é recusado — a regressão que já aconteceu", () => {
    assert.throws(
      () => buildKingOfCourtRounds(teamIds, {...config, phases: plan}),
      (err: unknown) =>
        err instanceof KocBracketError &&
        err.reason === "koc_bracket_count_not_roundtrippable",
    );
  });
});

/**
 * Fiação do override de duração por fase:
 *   categoria/`bracketConfig` → `resolveKocConfig` → `durationForPhase` →
 *   `durationSec` da fase no plano → `kocConfig.durationSec` do doc da rodada.
 *
 * A chave do mapa é o NÚMERO DA FASE como string, 1-based nas duas pontas. Um
 * descompasso 0-based/1-based entre quem grava e quem lê passaria por todo
 * teste que existe hoje: nenhum deles olha em QUAL fase o override caiu — só
 * que ele foi saneado (`resolveKocConfig`) ou que alguma rodada mudou de
 * duração. Com o override numa fase do MEIO, um deslocamento de uma casa
 * derruba este bloco em qualquer direção.
 *
 * Só o plano DERIVADO consulta `phaseDurationsSec`: plano explícito já traz a
 * duração de cada fase dentro de si (`assertPlan` usa `spec.durationSec`).
 * Por isso a config aqui é legada, sem `phases` — é a única em que o caminho
 * existe.
 */
describe("fiação: phaseDurationsSec cai na fase certa, e só nela", () => {
  const teamIds = Array.from({length: 16}, (_, i) => `t${i + 1}`);
  const OVERRIDE_PHASE = 2;
  const OVERRIDE_SEC = 1500;
  const DEFAULT_SEC = 900;

  const {plan, docs} = generateViaRealWiring(
    teamIds,
    {
      teamsPerCourt: 4,
      qualifiersPerRound: 2,
      roundDurationSec: DEFAULT_SEC,
      phaseDurationsSec: {[String(OVERRIDE_PHASE)]: OVERRIDE_SEC},
    },
    undefined,
  );

  it("o campo fecha em 3 fases — a override cai numa fase do MEIO, não numa ponta", () => {
    // Pré-condição do teste: numa ponta, um deslocamento de uma casa cairia
    // fora do plano e sumiria sem quebrar nada.
    assert.equal(plan.length, 3);
    assert.ok(OVERRIDE_PHASE > 1 && OVERRIDE_PHASE < plan.length);
  });

  it("o plano resolvido só muda a duração da fase com override", () => {
    assert.deepEqual(plan.map((p) => p.durationSec), [DEFAULT_SEC, OVERRIDE_SEC, DEFAULT_SEC]);
  });

  it("toda rodada da fase 2 é gravada com a duração da override", () => {
    const fase2 = docs.filter((d) => d.kocPhase === OVERRIDE_PHASE);
    assert.ok(fase2.length > 0, "a fase 2 precisa ter rodadas para o teste valer");
    for (const doc of fase2) {
      assert.equal(doc.kocConfig.durationSec, OVERRIDE_SEC);
    }
  });

  it("nenhuma rodada das OUTRAS fases herda a override", () => {
    const outras = docs.filter((d) => d.kocPhase !== OVERRIDE_PHASE);
    assert.ok(outras.length > 0);
    for (const doc of outras) {
      assert.equal(
        doc.kocConfig.durationSec,
        DEFAULT_SEC,
        `fase ${doc.kocPhase} não deveria durar ${doc.kocConfig.durationSec}s`,
      );
    }
  });

  it("a chave do mapa é 1-based: a fase 1 é \"1\", não \"0\"", () => {
    // O contraste direto. Uma override em "0" não pertence a fase nenhuma e
    // tem que ser ignorada — se o leitor fosse 0-based ela viraria a fase 1.
    const zeroBased = generateViaRealWiring(
      teamIds,
      {
        teamsPerCourt: 4,
        qualifiersPerRound: 2,
        roundDurationSec: DEFAULT_SEC,
        phaseDurationsSec: {"0": OVERRIDE_SEC},
      },
      undefined,
    );
    for (const doc of zeroBased.docs) {
      assert.equal(doc.kocConfig.durationSec, DEFAULT_SEC);
    }

    const oneBased = generateViaRealWiring(
      teamIds,
      {
        teamsPerCourt: 4,
        qualifiersPerRound: 2,
        roundDurationSec: DEFAULT_SEC,
        phaseDurationsSec: {"1": OVERRIDE_SEC},
      },
      undefined,
    );
    for (const doc of oneBased.docs.filter((d) => d.kocPhase === 1)) {
      assert.equal(doc.kocConfig.durationSec, OVERRIDE_SEC);
    }
  });

  it("a override também chega quando mora no doc da CATEGORIA, não no payload", () => {
    // O app da loja e o publish do sorteio não mandam `phaseDurationsSec`; se
    // o `pick()` deixasse de olhar a categoria, os dois perderiam o override
    // sem nenhum erro.
    const {docs: fromCategory} = generateViaRealWiring(
      teamIds,
      undefined,
      {
        teamsPerCourt: 4,
        qualifiersPerRound: 2,
        roundDurationSec: DEFAULT_SEC,
        phaseDurationsSec: {[String(OVERRIDE_PHASE)]: OVERRIDE_SEC},
      },
    );
    for (const doc of fromCategory) {
      assert.equal(
        doc.kocConfig.durationSec,
        doc.kocPhase === OVERRIDE_PHASE ? OVERRIDE_SEC : DEFAULT_SEC,
      );
    }
  });
});
