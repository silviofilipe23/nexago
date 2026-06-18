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

  it("feeds parallel finals + 3rd place for 8 teams", () => {
    const matches = buildDoubleEliminationMatches(
      Array.from({length: 8}, (_, i) => `t${i + 1}`),
    );

    const wbFinal = matches.find((m) => m.matchType === "WB" && m.round === 3);
    const lbFinal = matches
      .filter((m) => m.matchType === "LB")
      .sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0];
    const grandFinal = matches.find((m) => m.matchType === "Final");
    const thirdPlace = matches.find((m) => m.matchType === "Third Place");

    assert.ok(wbFinal && lbFinal && grandFinal && thirdPlace);
    // Vencedores das duas finais → grande final.
    assert.deepEqual(wbFinal?.winnerAdvance, {
      matchNumber: grandFinal!.matchNumber,
      teamSlot: "teamAId",
    });
    assert.deepEqual(lbFinal?.winnerAdvance, {
      matchNumber: grandFinal!.matchNumber,
      teamSlot: "teamBId",
    });
    // Perdedores das duas finais → 3º lugar (WB não cai mais na LB).
    assert.deepEqual(wbFinal?.loserAdvance, {
      matchNumber: thirdPlace!.matchNumber,
      teamSlot: "teamAId",
    });
    assert.deepEqual(lbFinal?.loserAdvance, {
      matchNumber: thirdPlace!.matchNumber,
      teamSlot: "teamBId",
    });
  });

  it("keeps 16-team bracket structurally consistent", () => {
    const matches = buildDoubleEliminationMatches(
      Array.from({length: 16}, (_, i) => `t${i + 1}`),
    );
    assert.equal(matches.length, 30);
    assert.equal(matches.filter((m) => m.matchType === "WB").length, 15);
    assert.equal(matches.filter((m) => m.matchType === "LB").length, 13);
    assert.equal(matches.filter((m) => m.matchType === "Third Place").length, 1);
    assert.equal(matches.filter((m) => m.matchType === "Final").length, 1);
    assertNoDuplicateDestinations(matches);

    // Todo perdedor da WB (exceto a final) tem destino na LB; a final da WB
    // manda o perdedor para o 3º lugar.
    const thirdPlace = matches.find((m) => m.matchType === "Third Place")!;
    for (const m of matches.filter((x) => x.matchType === "WB")) {
      assert.ok(m.loserAdvance, `WB #${m.matchNumber} sem destino de perdedor`);
    }
    const wbFinal = matches
      .filter((m) => m.matchType === "WB")
      .sort((a, b) => b.round - a.round)[0];
    assert.equal(wbFinal.loserAdvance?.matchNumber, thirdPlace.matchNumber);
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
  it("seeds first knockout round with team ids", () => {
    const matches = buildSingleEliminationMatches(["t1", "t2", "t3", "t4"]);
    const semis = matches.filter((m) => m.round === 1 && m.matchType === "knockout");
    assert.equal(semis[0].teamAId, "t1");
    assert.equal(semis[0].teamBId, "t2");
    assert.equal(semis[1].teamAId, "t3");
    assert.equal(semis[1].teamBId, "t4");
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
