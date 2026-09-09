import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
  BRACKET_DEFINITIONS,
  type MatchDefinition,
} from "./bracket-definitions/bracket-definitions";

/**
 * `seed: N` é a POSIÇÃO NO RANKING: o painel manda `seeds` na ordem da tela
 * (`seeds.component.ts` envia `eligible().map(t => t.teamId)` sem redistribuir),
 * então a planta é o ÚNICO lugar onde a semeadura acontece. Até 09/2026 quase
 * todas casavam seed 1 com seed 2 logo na estreia — o 1º e o 2º do ranking se
 * eliminavam no primeiro jogo de toda chave de dupla eliminação.
 *
 * As duas invariantes abaixo valem para TODA planta e são derivadas da FIAÇÃO
 * real (seguindo os ponteiros WINNER), nunca de uma tabela de quadrantes
 * mantida em paralelo — que sairia de sincronia sem ninguém perceber.
 */

interface Analise {
  /** rodadas da WB */
  R: number;
  /** partida em que cada par de seeds se encontraria, favorito sempre vencendo */
  encontro: Map<string, MatchDefinition>;
  /** confrontos seed × seed agrupados por rodada */
  porRodada: Map<number, Array<[number, number]>>;
}

function analisar(def: MatchDefinition[]): Analise {
  const wb = def.filter((m) => m.bracket === "WB");
  const R = Math.max(...wb.map((m) => m.round));
  const vencedor = new Map<number, number>();
  const encontro = new Map<string, MatchDefinition>();

  const resolve = (src: MatchDefinition["teamA"]): number | null => {
    if (src.type === "SEED") return src.seed;
    if (src.type === "WINNER") return vencedor.get(src.matchNumber) ?? null;
    return null; // vindo da LB: fora da trilha dos invictos
  };

  for (const m of [...wb].sort((a, b) => a.matchNumber - b.matchNumber)) {
    const a = resolve(m.teamA);
    const b = resolve(m.teamB);
    if (a == null || b == null) {
      const único = a ?? b;
      if (único != null) vencedor.set(m.matchNumber, único);
      continue;
    }
    encontro.set(a < b ? `${a}x${b}` : `${b}x${a}`, m);
    vencedor.set(m.matchNumber, Math.min(a, b));
  }

  const porRodada = new Map<number, Array<[number, number]>>();
  for (const m of wb) {
    if (m.teamA.type !== "SEED" || m.teamB.type !== "SEED") continue;
    const lista = porRodada.get(m.round) ?? [];
    lista.push([m.teamA.seed, m.teamB.seed]);
    porRodada.set(m.round, lista);
  }

  return {R, encontro, porRodada};
}

const PLANTAS = Object.keys(BRACKET_DEFINITIONS)
  .map(Number)
  .sort((a, b) => a - b);

describe("semeadura das plantas de dupla eliminação", () => {
  for (const n of PLANTAS) {
    /**
     * Cabeça × complemento: numa mesma rodada todo confronto entre dois seeds
     * soma o mesmo. Quem entra na R2 já teve bye, então a soma cai pela metade
     * a cada rodada (33 na R1 de uma chave de 32, 17 na R2) — por isso a
     * comparação é DENTRO da rodada, e não um número fixo por planta.
     */
    it(`planta de ${n}: confrontos balanceados dentro de cada rodada`, () => {
      const {porRodada} = analisar(BRACKET_DEFINITIONS[n]);
      for (const [rodada, pares] of porRodada) {
        const somas = [...new Set(pares.map(([a, b]) => a + b))];
        assert.equal(
          somas.length,
          1,
          `WB r${rodada} tem confrontos de somas diferentes (${somas.sort((x, y) => x - y).join(", ")}): ` +
            pares.map(([a, b]) => `${a}x${b}`).join(" "),
        );
      }
    });

    /**
     * Separação: os 2 melhores só podem se cruzar na última rodada da WB, os 4
     * melhores nas duas últimas, os 8 nas três últimas, e assim por diante. É a
     * formulação geral de "os quatro primeiros não se encontram antes das
     * semifinais".
     */
    it(`planta de ${n}: cabeças separados até as rodadas finais da WB`, () => {
      const {R, encontro} = analisar(BRACKET_DEFINITIONS[n]);
      for (let j = 1; 1 << j <= n; j++) {
        const k = 1 << j;
        const rodadaMínima = R - j + 1;
        for (let a = 1; a <= k; a++) {
          for (let b = a + 1; b <= k; b++) {
            const m = encontro.get(`${a}x${b}`);
            if (!m) continue; // não se cruzam na WB: melhor ainda
            assert.ok(
              m.round >= rodadaMínima,
              `top-${k}: ${a}º e ${b}º se encontram na WB r${m.round} ` +
                `(#${m.matchNumber}), mas a chave tem ${R} rodadas e eles só ` +
                `deveriam se cruzar a partir da r${rodadaMínima}`,
            );
          }
        }
      }
    });
  }

  it("nenhuma planta casa os dois melhores na estreia", () => {
    for (const n of PLANTAS) {
      for (const m of BRACKET_DEFINITIONS[n]) {
        if (m.bracket !== "WB" || m.round !== 1) continue;
        if (m.teamA.type !== "SEED" || m.teamB.type !== "SEED") continue;
        assert.ok(
          !(m.teamA.seed === 1 && m.teamB.seed === 2) &&
            !(m.teamA.seed === 2 && m.teamB.seed === 1),
          `planta de ${n}: 1º x 2º na partida #${m.matchNumber}`,
        );
      }
    }
  });
});
