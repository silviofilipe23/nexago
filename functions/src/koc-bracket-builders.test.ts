import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  KOC_DEFAULT_ROUND_DURATION_SEC,
  KocBracketError,
  buildKingOfCourtRounds,
  kocNextRoundIndex,
  kocQualifierDescription,
  kocRoundCount,
  kocRoundSizes,
  kocSnakeDistribute,
  type KocConfig,
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
