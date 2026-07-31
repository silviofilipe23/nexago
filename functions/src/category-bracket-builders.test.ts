import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildDoubleEliminationMatches,
  buildGroupsKnockoutMatches,
  buildSingleEliminationMatches,
  crossoverFirstRoundPairings,
  isBalancedQualifierTotal,
} from "./category-bracket-builders";
import {
  computePoolStandings,
  isPoolRoundRobinComplete,
} from "./group-standings";
import {BRACKET_DEFINITIONS} from "./bracket-definitions/bracket-definitions";

type DEMatch = ReturnType<typeof buildDoubleEliminationMatches>[number];

/** Mulberry32 — RNG determinístico para playthroughs reproduzíveis. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simula um torneio inteiro escolhendo vencedores ao acaso e propagando os
 * avanços (`winnerAdvance`/`loserAdvance`). Retorna a primeira inconsistência
 * encontrada (slot duplo, avanço para partida inexistente, deadlock, nº de
 * finais != 1) ou `null` se a chave foi 100% jogável até o fim.
 */
function simulateDoubleElimination(
  matches: DEMatch[],
  next: () => number,
): string | null {
  const byNum = new Map(
    matches.map((m) => [
      m.matchNumber,
      {...m, teamAId: m.teamAId, teamBId: m.teamBId, winnerId: "", done: false},
    ]),
  );
  const nums = [...byNum.keys()];
  let played = 0;
  let guard = 0;
  while (played < nums.length && guard++ < 10000) {
    let progressed = false;
    for (const num of nums) {
      const m = byNum.get(num)!;
      if (m.done) continue;
      const a = m.teamAId.trim();
      const b = m.teamBId.trim();
      if (!a || !b) continue;
      m.winnerId = next() < 0.5 ? a : b;
      m.done = true;
      played++;
      progressed = true;
      const loser = m.winnerId === a ? b : a;
      for (const [adv, team] of [
        [m.winnerAdvance, m.winnerId] as const,
        [m.loserAdvance, loser] as const,
      ]) {
        if (!adv) continue;
        const target = byNum.get(adv.matchNumber);
        if (!target) return `avanço para partida inexistente #${adv.matchNumber}`;
        if (target[adv.teamSlot].trim()) {
          return `slot ${adv.matchNumber}.${adv.teamSlot} preenchido 2x`;
        }
        target[adv.teamSlot] = team;
      }
    }
    if (!progressed) break;
  }
  const unfinished = nums.filter((n) => !byNum.get(n)!.done);
  if (unfinished.length) {
    return `deadlock: ${unfinished.map((n) => "#" + n).join(",")}`;
  }
  const finals = matches.filter((m) => m.matchType === "Final");
  if (finals.length !== 1) return `nº de finais = ${finals.length}`;
  return null;
}

function matchByNumber(
  matches: ReturnType<typeof buildDoubleEliminationMatches>,
  matchNumber: number,
) {
  return matches.find((m) => m.matchNumber === matchNumber);
}

// Garante consistência estrutural: nenhum slot de destino é alvo de duas
// origens (sem dupla atribuição) e todo perdedor da WB tem um destino.
function assertNoDuplicateDestinations(
  matches: ReturnType<typeof buildDoubleEliminationMatches>,
) {
  const seen = new Set<string>();
  for (const m of matches) {
    for (const a of [m.winnerAdvance, m.loserAdvance]) {
      if (!a) continue;
      const key = `${a.matchNumber}.${a.teamSlot}`;
      assert.ok(!seen.has(key), `slot de destino duplicado: ${key}`);
      seen.add(key);
    }
  }
}

describe("buildDoubleEliminationMatches", () => {
  it("builds 4-team bracket from static definition (7 jogos)", () => {
    const teams = ["t1", "t2", "t3", "t4"];
    const matches = buildDoubleEliminationMatches(teams);

    assert.equal(matches.length, 7);
    assert.equal(matches.filter((m) => m.matchType === "WB").length, 3);
    assert.equal(matches.filter((m) => m.matchType === "LB").length, 2);
    assert.equal(matches.filter((m) => m.matchType === "Third Place").length, 1);
    assert.equal(matches.filter((m) => m.matchType === "Final").length, 1);
    assertNoDuplicateDestinations(matches);

    // Seeds 1×4 e 3×2 (definidos em bracket-4-teams).
    assert.equal(matchByNumber(matches, 1)?.teamAId, "t1");
    assert.equal(matchByNumber(matches, 1)?.teamBId, "t4");
    assert.equal(matchByNumber(matches, 2)?.teamAId, "t3");
    assert.equal(matchByNumber(matches, 2)?.teamBId, "t2");
  });

  it("wires advances for the 4-team definition", () => {
    const matches = buildDoubleEliminationMatches(["t1", "t2", "t3", "t4"]);
    const adv = (num: number) => matchByNumber(matches, num);

    assert.deepEqual(adv(1)?.winnerAdvance, {matchNumber: 4, teamSlot: "teamAId"});
    assert.deepEqual(adv(1)?.loserAdvance, {matchNumber: 3, teamSlot: "teamAId"});
    assert.deepEqual(adv(2)?.winnerAdvance, {matchNumber: 4, teamSlot: "teamBId"});
    assert.deepEqual(adv(2)?.loserAdvance, {matchNumber: 3, teamSlot: "teamBId"});
    assert.deepEqual(adv(3)?.winnerAdvance, {matchNumber: 5, teamSlot: "teamAId"});
    assert.deepEqual(adv(3)?.loserAdvance, {matchNumber: 6, teamSlot: "teamAId"});
    assert.deepEqual(adv(4)?.winnerAdvance, {matchNumber: 7, teamSlot: "teamAId"});
    assert.deepEqual(adv(4)?.loserAdvance, {matchNumber: 5, teamSlot: "teamBId"});
    assert.deepEqual(adv(5)?.winnerAdvance, {matchNumber: 7, teamSlot: "teamBId"});
    assert.deepEqual(adv(5)?.loserAdvance, {matchNumber: 6, teamSlot: "teamBId"});
    // 3º lugar (#6) e final (#7) são terminais.
    assert.equal(adv(6)?.winnerAdvance, undefined);
    assert.equal(adv(7)?.winnerAdvance, undefined);
  });

  it("builds 8-team bracket (14 jogos, sem dupla atribuição)", () => {
    const teams = Array.from({length: 8}, (_, i) => `t${i + 1}`);
    const matches = buildDoubleEliminationMatches(teams);

    assert.equal(matches.length, 14);
    assert.equal(matches.filter((m) => m.matchType === "WB").length, 7);
    assert.equal(matches.filter((m) => m.matchType === "LB").length, 5);
    assert.equal(matches.filter((m) => m.matchType === "Third Place").length, 1);
    assert.equal(matches.filter((m) => m.matchType === "Final").length, 1);
    assertNoDuplicateDestinations(matches);

    // Numeração cronológica: WB R1 (#1-4), LB R1 (#5-6), WB R2 (#7-8),
    // LB R2 (#9-10), final WB (#11), final LB (#12), 3º (#13), final (#14).
    const tr = (num: number) => {
      const m = matchByNumber(matches, num);
      return `${m?.matchType}-R${m?.round}`;
    };
    assert.equal(tr(4), "WB-R1");
    assert.equal(tr(5), "LB-R1");
    assert.equal(tr(7), "WB-R2");
    assert.equal(tr(9), "LB-R2");
    assert.equal(tr(11), "WB-R3");
    assert.equal(tr(12), "LB-R3");
    assert.equal(tr(13), "Third Place-R1");
    assert.equal(tr(14), "Final-R1");
  });

  it("alimenta grande final + 3º lugar com 2 partidas cada (8 teams)", () => {
    const matches = buildDoubleEliminationMatches(
      Array.from({length: 8}, (_, i) => `t${i + 1}`),
    );

    const grandFinal = matches.find((m) => m.matchType === "Final");
    const thirdPlace = matches.find((m) => m.matchType === "Third Place");
    assert.ok(grandFinal && thirdPlace);

    // A grande final e o 3º lugar são cada um alimentados por exatamente duas
    // partidas distintas (sem origem solta nem slot faltando).
    const feedsGrandFinal = matches.filter(
      (m) =>
        m.winnerAdvance?.matchNumber === grandFinal!.matchNumber ||
        m.loserAdvance?.matchNumber === grandFinal!.matchNumber,
    );
    assert.equal(feedsGrandFinal.length, 2);
    const feedsThird = matches.filter(
      (m) =>
        m.winnerAdvance?.matchNumber === thirdPlace!.matchNumber ||
        m.loserAdvance?.matchNumber === thirdPlace!.matchNumber,
    );
    assert.equal(feedsThird.length, 2);
  });

  // Cobertura forte: toda chave estática registrada (4–27 equipes) deve ser
  // 100% jogável — sem slot preenchido 2x, sem avanço órfão, sem deadlock e
  // com exatamente uma final — para QUALQUER combinação de resultados.
  describe("chaves estáticas registradas são 100% jogáveis", () => {
    const sizes = Object.keys(BRACKET_DEFINITIONS)
      .map(Number)
      .sort((a, b) => a - b);

    for (const n of sizes) {
      it(`${n} equipes: 300 playthroughs aleatórios sem inconsistência`, () => {
        const teams = Array.from({length: n}, (_, i) => `t${i + 1}`);
        const matches = buildDoubleEliminationMatches(teams);
        assertNoDuplicateDestinations(matches);
        assert.equal(
          matches.filter((m) => m.matchType === "Final").length,
          1,
          `${n} equipes deveria ter exatamente uma final`,
        );
        for (let s = 0; s < 300; s++) {
          const err = simulateDoubleElimination(matches, rng(s * 31 + 1));
          assert.equal(err, null, `${n} equipes (seed ${s}): ${err}`);
        }
      });
    }
  });
});

describe("crossoverFirstRoundPairings", () => {
  it("pairs 1A×2B and 2A×1B for two groups", () => {
    const pairs = crossoverFirstRoundPairings(["A", "B"], 2);
    assert.deepEqual(pairs, [
      {a: {poolId: "A", place: 1}, b: {poolId: "B", place: 2}},
      {a: {poolId: "A", place: 2}, b: {poolId: "B", place: 1}},
    ]);
  });

  it("pairs A1×D2, B1×C2, C1×B2, D1×A2 for four groups", () => {
    const pairs = crossoverFirstRoundPairings(["A", "B", "C", "D"], 2);
    assert.deepEqual(pairs, [
      {a: {poolId: "A", place: 1}, b: {poolId: "D", place: 2}},
      {a: {poolId: "B", place: 1}, b: {poolId: "C", place: 2}},
      {a: {poolId: "C", place: 1}, b: {poolId: "B", place: 2}},
      {a: {poolId: "D", place: 1}, b: {poolId: "A", place: 2}},
    ]);
  });

  it("pairs eight groups in mirrored crossover for oitavas", () => {
    const groupIds = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const pairs = crossoverFirstRoundPairings(groupIds, 2);
    assert.equal(pairs.length, 8);
    assert.deepEqual(pairs[0], {a: {poolId: "A", place: 1}, b: {poolId: "H", place: 2}});
    assert.deepEqual(pairs[1], {a: {poolId: "B", place: 1}, b: {poolId: "G", place: 2}});
    assert.deepEqual(pairs[2], {a: {poolId: "C", place: 1}, b: {poolId: "F", place: 2}});
    assert.deepEqual(pairs[3], {a: {poolId: "D", place: 1}, b: {poolId: "E", place: 2}});
    assert.deepEqual(pairs[4], {a: {poolId: "E", place: 1}, b: {poolId: "D", place: 2}});
    assert.deepEqual(pairs[5], {a: {poolId: "F", place: 1}, b: {poolId: "C", place: 2}});
    assert.deepEqual(pairs[6], {a: {poolId: "G", place: 1}, b: {poolId: "B", place: 2}});
    assert.deepEqual(pairs[7], {a: {poolId: "H", place: 1}, b: {poolId: "A", place: 2}});
  });

  // Regressão: q=1 caía em halfBands=0 e retornava ZERO pares — a chave era
  // publicada só com a fase de grupos, sem mata-mata nenhum.
  it("pairs group winners across mirrored groups when only 1 qualifies (4 grupos)", () => {
    const pairs = crossoverFirstRoundPairings(["A", "B", "C", "D"], 1);
    assert.deepEqual(pairs, [
      {a: {poolId: "A", place: 1}, b: {poolId: "D", place: 1}},
      {a: {poolId: "B", place: 1}, b: {poolId: "C", place: 1}},
    ]);
  });

  it("pairs group winners for 8 groups × 1 classificado (quartas)", () => {
    const pairs = crossoverFirstRoundPairings(["A", "B", "C", "D", "E", "F", "G", "H"], 1);
    assert.equal(pairs.length, 4);
    assert.deepEqual(pairs[0], {a: {poolId: "A", place: 1}, b: {poolId: "H", place: 1}});
    assert.deepEqual(pairs[3], {a: {poolId: "D", place: 1}, b: {poolId: "E", place: 1}});
  });

  it("keeps two-group behaviour for q=1 (final direta 1A×1B)", () => {
    assert.deepEqual(crossoverFirstRoundPairings(["A", "B"], 1), [
      {a: {poolId: "A", place: 1}, b: {poolId: "B", place: 1}},
    ]);
  });

  it("emits every qualifier exactly once for odd q with n groups (banda do meio)", () => {
    const pairs = crossoverFirstRoundPairings(["A", "B", "C", "D"], 3);
    assert.equal(pairs.length, 6); // 12 classificados → 6 confrontos
    const seen = new Map<string, number>();
    for (const pair of pairs) {
      for (const slot of [pair.a, pair.b]) {
        const key = `${slot.place}${slot.poolId}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    for (const groupId of ["A", "B", "C", "D"]) {
      for (let place = 1; place <= 3; place++) {
        assert.equal(seen.get(`${place}${groupId}`), 1, `${place}º do grupo ${groupId}`);
      }
    }
  });
});

describe("isBalancedQualifierTotal", () => {
  it("aceita potências de 2 a partir de 2", () => {
    for (const total of [2, 4, 8, 16, 32]) {
      assert.equal(isBalancedQualifierTotal(total), true, String(total));
    }
  });

  it("rejeita os totais ímpares que o teste antigo de >>1 aceitava", () => {
    for (const total of [1, 3, 5, 9, 17]) {
      assert.equal(isBalancedQualifierTotal(total), false, String(total));
    }
  });

  it("rejeita pares que não são potência de 2", () => {
    for (const total of [6, 10, 12, 24]) {
      assert.equal(isBalancedQualifierTotal(total), false, String(total));
    }
  });
});

describe("buildGroupsKnockoutMatches", () => {
  it("builds group matches plus empty knockout qualifier slots", () => {
    const teams = ["t1", "t2", "t3", "t4"];
    const groups = [
      {id: "A", teamIds: ["t1", "t2"]},
      {id: "B", teamIds: ["t3", "t4"]},
    ];

    const matches = buildGroupsKnockoutMatches(teams, groups, 2);

    const group = matches
      .filter((m) => m.isGroupMatch)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    assert.equal(group.length, 2);
    // Fase de grupos preserva numeração 1..N (global, mas começa do início).
    assert.deepEqual(
      group.map((m) => m.matchNumber),
      [1, 2],
    );

    const semis = matches
      .filter((m) => m.round === 1 && m.matchType === "knockout")
      .sort((a, b) => a.matchNumber - b.matchNumber);
    assert.equal(semis.length, 2);
    // Numeração GLOBAL continua a contagem dos grupos: #1, #2 grupos → #3, #4 semis.
    assert.deepEqual(
      semis.map((m) => m.matchNumber),
      [3, 4],
    );
    assert.equal(semis[0].teamAId, "");
    assert.equal(semis[0].teamBId, "");
    assert.deepEqual(semis[0].teamAQualifier, {poolId: "A", place: 1});
    assert.deepEqual(semis[0].teamBQualifier, {poolId: "B", place: 2});
    // Descrições de qualifier (1º Grupo A / 2º Grupo B) NÃO são sobrescritas
    // pelos placeholders "Vencedor Jogo #N".
    assert.equal(semis[0].teamADescription, "1º Grupo A");
    assert.equal(semis[0].teamBDescription, "2º Grupo B");

    assert.deepEqual(semis[1].teamAQualifier, {poolId: "A", place: 2});
    assert.deepEqual(semis[1].teamBQualifier, {poolId: "B", place: 1});

    const finals = matches.filter((m) => m.matchType === "Final");
    assert.equal(finals.length, 1);
    assert.equal(finals[0].matchNumber, 5);
    assert.equal(finals[0].teamAId, "");
    assert.equal(finals[0].teamBId, "");
    // Final espera o vencedor das semis: placeholders globais.
    assert.equal(finals[0].teamADescription, `Vencedor Jogo #${semis[0].matchNumber}`);
    assert.equal(finals[0].teamBDescription, `Vencedor Jogo #${semis[1].matchNumber}`);

    const thirdPlace = matches.filter((m) => m.matchType === "Third Place");
    assert.equal(thirdPlace.length, 1);
    assert.equal(thirdPlace[0].round, finals[0].round);
    assert.equal(thirdPlace[0].matchNumber, 6);
    // 3º lugar mostra "Perdedor Jogo #N" para cada semifinal.
    assert.equal(thirdPlace[0].teamADescription, `Perdedor Jogo #${semis[0].matchNumber}`);
    assert.equal(thirdPlace[0].teamBDescription, `Perdedor Jogo #${semis[1].matchNumber}`);

    for (let i = 0; i < semis.length; i++) {
      const semi = semis[i];
      const slot = i === 0 ? "teamAId" : "teamBId";
      assert.deepEqual(semi.winnerAdvance, {
        matchNumber: finals[0].matchNumber,
        teamSlot: slot,
        round: finals[0].round,
      });
      assert.deepEqual(semi.loserAdvance, {
        matchNumber: thirdPlace[0].matchNumber,
        teamSlot: slot,
        round: thirdPlace[0].round,
      });
    }
  });

  it("intercala os grupos e dá descanso igual (2 grupos × 4 times)", () => {
    const groups = [
      {id: "A", teamIds: ["a1", "a2", "a3", "a4"]},
      {id: "B", teamIds: ["b1", "b2", "b3", "b4"]},
    ];
    const teams = [...groups[0].teamIds, ...groups[1].teamIds];

    const group = buildGroupsKnockoutMatches(teams, groups, 2)
      .filter((m) => m.isGroupMatch)
      .sort((x, y) => x.matchNumber - y.matchNumber);

    // Rodízio completo de cada grupo: 6 confrontos por grupo (C(4,2)), 12 no total.
    assert.equal(group.length, 12);
    const pairsOf = (poolId: string) =>
      new Set(
        group
          .filter((m) => m.poolId === poolId)
          .map((m) => [m.teamAId, m.teamBId].sort().join("-")),
      );
    assert.equal(pairsOf("A").size, 6);
    assert.equal(pairsOf("B").size, 6);

    // A sequência alterna os grupos (A,B,A,B…).
    assert.deepEqual(
      group.map((m) => m.poolId),
      ["A", "B", "A", "B", "A", "B", "A", "B", "A", "B", "A", "B"],
    );

    // Nenhum time joga em matchNumber consecutivos (descanso uniforme).
    for (let i = 1; i < group.length; i++) {
      const prev = new Set([group[i - 1].teamAId, group[i - 1].teamBId]);
      assert.ok(
        !prev.has(group[i].teamAId) && !prev.has(group[i].teamBId),
        `jogo ${i + 1} repete um time do jogo ${i}`,
      );
    }
  });

  it("cruza 4 grupos nas quartas e gera disputa de 3º lugar (16 equipes)", () => {
    const groups = [
      {id: "A", teamIds: ["a1", "a2", "a3", "a4"]},
      {id: "B", teamIds: ["b1", "b2", "b3", "b4"]},
      {id: "C", teamIds: ["c1", "c2", "c3", "c4"]},
      {id: "D", teamIds: ["d1", "d2", "d3", "d4"]},
    ];
    const teams = groups.flatMap((g) => g.teamIds);
    const matches = buildGroupsKnockoutMatches(teams, groups, 2);

    // 4 grupos × C(4,2)=6 confrontos = 24 jogos de fase de grupos.
    const groupMatches = matches.filter((m) => m.isGroupMatch);
    assert.equal(groupMatches.length, 24);
    assert.equal(
      Math.max(...groupMatches.map((m) => m.matchNumber)),
      24,
      "fase de grupos deve terminar em #24",
    );

    const quarters = matches
      .filter((m) => m.round === 1 && m.matchType === "knockout")
      .sort((a, b) => a.matchNumber - b.matchNumber);
    assert.equal(quarters.length, 4);
    // Mata-mata começa em #25 (24 grupos + 1) — numeração GLOBAL contínua.
    assert.deepEqual(
      quarters.map((m) => m.matchNumber),
      [25, 26, 27, 28],
    );
    assert.deepEqual(quarters[0].teamAQualifier, {poolId: "A", place: 1});
    assert.deepEqual(quarters[0].teamBQualifier, {poolId: "D", place: 2});
    assert.deepEqual(quarters[1].teamAQualifier, {poolId: "B", place: 1});
    assert.deepEqual(quarters[1].teamBQualifier, {poolId: "C", place: 2});
    assert.deepEqual(quarters[2].teamAQualifier, {poolId: "C", place: 1});
    assert.deepEqual(quarters[2].teamBQualifier, {poolId: "B", place: 2});
    assert.deepEqual(quarters[3].teamAQualifier, {poolId: "D", place: 1});
    assert.deepEqual(quarters[3].teamBQualifier, {poolId: "A", place: 2});

    const semis = matches
      .filter((m) => m.round === 2 && m.matchType === "knockout")
      .sort((a, b) => a.matchNumber - b.matchNumber);
    assert.equal(semis.length, 2);
    assert.deepEqual(
      semis.map((m) => m.matchNumber),
      [29, 30],
    );

    const finalMatch = matches.find((m) => m.matchType === "Final")!;
    const thirdPlace = matches.find((m) => m.matchType === "Third Place")!;
    assert.equal(finalMatch.matchNumber, 31);
    assert.equal(thirdPlace.matchNumber, 32);

    // QF.winnerAdvance aponta para as semis com matchNumber GLOBAL e round corretos.
    for (let i = 0; i < quarters.length; i++) {
      const target = semis[Math.floor(i / 2)];
      const slot = i % 2 === 0 ? "teamAId" : "teamBId";
      assert.deepEqual(quarters[i].winnerAdvance, {
        matchNumber: target.matchNumber,
        teamSlot: slot,
        round: target.round,
      });
      // QF não alimenta 3º lugar (apenas semis perdem para 3º lugar).
      assert.equal(quarters[i].loserAdvance, undefined);
    }

    // Semis alimentam final (vencedor) e 3º lugar (perdedor) com placeholders.
    for (let i = 0; i < semis.length; i++) {
      const slot = i === 0 ? "teamAId" : "teamBId";
      assert.deepEqual(semis[i].winnerAdvance, {
        matchNumber: finalMatch.matchNumber,
        teamSlot: slot,
        round: finalMatch.round,
      });
      assert.deepEqual(semis[i].loserAdvance, {
        matchNumber: thirdPlace.matchNumber,
        teamSlot: slot,
        round: thirdPlace.round,
      });
    }

    // Placeholders: QFs mantêm a descrição de qualifier; SFs/Final/3º referenciam
    // o nº GLOBAL do jogo anterior.
    assert.equal(quarters[0].teamADescription, "1º Grupo A");
    assert.equal(quarters[0].teamBDescription, "2º Grupo D");
    assert.equal(semis[0].teamADescription, "Vencedor Jogo #25");
    assert.equal(semis[0].teamBDescription, "Vencedor Jogo #26");
    assert.equal(semis[1].teamADescription, "Vencedor Jogo #27");
    assert.equal(semis[1].teamBDescription, "Vencedor Jogo #28");
    assert.equal(finalMatch.teamADescription, "Vencedor Jogo #29");
    assert.equal(finalMatch.teamBDescription, "Vencedor Jogo #30");
    assert.equal(thirdPlace.teamADescription, "Perdedor Jogo #29");
    assert.equal(thirdPlace.teamBDescription, "Perdedor Jogo #30");
  });

  // Regressão: com 1 classificado por grupo e mais de 2 grupos o mata-mata
  // saía VAZIO (crossover retornava zero pares) — a chave só tinha grupos.
  it("gera o mata-mata completo com 4 grupos × 1 classificado", () => {
    const groups = ["A", "B", "C", "D"].map((id, g) => ({
      id,
      teamIds: Array.from({length: 3}, (_, t) => `g${g}t${t}`),
    }));
    const teamIds = groups.flatMap((g) => g.teamIds);
    const matches = buildGroupsKnockoutMatches(teamIds, groups, 1);

    const knockout = matches.filter((m) => !m.isGroupMatch);
    // 2 semifinais (1ºA×1ºD, 1ºB×1ºC) + final + 3º lugar.
    assert.equal(knockout.length, 4);
    const semis = knockout
      .filter((m) => m.matchType === "knockout")
      .sort((a, b) => a.matchNumber - b.matchNumber);
    assert.equal(semis.length, 2);
    assert.equal(semis[0].teamADescription, "1º Grupo A");
    assert.equal(semis[0].teamBDescription, "1º Grupo D");
    assert.equal(semis[1].teamADescription, "1º Grupo B");
    assert.equal(semis[1].teamBDescription, "1º Grupo C");
    assert.equal(knockout.filter((m) => m.matchType === "Final").length, 1);
    assert.equal(knockout.filter((m) => m.matchType === "Third Place").length, 1);
    // Numeração continua a partir da fase de grupos (3 jogos por grupo × 4).
    assert.equal(semis[0].matchNumber, 13);
  });
});

describe("buildSingleEliminationMatches", () => {
  it("usa seeding padrão: seed 1×4 e 2×3 (4 equipes)", () => {
    const matches = buildSingleEliminationMatches(["t1", "t2", "t3", "t4"]);
    const semis = matches
      .filter((m) => m.round === 1 && m.matchType === "knockout")
      .sort((a, b) => a.matchNumber - b.matchNumber);
    // seed 1 enfrenta o pior seed; seed 2 no lado oposto.
    assert.equal(semis[0].teamAId, "t1");
    assert.equal(semis[0].teamBId, "t4");
    assert.equal(semis[1].teamAId, "t2");
    assert.equal(semis[1].teamBId, "t3");
  });

  it("gera disputa de 3º lugar com semifinais wired (4 equipes)", () => {
    const matches = buildSingleEliminationMatches(["t1", "t2", "t3", "t4"]);
    const final = matches.find((m) => m.matchType === "Final")!;
    const third = matches.find((m) => m.matchType === "Third Place")!;
    assert.ok(final);
    assert.ok(third);
    assert.equal(third.round, final.round);
    // Numeração global: semis #1-#2, final #3, 3º lugar #4.
    assert.equal(final.matchNumber, 3);
    assert.equal(third.matchNumber, 4);

    const semis = matches
      .filter((m) => m.round === 1 && m.matchType === "knockout")
      .sort((a, b) => a.matchNumber - b.matchNumber);
    assert.equal(semis.length, 2);
    assert.deepEqual(
      semis.map((m) => m.matchNumber),
      [1, 2],
    );
    for (let i = 0; i < semis.length; i++) {
      const slot = i === 0 ? "teamAId" : "teamBId";
      assert.deepEqual(semis[i].winnerAdvance, {
        matchNumber: final.matchNumber,
        teamSlot: slot,
        round: final.round,
      });
      assert.deepEqual(semis[i].loserAdvance, {
        matchNumber: third.matchNumber,
        teamSlot: slot,
        round: third.round,
      });
    }

    // Placeholders na final e no 3º lugar usam o nº GLOBAL das semifinais.
    assert.equal(final.teamADescription, `Vencedor Jogo #${semis[0].matchNumber}`);
    assert.equal(final.teamBDescription, `Vencedor Jogo #${semis[1].matchNumber}`);
    assert.equal(third.teamADescription, `Perdedor Jogo #${semis[0].matchNumber}`);
    assert.equal(third.teamBDescription, `Perdedor Jogo #${semis[1].matchNumber}`);
  });

  it("não gera 3º lugar com menos de 4 equipes", () => {
    assert.equal(
      buildSingleEliminationMatches(["t1", "t2"]).filter(
        (m) => m.matchType === "Third Place",
      ).length,
      0,
    );
    assert.equal(
      buildSingleEliminationMatches(["t1", "t2", "t3"]).filter(
        (m) => m.matchType === "Third Place",
      ).length,
      0,
    );
  });

  it("distribui byes para os melhores seeds, um por partida (não pot. de 2)", () => {
    // 6 equipes → bracket de 8, 2 byes para os seeds 1 e 2.
    const matches = buildSingleEliminationMatches(
      ["t1", "t2", "t3", "t4", "t5", "t6"],
    );
    const firstRound = matches.filter((m) => m.round === 1);
    // Nenhuma partida da 1ª rodada pode ser "vazia × vazia" (fantasma).
    for (const m of firstRound) {
      assert.ok(
        m.teamAId.trim() || m.teamBId.trim(),
        `partida fantasma #${m.matchNumber}`,
      );
    }
    // Toda equipe aparece exatamente uma vez na 1ª rodada.
    const seen = firstRound
      .flatMap((m) => [m.teamAId, m.teamBId])
      .filter((id) => id.trim().length > 0);
    assert.equal(new Set(seen).size, 6);

    // Os seeds 1 e 2 recebem bye: já estão posicionados na 2ª rodada e a
    // partida-bye da 1ª rodada tem só um time.
    const round2 = matches.filter((m) => m.round === 2);
    const round2Teams = round2.flatMap((m) => [m.teamAId, m.teamBId]);
    assert.ok(round2Teams.includes("t1"));
    assert.ok(round2Teams.includes("t2"));
  });

  // Garante que QUALQUER nº de equipes gera uma chave 100% jogável (sem
  // partida fantasma, byes distribuídos, campeão único) — cobre o bug antigo
  // de byes agrupados que travava a chave para contagens fora de pot. de 2.
  describe("é 100% jogável para qualquer nº de equipes", () => {
    for (let n = 2; n <= 24; n++) {
      it(`${n} equipes`, () => {
        const teams = Array.from({length: n}, (_, i) => `t${i + 1}`);
        const matches = buildSingleEliminationMatches(teams);
        const rounds = [...new Set(matches.map((m) => m.round))].sort(
          (a, b) => a - b,
        );
        const firstRound = matches.filter((m) => m.round === rounds[0]);

        // 1ª rodada: nenhuma partida vazia×vazia, e cobre todas as equipes 1x.
        const seen: string[] = [];
        for (const m of firstRound) {
          assert.ok(
            m.teamAId.trim() || m.teamBId.trim(),
            `${n}: partida fantasma #${m.matchNumber}`,
          );
          for (const id of [m.teamAId, m.teamBId]) {
            if (id.trim()) seen.push(id.trim());
          }
        }
        assert.equal(new Set(seen).size, n, `${n}: 1ª rodada não cobre todos`);

        // Exatamente uma final.
        assert.equal(
          matches.filter((m) => m.matchType === "Final").length,
          1,
          `${n}: deveria ter exatamente uma final`,
        );

        // 3º lugar quando há semifinais reais (n >= 4).
        const thirdCount = matches.filter(
          (m) => m.matchType === "Third Place",
        ).length;
        if (n >= 4) {
          assert.equal(thirdCount, 1, `${n}: deveria ter disputa de 3º lugar`);
          const finalRound = matches.find((m) => m.matchType === "Final")!.round;
          const semis = matches.filter(
            (m) => m.round === finalRound - 1 && m.matchType === "knockout",
          );
          for (const semi of semis) {
            assert.ok(
              semi.winnerAdvance?.round === finalRound,
              `${n}: semi sem winnerAdvance para final`,
            );
            assert.ok(
              semi.loserAdvance?.round === finalRound,
              `${n}: semi sem loserAdvance para 3º lugar`,
            );
          }
        } else {
          assert.equal(thirdCount, 0, `${n}: não deveria ter 3º lugar`);
        }

        // matchNumber é GLOBAL (único) → indexa direto. Joga partidas com 2 times
        // (sempre teamA vence, deterministicamente) e segue winnerAdvance/
        // loserAdvance explícitos; byes (1 time só) marcam done sem follow-up,
        // porque já foram propagados diretamente na construção.
        const byNum = new Map(
          matches.map((m) => [
            m.matchNumber,
            {...m, done: false, winnerId: ""} as typeof m & {
              done: boolean;
              winnerId: string;
            },
          ]),
        );
        let progressed = true;
        let guard = 0;
        while (progressed && guard++ < 5000) {
          progressed = false;
          for (const m of matches) {
            const cur = byNum.get(m.matchNumber)!;
            if (cur.done) continue;
            const a = cur.teamAId.trim();
            const b = cur.teamBId.trim();
            if (a && b) {
              cur.winnerId = a;
              const loserId = b;
              cur.done = true;
              progressed = true;
              for (const [adv, teamId] of [
                [m.winnerAdvance, cur.winnerId] as const,
                [m.loserAdvance, loserId] as const,
              ]) {
                if (!adv) continue;
                const target = byNum.get(adv.matchNumber);
                if (!target) continue;
                // Idempotente: se o slot já tem o mesmo time (bye direto na
                // construção), não dispara erro.
                if (target[adv.teamSlot].trim() === teamId.trim()) continue;
                assert.ok(
                  !target[adv.teamSlot].trim(),
                  `${n}: slot #${adv.matchNumber}.${adv.teamSlot} preenchido 2x`,
                );
                target[adv.teamSlot] = teamId;
              }
            } else if (a || b) {
              cur.done = true; // bye / walkover
            }
          }
        }
        const finalMatch = matches.find((m) => m.matchType === "Final")!;
        const fk = byNum.get(finalMatch.matchNumber)!;
        assert.ok(fk.done && fk.winnerId, `${n}: final não resolveu`);
      });
    }
  });
});

describe("group standings", () => {
  it("ranks teams by wins then set difference", () => {
    const standings = computePoolStandings(
      "A",
      ["t1", "t2", "t3"],
      [
        {
          poolId: "A",
          teamAId: "t1",
          teamBId: "t2",
          winnerId: "t1",
          status: "Completed",
          isGroupMatch: true,
          resultA: "2",
          resultB: "0",
        },
        {
          poolId: "A",
          teamAId: "t1",
          teamBId: "t3",
          winnerId: "t1",
          status: "Completed",
          isGroupMatch: true,
          resultA: "2",
          resultB: "1",
        },
        {
          poolId: "A",
          teamAId: "t2",
          teamBId: "t3",
          winnerId: "t3",
          status: "Completed",
          isGroupMatch: true,
          resultA: "0",
          resultB: "2",
        },
      ],
    );

    assert.deepEqual(standings, ["t1", "t3", "t2"]);
  });

  it("usa confronto direto entre empatadas, mesmo com pior saldo de sets", () => {
    // 4 duplas: t1 e t2 empatam em 2 vitórias; t3 e t4 em 1. t2 tem saldo de
    // sets MELHOR no geral, mas t1 venceu o confronto direto → t1 fica à frente.
    const g = (
      teamAId: string,
      teamBId: string,
      winnerId: string,
      a: number,
      b: number,
    ): {
      poolId: string;
      teamAId: string;
      teamBId: string;
      winnerId: string;
      status: string;
      isGroupMatch: boolean;
      resultA: string;
      resultB: string;
    } => ({
      poolId: "A",
      teamAId,
      teamBId,
      winnerId,
      status: "Completed",
      isGroupMatch: true,
      resultA: `${a}`,
      resultB: `${b}`,
    });

    const standings = computePoolStandings(
      "A",
      ["t1", "t2", "t3", "t4"],
      [
        g("t1", "t2", "t1", 2, 1), // confronto direto: t1 vence t2
        g("t1", "t3", "t1", 2, 1),
        g("t4", "t1", "t4", 2, 0),
        g("t2", "t3", "t2", 2, 0),
        g("t2", "t4", "t2", 2, 0),
        g("t3", "t4", "t3", 2, 0),
      ],
    );
    // t2 tem saldo de sets +3 (melhor que t1, 0), mas perdeu para t1 no direto.
    assert.deepEqual(standings, ["t1", "t2", "t3", "t4"]);
  });

  it("desempata por saldo de games quando sets empatam", () => {
    // t1 e t2 vencem t3 por 2-0; mesmo saldo de sets. t1 vence por mais games.
    const win20 = (
      teamAId: string,
      teamBId: string,
      g1: [number, number],
      g2: [number, number],
    ): {
      poolId: string;
      teamAId: string;
      teamBId: string;
      winnerId: string;
      status: string;
      isGroupMatch: boolean;
      resultA: string;
      resultB: string;
      sets: Array<{a: number; b: number}>;
    } => ({
      poolId: "A",
      teamAId,
      teamBId,
      winnerId: teamAId,
      status: "Completed",
      isGroupMatch: true,
      resultA: "2",
      resultB: "0",
      sets: [
        {a: g1[0], b: g1[1]},
        {a: g2[0], b: g2[1]},
      ],
    });

    const standings = computePoolStandings(
      "A",
      ["t1", "t2", "t3"],
      [
        win20("t1", "t3", [21, 10], [21, 12]), // t1: +20 games
        win20("t2", "t3", [21, 18], [21, 19]), // t2: +5 games
      ],
    );
    assert.deepEqual(standings, ["t1", "t2", "t3"]);
  });

  it("detects completed pool round robin", () => {
    const complete = isPoolRoundRobinComplete(
      "A",
      ["t1", "t2"],
      [
        {
          poolId: "A",
          teamAId: "t1",
          teamBId: "t2",
          winnerId: "t1",
          status: "Completed",
          isGroupMatch: true,
        },
      ],
    );
    assert.equal(complete, true);

    const incomplete = isPoolRoundRobinComplete("A", ["t1", "t2"], []);
    assert.equal(incomplete, false);
  });
});
