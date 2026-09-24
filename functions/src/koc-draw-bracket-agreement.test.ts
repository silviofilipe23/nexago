import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildKingOfCourtRounds,
  kocBracketCountForRounds,
  kocMaxRoundsPerBracket,
  kocProposePlan,
  kocResolvePlan,
  type KocConfig,
  type KocPhaseSpec,
} from "./koc-bracket-builders";
import {groupCapacities} from "./draw-plan";

/**
 * O sorteio ao vivo e a geração da chave TÊM que dividir o campo igual.
 *
 * O elenco sorteado na frente do público vira o elenco da fase 1, e
 * `buildKingOfCourtRounds` recusa quando o número de caixas não bate com o
 * número de chaves. Uma discordância aqui só aparece no PUBLISH — depois do
 * sorteio, com as duplas já reveladas —, e o conserto é anular a sessão.
 *
 * A armadilha é a ida e volta pelo TAMANHO: o sorteio não guarda quantas caixas
 * existem, guarda `teamsPerGroup`, e reconstrói com `ceil(duplas / alvo)`. Nem
 * toda contagem sobrevive a isso — 25 duplas em 6 chaves voltam como 5.
 */
describe("sorteio ao vivo e geração concordam na divisão do campo", () => {
  const cfg = (roundsPerBracket: number): KocConfig => ({
    teamsPerCourt: 4,
    roundsPerBracket,
    qualifiersPerRound: 2,
    roundDurationSec: 1200,
  });

  /** Reproduz `createDrawSession` + `groupCapacities`, sem I/O. */
  function drawnRosters(teamCount: number, roundsPerBracket: number): string[][] {
    const teamIds = Array.from({length: teamCount}, (_, i) => `t${i + 1}`);
    const brackets = kocBracketCountForRounds(teamCount, 4, roundsPerBracket);
    const teamsPerBox = Math.ceil(teamCount / brackets);
    let cursor = 0;
    return groupCapacities(teamCount, teamsPerBox).map((g) =>
      teamIds.slice(cursor, (cursor += g.capacity)),
    );
  }

  for (const roundsPerBracket of [1, 2]) {
    it(`com ${roundsPerBracket} rodada(s) por chave, de 8 a 40 duplas`, () => {
      for (let n = 8; n <= 40; n++) {
        const rosters = drawnRosters(n, roundsPerBracket);
        const smallest = Math.min(...rosters.map((r) => r.length));
        // Campo que a configuração não comporta é recusado — e recusado ANTES,
        // na criação da sessão. Aqui só se confere que a recusa é coerente.
        if (roundsPerBracket > kocMaxRoundsPerBracket(smallest)) {
          assert.throws(
            () => buildKingOfCourtRounds(
              rosters.flat(),
              cfg(roundsPerBracket),
              {phaseOneRosters: rosters},
            ),
            `${n} duplas: menor chave ${smallest} devia recusar`,
          );
          continue;
        }
        const rounds = buildKingOfCourtRounds(
          rosters.flat(),
          cfg(roundsPerBracket),
          {phaseOneRosters: rosters},
        );
        assert.ok(rounds.length > 0, `${n} duplas`);
        assert.equal(
          rounds.filter((r) => r.phase === 1).length,
          rosters.length * roundsPerBracket,
          `${n} duplas: fase 1 = caixas do sorteio × rodadas por chave`,
        );
      }
    });
  }

  it("25 duplas: a contagem sobrevive à ida e volta pelo tamanho da chave", () => {
    const brackets = kocBracketCountForRounds(25, 4, 2);
    assert.equal(Math.ceil(25 / Math.ceil(25 / brackets)), brackets);
    assert.equal(drawnRosters(25, 2).length, brackets);
  });
});

describe("o sorteio reproduz as chaves do plano, inclusive desiguais", () => {
  /** Reproduz `createDrawSession`: o plano decide o alvo da caixa. */
  function boxesFromPlan(teamCount: number, plan: KocPhaseSpec[]): number[] {
    const teamsPerBox = Math.max(...plan[0]!.bracketSizes);
    return groupCapacities(teamCount, teamsPerBox).map((g) => g.capacity);
  }

  it("11 duplas com teto 6: [6,5] no plano e [6,5] no sorteio", () => {
    const plan = kocProposePlan(11, 6, () => 900);
    assert.deepEqual(plan[0]!.bracketSizes, [6, 5]);
    assert.deepEqual(boxesFromPlan(11, plan), [6, 5]);
  });

  it("3 a 24 duplas: o sorteio devolve exatamente as chaves da fase 1", () => {
    for (let n = 3; n <= 24; n++) {
      const plan = kocProposePlan(n, 6, () => 900);
      assert.deepEqual(
        boxesFromPlan(n, plan),
        plan[0]!.bracketSizes,
        `${n} duplas`,
      );
    }
  });

  it("o elenco sorteado é aceito pela geração sem discordância", () => {
    for (let n = 7; n <= 24; n++) {
      const plan = kocProposePlan(n, 6, () => 900);
      const teamIds = Array.from({length: n}, (_, i) => `t${i + 1}`);
      let cursor = 0;
      const rosters = boxesFromPlan(n, plan).map((cap) =>
        teamIds.slice(cursor, (cursor += cap)),
      );
      const config: KocConfig = {
        teamsPerCourt: 4, qualifiersPerRound: 2, roundDurationSec: 900,
        maxTeamsPerRound: 6, phases: plan,
      };
      assert.doesNotThrow(
        () => buildKingOfCourtRounds(teamIds, config, {phaseOneRosters: rosters}),
        `${n} duplas`,
      );
    }
  });
});

/**
 * Bug pré-existente (não é regressão desta branch): a config legada — sem
 * `phases` explícito — descreve a fase 1 só pelo ALVO da caixa
 * (`teamsPerCourt`), e `createDrawSession` reconstruía o número de chaves com
 * `groupCapacities(campo, alvo)`, que é `ceil(campo / alvo)`. Nem toda
 * contagem de chaves do plano sobrevive a essa ida e volta pelo TAMANHO — o
 * caso concreto é `teamsPerCourt: 3` com 19 duplas: o plano fecha em 6 chaves
 * `[4,3,3,3,3,3]`, mas `ceil(19/4)` é 5. O sorteio ao vivo revela as duplas
 * ANTES da geração existir, então essa discordância só era descoberta no
 * publish — com o público já vendo o elenco errado nas caixas. A geração
 * (`assertPlan`) já recusa esse descompasso para plano EXPLÍCITO; este bloco
 * cobre o caminho legado, que não passa por `assertPlan`.
 */
describe("createDrawSession recusa fase 1 cujo número de chaves não sobrevive à ida e volta pelo alvo", () => {
  /** Mesma fórmula que `assertPlan` usa e que `createDrawSession` passa a usar. */
  function roundTrips(teamCount: number, plan: KocPhaseSpec[]): boolean {
    const target = Math.max(...plan[0]!.bracketSizes);
    return Math.ceil(teamCount / target) === plan[0]!.bracketSizes.length;
  }

  it("teamsPerCourt 3 com 19 duplas: plano fecha em 6 chaves, mas ceil(19/4) é 5", () => {
    const config: KocConfig = {teamsPerCourt: 3, qualifiersPerRound: 2, roundDurationSec: 900};
    const plan = kocResolvePlan(19, config);
    assert.deepEqual(plan[0]!.bracketSizes, [4, 3, 3, 3, 3, 3]);
    assert.equal(
      roundTrips(19, plan),
      false,
      "este é exatamente o caso que createDrawSession deve recusar na criação da sessão",
    );
  });

  it("configs legadas (teamsPerCourt 3 a 6, 3 a 40 duplas): quando o plano sobrevive à ida " +
    "e volta, as caixas do sorteio são EXATAMENTE as chaves da fase 1", () => {
    for (let teamsPerCourt = 3; teamsPerCourt <= 6; teamsPerCourt++) {
      for (let n = 3; n <= 40; n++) {
        const config: KocConfig = {teamsPerCourt, qualifiersPerRound: 2, roundDurationSec: 900};
        let plan: KocPhaseSpec[];
        try {
          plan = kocResolvePlan(n, config);
        } catch {
          continue; // recusado por outro motivo (campo não reduz etc.) — fora do escopo aqui
        }
        if (!roundTrips(n, plan)) continue; // createDrawSession recusaria antes do sorteio
        const target = Math.max(...plan[0]!.bracketSizes);
        assert.deepEqual(
          groupCapacities(n, target).map((g) => g.capacity),
          plan[0]!.bracketSizes,
          `${n} duplas, teamsPerCourt ${teamsPerCourt}`,
        );
      }
    }
  });
});
