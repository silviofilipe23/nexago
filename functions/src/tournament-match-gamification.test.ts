import assert from "node:assert/strict";
import {test} from "node:test";

import {
  appendGameCompletionDay,
  buildStreakActivityFields,
  collectWinnerAthleteIds,
  isTournamentMatchCompleted,
  parseGamificationSummary,
  shouldProcessTournamentMatchXp,
  tournamentMatchXpEventId,
  updateStreak,
  updateStreakWithShield,
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

// —— Protetor de Sequência (perk da trilha de elos) ——

test("updateStreakWithShield consome escudo com exatamente 1 dia perdido", () => {
  const twoDaysAgo = new Date(2026, 5, 7, 18, 0, 0);
  const today = new Date(2026, 5, 9, 10, 0, 0);
  assert.deepEqual(updateStreakWithShield(4, twoDaysAgo, today, 1), {
    streak: 5,
    shieldConsumed: true,
  });
});

test("updateStreakWithShield não consome com 2+ dias perdidos", () => {
  const threeDaysAgo = new Date(2026, 5, 6, 18, 0, 0);
  const today = new Date(2026, 5, 9, 10, 0, 0);
  assert.deepEqual(updateStreakWithShield(4, threeDaysAgo, today, 2), {
    streak: 1,
    shieldConsumed: false,
  });
});

test("updateStreakWithShield sem escudo reseta como hoje", () => {
  const twoDaysAgo = new Date(2026, 5, 7, 18, 0, 0);
  const today = new Date(2026, 5, 9, 10, 0, 0);
  assert.deepEqual(updateStreakWithShield(4, twoDaysAgo, today, 0), {
    streak: 1,
    shieldConsumed: false,
  });
});

test("updateStreakWithShield não gasta escudo em dia consecutivo", () => {
  const yesterday = new Date(2026, 5, 8, 18, 0, 0);
  const today = new Date(2026, 5, 9, 10, 0, 0);
  assert.deepEqual(updateStreakWithShield(4, yesterday, today, 2), {
    streak: 5,
    shieldConsumed: false,
  });
});

test("buildStreakActivityFields repõe escudos na virada do mês por elo", () => {
  const fields = buildStreakActivityFields(
    parseGamificationSummary({
      xp: 7000,
      streak: 3,
      lastGameDate: undefined,
      streakShieldsAvailable: 0,
      streakShieldMonthKey: "2026-05",
      highestSandRankTrackIndex: 12, // Mestre III → 2 escudos/mês
    }),
    new Date(2026, 5, 9),
  );
  assert.equal(fields["streakShieldsAvailable"], 2);
  assert.equal(fields["streakShieldMonthKey"], "2026-06");
});

test("buildStreakActivityFields consome escudo e registra o uso", () => {
  const fields = buildStreakActivityFields(
    parseGamificationSummary({
      xp: 2000,
      streak: 6,
      lastGameDate: new Date(2026, 5, 7).toISOString(),
      streakShieldsAvailable: 1,
      streakShieldMonthKey: "2026-06",
      highestSandRankTrackIndex: 6,
    }),
    new Date(2026, 5, 9),
  );
  assert.equal(fields["streak"], 7);
  assert.equal(fields["streakShieldsAvailable"], 0);
  assert.ok(fields["streakShieldUsedAt"]);
});

test("buildStreakActivityFields abaixo do marco segue sem escudos", () => {
  const fields = buildStreakActivityFields(
    parseGamificationSummary({
      xp: 300,
      streak: 6,
      lastGameDate: new Date(2026, 5, 7).toISOString(),
      streakShieldsAvailable: 0,
      streakShieldMonthKey: "2026-05",
      highestSandRankTrackIndex: 2,
    }),
    new Date(2026, 5, 9),
  );
  assert.equal(fields["streak"], 1);
  assert.equal(fields["streakShieldsAvailable"], 0);
  assert.equal(fields["streakShieldUsedAt"], undefined);
});
