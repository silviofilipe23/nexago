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

describe("buildDoubleEliminationMatches", () => {
  it("builds 6 matches for 4 teams (WB + LB + Final)", () => {
    const teams = ["t1", "t2", "t3", "t4"];
    const matches = buildDoubleEliminationMatches(teams);

    assert.equal(matches.length, 6);
    assert.equal(matches.filter((m) => m.matchType === "WB").length, 3);
    assert.equal(matches.filter((m) => m.matchType === "LB").length, 2);
    assert.equal(matches.filter((m) => m.matchType === "Final").length, 1);

    const wbR1 = matches.filter((m) => m.matchType === "WB" && m.round === 1);
    assert.equal(wbR1.length, 2);
    assert.equal(wbR1[0].teamAId, "t1");
    assert.equal(wbR1[0].teamBId, "t2");
    assert.equal(wbR1[1].teamAId, "t3");
    assert.equal(wbR1[1].teamBId, "t4");
  });

  it("wires DE advances for 4 teams", () => {
    const matches = buildDoubleEliminationMatches(["t1", "t2", "t3", "t4"]);

    assert.deepEqual(matchByNumber(matches, 1)?.winnerAdvance, {
      matchNumber: 3,
      teamSlot: "teamAId",
    });
    assert.deepEqual(matchByNumber(matches, 1)?.loserAdvance, {
      matchNumber: 4,
      teamSlot: "teamAId",
    });
    assert.deepEqual(matchByNumber(matches, 2)?.winnerAdvance, {
      matchNumber: 3,
      teamSlot: "teamBId",
    });
    assert.deepEqual(matchByNumber(matches, 2)?.loserAdvance, {
      matchNumber: 4,
      teamSlot: "teamBId",
    });
    assert.deepEqual(matchByNumber(matches, 3)?.winnerAdvance, {
      matchNumber: 6,
      teamSlot: "teamAId",
    });
    assert.deepEqual(matchByNumber(matches, 3)?.loserAdvance, {
      matchNumber: 5,
      teamSlot: "teamBId",
    });
    assert.deepEqual(matchByNumber(matches, 4)?.winnerAdvance, {
      matchNumber: 5,
      teamSlot: "teamAId",
    });
    assert.deepEqual(matchByNumber(matches, 5)?.winnerAdvance, {
      matchNumber: 6,
      teamSlot: "teamBId",
    });
  });

  it("builds 14 matches for 8 teams", () => {
    const teams = Array.from({length: 8}, (_, i) => `t${i + 1}`);
    const matches = buildDoubleEliminationMatches(teams);

    assert.equal(matches.length, 14);
    assert.equal(matches.filter((m) => m.matchType === "WB").length, 7);
    assert.equal(matches.filter((m) => m.matchType === "LB").length, 6);
    assert.equal(matches.filter((m) => m.matchType === "Final").length, 1);
  });

  it("wires WB final and LB final into grand final for 8 teams", () => {
    const matches = buildDoubleEliminationMatches(
      Array.from({length: 8}, (_, i) => `t${i + 1}`),
    );

    const wbFinal = matches.find((m) => m.matchType === "WB" && m.round === 3);
    const lbFinal = matches
      .filter((m) => m.matchType === "LB")
      .sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0];
    const grandFinal = matchByNumber(matches, 14);

    assert.ok(wbFinal);
    assert.ok(lbFinal);
    assert.ok(grandFinal);
    assert.deepEqual(wbFinal?.winnerAdvance, {
      matchNumber: grandFinal!.matchNumber,
      teamSlot: "teamAId",
    });
    assert.deepEqual(wbFinal?.loserAdvance, {
      matchNumber: lbFinal!.matchNumber,
      teamSlot: "teamBId",
    });
    assert.deepEqual(lbFinal?.winnerAdvance, {
      matchNumber: grandFinal!.matchNumber,
      teamSlot: "teamBId",
    });
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
