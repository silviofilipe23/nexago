import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildKingOfCourtRounds,
  kocBracketCountForRounds,
  kocMaxRoundsPerBracket,
  type KocConfig,
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
