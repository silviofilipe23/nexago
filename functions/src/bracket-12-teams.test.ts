import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {BRACKET_12_TEAMS} from "./bracket-definitions/bracket-12-teams";
import type {MatchDefinition} from "./bracket-definitions/bracket-definitions";

/**
 * A planta de 12 é a transcrição da tabela impressa "TABELAS 12 DUPLAS —
 * GOIÂNIA OPEN", e ela FECHA DIFERENTE das vizinhas (4–11, 13–27): a WB para
 * com dois sobreviventes que nunca se enfrentam, e o cruzamento com a LB
 * acontece duas vezes, nas semifinais. Quem comparar com a planta de 11 ou a de
 * 13 vai achar que falta a final da WB e "consertar". Os testes abaixo travam o
 * fechamento, o cruzamento dos ramos e o bracket das semifinais — sempre
 * derivando da FIAÇÃO real, nunca de uma tabela mantida em paralelo.
 */

const POR_NUMERO = new Map(BRACKET_12_TEAMS.map((m) => [m.matchNumber, m]));

/** Para onde vai o vencedor de `matchNumber` (null se não avança). */
function destinoDoVencedor(matchNumber: number): number | null {
  for (const m of BRACKET_12_TEAMS) {
    for (const src of [m.teamA, m.teamB]) {
      if (src.type === "WINNER" && src.matchNumber === matchNumber) {
        return m.matchNumber;
      }
    }
  }
  return null;
}

/** Para onde vai o perdedor de `matchNumber` (null quando é eliminação). */
function destinoDoPerdedor(matchNumber: number): number | null {
  for (const m of BRACKET_12_TEAMS) {
    for (const src of [m.teamA, m.teamB]) {
      if (src.type === "LOSER" && src.matchNumber === matchNumber) {
        return m.matchNumber;
      }
    }
  }
  return null;
}

/** Semifinal (#19 ou #20) em que o vencedor de `matchNumber` desemboca. */
function semifinalAlcancada(matchNumber: number): number {
  const semifinais = new Set([19, 20]);
  let atual = matchNumber;
  for (let passo = 0; passo <= BRACKET_12_TEAMS.length; passo++) {
    if (semifinais.has(atual)) return atual;
    const proxima = destinoDoVencedor(atual);
    assert.ok(proxima != null, `#${atual} não avança para lugar nenhum`);
    atual = proxima;
  }
  throw new Error(`#${matchNumber} não chega a nenhuma semifinal`);
}

/** Fontes de uma partida como "SEED n" / "WINNER #n" / "LOSER #n". */
function fontes(matchNumber: number): [string, string] {
  const descrever = (src: MatchDefinition["teamA"]): string =>
    src.type === "SEED" ? `SEED ${src.seed}` :
      src.type === "BYE" ? "BYE" : `${src.type} #${src.matchNumber}`;
  const m = POR_NUMERO.get(matchNumber);
  assert.ok(m, `partida #${matchNumber} não existe na planta`);
  return [descrever(m.teamA), descrever(m.teamB)];
}

describe("planta de 12 duplas (Goiânia Open)", () => {
  it("tem as 22 partidas da tabela impressa", () => {
    assert.equal(BRACKET_12_TEAMS.length, 22);
    for (let n = 1; n <= 22; n++) {
      assert.ok(POR_NUMERO.has(n), `falta a partida #${n}`);
    }
  });

  it("a WB para com DOIS sobreviventes que nunca se enfrentam", () => {
    // Nas plantas vizinhas os vencedores das quartas (#15 e #16) se encontram
    // na final da WB. Aqui cada um segue para uma semifinal DIFERENTE.
    const destinos = [destinoDoVencedor(15), destinoDoVencedor(16)];
    assert.deepEqual(destinos, [20, 19]);
    assert.equal(
      new Set(destinos).size,
      2,
      "os dois sobreviventes da WB se enfrentariam antes das semifinais",
    );
  });

  it("as semifinais cruzam WB × LB, cada uma com o lado oposto", () => {
    assert.deepEqual(fontes(19), ["WINNER #16", "WINNER #17"]);
    assert.deepEqual(fontes(20), ["WINNER #15", "WINNER #18"]);
    assert.equal(POR_NUMERO.get(17)!.bracket, "LB");
    assert.equal(POR_NUMERO.get(18)!.bracket, "LB");
  });

  it("as semifinais estão no bracket WB, não LB", () => {
    // Marcá-las LB faria `resolveDoubleEliminationLbPlacement` premiar o
    // perdedor com o degrau de 5º-8º ANTES de ele jogar o 3º lugar.
    for (const n of [19, 20]) {
      assert.equal(
        POR_NUMERO.get(n)!.bracket,
        "WB",
        `semifinal #${n} fora da WB rouba colocação do pódio`,
      );
    }
  });

  it("o pódio inteiro sai de #21 e #22", () => {
    assert.equal(POR_NUMERO.get(21)!.bracket, "THIRD_PLACE");
    assert.equal(POR_NUMERO.get(22)!.bracket, "FINAL");
    assert.deepEqual(fontes(21), ["LOSER #19", "LOSER #20"]);
    assert.deepEqual(fontes(22), ["WINNER #19", "WINNER #20"]);
  });

  it("a LB R1 casa perdedor da R1 com perdedor da R2, cruzados", () => {
    assert.deepEqual(fontes(9), ["LOSER #1", "LOSER #8"]);
    assert.deepEqual(fontes(10), ["LOSER #2", "LOSER #7"]);
    assert.deepEqual(fontes(11), ["LOSER #3", "LOSER #6"]);
    assert.deepEqual(fontes(12), ["LOSER #4", "LOSER #5"]);
  });

  it("o perdedor de cada quarta cai no ramo OPOSTO da LB", () => {
    // #15 alimenta a semifinal #20, então seu perdedor tem de descer no ramo
    // que desemboca na #19 — e vice-versa. Sem o cruzamento, o perdedor da
    // quarta reencontraria na semifinal quem acabou de eliminá-lo.
    assert.equal(semifinalAlcancada(destinoDoPerdedor(15)!), 19);
    assert.equal(semifinalAlcancada(destinoDoPerdedor(16)!), 20);
  });

  it("os quatro primeiros têm bye e estreiam na WB R2", () => {
    const r1 = BRACKET_12_TEAMS.filter(
      (m) => m.bracket === "WB" && m.round === 1,
    );
    assert.equal(r1.length, 4);
    for (const m of r1) {
      for (const src of [m.teamA, m.teamB]) {
        assert.equal(src.type, "SEED");
        const seed = (src as {seed: number}).seed;
        assert.ok(
          seed >= 5,
          `#${m.matchNumber} traz o seed ${seed} para a R1: ` +
            "os quatro primeiros têm bye",
        );
      }
    }
  });

  it("as quartas saem 1º×4º e 2º×3º", () => {
    // Favorito sempre vencendo, seguindo os ponteiros WINNER da WB.
    const vencedor = new Map<number, number>();
    const resolve = (src: MatchDefinition["teamA"]): number | null =>
      src.type === "SEED" ? src.seed :
        src.type === "WINNER" ? vencedor.get(src.matchNumber) ?? null : null;
    const encontro = new Map<string, number>();
    for (const m of [...BRACKET_12_TEAMS].sort(
      (a, b) => a.matchNumber - b.matchNumber,
    )) {
      if (m.bracket !== "WB") continue;
      const a = resolve(m.teamA);
      const b = resolve(m.teamB);
      if (a == null || b == null) {
        const unico = a ?? b;
        if (unico != null) vencedor.set(m.matchNumber, unico);
        continue;
      }
      encontro.set(a < b ? `${a}x${b}` : `${b}x${a}`, m.matchNumber);
      vencedor.set(m.matchNumber, Math.min(a, b));
    }
    assert.equal(encontro.get("1x4"), 15);
    assert.equal(encontro.get("2x3"), 16);
    assert.equal(
      encontro.get("1x2"),
      undefined,
      "1º e 2º não podem se cruzar dentro da WB — só na final",
    );
  });
});
