import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  placementTiersFromMatches,
  tierForTopPosition,
} from "./bracket-placement-tiers";

/** Atalho: uma partida só precisa de tipo e rodada para o cálculo do degrau. */
const m = (matchType: string, round: number) => ({matchType, round});
const many = (n: number, matchType: string, round: number) =>
  Array.from({length: n}, () => m(matchType, round));

describe("tierForTopPosition", () => {
  it("o degrau sai do TOPO da faixa", () => {
    assert.equal(tierForTopPosition(5), "quarters");
    assert.equal(tierForTopPosition(8), "quarters");
    assert.equal(tierForTopPosition(9), "r16");
    assert.equal(tierForTopPosition(16), "r16");
    assert.equal(tierForTopPosition(17), "r32");
  });

  it("faixa além de 32 fica no último degrau (regra de piso da spec)", () => {
    assert.equal(tierForTopPosition(33), "r32");
    assert.equal(tierForTopPosition(65), "r32");
  });
});

describe("placementTiersFromMatches — dupla eliminação de 22 duplas", () => {
  // Estrutura real da planta: LB r1..r6 com 6/4/4/2/2/1 partidas.
  const matches = [
    ...many(6, "LB", 1),
    ...many(4, "LB", 2),
    ...many(4, "LB", 3),
    ...many(2, "LB", 4),
    ...many(2, "LB", 5),
    m("LB", 6),
    m("WB", 5),
    m("THIRD_PLACE", 1),
    m("FINAL", 1),
  ];

  it("acumula as faixas de cima para baixo a partir da 5ª colocação", () => {
    const tiers = placementTiersFromMatches(matches);
    assert.deepEqual(tiers.lb, {
      5: "quarters", // 5º-6º
      4: "quarters", // 7º-8º
      3: "r16", //     9º-12º
      2: "r16", //     13º-16º
      1: "r32", //     17º-22º
    });
  });

  it("a final da LB não gera degrau: seu perdedor ainda joga o 3º lugar", () => {
    const tiers = placementTiersFromMatches(matches);
    assert.equal(tiers.lb[6], undefined);
  });
});

describe("placementTiersFromMatches — dupla eliminação legada (sem disputa de 3º)", () => {
  it("as duas últimas rodadas da LB são pódio (3º e 4º), não degrau", () => {
    const matches = [
      ...many(4, "LB", 1),
      ...many(2, "LB", 2),
      m("LB", 3),
      m("FINAL", 1),
    ];
    const tiers = placementTiersFromMatches(matches);
    assert.equal(tiers.lb[3], undefined);
    assert.equal(tiers.lb[2], undefined);
    assert.equal(tiers.lb[1], "quarters"); // 4 eliminados: 5º-8º
  });
});

describe("placementTiersFromMatches — mata-mata simples de 32", () => {
  const matches = [
    ...many(16, "knockout", 1),
    ...many(8, "knockout", 2),
    ...many(4, "knockout", 3),
    ...many(2, "knockout", 4), // semifinais
    m("FINAL", 5),
    m("THIRD_PLACE", 5),
  ];

  it("cada rodada cai no degrau da sua faixa", () => {
    const tiers = placementTiersFromMatches(matches);
    assert.deepEqual(tiers.knockout, {
      3: "quarters", // 5º-8º
      2: "r16", //     9º-16º
      1: "r32", //     17º-32º
    });
  });

  it("semifinal em diante não gera degrau", () => {
    const tiers = placementTiersFromMatches(matches);
    assert.equal(tiers.knockout[4], undefined);
    assert.equal(tiers.knockout[5], undefined);
  });
});

describe("placementTiersFromMatches — formatos sem eliminação abaixo do pódio", () => {
  it("grupos + semifinal direta não produz degrau nenhum", () => {
    // Caso real da Copa Goiás feminina: 30 jogos de grupo, 2 semis, final e 3º.
    const matches = [
      ...many(30, "group", 0),
      ...many(2, "knockout", 1),
      m("FINAL", 2),
      m("THIRD_PLACE", 2),
    ];
    const tiers = placementTiersFromMatches(matches);
    assert.deepEqual(tiers.knockout, {});
    assert.deepEqual(tiers.lb, {});
  });

  it("lista vazia devolve mapas vazios", () => {
    assert.deepEqual(placementTiersFromMatches([]), {lb: {}, knockout: {}});
  });
});
