import assert from "node:assert/strict";
import {test} from "node:test";

import {dailyMissionById, dailyMissionEventId} from "./daily-mission-gamification";

test("dailyMissionById is case-insensitive and matches the Dart catalog", () => {
  assert.equal(dailyMissionById("play_today")?.xpReward, 40);
  assert.equal(dailyMissionById("RESERVE_TODAY")?.xpReward, 35);
  assert.equal(dailyMissionById("FAVORITE_ARENA")?.xpReward, 15);
  assert.equal(dailyMissionById("EXPLORE_TOURNAMENT")?.xpReward, 20);
  assert.equal(dailyMissionById("SHARE_PROFILE")?.xpReward, 20);
  assert.equal(dailyMissionById("unknown"), undefined);
});

test("dailyMissionEventId is stable per day+mission", () => {
  assert.equal(dailyMissionEventId("2026-07-06", "PLAY_TODAY"), "daily_2026-07-06_PLAY_TODAY");
});
