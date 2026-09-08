import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {BRACKET_32_TEAMS} from "./bracket-definitions/bracket-32-teams";
import type {MatchDefinition} from "./bracket-definitions/bracket-definitions";

/**
 * A semeadura da planta de 32 é regra de negócio do dono, não detalhe de
 * transcrição: a tabela impressa deixa as caixas da primeira coluna EM BRANCO.
 * E ela contraria o padrão das outras plantas (que casam seed 1 com seed 2 na
 * estreia), então é exatamente o tipo de coisa que alguém "arruma" de volta
 * para sequencial achando que corrige um deslize. Os testes abaixo travam as
 * três exigências, sempre derivando o resultado da FIAÇÃO real da planta, nunca
 * de uma lista de quadrantes escrita à mão em paralelo.
 */

const R1 = BRACKET_32_TEAMS.filter(
  (m) => m.bracket === "WB" && m.round === 1,
).sort((a, b) => a.matchNumber - b.matchNumber);

/** Em que partida o `seed` entra na chave. */
function entryMatch(seed: number): number {
  for (const m of R1) {
    for (const src of [m.teamA, m.teamB]) {
      if (src.type === "SEED" && src.seed === seed) return m.matchNumber;
    }
  }
  throw new Error(`seed ${seed} não entra na R1`);
}

/**
 * Percorre a WB com "o mais bem ranqueado sempre vence" e devolve, para cada
 * par de seeds, o número da partida em que os dois se encontrariam. É a única
 * leitura honesta de "não se cruzam antes de X": segue os ponteiros WINNER da
 * planta em vez de assumir como as colunas estão agrupadas.
 */
function meetingMatches(): Map<string, MatchDefinition> {
  const byNumber = new Map(BRACKET_32_TEAMS.map((m) => [m.matchNumber, m]));
  const winner = new Map<number, number>();
  const meetings = new Map<string, MatchDefinition>();

  const resolve = (src: MatchDefinition["teamA"]): number | null => {
    if (src.type === "SEED") return src.seed;
    if (src.type === "WINNER") return winner.get(src.matchNumber) ?? null;
    return null; // LOSER/BYE: fora da trilha dos invictos
  };

  for (const m of [...BRACKET_32_TEAMS].sort(
    (a, b) => a.matchNumber - b.matchNumber,
  )) {
    if (m.bracket !== "WB") continue;
    const a = resolve(m.teamA);
    const b = resolve(m.teamB);
    if (a == null || b == null) continue;
    meetings.set(a < b ? `${a}x${b}` : `${b}x${a}`, byNumber.get(m.matchNumber)!);
    winner.set(m.matchNumber, Math.min(a, b));
  }
  return meetings;
}

describe("semeadura da planta de 32 duplas", () => {
  it("os quatro primeiros abrem nas partidas pedidas pelo dono", () => {
    assert.equal(entryMatch(1), 1, "1º do ranking joga a partida #1");
    assert.equal(entryMatch(2), 16, "2º do ranking joga a partida #16");
    assert.equal(entryMatch(3), 9, "3º do ranking joga a partida #9");
    assert.equal(entryMatch(4), 8, "4º do ranking joga a partida #8");
  });

  it("toda partida da R1 é cabeça × complemento (soma 33)", () => {
    assert.equal(R1.length, 16);
    for (const m of R1) {
      assert.equal(m.teamA.type, "SEED");
      assert.equal(m.teamB.type, "SEED");
      const a = (m.teamA as {seed: number}).seed;
      const b = (m.teamB as {seed: number}).seed;
      assert.equal(
        a + b,
        33,
        `#${m.matchNumber} casa ${a} com ${b}: deveria ser ${a} x ${33 - a}`,
      );
    }
  });

  it("os quatro primeiros só se encontram nas semifinais da WB", () => {
    const meetings = meetingMatches();
    // #53 e #54 são a última rodada da WB — as semifinais desta chave.
    const semifinais = new Set([53, 54]);
    for (const a of [1, 2, 3, 4]) {
      for (const b of [1, 2, 3, 4]) {
        if (a >= b) continue;
        const match = meetings.get(`${a}x${b}`);
        if (!match) continue; // só se cruzam depois da WB — melhor ainda
        assert.ok(
          semifinais.has(match.matchNumber),
          `${a}º e ${b}º se encontram em #${match.matchNumber} (WB r${match.round}), ` +
            "antes das semifinais da WB",
        );
      }
    }
    // E o pareamento das semifinais é o canônico: 1x4 de um lado, 2x3 do outro.
    assert.equal(meetings.get("1x4")?.matchNumber, 53);
    assert.equal(meetings.get("2x3")?.matchNumber, 54);
  });

  it("os oito primeiros só se encontram das quartas em diante", () => {
    const meetings = meetingMatches();
    const quartasOuDepois = new Set([41, 42, 43, 44, 53, 54]);
    for (let a = 1; a <= 8; a++) {
      for (let b = a + 1; b <= 8; b++) {
        const match = meetings.get(`${a}x${b}`);
        if (!match) continue;
        assert.ok(
          quartasOuDepois.has(match.matchNumber),
          `${a}º e ${b}º se encontram em #${match.matchNumber}, antes das quartas`,
        );
      }
    }
  });

  it("os dezesseis primeiros nunca se encontram na estreia", () => {
    for (const m of R1) {
      const a = (m.teamA as {seed: number}).seed;
      const b = (m.teamB as {seed: number}).seed;
      assert.ok(
        !(a <= 16 && b <= 16),
        `#${m.matchNumber} casa dois cabeças (${a} e ${b}) logo na R1`,
      );
    }
  });
});
