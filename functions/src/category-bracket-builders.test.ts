import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {buildDoubleEliminationMatches} from "./category-bracket-builders";

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
