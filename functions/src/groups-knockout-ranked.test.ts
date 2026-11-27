import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupsKnockoutMatches,
  isRankedQualifierSlot,
  rankedQualifierDescription,
  type MatchDraft,
} from "./category-bracket-builders";
import {
  rankQualifiersAcrossGroups,
  teamIdForQualifier,
  type GroupMatchData,
  type GroupPreview,
} from "./group-standings";

function groupsOf(sizes: number[]): GroupPreview[] {
  let next = 1;
  return sizes.map((size, i) => ({
    id: String.fromCharCode(65 + i),
    teamIds: Array.from({length: size}, () => `t${next++}`),
  }));
}

function knockoutOf(matches: MatchDraft[]): MatchDraft[] {
  return matches
    .filter((m) => !m.isGroupMatch)
    .sort((a, b) => a.matchNumber - b.matchNumber);
}

function side(m: MatchDraft, s: "A" | "B"): string {
  return (s === "A" ? m.teamADescription : m.teamBDescription) ?? "";
}

describe("rankedQualifierDescription", () => {
  it("o primeiro do ranking é o 'Melhor', os demais levam o ordinal", () => {
    assert.equal(rankedQualifierDescription({place: 1, rank: 1}), "Melhor 1º");
    assert.equal(rankedQualifierDescription({place: 1, rank: 3}), "3º melhor 1º");
    assert.equal(rankedQualifierDescription({place: 2, rank: 2}), "2º melhor 2º");
  });
});

describe("buildGroupsKnockoutMatches · total de classificados fora de potência de 2", () => {
  it("3 grupos × 2: chave de 8 com folga para os dois melhores 1ºs", () => {
    const groups = groupsOf([3, 3, 3]);
    const matches = buildGroupsKnockoutMatches(groups.flatMap((g) => g.teamIds), groups, 2);
    const groupMatches = matches.filter((m) => m.isGroupMatch);
    assert.equal(groupMatches.length, 9);

    const knockout = knockoutOf(matches);
    // 4 (quartas, 2 delas folga) + 2 semis + final + 3º lugar.
    assert.equal(knockout.length, 8);
    assert.equal(knockout[0]!.matchNumber, 10);

    const quarters = knockout.filter((m) => m.round === 1);
    assert.equal(quarters.length, 4);
    // Ordem de seeding padrão de 8: [1,8] [4,5] [2,7] [3,6] — 7 e 8 não existem.
    assert.deepEqual(quarters.map((m) => [side(m, "A"), side(m, "B")]), [
      ["Melhor 1º", ""],
      ["Melhor 2º", "2º melhor 2º"],
      ["2º melhor 1º", ""],
      ["3º melhor 1º", "3º melhor 2º"],
    ]);
    assert.deepEqual(quarters[0]!.teamAQualifier, {place: 1, rank: 1});
    assert.equal(quarters[0]!.teamBQualifier, undefined);
    assert.deepEqual(quarters[3]!.teamBQualifier, {place: 2, rank: 3});

    // Quem folga já nasce na semifinal, com a MESMA vaga — é o que o
    // preenchimento usa para pôr a dupla nos dois lugares de uma vez.
    const semis = knockout.filter((m) => m.round === 2 && m.matchType === "knockout");
    assert.equal(semis.length, 2);
    assert.deepEqual(semis[0]!.teamAQualifier, {place: 1, rank: 1});
    assert.equal(side(semis[0]!, "A"), "Melhor 1º");
    assert.equal(side(semis[0]!, "B"), `Vencedor Jogo #${quarters[1]!.matchNumber}`);
    assert.deepEqual(semis[1]!.teamAQualifier, {place: 1, rank: 2});
    assert.equal(side(semis[1]!, "B"), `Vencedor Jogo #${quarters[3]!.matchNumber}`);

    assert.equal(knockout.filter((m) => m.matchType === "Final").length, 1);
    assert.equal(knockout.filter((m) => m.matchType === "Third Place").length, 1);
  });

  it("toda vaga é por ranking entre grupos e nenhuma partida nasce vazia dos dois lados", () => {
    const groups = groupsOf([4, 3, 3]);
    const knockout = knockoutOf(buildGroupsKnockoutMatches(groups.flatMap((g) => g.teamIds), groups, 2));
    const firstRound = knockout.filter((m) => m.round === 1);
    for (const m of firstRound) {
      assert.ok(m.teamAQualifier || m.teamBQualifier, `partida fantasma #${m.matchNumber}`);
    }
    const slots = firstRound.flatMap((m) => [m.teamAQualifier, m.teamBQualifier]).filter((s) => s != null);
    assert.equal(slots.length, 6);
    assert.ok(slots.every((s) => isRankedQualifierSlot(s!)));
    assert.equal(new Set(slots.map((s) => JSON.stringify(s))).size, 6);
  });

  it("todo avanço aponta para uma partida que existe", () => {
    for (const [sizes, q] of [[[3, 3, 3], 2], [[4, 4, 4, 4, 4], 2], [[3, 3, 3, 3, 3, 3], 2], [[4, 4, 4], 1], [[4, 4, 4, 4], 3]] as Array<[number[], number]>) {
      const groups = groupsOf(sizes);
      const knockout = knockoutOf(buildGroupsKnockoutMatches(groups.flatMap((g) => g.teamIds), groups, q));
      const numbers = new Set(knockout.map((m) => m.matchNumber));
      for (const m of knockout) {
        if (m.winnerAdvance) assert.ok(numbers.has(m.winnerAdvance.matchNumber));
        if (m.loserAdvance) assert.ok(numbers.has(m.loserAdvance.matchNumber));
      }
      assert.equal(knockout.filter((m) => m.matchType === "Final").length, 1, `${sizes.length}×${q}`);
    }
  });

  it("3 grupos × 1: o melhor 1º espera na final, os outros dois fazem a semifinal", () => {
    const groups = groupsOf([3, 3, 3]);
    const knockout = knockoutOf(buildGroupsKnockoutMatches(groups.flatMap((g) => g.teamIds), groups, 1));
    const semis = knockout.filter((m) => m.round === 1);
    assert.deepEqual(semis.map((m) => [side(m, "A"), side(m, "B")]), [
      ["Melhor 1º", ""],
      ["2º melhor 1º", "3º melhor 1º"],
    ]);
    const final = knockout.find((m) => m.matchType === "Final")!;
    assert.deepEqual(final.teamAQualifier, {place: 1, rank: 1});
    assert.equal(side(final, "B"), `Vencedor Jogo #${semis[1]!.matchNumber}`);
    // Com 3 classificados não há dois perdedores de semifinal para o 3º lugar.
    assert.equal(knockout.filter((m) => m.matchType === "Third Place").length, 0);
  });

  it("total em potência de 2 continua no cruzamento fixo por grupo", () => {
    const groups = groupsOf([3, 3, 3, 3]);
    const knockout = knockoutOf(buildGroupsKnockoutMatches(groups.flatMap((g) => g.teamIds), groups, 2));
    const first = knockout.filter((m) => m.round === 1);
    assert.equal(first.length, 4);
    assert.ok(first.every((m) => m.teamAQualifier && !isRankedQualifierSlot(m.teamAQualifier)));
    assert.equal(side(first[0]!, "A"), "1º Grupo A");
  });
});

/**
 * Gabarito dos confrontos da 1ª rodada. O portal desenha a prévia com uma CÓPIA
 * desta regra (`groups-knockout-plan.ts`), e o spec dele prende os MESMOS
 * valores: mexeu aqui, mexa lá — senão a tela promete um cruzamento e a chave
 * publicada sai com outro.
 */
describe("gabarito dos confrontos da 1ª rodada (espelhado no portal)", () => {
  const GOLDEN: Array<[number, number, Array<[string, string | null]>]> = [
    [2, 2, [["1º Grupo A", "2º Grupo B"], ["2º Grupo A", "1º Grupo B"]]],
    [4, 2, [["1º Grupo A", "2º Grupo D"], ["1º Grupo B", "2º Grupo C"], ["1º Grupo C", "2º Grupo B"], ["1º Grupo D", "2º Grupo A"]]],
    [8, 1, [["1º Grupo A", "1º Grupo H"], ["1º Grupo B", "1º Grupo G"], ["1º Grupo C", "1º Grupo F"], ["1º Grupo D", "1º Grupo E"]]],
    [3, 2, [["Melhor 1º", null], ["Melhor 2º", "2º melhor 2º"], ["2º melhor 1º", null], ["3º melhor 1º", "3º melhor 2º"]]],
    [3, 1, [["Melhor 1º", null], ["2º melhor 1º", "3º melhor 1º"]]],
    [5, 2, [
      ["Melhor 1º", null], ["3º melhor 2º", "4º melhor 2º"], ["4º melhor 1º", null], ["5º melhor 1º", null],
      ["2º melhor 1º", null], ["2º melhor 2º", "5º melhor 2º"], ["3º melhor 1º", null], ["Melhor 2º", null],
    ]],
  ];

  for (const [groupCount, qualifiers, expected] of GOLDEN) {
    it(`${groupCount} grupos × ${qualifiers}`, () => {
      const groups = groupsOf(Array.from({length: groupCount}, () => 4));
      const first = knockoutOf(buildGroupsKnockoutMatches(groups.flatMap((g) => g.teamIds), groups, qualifiers))
        .filter((m) => m.round === 1);
      assert.deepEqual(
        first.map((m) => [m.teamADescription ?? null, m.teamBDescription ?? null]),
        expected,
      );
    });
  }
});

/** Jogo de grupo concluído, placar por pontos (um set). */
function game(poolId: string, winner: string, loser: string, winPts: number, losePts: number): GroupMatchData {
  return {
    poolId,
    teamAId: winner,
    teamBId: loser,
    winnerId: winner,
    status: "Completed",
    isGroupMatch: true,
    sets: [{a: winPts, b: losePts}],
  };
}

describe("rankQualifiersAcrossGroups", () => {
  const groups: GroupPreview[] = [
    {id: "A", teamIds: ["a1", "a2", "a3"]},
    {id: "B", teamIds: ["b1", "b2", "b3"]},
    {id: "C", teamIds: ["c1", "c2", "c3"]},
  ];

  it("ordena os 1ºs por aproveitamento e depois por saldo médio de pontos", () => {
    const matches = [
      // A: a1 vence as duas por pouco.
      game("A", "a1", "a2", 21, 19), game("A", "a1", "a3", 21, 19), game("A", "a2", "a3", 21, 10),
      // B: b1 vence as duas com folga — melhor saldo.
      game("B", "b1", "b2", 21, 5), game("B", "b1", "b3", 21, 5), game("B", "b2", "b3", 21, 10),
      // C: ciclo — c1 lidera com 1 vitória só.
      game("C", "c1", "c2", 21, 0), game("C", "c2", "c3", 21, 19), game("C", "c3", "c1", 21, 19),
    ];
    const ranked = rankQualifiersAcrossGroups(groups, matches);
    assert.deepEqual(ranked.get(1), ["b1", "a1", "c1"]);
    assert.equal(teamIdForQualifier({place: 1, rank: 1}, new Map(), ranked), "b1");
    assert.equal(teamIdForQualifier({place: 1, rank: 3}, new Map(), ranked), "c1");
    assert.equal(teamIdForQualifier({place: 1, rank: 4}, new Map(), ranked), null);
  });

  it("grupos de tamanhos diferentes: compara por MÉDIA, não por total", () => {
    const uneven: GroupPreview[] = [
      {id: "A", teamIds: ["a1", "a2", "a3", "a4"]},
      {id: "B", teamIds: ["b1", "b2", "b3"]},
    ];
    const matches = [
      // a1: 3 vitórias em 3, saldo +6 (média +2 por jogo).
      game("A", "a1", "a2", 21, 19), game("A", "a1", "a3", 21, 19), game("A", "a1", "a4", 21, 19),
      game("A", "a2", "a3", 21, 10), game("A", "a2", "a4", 21, 10), game("A", "a3", "a4", 21, 10),
      // b1: 2 vitórias em 2, saldo +10 (média +5 por jogo) — menos vitórias no TOTAL.
      game("B", "b1", "b2", 21, 16), game("B", "b1", "b3", 21, 16), game("B", "b2", "b3", 21, 10),
    ];
    assert.deepEqual(rankQualifiersAcrossGroups(uneven, matches).get(1), ["b1", "a1"]);
  });

  it("empate total cai na ordem dos grupos (o da cabeça de chave mais alta primeiro)", () => {
    const two: GroupPreview[] = [
      {id: "A", teamIds: ["a1", "a2"]},
      {id: "B", teamIds: ["b1", "b2"]},
    ];
    const matches = [game("A", "a1", "a2", 21, 15), game("B", "b1", "b2", 21, 15)];
    const ranked = rankQualifiersAcrossGroups(two, matches);
    assert.deepEqual(ranked.get(1), ["a1", "b1"]);
    assert.deepEqual(ranked.get(2), ["a2", "b2"]);
  });

  it("vaga fixa por grupo continua sendo resolvida pela classificação do grupo", () => {
    const standings = new Map([["A", ["a2", "a1"]]]);
    assert.equal(teamIdForQualifier({poolId: "A", place: 1}, standings, new Map()), "a2");
  });
});
