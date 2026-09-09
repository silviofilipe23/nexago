import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {BRACKET_DEFINITIONS} from "./bracket-definitions/bracket-definitions";
import {
  byeSeeds,
  dePlacementFor,
  expectedWinnerSeed,
  winnersRoundOnePairings,
} from "./draw-de-placement";

/**
 * Roda contra as PLANTAS REAIS (`bracket-definitions/`), não contra uma chave
 * inventada pro teste. É esse acoplamento que garante que a "consequência
 * imediata" mostrada no telão seja a mesma chave que a `generateCategoryBracket`
 * vai materializar depois.
 */
const P16 = BRACKET_DEFINITIONS[16]!;
const P12 = BRACKET_DEFINITIONS[12]!;

describe("expectedWinnerSeed — favoritismo puro", () => {
  it("numa partida entre dois seeds, o favorito é o menor", () => {
    // #1 na planta de 16: seed 2 × seed 15.
    assert.equal(expectedWinnerSeed(P16, 1), 2);
  });

  it("propaga pelo ramo: a WB R2 herda o favorito das duas de baixo", () => {
    // #13 = vencedor(#1: 2×15) × vencedor(#2: 7×10) → 2.
    assert.equal(expectedWinnerSeed(P16, 13), 2);
  });

  it("chega na cabeça 1 no topo do ramo dela", () => {
    // #22 = vencedor(#15) × vencedor(#16); #15 vem de 1×16 e 8×9.
    assert.equal(expectedWinnerSeed(P16, 22), 1);
  });
});

describe("winnersRoundOnePairings", () => {
  it("planta de 16 abre com 8 jogos, todos entre seeds", () => {
    const pairs = winnersRoundOnePairings(P16);
    assert.equal(pairs.length, 8);
    assert.deepEqual(pairs[0], {matchNumber: 1, seedA: 2, seedB: 15});
    assert.deepEqual(pairs[4], {matchNumber: 5, seedA: 1, seedB: 16});
  });

  it("planta de 12 abre com 4 jogos — as cabeças não jogam a primeira rodada", () => {
    const pairs = winnersRoundOnePairings(P12);
    assert.equal(pairs.length, 4);
    assert.deepEqual(pairs[0], {matchNumber: 1, seedA: 7, seedB: 10});
  });
});

describe("byeSeeds", () => {
  it("planta de 16 não tem bye", () => {
    assert.deepEqual(byeSeeds(P16), []);
  });

  it("planta de 12 dá bye às quatro cabeças, em ordem de seed", () => {
    assert.deepEqual(byeSeeds(P12), [1, 2, 3, 4]);
  });
});

describe("dePlacementFor — planta de 16", () => {
  it("seed 15 estreia contra a cabeça 2 já na primeira rodada", () => {
    const p = dePlacementFor(P16, 15, 4);
    assert.equal(p.entryMatchNumber, 1);
    assert.equal(p.entryRound, 1);
    assert.equal(p.hasBye, false);
    assert.equal(p.opponentSeed, 2);
    assert.equal(p.opponentFromMatch, null);
    assert.deepEqual(p.meetsSeed, {seed: 2, round: 1, winsNeeded: 0});
  });

  it("seed 12 estreia contra a 5 e só cruza com cabeça se ganhar uma", () => {
    const p = dePlacementFor(P16, 12, 4);
    assert.equal(p.entryMatchNumber, 8);
    assert.equal(p.opponentSeed, 5);
    assert.deepEqual(p.meetsSeed, {seed: 4, round: 2, winsNeeded: 1});
  });

  it("seed 9 encontra a cabeça 1 na segunda rodada", () => {
    assert.deepEqual(dePlacementFor(P16, 9, 4).meetsSeed, {seed: 1, round: 2, winsNeeded: 1});
  });

  it("com só 2 cabeças travadas, a 9 tem que ganhar mais pra achar uma", () => {
    // Cabeça = seed ≤ 2. A 9 pega a 1 na R2 do mesmo jeito (é o ramo dela).
    assert.deepEqual(dePlacementFor(P16, 9, 2).meetsSeed, {seed: 1, round: 2, winsNeeded: 1});
    // Já a 12 encontrava a 4 na R2; com 2 cabeças, a próxima é a 1 na R3.
    assert.deepEqual(dePlacementFor(P16, 12, 2).meetsSeed, {seed: 1, round: 3, winsNeeded: 2});
  });

  it("a própria cabeça 1 não 'encontra' ninguém acima dela", () => {
    assert.equal(dePlacementFor(P16, 1, 4).meetsSeed, null);
  });
});

describe("dePlacementFor — planta de 12, com byes", () => {
  it("cabeça com bye estreia na segunda rodada contra o vencedor de outra partida", () => {
    const p = dePlacementFor(P12, 1, 4);
    assert.equal(p.entryMatchNumber, 7);
    assert.equal(p.entryRound, 2);
    assert.equal(p.hasBye, true);
    assert.equal(p.opponentSeed, null);
    assert.equal(p.opponentFromMatch, 3);
  });

  it("não-cabeça sem bye estreia na primeira rodada e cruza com cabeça se ganhar", () => {
    const p = dePlacementFor(P12, 10, 4);
    assert.equal(p.entryMatchNumber, 1);
    assert.equal(p.hasBye, false);
    assert.equal(p.opponentSeed, 7);
    assert.deepEqual(p.meetsSeed, {seed: 2, round: 2, winsNeeded: 1});
  });
});

describe("dePlacementFor — todas as plantas", () => {
  it("todo seed de toda planta tem partida de estreia na chave de vencedores", () => {
    for (const [count, definition] of Object.entries(BRACKET_DEFINITIONS)) {
      const n = Number(count);
      for (let seed = 1; seed <= n; seed++) {
        const p = dePlacementFor(definition, seed, 4);
        assert.ok(
          p.entryMatchNumber > 0,
          `planta de ${n} duplas: seed ${seed} sem partida de estreia`,
        );
        assert.ok(
          p.opponentSeed != null || p.opponentFromMatch != null,
          `planta de ${n} duplas: seed ${seed} sem adversário de estreia`,
        );
      }
    }
  });

  it("seed fora da planta devolve colocação vazia em vez de estourar", () => {
    const p = dePlacementFor(P16, 99, 4);
    assert.equal(p.entryMatchNumber, 0);
    assert.equal(p.meetsSeed, null);
  });
});
