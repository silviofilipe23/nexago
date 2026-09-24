import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  KOC_DEFAULT_ROUND_DURATION_SEC,
  KOC_LEGACY_MAX_TEAMS_PER_ROUND,
  KocBracketError,
  buildKingOfCourtRounds,
  kocBracketCountForRounds,
  kocClampMaxPerRound,
  kocLegacyPlan,
  kocNextRoundIndex,
  kocProposePlan,
  kocQualifierDescription,
  kocResolvePlan,
  kocRoundCount,
  kocRoundSizes,
  kocMaxRoundsPerBracket,
  kocSnakeDistribute,
  type KocConfig,
  type KocPhaseSpec,
  type KocRoundDraft,
} from "./koc-bracket-builders";

const baseConfig: KocConfig = {
  teamsPerCourt: 4,
  qualifiersPerRound: 2,
  roundDurationSec: KOC_DEFAULT_ROUND_DURATION_SEC,
};

/** Duplas semeadas: "s1" é o cabeça de chave. */
function seeds(n: number): string[] {
  return Array.from({length: n}, (_, i) => `s${i + 1}`);
}

/** Converte o elenco de volta para números de seed, para ler a semeadura. */
function seedNumbers(ids: string[]): number[] {
  return ids.map((id) => Number(id.replace("s", "")));
}

function phaseOf(drafts: KocRoundDraft[], phase: number): KocRoundDraft[] {
  return drafts.filter((d) => d.phase === phase);
}

describe("kocRoundCount", () => {
  it("divide pelo número de duplas por quadra quando fecha", () => {
    assert.equal(kocRoundCount(16, 4), 4);
    assert.equal(kocRoundCount(8, 4), 2);
    assert.equal(kocRoundCount(12, 4), 3);
  });

  it("junta em vez de deixar rodada com menos de 3 duplas", () => {
    // 5 em quadras de 4 dariam 3 e 2 — uma rodada de 2 não é KOTC, é um jogo.
    assert.equal(kocRoundCount(5, 4), 1);
    assert.equal(kocRoundCount(7, 4), 2);
  });

  it("nunca passa do teto de 5 duplas na rodada", () => {
    for (let n = 3; n <= 40; n++) {
      for (const perCourt of [3, 4, 5]) {
        const rounds = kocRoundCount(n, perCourt);
        const sizes = kocRoundSizes(n, rounds);
        assert.ok(
          Math.max(...sizes) <= 5,
          `${n} duplas em quadras de ${perCourt}: ${sizes.join(",")}`,
        );
        assert.ok(
          Math.min(...sizes) >= 3,
          `${n} duplas em quadras de ${perCourt}: ${sizes.join(",")}`,
        );
      }
    }
  });

  it("recusa campo menor que uma rodada", () => {
    assert.throws(() => kocRoundCount(2, 4), KocBracketError);
  });
});

describe("kocRoundSizes", () => {
  it("distribui o resto nas primeiras rodadas", () => {
    assert.deepEqual(kocRoundSizes(14, 4), [4, 4, 3, 3]);
    assert.deepEqual(kocRoundSizes(16, 4), [4, 4, 4, 4]);
  });
});

describe("kocSnakeDistribute", () => {
  it("equilibra a força: em 16 duplas toda rodada soma 34", () => {
    const rounds = kocSnakeDistribute(seeds(16), [4, 4, 4, 4]);
    const sums = rounds.map((r) => seedNumbers(r).reduce((a, b) => a + b, 0));
    assert.deepEqual(sums, [34, 34, 34, 34]);
  });

  it("reproduz a grade da 1ª etapa (seção 7 do plano)", () => {
    const rounds = kocSnakeDistribute(seeds(16), [4, 4, 4, 4]);
    assert.deepEqual(rounds.map(seedNumbers), [
      [1, 8, 9, 16],
      [2, 7, 10, 15],
      [3, 6, 11, 14],
      [4, 5, 12, 13],
    ]);
  });

  it("respeita rodadas de tamanhos diferentes sem perder dupla", () => {
    const rounds = kocSnakeDistribute(seeds(14), [4, 4, 3, 3]);
    assert.deepEqual(rounds.map((r) => r.length), [4, 4, 3, 3]);
    assert.equal(new Set(rounds.flat()).size, 14);
  });
});

describe("kocNextRoundIndex", () => {
  it("manda as classificadas de uma mesma rodada para semis diferentes", () => {
    // Sem isso, as duas que acabaram de se enfrentar se reencontram na fase
    // seguinte — o contrário do que o cruzamento existe para evitar.
    for (let source = 0; source < 4; source++) {
      const first = kocNextRoundIndex(source, 1, 2);
      const second = kocNextRoundIndex(source, 2, 2);
      assert.notEqual(first, second, `rodada ${source + 1}`);
    }
  });

  it("equilibra primeiros e segundos entre as semis", () => {
    const semis: number[][] = [[], []];
    for (let source = 0; source < 4; source++) {
      for (const place of [1, 2]) {
        semis[kocNextRoundIndex(source, place, 2)]!.push(place);
      }
    }
    for (const semi of semis) {
      assert.equal(semi.filter((p) => p === 1).length, 2);
      assert.equal(semi.filter((p) => p === 2).length, 2);
    }
  });
});

describe("buildKingOfCourtRounds — 16 duplas, a 1ª etapa", () => {
  const drafts = buildKingOfCourtRounds(seeds(16), baseConfig);

  it("fecha em 7 rodadas: 4 classificatórias, 2 semis e a final", () => {
    assert.equal(drafts.length, 7);
    assert.deepEqual(
      [1, 2, 3].map((p) => phaseOf(drafts, p).length),
      [4, 2, 1],
    );
  });

  it("numera as rodadas em sequência cronológica", () => {
    assert.deepEqual(
      drafts.map((d) => d.matchNumber),
      [1, 2, 3, 4, 5, 6, 7],
    );
  });

  it("marca os tipos de partida por fase", () => {
    assert.deepEqual(phaseOf(drafts, 1).map((d) => d.matchType), [
      "koc_round",
      "koc_round",
      "koc_round",
      "koc_round",
    ]);
    assert.deepEqual(phaseOf(drafts, 2).map((d) => d.matchType), [
      "koc_semifinal",
      "koc_semifinal",
    ]);
    assert.deepEqual(phaseOf(drafts, 3).map((d) => d.matchType), ["koc_final"]);
  });

  it("classificatória sai com elenco fechado e semeadura equilibrada", () => {
    assert.deepEqual(phaseOf(drafts, 1).map((d) => seedNumbers(d.teamIds)), [
      [1, 8, 9, 16],
      [2, 7, 10, 15],
      [3, 6, 11, 14],
      [4, 5, 12, 13],
    ]);
  });

  it("semis nascem sem elenco, só com as vagas da fase anterior", () => {
    for (const semi of phaseOf(drafts, 2)) {
      assert.deepEqual(semi.teamIds, []);
      assert.equal(semi.qualifiers.length, 4);
      assert.equal(semi.size, 4);
    }
  });

  it("cruza as semis como o plano descreve", () => {
    const [sf1, sf2] = phaseOf(drafts, 2);
    const label = (d: KocRoundDraft) =>
      d.qualifiers
        .map((q) => `${q.place}ºR${q.fromRoundLabel}`)
        .sort()
        .join(" ");
    assert.equal(label(sf1!), ["1ºR1", "2ºR2", "1ºR3", "2ºR4"].sort().join(" "));
    assert.equal(label(sf2!), ["1ºR2", "2ºR1", "1ºR4", "2ºR3"].sort().join(" "));
  });

  it("ninguém reencontra na semi quem enfrentou na classificatória", () => {
    for (const semi of phaseOf(drafts, 2)) {
      const sources = semi.qualifiers.map((q) => q.fromRoundLabel);
      assert.equal(new Set(sources).size, sources.length);
    }
  });

  it("a final leva as 4 duplas das duas semis", () => {
    const [grandFinal] = phaseOf(drafts, 3);
    assert.equal(grandFinal!.size, 4);
    assert.equal(grandFinal!.qualifiers.length, 4);
    assert.deepEqual(
      grandFinal!.qualifiers.map((q) => q.place).sort(),
      [1, 1, 2, 2],
    );
  });

  it("carimba a duração em toda rodada", () => {
    for (const draft of drafts) {
      assert.equal(draft.durationSec, KOC_DEFAULT_ROUND_DURATION_SEC);
    }
  });
});

describe("buildKingOfCourtRounds — duração configurável", () => {
  it("aceita duração própria da categoria", () => {
    const drafts = buildKingOfCourtRounds(seeds(16), {
      ...baseConfig,
      roundDurationSec: 1200,
    });
    assert.ok(drafts.every((d) => d.durationSec === 1200));
  });

  it("aceita override por fase — final mais longa que a classificatória", () => {
    const drafts = buildKingOfCourtRounds(seeds(16), {
      ...baseConfig,
      phaseDurationsSec: {"3": 1200},
    });
    assert.ok(phaseOf(drafts, 1).every((d) => d.durationSec === 900));
    assert.equal(phaseOf(drafts, 3)[0]!.durationSec, 1200);
  });

  it("prende a duração nos limites do formato", () => {
    const curta = buildKingOfCourtRounds(seeds(8), {
      ...baseConfig,
      roundDurationSec: 30,
    });
    assert.equal(curta[0]!.durationSec, 300);

    const longa = buildKingOfCourtRounds(seeds(8), {
      ...baseConfig,
      roundDurationSec: 99999,
    });
    assert.equal(longa[0]!.durationSec, 2400);
  });
});

describe("buildKingOfCourtRounds — outros tamanhos de campo", () => {
  it("campo de 8 duplas fecha em 2 fases, sem semifinal", () => {
    const drafts = buildKingOfCourtRounds(seeds(8), baseConfig);
    assert.deepEqual(drafts.map((d) => d.matchType), [
      "koc_round",
      "koc_round",
      "koc_final",
    ]);
  });

  it("campo que cabe numa rodada só é a própria final", () => {
    const drafts = buildKingOfCourtRounds(seeds(4), baseConfig);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]!.matchType, "koc_final");
    assert.equal(drafts[0]!.teamIds.length, 4);
  });

  it("campo ímpar não perde nem duplica dupla", () => {
    for (const total of [9, 11, 13, 14, 17, 19, 23]) {
      const drafts = buildKingOfCourtRounds(seeds(total), baseConfig);
      const rostered = phaseOf(drafts, 1).flatMap((d) => d.teamIds);
      assert.equal(new Set(rostered).size, total, `${total} duplas`);
      assert.equal(rostered.length, total, `${total} duplas`);
    }
  });

  it("toda fase termina numa única rodada final", () => {
    for (let total = 3; total <= 30; total++) {
      const drafts = buildKingOfCourtRounds(seeds(total), baseConfig);
      const finals = drafts.filter((d) => d.matchType === "koc_final");
      assert.equal(finals.length, 1, `${total} duplas`);
      assert.equal(
        finals[0]!.matchNumber,
        drafts.length,
        `${total} duplas: a final é a última rodada`,
      );
    }
  });

  it("recusa campo menor que uma rodada", () => {
    assert.throws(() => buildKingOfCourtRounds(seeds(2), baseConfig), KocBracketError);
  });

  it("recusa configuração que não reduz o campo entre as fases", () => {
    // 4 classificadas por rodada em quadras de 4: a fase inteira passa.
    assert.throws(
      () => buildKingOfCourtRounds(seeds(16), {...baseConfig, qualifiersPerRound: 4}),
      (err: Error) => {
        assert.ok(err instanceof KocBracketError);
        assert.equal(err.reason, "koc_phase_does_not_reduce");
        return true;
      },
    );
  });
});

describe("kocQualifierDescription", () => {
  it("descreve a vaga do jeito que a mesa lê", () => {
    assert.equal(
      kocQualifierDescription({fromMatchNumber: 3, fromRoundLabel: 3, place: 1}),
      "1º Rodada 3",
    );
  });
});

/**
 * Elenco vindo do SORTEIO AO VIVO.
 *
 * O sorteio distribui as duplas nas rodadas na frente do público; a geração
 * tem de respeitar aquilo em vez de refazer a serpentina — senão o que a chave
 * grava não é o que as pessoas viram sortear.
 */
describe("buildKingOfCourtRounds · elenco sorteado", () => {
  const CONFIG = {teamsPerCourt: 4, qualifiersPerRound: 2, roundDurationSec: 900};
  const SEEDS = Array.from({length: 8}, (_, i) => `t${i + 1}`);

  it("usa as rodadas do sorteio em vez da serpentina", () => {
    const sorteadas = [["t8", "t3", "t5", "t1"], ["t2", "t7", "t4", "t6"]];
    const rounds = buildKingOfCourtRounds(SEEDS, CONFIG, {
      phaseOneRosters: sorteadas,
    });
    const fase1 = rounds.filter((r) => r.phase === 1);
    assert.deepEqual(fase1.map((r) => r.teamIds), sorteadas);
  });

  it("sem sorteio, continua na serpentina", () => {
    const fase1 = buildKingOfCourtRounds(SEEDS, CONFIG).filter((r) => r.phase === 1);
    assert.deepEqual(fase1.map((r) => r.teamIds), kocSnakeDistribute(SEEDS, [4, 4]));
  });

  it("recusa elenco que não cobre todas as duplas", () => {
    assert.throws(
      () =>
        buildKingOfCourtRounds(SEEDS, CONFIG, {
          phaseOneRosters: [["t1", "t2", "t3", "t4"], ["t5", "t6", "t7", "t1"]],
        }),
      /repetiu uma dupla/,
    );
  });

  it("recusa rodada com tamanho errado", () => {
    assert.throws(
      () =>
        buildKingOfCourtRounds(SEEDS, CONFIG, {
          phaseOneRosters: [["t1", "t2", "t3"], ["t4", "t5", "t6", "t7", "t8"]],
        }),
      /pede 4/,
    );
  });

  it("recusa número de rodadas diferente do da fase", () => {
    assert.throws(
      () =>
        buildKingOfCourtRounds(SEEDS, CONFIG, {
          phaseOneRosters: [SEEDS],
        }),
      /1 rodadas, mas a fase tem 2/,
    );
  });

  it("as fases seguintes seguem nascendo com vagas, não com elenco", () => {
    const rounds = buildKingOfCourtRounds(SEEDS, CONFIG, {
      phaseOneRosters: [["t8", "t3", "t5", "t1"], ["t2", "t7", "t4", "t6"]],
    });
    const final = rounds.filter((r) => r.phase === 2);
    assert.deepEqual(final.map((r) => r.teamIds), [[]]);
    assert.equal(final[0]!.qualifiers.length, 4);
  });
});

/**
 * Chave que joga VÁRIAS rodadas, cada uma classificando uma dupla.
 *
 * A vencedora sai e libera a quadra, então a chave encolhe: 4 → 3. É o que
 * permite classificar N duplas de uma chave sem comparar pontos entre elas.
 */
describe("buildKingOfCourtRounds · rodadas por chave", () => {
  const BASE = {teamsPerCourt: 4, qualifiersPerRound: 2, roundDurationSec: 900};
  const SEEDS = Array.from({length: 16}, (_, i) => `t${i + 1}`);

  function build(roundsPerBracket: number) {
    return buildKingOfCourtRounds(SEEDS, {...BASE, roundsPerBracket});
  }

  it("as rodadas da MESMA chave saem em sequência: 4 chaves × 2 = 8", () => {
    // Na areia é o mesmo grupo na mesma quadra: joga a rodada 1, a vencedora
    // sai, e quem ficou segue direto para a rodada 2. Emitir todas as primeiras
    // e depois todas as segundas espalhava a chave pela grade.
    const fase1 = build(2).filter((r) => r.phase === 1);
    assert.equal(fase1.length, 8);
    assert.deepEqual(
      fase1.map((r) => r.poolId),
      ["C1", "C1", "C2", "C2", "C3", "C3", "C4", "C4"],
    );
    // Consecutivas também no número da partida — é o que a grade e o
    // agendamento leem para pôr uma logo depois da outra.
    for (const pool of ["C1", "C2", "C3", "C4"]) {
      const [primeira, segunda] = fase1.filter((r) => r.poolId === pool);
      assert.equal(segunda!.matchNumber, primeira!.matchNumber + 1, pool);
    }
  });

  it("o rótulo da rodada segue a ordem de jogo, sem repetir", () => {
    const fase1 = build(2).filter((r) => r.phase === 1);
    assert.deepEqual(fase1.map((r) => r.roundLabel), [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("a rodada seguinte da chave é quem NÃO classificou na anterior", () => {
    const fase1 = build(2).filter((r) => r.phase === 1);
    const primeira = fase1.find((r) => r.poolId === "C1")!;
    const segunda = fase1.filter((r) => r.poolId === "C1")[1]!;

    assert.equal(segunda.teamIds.length, 0, "o elenco vem da tabela, não da semeadura");
    assert.deepEqual(
      segunda.qualifiers.map((q) => q.place),
      [2, 3, 4],
      "a vencedora saiu; ficam os lugares 2 em diante",
    );
    assert.ok(
      segunda.qualifiers.every((q) => q.fromMatchNumber === primeira.matchNumber),
      "as vagas apontam para a rodada anterior da PRÓPRIA chave",
    );
  });

  it("a chave encolhe rodada a rodada", () => {
    const c1 = build(2).filter((r) => r.phase === 1 && r.poolId === "C1");
    assert.deepEqual(c1.map((r) => r.size), [4, 3]);
  });

  it("as duas classificadas da mesma chave caem em semifinais diferentes", () => {
    const rounds = build(2);
    const semis = rounds.filter((r) => r.phase === 2);
    const c1 = rounds.filter((r) => r.phase === 1 && r.poolId === "C1");

    const semiDe = (matchNumber: number) =>
      semis.findIndex((s) => s.qualifiers.some((q) => q.fromMatchNumber === matchNumber));

    assert.notEqual(semiDe(c1[0]!.matchNumber), semiDe(c1[1]!.matchNumber));
  });

  it("nenhuma semifinal vira a 'forte': cada uma mistura vencedoras de rodadas diferentes", () => {
    // Agrupar por ordem de classificação poria todas as que venceram contra a
    // chave cheia numa semifinal só.
    const rounds = build(2);
    const fase1 = rounds.filter((r) => r.phase === 1);
    const primeiras = new Set(fase1.slice(0, 4).map((r) => r.matchNumber));

    for (const semi of rounds.filter((r) => r.phase === 2)) {
      const daPrimeira = semi.qualifiers.filter((q) => primeiras.has(q.fromMatchNumber)).length;
      assert.equal(daPrimeira, 2, "cada semifinal leva 2 de rodada 1 e 2 de rodada 2");
    }
  });

  it("a semifinal segue mandando DUAS para a final", () => {
    const final = build(2).find((r) => r.matchType === "koc_final")!;
    assert.deepEqual(final.qualifiers.map((q) => q.place).sort(), [1, 1, 2, 2]);
  });

  it("recusa mais rodadas do que a chave aguenta", () => {
    // Chave de 4: a 3ª rodada rodaria com 2 duplas, que não é King of the Court.
    assert.throws(() => build(3), /comporta no máximo 2 rodada/);
  });

  it("uma rodada por chave é o formato de sempre", () => {
    assert.deepEqual(build(1), buildKingOfCourtRounds(SEEDS, BASE));
  });
});

describe("kocMaxRoundsPerBracket", () => {
  it("cada rodada tira uma dupla, e o mínimo do formato é o piso", () => {
    assert.equal(kocMaxRoundsPerBracket(3), 1);
    assert.equal(kocMaxRoundsPerBracket(4), 2);
    assert.equal(kocMaxRoundsPerBracket(5), 3);
  });
});

describe("kocBracketCountForRounds", () => {
  it("14 duplas com 2 rodadas por chave viram 3 chaves, nao 4 com uma de 3", () => {
    assert.equal(kocRoundCount(14, 4), 4);
    assert.equal(kocBracketCountForRounds(14, 4, 2), 3);
    assert.deepEqual(kocRoundSizes(14, kocBracketCountForRounds(14, 4, 2)), [5, 5, 4]);
  });

  it("com uma rodada por chave nada muda", () => {
    for (const n of [9, 13, 14, 17, 22]) {
      assert.equal(kocBracketCountForRounds(n, 4, 1), kocRoundCount(n, 4));
    }
  });

  it("nao estoura o teto da rodada: 6 duplas continuam em 2 chaves", () => {
    // Juntar em 1 chave daria uma rodada de 6, acima do maximo do formato.
    assert.equal(kocBracketCountForRounds(6, 4, 2), 2);
  });
});

/** Duração fixa: o planejador não decide duração, só a carrega. */
const flat = (): number => 900;

describe("kocMaxRoundsPerBracket com mais de uma classificada", () => {
  it("com 1 por bateria é o de sempre: a chave encolhe de uma em uma", () => {
    assert.equal(kocMaxRoundsPerBracket(3), 1);
    assert.equal(kocMaxRoundsPerBracket(4), 2);
    assert.equal(kocMaxRoundsPerBracket(5), 3);
    assert.equal(kocMaxRoundsPerBracket(6), 4);
  });

  it("com 2 por bateria a chave encolhe de duas em duas", () => {
    assert.equal(kocMaxRoundsPerBracket(6, 2), 2); // 6 → 4, e 4 ainda é rodada
    assert.equal(kocMaxRoundsPerBracket(7, 2), 3); // 7 → 5 → 3
    assert.equal(kocMaxRoundsPerBracket(4, 2), 1); // 4 → 2 não é rodada
  });
});

describe("kocClampMaxPerRound", () => {
  it("ausente ou inválido vale o teto de sempre, não o novo", () => {
    assert.equal(kocClampMaxPerRound(undefined), KOC_LEGACY_MAX_TEAMS_PER_ROUND);
    assert.equal(kocClampMaxPerRound("x"), KOC_LEGACY_MAX_TEAMS_PER_ROUND);
  });

  it("prende na faixa do formato", () => {
    assert.equal(kocClampMaxPerRound(2), 3);
    assert.equal(kocClampMaxPerRound(9), 6);
    assert.equal(kocClampMaxPerRound(6), 6);
  });
});

describe("kocProposePlan", () => {
  it("10 duplas com teto 6: o formato que o dono pediu", () => {
    const plan = kocProposePlan(10, 6, flat);
    assert.deepEqual(plan, [
      {bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
      {bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900},
      {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
    ] satisfies KocPhaseSpec[]);
  });

  it("campo que cabe numa quadra é uma rodada só — não se inventa fase", () => {
    for (const n of [3, 4, 5, 6]) {
      const plan = kocProposePlan(n, 6, flat);
      assert.deepEqual(plan, [
        {bracketSizes: [n], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
      ]);
    }
  });

  it("chave que só aguenta uma bateria classifica mais de uma, ou o campo morre", () => {
    // 7 duplas: 2 chaves de [4,3]; a de 3 não comporta segunda bateria, então a
    // fase volta ao formato clássico e passam 2 de cada.
    const plan = kocProposePlan(7, 6, flat);
    assert.equal(plan[0]!.roundsPerBracket, 1);
    assert.equal(plan[0]!.qualifiersPerRound, 2);
    assert.deepEqual(plan[1]!.bracketSizes, [4]);
  });

  it("72 duplas com teto 6 fecham em 6 fases, a última numa chave de 6", () => {
    // Achado do round de revisão: o planejador é guloso e não conhecia o
    // orçamento de KOC_MAX_PHASES — em 72 duplas ele devolvia uma última fase
    // com mais de uma chave e `qualifiersPerRound` maior que 0, violando a
    // regra de que a final é sempre uma chave só com `qualifiersPerRound: 0`.
    const plan = kocProposePlan(72, 6, flat);
    assert.equal(plan.length, 6, "72 duplas: plano deveria fechar em 6 fases");
    const final = plan[plan.length - 1]!;
    assert.deepEqual(final.bracketSizes, [6]);
    assert.equal(final.roundsPerBracket, 1);
    assert.equal(final.qualifiersPerRound, 0);
  });

  it("4 duplas com teto 3 não têm chave que caiba entre o piso e o teto", () => {
    // 4 duplas em quadras de no máximo 3: uma chave só estoura o teto, duas
    // chaves dão 2+2 — abaixo do piso. Não existe divisão válida.
    assert.throws(() => kocProposePlan(4, 3, flat), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_field_not_splittable");
      return true;
    });
  });

  it("3 a 200 duplas, teto 3 a 6: todo plano fecha nas regras do formato ou recusa por nome", () => {
    // Orçamento de fases do módulo (`KOC_MAX_PHASES`, module-private — não
    // exportado, então repetido aqui como literal documentado).
    const MAX_PHASES = 6;
    for (const max of [3, 4, 5, 6]) {
      for (let n = 3; n <= 200; n++) {
        let plan: KocPhaseSpec[];
        try {
          plan = kocProposePlan(n, max, flat);
        } catch (e) {
          if (!(e instanceof KocBracketError)) throw e;
          assert.ok(
            e.reason === "koc_field_not_splittable" || e.reason === "koc_plan_exceeds_max_phases",
            `${n} duplas, teto ${max}: motivo inesperado ${e.reason}`,
          );
          continue;
        }
        assert.ok(
          plan.length <= MAX_PHASES,
          `${n} duplas, teto ${max}: plano com ${plan.length} fases, acima do orçamento`,
        );
        let field = n;
        for (let i = 0; i < plan.length; i++) {
          const spec = plan[i]!;
          const sum = spec.bracketSizes.reduce((a, b) => a + b, 0);
          assert.equal(sum, field, `${n} duplas, teto ${max}: fase ${i + 1} soma ${sum}, campo é ${field}`);
          for (const size of spec.bracketSizes) {
            assert.ok(size >= 3 && size <= max, `${n} duplas, teto ${max}: chave de ${size} fora da faixa`);
            const last = size - (spec.roundsPerBracket - 1) * Math.max(1, spec.qualifiersPerRound);
            assert.ok(last >= 3, `${n} duplas, teto ${max}: última bateria ficaria com ${last}`);
          }
          const isLast = i === plan.length - 1;
          if (isLast) {
            assert.equal(spec.bracketSizes.length, 1, `${n} duplas, teto ${max}: final com mais de uma quadra`);
            assert.equal(spec.roundsPerBracket, 1);
            assert.equal(spec.qualifiersPerRound, 0);
          } else {
            assert.ok(spec.qualifiersPerRound >= 1, `${n} duplas, teto ${max}: fase ${i + 1} não classifica ninguém`);
            const next = spec.bracketSizes.length * spec.roundsPerBracket * spec.qualifiersPerRound;
            assert.ok(next < field, `${n} duplas, teto ${max}: fase ${i + 1} não reduz (${field} → ${next})`);
            field = next;
          }
        }
      }
    }
  });

  it("recusa campo menor que o mínimo do formato", () => {
    assert.throws(() => kocProposePlan(2, 6, flat), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_field_too_small");
      return true;
    });
  });
});

describe("buildKingOfCourtRounds · campo que nao e multiplo da quadra", () => {
  const cfg = (roundsPerBracket: number) => ({
    teamsPerCourt: 4,
    roundsPerBracket,
    qualifiersPerRound: 2,
    roundDurationSec: 1200,
  });

  it("14 duplas aceitam 2 rodadas por chave", () => {
    const teamIds = Array.from({length: 14}, (_, i) => `t${i + 1}`);
    const rounds = buildKingOfCourtRounds(teamIds, cfg(2));
    const phaseOne = rounds.filter((r) => r.phase === 1);
    assert.equal(phaseOne.length, 6); // 3 chaves x 2 rodadas, em sequencia
    // As rodadas de cada chave saem juntas: [C1 r1, C1 r2, C2 r1, C2 r2, ...].
    assert.deepEqual(phaseOne.map((r) => r.size), [5, 4, 5, 4, 4, 3]);
    // A 2a rodada de cada chave herda os nao-classificados da 1a, e so deles.
    for (let i = 0; i < 3; i++) {
      const first = phaseOne[i * 2]!;
      const second = phaseOne[i * 2 + 1]!;
      assert.equal(second.poolId, first.poolId);
      const sources = new Set((second.qualifiers ?? []).map((q) => q.fromMatchNumber));
      assert.deepEqual([...sources], [first.matchNumber]);
    }
  });

  it("13, 15, 17 e 22 duplas tambem fecham", () => {
    for (const n of [13, 15, 17, 22]) {
      const teamIds = Array.from({length: n}, (_, i) => `t${i + 1}`);
      const rounds = buildKingOfCourtRounds(teamIds, cfg(2));
      assert.ok(rounds.length > 0, `${n} duplas`);
      const phaseOne = rounds.filter((r) => r.phase === 1);
      assert.equal(phaseOne.length % 2, 0, `${n} duplas: fase 1 tem que ser chaves x 2`);
    }
  });

  it("6 duplas seguem recusadas: 1 chave de 6 estoura o teto da rodada", () => {
    const teamIds = Array.from({length: 6}, (_, i) => `t${i + 1}`);
    assert.throws(
      () => buildKingOfCourtRounds(teamIds, cfg(2)),
      (e: KocBracketError) => e.reason === "koc_rounds_per_bracket_too_high",
    );
  });
});

describe("kocLegacyPlan preserva o comportamento de hoje", () => {
  it("16 duplas em quadras de 4, 2 classificadas: 4 chaves → 2 → final", () => {
    const plan = kocLegacyPlan(16, {...baseConfig});
    assert.deepEqual(plan.map((p) => p.bracketSizes), [[4, 4, 4, 4], [4, 4], [4]]);
    assert.deepEqual(plan.map((p) => p.roundsPerBracket), [1, 1, 1]);
    assert.deepEqual(plan.map((p) => p.qualifiersPerRound), [2, 2, 0]);
  });

  it("14 duplas com 2 rodadas por chave: 3 chaves mais cheias", () => {
    const plan = kocLegacyPlan(14, {...baseConfig, roundsPerBracket: 2});
    assert.deepEqual(plan[0]!.bracketSizes, [5, 5, 4]);
    assert.equal(plan[0]!.roundsPerBracket, 2);
    assert.equal(plan[0]!.qualifiersPerRound, 1);
  });

  it("recusa a chave que não comporta as rodadas pedidas", () => {
    assert.throws(
      () => kocLegacyPlan(6, {...baseConfig, roundsPerBracket: 3}),
      (e: unknown) => e instanceof KocBracketError,
    );
  });
});

/**
 * Achado durante esta task: com campo que não divide igual entre as chaves de
 * uma fase do MEIO (ex.: 17 duplas — fase 2 nasce em chaves de 4, 3 e 3), o
 * cruzamento por módulo (`kocNextRoundIndex`) podia mandar vagas a mais para
 * uma chave e a menos para outra, porque ele não sabe que `kocRoundSizes` dá a
 * vaga extra sempre à(s) PRIMEIRA(S) chave(s). Antes desta task isso nunca
 * estourava um teste porque nada verificava o elenco de fases além da 1ª — a
 * chave saía torta em silêncio. `emitPhase` ganhou uma rede de segurança que
 * teria acusado (`koc_round_roster_mismatch`); este teste cobre o campo que
 * antes quebrava (17 e 19) e uma faixa ao redor, para não voltar a quebrar.
 */
describe("buildKingOfCourtRounds · legado com fase do meio que não divide igual", () => {
  it("3 a 40 duplas: toda rodada nasce com exatamente as vagas que pede", () => {
    for (let n = 3; n <= 40; n++) {
      const drafts = buildKingOfCourtRounds(seeds(n), baseConfig);
      for (const d of drafts) {
        assert.equal(
          d.teamIds.length + d.qualifiers.length,
          d.size,
          `${n} duplas: fase ${d.phase} ${d.poolId} #${d.matchNumber} pede ${d.size} ` +
            `e tem ${d.teamIds.length} + ${d.qualifiers.length}`,
        );
      }
    }
  });
});

/**
 * Achado no round 1 de revisão desta task: a correção acima ("anda para a
 * próxima chave com lugar livre") olhava só CAPACIDADE, nunca a IDENTIDADE de
 * quem já caiu ali — então podia mandar duas classificadas da MESMA chave de
 * origem para a MESMA chave da fase seguinte, que é exatamente o reencontro
 * que a serpentina existe para evitar. Reproduzido com
 * `{teamsPerCourt: 5, qualifiersPerRound: 3}` em n=66: a rodada #19 (fase 2,
 * C5) recebia o 2º E o 3º lugar da MESMA rodada #12.
 *
 * `findAvailableTarget` agora peneira por capacidade E por origem repetida,
 * com fallback para repetir a origem só quando nenhuma chave sobra sem
 * repetir — o pigeonhole genuíno de uma chave mandar mais classificadas do que
 * a fase seguinte tem chaves (a ÚLTIMA fase do plano, a final, é o caso
 * extremo disso: tudo converge ali, então fica de fora do teste).
 */
function assertNoAvoidableRematch(drafts: readonly KocRoundDraft[], label: string): void {
  const totalPhases = Math.max(...drafts.map((d) => d.phase));
  const poolsByPhase = new Map<number, Set<string>>();
  const phaseOfMatchNumber = new Map<number, number>();
  for (const d of drafts) {
    if (!poolsByPhase.has(d.phase)) poolsByPhase.set(d.phase, new Set());
    poolsByPhase.get(d.phase)!.add(d.poolId);
    phaseOfMatchNumber.set(d.matchNumber, d.phase);
  }
  // fromMatchNumber -> fase de destino e a lista de rodadas (matchNumber) para
  // onde cada uma das suas vagas foi. Só vagas que CRUZAM fase contam: dentro
  // da MESMA fase, a bateria 2 em diante de uma chave sempre herda da bateria
  // anterior da MESMA chave — não é reencontro, é o mesmo grupo continuando.
  const bySource = new Map<number, {phase: number; targets: number[]}>();
  for (const d of drafts) {
    for (const q of d.qualifiers) {
      const sourcePhase = phaseOfMatchNumber.get(q.fromMatchNumber)!;
      if (sourcePhase === d.phase) continue; // bateria seguinte da própria chave.
      let entry = bySource.get(q.fromMatchNumber);
      if (!entry) {
        entry = {phase: d.phase, targets: []};
        bySource.set(q.fromMatchNumber, entry);
      }
      entry.targets.push(d.matchNumber);
    }
  }
  for (const [source, {phase, targets}] of bySource) {
    if (phase === totalPhases) continue; // a final: reencontro é estrutural.
    const brackets = poolsByPhase.get(phase)!.size;
    const distinctTargets = new Set(targets).size;
    if (distinctTargets === targets.length) continue; // sem repetição — ok.
    assert.ok(
      targets.length > brackets,
      `${label}: a chave da rodada #${source} mandou ${targets.length} classificadas ` +
        `para ${brackets} chave(s) da fase seguinte e repetiu uma delas sem ser ` +
        `pigeonhole (destinos: ${targets.join(",")})`,
    );
  }
}

describe("buildKingOfCourtRounds · cruzamento não repete a chave de origem (achado do round 1)", () => {
  it("teamsPerCourt: 5, qualifiersPerRound: 3, 60 a 120 duplas: sem reencontro evitável", () => {
    for (let n = 60; n <= 120; n++) {
      let drafts;
      try {
        drafts = buildKingOfCourtRounds(
          seeds(n), {teamsPerCourt: 5, qualifiersPerRound: 3, roundDurationSec: 900},
        );
      } catch {
        continue; // campo que o planejador legado legitimamente recusa — não é o que testamos aqui.
      }
      assertNoAvoidableRematch(drafts, `${n} duplas`);
    }
  });

  it("caminho do plano explícito (kocProposePlan): sem reencontro evitável", () => {
    for (const max of [3, 4, 5, 6]) {
      for (let n = 3; n <= 150; n++) {
        let phases: KocPhaseSpec[];
        try {
          phases = kocProposePlan(n, max, () => 900);
        } catch {
          continue; // campo sem divisão válida para este teto — não é o que testamos aqui.
        }
        const drafts = buildKingOfCourtRounds(
          seeds(n), {...baseConfig, maxTeamsPerRound: max, phases},
        );
        assertNoAvoidableRematch(drafts, `teto ${max}, ${n} duplas`);
      }
    }
  });
});

describe("kocResolvePlan", () => {
  it("sem `phases`, é exatamente o que kocLegacyPlan devolve", () => {
    assert.deepEqual(kocResolvePlan(16, baseConfig), kocLegacyPlan(16, baseConfig));
  });

  it("com `phases`, valida e normaliza o plano explícito em vez de derivar", () => {
    const explicit: KocPhaseSpec[] = [
      {bracketSizes: [5, 5], roundsPerBracket: 1.9, qualifiersPerRound: 2.9, durationSec: 900},
      {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
    ];
    const resolved = kocResolvePlan(10, {...baseConfig, phases: explicit});
    // `assertPlan` trunca frações — o plano que vale é o saneado, não o cru.
    assert.deepEqual(resolved, [
      {bracketSizes: [5, 5], roundsPerBracket: 1, qualifiersPerRound: 2, durationSec: 900},
      {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
    ]);
  });

  it("recusa campo abaixo do piso do formato mesmo com plano explícito", () => {
    assert.throws(() => kocResolvePlan(2, {
      ...baseConfig,
      phases: [{bracketSizes: [2], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}],
    }), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_field_too_small");
      return true;
    });
  });

  /**
   * Achados do round 1 de revisão: `assertPlan` dizia na sua própria doc que
   * era a defesa contra plano vindo de fora, mas deixava passar 3 planos que
   * não deveriam existir. Os três testes abaixo cobrem cada rejeição nova.
   */
  it("recusa última fase que não é realmente final (qualifiersPerRound fora de 0)", () => {
    // 12 duplas: fase 1 (3 chaves de 4, classifica 2 cada = 6) → fase 2
    // (2 chaves de 3, some 6) — mas a fase 2 é a ÚLTIMA e classifica 1 em vez
    // de fechar em qualifiersPerRound 0.
    const config: KocConfig = {
      ...baseConfig,
      phases: [
        {bracketSizes: [4, 4, 4], roundsPerBracket: 1, qualifiersPerRound: 2, durationSec: 900},
        {bracketSizes: [3, 3], roundsPerBracket: 1, qualifiersPerRound: 1, durationSec: 900},
      ],
    };
    assert.throws(() => kocResolvePlan(12, config), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_last_phase_not_final");
      return true;
    });
  });

  it("recusa última fase que não é realmente final (roundsPerBracket fora de 1)", () => {
    const config: KocConfig = {
      ...baseConfig,
      // `maxTeamsPerRound: 6` para isolar o que este teste verifica: sem ele o
      // teto efetivo é o legado (5) e a chave de 6 da última fase seria
      // recusada antes, por `koc_bracket_over_max`.
      maxTeamsPerRound: 6,
      phases: [
        {bracketSizes: [4, 4, 4], roundsPerBracket: 1, qualifiersPerRound: 2, durationSec: 900},
        {bracketSizes: [6], roundsPerBracket: 2, qualifiersPerRound: 0, durationSec: 900},
      ],
    };
    assert.throws(() => kocResolvePlan(12, config), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_last_phase_not_final");
      return true;
    });
  });

  it("recusa plano com mais fases do que o formato aceita", () => {
    // `7`, não `KOC_MAX_PHASES + 1`: a constante é module-private (mesma
    // convenção já usada no teste de `kocProposePlan` acima).
    const phases: KocPhaseSpec[] = Array.from({length: 7}, () => (
      {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}
    ));
    assert.throws(() => kocResolvePlan(4, {...baseConfig, phases}), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_plan_exceeds_max_phases");
      return true;
    });
  });

  it("recusa chave acima do teto DA CATEGORIA, mesmo dentro do teto do formato", () => {
    // Teto do formato é 6; esta categoria escolheu 3. Uma chave de 4 está
    // dentro do primeiro e fora do segundo — tem que ser recusada.
    const config: KocConfig = {
      ...baseConfig,
      maxTeamsPerRound: 3,
      phases: [{bracketSizes: [4, 4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}],
    };
    assert.throws(() => kocResolvePlan(8, config), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_bracket_over_max");
      assert.ok(/teto desta categoria é 3/.test(e.message));
      return true;
    });
  });
});

describe("buildKingOfCourtRounds com plano explícito", () => {
  /** O invariante que pega semi nascendo com vaga a mais ou a menos. */
  function assertRostersAreComplete(drafts: KocRoundDraft[], label: string): void {
    for (const d of drafts) {
      assert.equal(
        d.teamIds.length + d.qualifiers.length,
        d.size,
        `${label}: fase ${d.phase} ${d.poolId} #${d.matchNumber} pede ${d.size} ` +
          `e tem ${d.teamIds.length} + ${d.qualifiers.length}`,
      );
    }
  }

  it("10 duplas: semi de 6 com 4 baterias e final de 4", () => {
    const config: KocConfig = {
      ...baseConfig,
      maxTeamsPerRound: 6,
      phases: kocProposePlan(10, 6, () => 900),
    };
    const drafts = buildKingOfCourtRounds(seeds(10), config);
    assert.deepEqual(
      drafts.map((d) => [d.phase, d.poolId, d.size, d.batteryLabel]),
      [
        [1, "C1", 5, 1], [1, "C1", 4, 2], [1, "C1", 3, 3],
        [1, "C2", 5, 1], [1, "C2", 4, 2], [1, "C2", 3, 3],
        [2, "C1", 6, 1], [2, "C1", 5, 2], [2, "C1", 4, 3], [2, "C1", 3, 4],
        [3, "C1", 4, 1],
      ],
    );
    // `.at(-1)` pede lib ES2022; o projeto compila em es2017 — índice direto
    // tem o mesmo efeito.
    assert.equal(drafts[drafts.length - 1]!.matchType, "koc_final");
    assert.equal(drafts[6]!.matchType, "koc_semifinal");
    assertRostersAreComplete(drafts, "10 duplas");
  });

  it("a bateria 2 em diante herda quem FICOU na quadra", () => {
    const config: KocConfig = {
      ...baseConfig, maxTeamsPerRound: 6, phases: kocProposePlan(10, 6, () => 900),
    };
    const drafts = buildKingOfCourtRounds(seeds(10), config);
    // Bateria 2 da chave 1: lugares 2 a 5 da bateria 1, que é o elenco menos a
    // classificada.
    assert.deepEqual(
      drafts[1]!.qualifiers.map((q) => q.place),
      [2, 3, 4, 5],
    );
    assert.ok(drafts[1]!.qualifiers.every((q) => q.fromMatchNumber === drafts[0]!.matchNumber));
  });

  it("3 a 24 duplas: nenhuma rodada nasce com vaga sobrando ou faltando", () => {
    for (let n = 3; n <= 24; n++) {
      const config: KocConfig = {
        ...baseConfig, maxTeamsPerRound: 6, phases: kocProposePlan(n, 6, () => 900),
      };
      assertRostersAreComplete(buildKingOfCourtRounds(seeds(n), config), `${n} duplas`);
    }
  });

  it("as classificadas de uma chave caem em rodadas DIFERENTES da fase seguinte", () => {
    // 20 duplas: 4 chaves de 5 com 3 baterias cada mandam 12 para 2 semis de 6.
    // Se as 3 de uma chave caíssem na mesma semi, quem acabou de se enfrentar
    // reencontraria antes da hora.
    const config: KocConfig = {
      ...baseConfig, maxTeamsPerRound: 6, phases: kocProposePlan(20, 6, () => 900),
    };
    const drafts = buildKingOfCourtRounds(seeds(20), config);
    const semiFirsts = drafts.filter((d) => d.phase === 2 && d.batteryLabel === 1);
    assert.equal(semiFirsts.length, 2);
    for (const pool of ["C1", "C2", "C3", "C4"]) {
      const sources = new Set(
        drafts.filter((d) => d.phase === 1 && d.poolId === pool).map((d) => d.matchNumber),
      );
      assert.equal(sources.size, 3, `${pool} deveria ter 3 baterias`);
      const perSemi = semiFirsts.map(
        (semi) => semi.qualifiers.filter((q) => sources.has(q.fromMatchNumber)).length,
      );
      assert.ok(
        perSemi.every((n) => n < 3),
        `as 3 classificadas de ${pool} caíram todas na mesma semifinal (${perSemi.join("/")})`,
      );
    }
  });

  it("recusa contagem de chaves que o sorteio não reproduz", () => {
    const config: KocConfig = {
      ...baseConfig,
      phases: [
        // 25 duplas em 6 chaves: o sorteio devolveria 5 caixas de alvo 5.
        {bracketSizes: [5, 5, 5, 4, 3, 3], roundsPerBracket: 1, qualifiersPerRound: 2, durationSec: 900},
        {bracketSizes: [6, 6], roundsPerBracket: 1, qualifiersPerRound: 1, durationSec: 900},
        {bracketSizes: [2], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
      ],
    };
    assert.throws(() => buildKingOfCourtRounds(seeds(25), config), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_bracket_count_not_roundtrippable");
      return true;
    });
  });

  it("recusa bateria que ficaria abaixo do mínimo", () => {
    const config: KocConfig = {
      ...baseConfig,
      // `maxTeamsPerRound: 6` para isolar o que este teste verifica (a bateria
      // que encolhe demais): sem ele o teto efetivo cai para o legado (5), e a
      // chave de 6 da fase 2 seria recusada antes, por `koc_bracket_over_max`.
      maxTeamsPerRound: 6,
      phases: [
        {bracketSizes: [4, 4], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
        {bracketSizes: [6], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
      ],
    };
    assert.throws(() => buildKingOfCourtRounds(seeds(8), config), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_battery_too_small");
      return true;
    });
  });

  it("recusa plano cuja fase 1 não cobre o campo", () => {
    const config: KocConfig = {
      ...baseConfig,
      phases: [{bracketSizes: [4, 4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}],
    };
    assert.throws(() => buildKingOfCourtRounds(seeds(10), config), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_phase_size_mismatch");
      return true;
    });
  });
});

/**
 * Achado durante a Task 3 (`organizer-category-ops.ts`): resolver o plano e
 * devolvê-lo por `config.phases` faz `kocResolvePlan` julgar DE NOVO, via
 * `assertPlan`, um plano que `kocLegacyPlan` só teria emitido direto. A
 * checagem de round-trip existe para plano vindo de FORA (tela ou doc de
 * categoria já publicado) — aplicá-la ao que o próprio `kocLegacyPlan` acabou
 * de produzir recusava config legada que sempre funcionou
 * (`teamsPerCourt: 3` com 19 duplas: fase 1 sai `[4,3,3,3,3,3]`, 6 chaves, mas
 * o sorteio reconstruiria só 5 a partir do alvo 4).
 *
 * `opts.plan` é a porta que evita a segunda resolução: entra sem passar de
 * novo por `assertPlan`.
 */
describe("buildKingOfCourtRounds · plano resolvido entra por opts.plan, não por config.phases", () => {
  it("teamsPerCourt: 3 com 19 duplas — a config exata do achado da Task 3", () => {
    const config: KocConfig = {teamsPerCourt: 3, qualifiersPerRound: 2, roundDurationSec: 900};
    const direct = buildKingOfCourtRounds(seeds(19), config);
    const plan = kocResolvePlan(19, config);
    const wired = buildKingOfCourtRounds(seeds(19), config, {plan});
    assert.deepEqual(wired, direct);
  });

  it("nunca recusa onde o caminho direto aceita — teamsPerCourt 3/4/5, 3 a 60 duplas", () => {
    for (const teamsPerCourt of [3, 4, 5]) {
      for (let n = 3; n <= 60; n++) {
        const config: KocConfig = {teamsPerCourt, qualifiersPerRound: 2, roundDurationSec: 900};
        let direct: KocRoundDraft[];
        try {
          direct = buildKingOfCourtRounds(seeds(n), config);
        } catch {
          // Config que o próprio plano legado recusa (campo não reduz, etc.)
          // não é o que este teste cobre — o achado é só sobre o round-trip.
          continue;
        }
        const plan = kocResolvePlan(n, config);
        const wired = buildKingOfCourtRounds(seeds(n), config, {plan});
        assert.deepEqual(
          wired,
          direct,
          `teamsPerCourt=${teamsPerCourt}, n=${n}: opts.plan divergiu do caminho direto`,
        );
      }
    }
  });
});

describe("retrocompat: config sem plano gera o que sempre gerou", () => {
  it("o plano derivado e o explícito produzem a MESMA chave", () => {
    for (const [n, cfg] of [
      [16, baseConfig],
      [14, {...baseConfig, roundsPerBracket: 2}],
      [12, {...baseConfig, teamsPerCourt: 5, qualifiersPerRound: 2}],
      [10, {...baseConfig, teamsPerCourt: 5, roundsPerBracket: 3}],
    ] as Array<[number, KocConfig]>) {
      const derived = buildKingOfCourtRounds(seeds(n), cfg);
      const explicit = buildKingOfCourtRounds(seeds(n), {
        ...cfg, phases: kocLegacyPlan(n, cfg),
      });
      assert.deepEqual(explicit, derived, `${n} duplas`);
    }
  });
});

/**
 * Prova de retrocompat de verdade — a comparação acima é quase uma tautologia
 * depois da reescrita: os dois lados passam pelo MESMO `kocResolvePlan`, então
 * ela só garante que `kocLegacyPlan` e o caminho "sem `phases`" concordam
 * ENTRE SI, não que o gerador NOVO ainda produz o que o gerador ANTIGO
 * produzia.
 *
 * Estas fixtures são a saída EXATA de `buildKingOfCourtRounds` no commit
 * `40b4ec37` (fim da Task 1, antes de qualquer mudança de produção desta
 * task), capturada rodando esses 4 casos contra o código de então. Ver
 * `.superpowers/sdd/2026-09-24-koc-plano-dinamico-de-fases/task-2-report.md`
 * para como foram extraídas.
 *
 * Tupla por rodada: [phase, matchType, poolId, matchNumber, roundLabel,
 * teamIds, qualifiers, size, durationSec, batteryLabel].
 *
 * Duas decisões deliberadas sobre os dois campos que mudam de forma com a
 * reescrita:
 * - `batteryLabel` é campo NOVO desta task. Incluído aqui com o valor que o
 *   emissor de então já IMPLICAVA (posição da rodada dentro da própria
 *   chave — 1, 2, 3…), que é a mesma numeração que `emitPhaseOneWithBracketRounds`
 *   já usava para nomear as rodadas de uma chave em sequência.
 * - `crossoverIndex` fica DE FORA da tupla, ou seja, não é comparado. No
 *   emissor antigo ele só existia (como propriedade do objeto) nas fases com
 *   várias rodadas por chave; nas fases de rodada única o campo nem era
 *   atribuído. O novo `emitPhase` passou a atribuí-lo sempre, para toda fase.
 *   O valor, quando o campo existia, sempre coincidia com o fallback
 *   `source.crossoverIndex ?? source.roundLabel - 1` que o próprio código usa
 *   para ler esse índice — então presença/ausência do campo é ruído de
 *   implementação (a forma do objeto), não comportamento observável, e por
 *   isso não faz parte do que este teste verifica.
 */
describe("retrocompat: fixtures congeladas em 40b4ec37 (antes da reescrita)", () => {
  type FrozenTuple = readonly [
    number, string, string, number, number, string[],
    {fromMatchNumber: number; fromRoundLabel: number; place: number}[],
    number, number, number,
  ];

  function toTuple(d: KocRoundDraft): FrozenTuple {
    return [
      d.phase, d.matchType, d.poolId, d.matchNumber, d.roundLabel,
      d.teamIds, d.qualifiers, d.size, d.durationSec, d.batteryLabel,
    ];
  }

  it("16 duplas, config padrão", () => {
    const drafts = buildKingOfCourtRounds(seeds(16), baseConfig);
    const frozen: FrozenTuple[] = [
      [1, "koc_round", "C1", 1, 1, ["s1", "s8", "s9", "s16"], [], 4, 900, 1],
      [1, "koc_round", "C2", 2, 2, ["s2", "s7", "s10", "s15"], [], 4, 900, 1],
      [1, "koc_round", "C3", 3, 3, ["s3", "s6", "s11", "s14"], [], 4, 900, 1],
      [1, "koc_round", "C4", 4, 4, ["s4", "s5", "s12", "s13"], [], 4, 900, 1],
      [2, "koc_semifinal", "C1", 5, 1, [], [
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 1},
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 2},
        {fromMatchNumber: 3, fromRoundLabel: 3, place: 1},
        {fromMatchNumber: 4, fromRoundLabel: 4, place: 2},
      ], 4, 900, 1],
      [2, "koc_semifinal", "C2", 6, 2, [], [
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 2},
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 1},
        {fromMatchNumber: 3, fromRoundLabel: 3, place: 2},
        {fromMatchNumber: 4, fromRoundLabel: 4, place: 1},
      ], 4, 900, 1],
      [3, "koc_final", "C1", 7, 1, [], [
        {fromMatchNumber: 5, fromRoundLabel: 1, place: 1},
        {fromMatchNumber: 5, fromRoundLabel: 1, place: 2},
        {fromMatchNumber: 6, fromRoundLabel: 2, place: 1},
        {fromMatchNumber: 6, fromRoundLabel: 2, place: 2},
      ], 4, 900, 1],
    ];
    assert.deepEqual(drafts.map(toTuple), frozen);
  });

  it("14 duplas, roundsPerBracket: 2", () => {
    const drafts = buildKingOfCourtRounds(seeds(14), {...baseConfig, roundsPerBracket: 2});
    const frozen: FrozenTuple[] = [
      [1, "koc_round", "C1", 1, 1, ["s1", "s6", "s7", "s12", "s13"], [], 5, 900, 1],
      [1, "koc_round", "C1", 2, 2, [], [
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 2},
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 3},
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 4},
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 5},
      ], 4, 900, 2],
      [1, "koc_round", "C2", 3, 3, ["s2", "s5", "s8", "s11", "s14"], [], 5, 900, 1],
      [1, "koc_round", "C2", 4, 4, [], [
        {fromMatchNumber: 3, fromRoundLabel: 3, place: 2},
        {fromMatchNumber: 3, fromRoundLabel: 3, place: 3},
        {fromMatchNumber: 3, fromRoundLabel: 3, place: 4},
        {fromMatchNumber: 3, fromRoundLabel: 3, place: 5},
      ], 4, 900, 2],
      [1, "koc_round", "C3", 5, 5, ["s3", "s4", "s9", "s10"], [], 4, 900, 1],
      [1, "koc_round", "C3", 6, 6, [], [
        {fromMatchNumber: 5, fromRoundLabel: 5, place: 2},
        {fromMatchNumber: 5, fromRoundLabel: 5, place: 3},
        {fromMatchNumber: 5, fromRoundLabel: 5, place: 4},
      ], 3, 900, 2],
      [2, "koc_semifinal", "C1", 7, 1, [], [
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 1},
        {fromMatchNumber: 4, fromRoundLabel: 4, place: 1},
        {fromMatchNumber: 5, fromRoundLabel: 5, place: 1},
      ], 3, 900, 1],
      [2, "koc_semifinal", "C2", 8, 2, [], [
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 1},
        {fromMatchNumber: 3, fromRoundLabel: 3, place: 1},
        {fromMatchNumber: 6, fromRoundLabel: 6, place: 1},
      ], 3, 900, 1],
      [3, "koc_final", "C1", 9, 1, [], [
        {fromMatchNumber: 7, fromRoundLabel: 1, place: 1},
        {fromMatchNumber: 7, fromRoundLabel: 1, place: 2},
        {fromMatchNumber: 8, fromRoundLabel: 2, place: 1},
        {fromMatchNumber: 8, fromRoundLabel: 2, place: 2},
      ], 4, 900, 1],
    ];
    assert.deepEqual(drafts.map(toTuple), frozen);
  });

  it("12 duplas, teamsPerCourt: 5", () => {
    const drafts = buildKingOfCourtRounds(
      seeds(12), {...baseConfig, teamsPerCourt: 5, qualifiersPerRound: 2},
    );
    const frozen: FrozenTuple[] = [
      [1, "koc_round", "C1", 1, 1, ["s1", "s6", "s7", "s12"], [], 4, 900, 1],
      [1, "koc_round", "C2", 2, 2, ["s2", "s5", "s8", "s11"], [], 4, 900, 1],
      [1, "koc_round", "C3", 3, 3, ["s3", "s4", "s9", "s10"], [], 4, 900, 1],
      [2, "koc_semifinal", "C1", 4, 1, [], [
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 1},
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 2},
        {fromMatchNumber: 3, fromRoundLabel: 3, place: 1},
      ], 3, 900, 1],
      [2, "koc_semifinal", "C2", 5, 2, [], [
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 2},
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 1},
        {fromMatchNumber: 3, fromRoundLabel: 3, place: 2},
      ], 3, 900, 1],
      [3, "koc_final", "C1", 6, 1, [], [
        {fromMatchNumber: 4, fromRoundLabel: 1, place: 1},
        {fromMatchNumber: 4, fromRoundLabel: 1, place: 2},
        {fromMatchNumber: 5, fromRoundLabel: 2, place: 1},
        {fromMatchNumber: 5, fromRoundLabel: 2, place: 2},
      ], 4, 900, 1],
    ];
    assert.deepEqual(drafts.map(toTuple), frozen);
  });

  it("10 duplas, teamsPerCourt: 5 e roundsPerBracket: 3", () => {
    const drafts = buildKingOfCourtRounds(
      seeds(10), {...baseConfig, teamsPerCourt: 5, roundsPerBracket: 3},
    );
    const frozen: FrozenTuple[] = [
      [1, "koc_round", "C1", 1, 1, ["s1", "s4", "s5", "s8", "s9"], [], 5, 900, 1],
      [1, "koc_round", "C1", 2, 2, [], [
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 2},
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 3},
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 4},
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 5},
      ], 4, 900, 2],
      [1, "koc_round", "C1", 3, 3, [], [
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 2},
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 3},
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 4},
      ], 3, 900, 3],
      [1, "koc_round", "C2", 4, 4, ["s2", "s3", "s6", "s7", "s10"], [], 5, 900, 1],
      [1, "koc_round", "C2", 5, 5, [], [
        {fromMatchNumber: 4, fromRoundLabel: 4, place: 2},
        {fromMatchNumber: 4, fromRoundLabel: 4, place: 3},
        {fromMatchNumber: 4, fromRoundLabel: 4, place: 4},
        {fromMatchNumber: 4, fromRoundLabel: 4, place: 5},
      ], 4, 900, 2],
      [1, "koc_round", "C2", 6, 6, [], [
        {fromMatchNumber: 5, fromRoundLabel: 5, place: 2},
        {fromMatchNumber: 5, fromRoundLabel: 5, place: 3},
        {fromMatchNumber: 5, fromRoundLabel: 5, place: 4},
      ], 3, 900, 3],
      [2, "koc_semifinal", "C1", 7, 1, [], [
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 1},
        {fromMatchNumber: 3, fromRoundLabel: 3, place: 1},
        {fromMatchNumber: 5, fromRoundLabel: 5, place: 1},
      ], 3, 900, 1],
      [2, "koc_semifinal", "C2", 8, 2, [], [
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 1},
        {fromMatchNumber: 4, fromRoundLabel: 4, place: 1},
        {fromMatchNumber: 6, fromRoundLabel: 6, place: 1},
      ], 3, 900, 1],
      [3, "koc_final", "C1", 9, 1, [], [
        {fromMatchNumber: 7, fromRoundLabel: 1, place: 1},
        {fromMatchNumber: 7, fromRoundLabel: 1, place: 2},
        {fromMatchNumber: 8, fromRoundLabel: 2, place: 1},
        {fromMatchNumber: 8, fromRoundLabel: 2, place: 2},
      ], 4, 900, 1],
    ];
    assert.deepEqual(drafts.map(toTuple), frozen);
  });
});
