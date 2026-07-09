import assert from "node:assert/strict";
import {test} from "node:test";

import {
  SAND_RANK_REWARD_CATALOG,
  SAND_RANK_TOP_TRACK_INDEX,
  SAND_RANK_TRACK,
  rankPromotionEventId,
  rewardsForTrackIndex,
  sandRankLabel,
  sandRankStepFromXp,
  shieldsPerMonthForTrackIndex,
} from "./sand-rank-engine";

// Tabela literal — guarda de paridade com o catálogo Dart
// (sand_rank_catalog.dart tem esta MESMA tabela no teste espelho).
const EXPECTED_TRACK: Array<[number, string, number, number]> = [
  [0, "INICIANTE", 3, 0],
  [1, "INICIANTE", 2, 100],
  [2, "INICIANTE", 1, 250],
  [3, "COMPETIDOR", 3, 450],
  [4, "COMPETIDOR", 2, 700],
  [5, "COMPETIDOR", 1, 1000],
  [6, "DESAFIANTE", 3, 1400],
  [7, "DESAFIANTE", 2, 1900],
  [8, "DESAFIANTE", 1, 2500],
  [9, "ELITE", 3, 3300],
  [10, "ELITE", 2, 4200],
  [11, "ELITE", 1, 5300],
  [12, "MESTRE", 3, 6600],
  [13, "MESTRE", 2, 8200],
  [14, "MESTRE", 1, 10000],
  [15, "LENDA", 0, 12500],
];

test("track matches the literal 16-step table (Dart parity guard)", () => {
  assert.equal(SAND_RANK_TRACK.length, EXPECTED_TRACK.length);
  for (const [trackIndex, rankCode, division, minXp] of EXPECTED_TRACK) {
    const step = SAND_RANK_TRACK[trackIndex];
    assert.equal(step.trackIndex, trackIndex);
    assert.equal(step.rankCode, rankCode);
    assert.equal(step.division, division);
    assert.equal(step.minXp, minXp);
  }
  assert.equal(SAND_RANK_TOP_TRACK_INDEX, 15);
});

test("thresholds are strictly increasing", () => {
  for (let i = 1; i < SAND_RANK_TRACK.length; i++) {
    assert.ok(SAND_RANK_TRACK[i].minXp > SAND_RANK_TRACK[i - 1].minXp);
  }
});

test("sandRankStepFromXp resolves boundary values", () => {
  assert.equal(sandRankStepFromXp(0).trackIndex, 0);
  assert.equal(sandRankStepFromXp(99).trackIndex, 0);
  assert.equal(sandRankStepFromXp(100).trackIndex, 1);
  assert.equal(sandRankStepFromXp(249).trackIndex, 1);
  assert.equal(sandRankStepFromXp(250).trackIndex, 2);
  assert.equal(sandRankStepFromXp(12499).trackIndex, 14);
  assert.equal(sandRankStepFromXp(12500).trackIndex, 15);
  assert.equal(sandRankStepFromXp(50000).trackIndex, 15);
});

test("sandRankStepFromXp clamps invalid input to the first step", () => {
  assert.equal(sandRankStepFromXp(-10).trackIndex, 0);
  assert.equal(sandRankStepFromXp(Number.NaN).trackIndex, 0);
  assert.equal(sandRankStepFromXp(Number.POSITIVE_INFINITY).trackIndex, 15);
});

test("sandRankLabel renders divisions as roman numerals", () => {
  assert.equal(sandRankLabel(SAND_RANK_TRACK[0]), "Iniciante III");
  assert.equal(sandRankLabel(SAND_RANK_TRACK[7]), "Desafiante II");
  assert.equal(sandRankLabel(SAND_RANK_TRACK[14]), "Mestre I");
  assert.equal(sandRankLabel(SAND_RANK_TRACK[15]), "Lenda");
});

test("every step grants at least one reward and ids are unique", () => {
  const ids = new Set(SAND_RANK_REWARD_CATALOG.map((r) => r.id));
  assert.equal(ids.size, SAND_RANK_REWARD_CATALOG.length);
  for (const step of SAND_RANK_TRACK) {
    const rewards = rewardsForTrackIndex(step.trackIndex);
    assert.ok(
      rewards.length >= 1,
      `degrau ${step.trackIndex} sem recompensa`,
    );
  }
});

test("reward trackIndex values point to existing steps", () => {
  for (const reward of SAND_RANK_REWARD_CATALOG) {
    assert.ok(reward.trackIndex >= 0);
    assert.ok(reward.trackIndex <= SAND_RANK_TOP_TRACK_INDEX);
  }
});

test("rankPromotionEventId is stable", () => {
  assert.equal(rankPromotionEventId(0), "rank_track_0");
  assert.equal(rankPromotionEventId(15), "rank_track_15");
});

test("shieldsPerMonthForTrackIndex follows the perk milestones", () => {
  assert.equal(shieldsPerMonthForTrackIndex(0), 0);
  assert.equal(shieldsPerMonthForTrackIndex(5), 0);
  assert.equal(shieldsPerMonthForTrackIndex(6), 1);
  assert.equal(shieldsPerMonthForTrackIndex(11), 1);
  assert.equal(shieldsPerMonthForTrackIndex(12), 2);
  assert.equal(shieldsPerMonthForTrackIndex(15), 2);
});
