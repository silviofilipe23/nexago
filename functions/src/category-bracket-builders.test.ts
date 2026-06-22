import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildDoubleEliminationMatches,
  buildGroupsKnockoutMatches,
  buildSingleEliminationMatches,
  crossoverFirstRoundPairings,
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
});

describe("buildGroupsKnockoutMatches", () => {
  it("builds group matches plus empty knockout qualifier slots", () => {
    const teams = ["t1", "t2", "t3", "t4"];
    const groups = [
      {id: "A", teamIds: ["t1", "t2"]},
      {id: "B", teamIds: ["t3", "t4"]},
    ];

    const matches = buildGroupsKnockoutMatches(teams, groups, 2);

    const group = matches.filter((m) => m.isGroupMatch);
    assert.equal(group.length, 2);

    const semis = matches.filter((m) => m.round === 1 && m.matchType === "knockout");
    assert.equal(semis.length, 2);
    assert.equal(semis[0].teamAId, "");
    assert.equal(semis[0].teamBId, "");
    assert.deepEqual(semis[0].teamAQualifier, {poolId: "A", place: 1});
    assert.deepEqual(semis[0].teamBQualifier, {poolId: "B", place: 2});
    assert.equal(semis[0].teamADescription, "1º Grupo A");
    assert.equal(semis[0].teamBDescription, "2º Grupo B");

    assert.deepEqual(semis[1].teamAQualifier, {poolId: "A", place: 2});
    assert.deepEqual(semis[1].teamBQualifier, {poolId: "B", place: 1});

    const finals = matches.filter((m) => m.matchType === "Final");
    assert.equal(finals.length, 1);
    assert.equal(finals[0].teamAId, "");
    assert.equal(finals[0].teamBId, "");
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

        // Simula: joga partidas com 2 times, byes são walkover (já propagados
        // na construção). Ao fim, a final tem que ter sido resolvida.
        const byKey = new Map(
          matches.map((m) => [
            `${m.round}:${m.matchNumber}`,
            {...m, done: false, winnerId: ""},
          ]),
        );
        let progressed = true;
        let guard = 0;
        while (progressed && guard++ < 5000) {
          progressed = false;
          for (const m of matches) {
            const cur = byKey.get(`${m.round}:${m.matchNumber}`)!;
            if (cur.done) continue;
            const a = cur.teamAId.trim();
            const b = cur.teamBId.trim();
            if (a && b) {
              cur.winnerId = a;
              cur.done = true;
              progressed = true;
              const nr = m.round + 1;
              if (rounds.includes(nr)) {
                const nn = Math.ceil(m.matchNumber / 2);
                const slot =
                  m.matchNumber % 2 === 1 ? "teamAId" : "teamBId";
                const t = byKey.get(`${nr}:${nn}`)!;
                t[slot] = cur.winnerId;
              }
            } else if (a || b) {
              cur.done = true; // bye / walkover
            }
          }
        }
        const finalMatch = matches.find((m) => m.matchType === "Final")!;
        const fk = byKey.get(`${finalMatch.round}:${finalMatch.matchNumber}`)!;
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
