import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupsKnockoutMatches,
  isRankedQualifierSlot,
  type KnockoutQualifierSlot,
} from "./category-bracket-builders";
import {
  avoidGroupRematches,
  teamIdForQualifier,
  type GroupPreview,
  type KnockoutSlotPair,
} from "./group-standings";

/** Grupos A, B, C… com duplas "A1" (1º), "A2" (2º)… — o id já diz grupo e colocação. */
function groupsOf(count: number, size = 4): GroupPreview[] {
  return Array.from({length: count}, (_, i) => {
    const id = String.fromCharCode(65 + i);
    return {id, teamIds: Array.from({length: size}, (_, j) => `${id}${j + 1}`)};
  });
}

/** As vagas de cada partida do mata-mata, como o preenchimento as lê dos docs. */
function pairsOf(groupCount: number, qualifiers: number): KnockoutSlotPair[] {
  const groups = groupsOf(groupCount);
  return buildGroupsKnockoutMatches(groups.flatMap((g) => g.teamIds), groups, qualifiers)
    .filter((m) => !m.isGroupMatch)
    .map((m) => ({a: m.teamAQualifier ?? null, b: m.teamBQualifier ?? null}));
}

/** Classificação entre grupos: para cada colocação, a ordem dos GRUPOS do melhor ao pior. */
function rankingOf(orderByPlace: string[][]): Map<number, string[]> {
  return new Map(orderByPlace.map((order, i) => [i + 1, order.map((group) => `${group}${i + 1}`)]));
}

function groupOf(teamId: string): string {
  return teamId[0]!;
}

/** Confrontos CERTOS (os dois lados já são vaga de grupo) entre duplas do mesmo grupo. */
function rematches(pairs: KnockoutSlotPair[], ranked: Map<number, string[]>): string[] {
  const team = (slot: KnockoutQualifierSlot | null) =>
    slot ? teamIdForQualifier(slot, new Map(), ranked) : null;
  return pairs
    .map((pair) => [team(pair.a), team(pair.b)])
    .filter((teams): teams is [string, string] => teams[0] !== null && teams[1] !== null)
    .filter(([a, b]) => groupOf(a) === groupOf(b))
    .map(([a, b]) => `${a}×${b}`);
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

describe("avoidGroupRematches", () => {
  it("3 × 2: pior 1º e pior 2º do mesmo grupo — o 2º troca com a vaga vizinha", () => {
    const pairs = pairsOf(3, 2);
    const groups = groupsOf(3);
    // 1ºs: A, B, C. 2ºs: A, B, C → C1 (3º melhor 1º) pegaria C2 (3º melhor 2º).
    const ranked = rankingOf([["A", "B", "C"], ["A", "B", "C"]]);
    assert.deepEqual(rematches(pairs, ranked), ["C1×C2"]);

    const fixed = avoidGroupRematches(ranked, pairs, groups);
    assert.deepEqual(fixed.get(1), ["A1", "B1", "C1"]);
    assert.deepEqual(fixed.get(2), ["A2", "C2", "B2"]);
    assert.deepEqual(rematches(pairs, fixed), []);
  });

  it("sem reencontro, a classificação sai exatamente como entrou", () => {
    const pairs = pairsOf(3, 2);
    const ranked = rankingOf([["A", "B", "C"], ["C", "B", "A"]]);
    assert.deepEqual(rematches(pairs, ranked), []);
    assert.deepEqual(avoidGroupRematches(ranked, pairs, groupsOf(3)), ranked);
  });

  it("não altera a classificação recebida", () => {
    const ranked = rankingOf([["A", "B", "C"], ["A", "B", "C"]]);
    const before = JSON.stringify([...ranked]);
    avoidGroupRematches(ranked, pairsOf(3, 2), groupsOf(3));
    assert.equal(JSON.stringify([...ranked]), before);
  });

  it("3 × 2: nenhuma combinação de resultados deixa reencontro, e quem folga não muda", () => {
    const pairs = pairsOf(3, 2);
    const groups = groupsOf(3);
    for (const firsts of permutations(["A", "B", "C"])) {
      for (const seconds of permutations(["A", "B", "C"])) {
        const ranked = rankingOf([firsts, seconds]);
        const fixed = avoidGroupRematches(ranked, pairs, groups);
        assert.deepEqual(rematches(pairs, fixed), [], `1ºs ${firsts} · 2ºs ${seconds}`);
        // As duas folgas são dos dois melhores 1ºs — a troca nunca mexe nelas.
        assert.deepEqual(fixed.get(1), ranked.get(1));
        assert.deepEqual([...fixed.get(2)!].sort(), [...ranked.get(2)!].sort());
      }
    }
  });

  it("2 × 3 e 6 × 2: sempre dá para evitar", () => {
    for (const [groupCount, qualifiers] of [[2, 3], [6, 2]] as Array<[number, number]>) {
      const pairs = pairsOf(groupCount, qualifiers);
      const groups = groupsOf(groupCount);
      const ids = groups.map((g) => g.id);
      const orders = permutations(ids).slice(0, 60);
      for (const top of orders) {
        for (const bottom of orders) {
          const tiers = Array.from({length: qualifiers}, (_, i) => (i === 0 ? top : i === qualifiers - 1 ? bottom : ids));
          const fixed = avoidGroupRematches(rankingOf(tiers), pairs, groups);
          assert.deepEqual(rematches(pairs, fixed), [], `${groupCount}×${qualifiers} ${top}/${bottom}`);
        }
      }
    }
  });

  it("5 × 2: quem folga só troca com quem também folga — o melhor 2º não perde a folga", () => {
    const pairs = pairsOf(5, 2);
    const groups = groupsOf(5);
    // Quartas certas entre quem folga: "1º · 3ª melhor campanha × 2º · melhor campanha".
    // Com C em 3º entre os 1ºs e C como melhor 2º, seria C1 × C2.
    const ranked = rankingOf([["A", "B", "C", "D", "E"], ["C", "A", "B", "D", "E"]]);
    assert.deepEqual(rematches(pairs, ranked), ["C1×C2"]);

    const fixed = avoidGroupRematches(ranked, pairs, groups);
    assert.deepEqual(rematches(pairs, fixed), []);
    // O melhor 2º continua sendo o C2 (única folga entre os 2ºs); quem troca é
    // o 1º, com o vizinho de baixo, que também folga.
    assert.deepEqual(fixed.get(2), ranked.get(2));
    assert.deepEqual(fixed.get(1), ["A1", "B1", "D1", "C1", "E1"]);
  });

  it("nunca piora: o número de reencontros só cai, em qualquer formato", () => {
    for (const [groupCount, qualifiers] of [[3, 1], [3, 2], [5, 2], [6, 2], [7, 2], [3, 3], [4, 3], [5, 3], [2, 3]] as Array<[number, number]>) {
      const pairs = pairsOf(groupCount, qualifiers);
      const groups = groupsOf(groupCount);
      const ids = groups.map((g) => g.id);
      const rotations = ids.map((_, shift) => [...ids.slice(shift), ...ids.slice(0, shift)]);
      for (const top of rotations) {
        for (const bottom of rotations) {
          const tiers = Array.from({length: qualifiers}, (_, i) => (i % 2 === 0 ? top : bottom));
          const ranked = rankingOf(tiers);
          const fixed = avoidGroupRematches(ranked, pairs, groups);
          const label = `${groupCount}×${qualifiers}`;
          assert.ok(rematches(pairs, fixed).length <= rematches(pairs, ranked).length, label);
          for (let place = 1; place <= qualifiers; place++) {
            assert.deepEqual([...fixed.get(place)!].sort(), [...ranked.get(place)!].sort(), label);
          }
        }
      }
    }
  });

  it("chave de vagas fixas (total em potência de 2) passa intacta", () => {
    const pairs = pairsOf(4, 2);
    assert.ok(pairs.every((p) => !p.a || !isRankedQualifierSlot(p.a)));
    const ranked = rankingOf([["A", "B", "C", "D"], ["A", "B", "C", "D"]]);
    assert.deepEqual(avoidGroupRematches(ranked, pairs, groupsOf(4)), ranked);
  });

  it("reencontro sem saída (ninguém da mesma colocação para trocar) fica como está", () => {
    // Uma partida só, e nenhuma outra vaga da mesma colocação na chave.
    const pairs: KnockoutSlotPair[] = [{a: {place: 1, rank: 1}, b: {place: 2, rank: 1}}];
    const ranked = new Map([[1, ["A1"]], [2, ["A2"]]]);
    assert.deepEqual(avoidGroupRematches(ranked, pairs, groupsOf(1)), ranked);
  });
});
