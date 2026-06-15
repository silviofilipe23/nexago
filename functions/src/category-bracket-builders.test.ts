import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {buildDoubleEliminationMatches} from "./category-bracket-builders";

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

  it("builds 14 matches for 8 teams", () => {
    const teams = Array.from({length: 8}, (_, i) => `t${i + 1}`);
    const matches = buildDoubleEliminationMatches(teams);

    assert.equal(matches.length, 14);
    assert.equal(matches.filter((m) => m.matchType === "WB").length, 7);
    assert.equal(matches.filter((m) => m.matchType === "LB").length, 6);
    assert.equal(matches.filter((m) => m.matchType === "Final").length, 1);
  });
});
