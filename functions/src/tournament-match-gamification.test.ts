import assert from "node:assert/strict";
import {test} from "node:test";

import {
  appendGameCompletionDay,
  collectWinnerAthleteIds,
  isTournamentMatchCompleted,
  shouldProcessTournamentMatchXp,
  tournamentMatchXpEventId,
  updateStreak,
} from "./tournament-match-gamification";

test("tournamentMatchXpEventId matches client convention", () => {
  assert.equal(tournamentMatchXpEventId(" match-1 "), "tournament_match_match-1");
});

test("isTournamentMatchCompleted is case-insensitive", () => {
  assert.equal(isTournamentMatchCompleted("Completed"), true);
  assert.equal(isTournamentMatchCompleted("Scheduled"), false);
});

test("shouldProcessTournamentMatchXp on completed transition", () => {
  assert.equal(
    shouldProcessTournamentMatchXp(
      {status: "In Progress"},
      {status: "Completed", winnerId: "team-a"},
    ),
    true,
  );
});

test("shouldProcessTournamentMatchXp when winner is set after completion", () => {
  assert.equal(
    shouldProcessTournamentMatchXp(
      {status: "Completed", winnerId: ""},
      {status: "Completed", winnerId: "team-a"},
    ),
    true,
  );
});

test("shouldProcessTournamentMatchXp ignores unrelated updates", () => {
  assert.equal(
    shouldProcessTournamentMatchXp(
      {status: "Completed", winnerId: "team-a"},
      {status: "Completed", winnerId: "team-a", courtName: "Quadra 2"},
    ),
    false,
  );
});

test("collectWinnerAthleteIds deduplicates placeholder partner", () => {
  assert.deepEqual(
    collectWinnerAthleteIds({player1Id: "u1", player2Id: "u1"}),
    ["u1"],
  );
  assert.deepEqual(
    collectWinnerAthleteIds({player1Id: "u1", player2Id: "u2"}),
    ["u1", "u2"],
  );
});

test("updateStreak increments on consecutive days", () => {
  const yesterday = new Date(2026, 5, 8, 18, 0, 0);
  const today = new Date(2026, 5, 9, 10, 0, 0);
  assert.equal(updateStreak(2, yesterday, today), 3);
});

test("appendGameCompletionDay keeps rolling window", () => {
  const days = Array.from({length: 121}, (_, index) => `2026-01-${String(index + 1).padStart(2, "0")}`);
  const next = appendGameCompletionDay(days, new Date(2026, 5, 9));
  assert.equal(next.length, 120);
  assert.equal(next[next.length - 1], "2026-06-09");
});
