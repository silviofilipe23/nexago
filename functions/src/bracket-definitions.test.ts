import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {BRACKET_4_TEAMS} from "./bracket-definitions/bracket-4-teams";
import {BRACKET_5_TEAMS} from "./bracket-definitions/bracket-5-teams";
import {BRACKET_6_TEAMS} from "./bracket-definitions/bracket-6-teams";
import {BRACKET_7_TEAMS} from "./bracket-definitions/bracket-7-teams";
import {BRACKET_8_TEAMS} from "./bracket-definitions/bracket-8-teams";
import {BRACKET_9_TEAMS} from "./bracket-definitions/bracket-9-teams";
import {BRACKET_10_TEAMS} from "./bracket-definitions/bracket-10-teams";
import {BRACKET_11_TEAMS} from "./bracket-definitions/bracket-11-teams";
import {BRACKET_12_TEAMS} from "./bracket-definitions/bracket-12-teams";
import {BRACKET_13_TEAMS} from "./bracket-definitions/bracket-13-teams";
import {BRACKET_14_TEAMS} from "./bracket-definitions/bracket-14-teams";
import {BRACKET_15_TEAMS} from "./bracket-definitions/bracket-15-teams";
import {BRACKET_16_TEAMS} from "./bracket-definitions/bracket-16-teams";
import {BRACKET_17_TEAMS} from "./bracket-definitions/bracket-17-teams";
import {BRACKET_18_TEAMS} from "./bracket-definitions/bracket-18-teams";
import {BRACKET_19_TEAMS} from "./bracket-definitions/bracket-19-teams";
import {BRACKET_20_TEAMS} from "./bracket-definitions/bracket-20-teams";
import {BRACKET_21_TEAMS} from "./bracket-definitions/bracket-21-teams";
import {BRACKET_22_TEAMS} from "./bracket-definitions/bracket-22-teams";
import {BRACKET_23_TEAMS} from "./bracket-definitions/bracket-23-teams";
import {BRACKET_24_TEAMS} from "./bracket-definitions/bracket-24-teams";
import {BRACKET_25_TEAMS} from "./bracket-definitions/bracket-25-teams";
import {BRACKET_26_TEAMS} from "./bracket-definitions/bracket-26-teams";
import {BRACKET_27_TEAMS} from "./bracket-definitions/bracket-27-teams";
import {
  type MatchDefinition,
  validateBracketDefinition,
} from "./bracket-definitions/bracket-definitions";
import {buildMatchesFromDefinition} from "./category-bracket-builders";

const ALL_BRACKET_DEFINITIONS: [number, MatchDefinition[]][] = [
  [4, BRACKET_4_TEAMS],
  [5, BRACKET_5_TEAMS],
  [6, BRACKET_6_TEAMS],
  [7, BRACKET_7_TEAMS],
  [8, BRACKET_8_TEAMS],
  [9, BRACKET_9_TEAMS],
  [10, BRACKET_10_TEAMS],
  [11, BRACKET_11_TEAMS],
  [12, BRACKET_12_TEAMS],
  [13, BRACKET_13_TEAMS],
  [14, BRACKET_14_TEAMS],
  [15, BRACKET_15_TEAMS],
  [16, BRACKET_16_TEAMS],
  [17, BRACKET_17_TEAMS],
  [18, BRACKET_18_TEAMS],
  [19, BRACKET_19_TEAMS],
  [20, BRACKET_20_TEAMS],
  [21, BRACKET_21_TEAMS],
  [22, BRACKET_22_TEAMS],
  [23, BRACKET_23_TEAMS],
  [24, BRACKET_24_TEAMS],
  [25, BRACKET_25_TEAMS],
  [26, BRACKET_26_TEAMS],
  [27, BRACKET_27_TEAMS],
];

describe("validateBracketDefinition", () => {
  it("accepts a consistent definition", () => {
    const def: MatchDefinition[] = [
      {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 2}},
      {matchNumber: 2, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 1}, teamB: {type: "LOSER", matchNumber: 1}},
    ];
    assert.doesNotThrow(() => validateBracketDefinition(def));
  });

  it("rejects a loser referenced by two matches", () => {
    const def: MatchDefinition[] = [
      {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 2}},
      {matchNumber: 2, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 1}, teamB: {type: "BYE"}},
      {matchNumber: 3, bracket: "FINAL", round: 1, teamA: {type: "LOSER", matchNumber: 1}, teamB: {type: "WINNER", matchNumber: 1}},
    ];
    assert.throws(() => validateBracketDefinition(def), /LOSER.*#1/);
  });

  it("rejects references to missing matches", () => {
    const def: MatchDefinition[] = [
      {matchNumber: 1, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 9}, teamB: {type: "BYE"}},
    ];
    assert.throws(() => validateBracketDefinition(def), /inexistente/);
  });

  for (const [numTeams, def] of ALL_BRACKET_DEFINITIONS) {
    it(`accepts bracket-${numTeams}-teams`, () => {
      assert.doesNotThrow(() => validateBracketDefinition(def));
    });
  }
});

describe("buildMatchesFromDefinition", () => {
  const def: MatchDefinition[] = [
    {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 4}},
    {matchNumber: 2, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 3}, teamB: {type: "SEED", seed: 2}},
    {matchNumber: 3, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 1}, teamB: {type: "WINNER", matchNumber: 2}},
  ];

  it("resolves SEED slots from the seeding order", () => {
    const out = buildMatchesFromDefinition(def, ["a", "b", "c", "d"]);
    const m1 = out.find((m) => m.matchNumber === 1)!;
    assert.equal(m1.teamAId, "a"); // seed 1
    assert.equal(m1.teamBId, "d"); // seed 4
    const m2 = out.find((m) => m.matchNumber === 2)!;
    assert.equal(m2.teamAId, "c"); // seed 3
    assert.equal(m2.teamBId, "b"); // seed 2
  });

  it("fills placeholders and wires WINNER advances to the source match", () => {
    const out = buildMatchesFromDefinition(def, ["a", "b", "c", "d"]);
    const final = out.find((m) => m.matchNumber === 3)!;
    assert.equal(final.matchType, "Final");
    assert.equal(final.teamAId, "");
    assert.equal(final.teamADescription, "Vencedor Jogo #1");
    assert.equal(final.teamBDescription, "Vencedor Jogo #2");

    const m1 = out.find((m) => m.matchNumber === 1)!;
    assert.deepEqual(m1.winnerAdvance, {matchNumber: 3, teamSlot: "teamAId"});
    const m2 = out.find((m) => m.matchNumber === 2)!;
    assert.deepEqual(m2.winnerAdvance, {matchNumber: 3, teamSlot: "teamBId"});
  });
});
