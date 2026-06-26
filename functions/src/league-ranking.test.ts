import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  effectivePointsFromStageResults,
  parseCountingStagesMode,
  placementPoints,
  pointsForBucket,
  pointsForPlace,
  resolveLeaguePlacementsFromMatch,
} from "./league-ranking";

const DEFAULT_TABLE = {
  "1": 450,
  "2": 280,
  "3": 180,
  "4": 120,
  quarters: 80,
  groups: 40,
};

function completedMatch(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    status: "Completed",
    teamAId: "team-a",
    teamBId: "team-b",
    winnerId: "team-a",
    ...overrides,
  };
}

describe("parseCountingStagesMode", () => {
  it("defaults to best_4_of_6", () => {
    assert.equal(parseCountingStagesMode(null), "best_4_of_6");
    assert.equal(parseCountingStagesMode("unknown"), "best_4_of_6");
  });

  it("parses known modes", () => {
    assert.equal(parseCountingStagesMode("best_3_of_5"), "best_3_of_5");
    assert.equal(parseCountingStagesMode("all_stages"), "all_stages");
  });
});

describe("pointsForPlace and pointsForBucket", () => {
  it("uses defaults", () => {
    assert.equal(pointsForPlace(DEFAULT_TABLE, 1), 450);
    assert.equal(pointsForPlace(DEFAULT_TABLE, 3), 180);
    assert.equal(pointsForBucket(DEFAULT_TABLE, "quarters"), 80);
    assert.equal(pointsForBucket(DEFAULT_TABLE, "groups"), 40);
  });

  it("resolves placementPoints from award", () => {
    assert.equal(
      placementPoints(DEFAULT_TABLE, {teamId: "t1", place: 2}),
      280,
    );
    assert.equal(
      placementPoints(DEFAULT_TABLE, {teamId: "t1", bucket: "groups"}),
      40,
    );
  });
});

describe("resolveLeaguePlacementsFromMatch", () => {
  const noThirdPlace = {
    hasThirdPlaceMatch: false,
    isDoubleElimination: false,
    maxLbRound: 0,
  };

  it("awards 1st and 2nd on Final", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "Final"}),
      noThirdPlace,
    );
    assert.deepEqual(awards, [
      {teamId: "team-a", place: 1},
      {teamId: "team-b", place: 2},
    ]);
  });

  it("awards 3rd and 4th on Third Place", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "Third Place"}),
      {...noThirdPlace, hasThirdPlaceMatch: true},
    );
    assert.deepEqual(awards, [
      {teamId: "team-a", place: 3},
      {teamId: "team-b", place: 4},
    ]);
  });

  it("awards quarters to QF loser", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "Quarter-Final"}),
      noThirdPlace,
    );
    assert.deepEqual(awards, [{teamId: "team-b", bucket: "quarters"}]);
  });

  it("defers semi loser when third place match exists", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "Semi-Final"}),
      {...noThirdPlace, hasThirdPlaceMatch: true},
    );
    assert.deepEqual(awards, []);
  });

  it("awards 3rd to semi loser without third place match", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "Semi-Final"}),
      noThirdPlace,
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 3}]);
  });

  it("awards 3rd to knockout round 1 loser numa chave de 4 (final round 2)", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "knockout", round: 1}),
      {...noThirdPlace, knockoutFinalRound: 2},
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 3}]);
  });

  it("legado: sem knockoutFinalRound, round 1 ainda é semifinal", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "knockout", round: 1}),
      noThirdPlace,
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 3}]);
  });

  it("chave de 8: round 1 (oitavas/quartas) perdedor vai p/ 'quarters'", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "knockout", round: 1}),
      {...noThirdPlace, knockoutFinalRound: 3},
    );
    assert.deepEqual(awards, [{teamId: "team-b", bucket: "quarters"}]);
  });

  it("chave de 8: round 2 (semifinal) perdedor sem 3º lugar vira 3º", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "knockout", round: 2}),
      {...noThirdPlace, knockoutFinalRound: 3},
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 3}]);
  });

  it("chave de 8: semifinal com disputa de 3º lugar é adiada", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "knockout", round: 2}),
      {
        ...noThirdPlace,
        hasThirdPlaceMatch: true,
        knockoutFinalRound: 3,
      },
    );
    assert.deepEqual(awards, []);
  });

  it("ignores group matches", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "group", isGroupMatch: true}),
      noThirdPlace,
    );
    assert.deepEqual(awards, []);
  });

  it("ignores incomplete matches", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      {
        status: "In Progress",
        matchType: "Final",
        teamAId: "team-a",
        teamBId: "team-b",
        winnerId: "team-a",
      },
      noThirdPlace,
    );
    assert.deepEqual(awards, []);
  });

  it("ignores WB losses in double elimination", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "WB", round: 1}),
      {...noThirdPlace, isDoubleElimination: true, maxLbRound: 2},
    );
    assert.deepEqual(awards, []);
  });

  it("awards 3rd on last LB round in double elimination", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "LB", round: 2}),
      {...noThirdPlace, isDoubleElimination: true, maxLbRound: 2},
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 3}]);
  });

  it("awards 4th on penultimate LB round in double elimination", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "LB", round: 1}),
      {...noThirdPlace, isDoubleElimination: true, maxLbRound: 2},
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 4}]);
  });

  it("awards quarters on early LB elimination", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "LB", round: 1}),
      {...noThirdPlace, isDoubleElimination: true, maxLbRound: 4},
    );
    assert.deepEqual(awards, [{teamId: "team-b", bucket: "quarters"}]);
  });
});

describe("effectivePointsFromStageResults", () => {
  const stages = [
    {points: 450},
    {points: 280},
    {points: 180},
    {points: 120},
    {points: 80},
    {points: 40},
  ];

  it("sums all stages when mode is all_stages", () => {
    assert.equal(
      effectivePointsFromStageResults(stages, "all_stages"),
      1150,
    );
  });

  it("keeps top 4 for best_4_of_6", () => {
    assert.equal(
      effectivePointsFromStageResults(stages, "best_4_of_6"),
      1030,
    );
  });

  it("keeps top 3 for best_3_of_5", () => {
    assert.equal(
      effectivePointsFromStageResults(stages, "best_3_of_5"),
      910,
    );
  });

  it("ignores invalid points", () => {
    assert.equal(
      effectivePointsFromStageResults(
        [{points: 100}, {points: "x"}, {points: -5}, {points: 50}],
        "best_3_of_5",
      ),
      150,
    );
  });
});
