import assert from "node:assert/strict";
import {test} from "node:test";

import {
  ACHIEVEMENT_CATALOG,
  achievementEventId,
  buildAchievementMetrics,
  isAchievementRuleMet,
} from "./achievement-engine";

test("catalog has 24 achievements with unique ids", () => {
  assert.equal(ACHIEVEMENT_CATALOG.length, 24);
  const ids = new Set(ACHIEVEMENT_CATALOG.map((d) => d.id));
  assert.equal(ids.size, 24);
});

test("achievementEventId trims and prefixes", () => {
  assert.equal(achievementEventId(" FIRST_GAME "), "achievement_FIRST_GAME");
});

test("buildAchievementMetrics reads counters straight from the summary doc", () => {
  const metrics = buildAchievementMetrics(
    {
      xp: 130,
      level: 1,
      streak: 4,
      totalGames: 6,
      invitesCount: 2,
      profileSharesCount: 1,
      favoriteArenasCount: 1,
      checkInsCount: 3,
      attendanceConfirmationsTotal: 5,
      attendanceConfirmationStreak: 5,
    },
    {avatarUrl: "https://cdn/x.jpg", sport: "Beach tennis", city: "Floripa", state: "SC"},
    2,
  );

  assert.equal(metrics.xp, 130);
  assert.equal(metrics.totalGames, 6);
  assert.equal(metrics.totalBookings, 2);
  assert.equal(metrics.identityComplete, true);
  assert.equal(metrics.attendanceConfirmationStreak, 5);
});

test("isAchievementRuleMet evaluates count-based rules", () => {
  const metrics = buildAchievementMetrics({totalGames: 5}, {});
  assert.equal(isAchievementRuleMet({type: "totalGames", target: 5}, metrics), true);
  assert.equal(isAchievementRuleMet({type: "totalGames", target: 6}, metrics), false);
});

test("isAchievementRuleMet evaluates identityComplete only when photo+sport are done", () => {
  const incomplete = buildAchievementMetrics({}, {avatarUrl: "x"});
  assert.equal(isAchievementRuleMet({type: "identityComplete"}, incomplete), false);

  const complete = buildAchievementMetrics({}, {avatarUrl: "x", sport: "Vôlei"});
  assert.equal(isAchievementRuleMet({type: "identityComplete"}, complete), true);
});

test("isAchievementRuleMet picks the right 7d/30d window", () => {
  const metrics = buildAchievementMetrics({gamesLast7Days: 4, gamesLast30Days: 9}, {});
  assert.equal(isAchievementRuleMet({type: "gamesInLastDays", days: 7, target: 4}, metrics), true);
  assert.equal(isAchievementRuleMet({type: "gamesInLastDays", days: 30, target: 10}, metrics), false);
});
