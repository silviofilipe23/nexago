import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {SCORING_VECTORS} from "./vectors.generated";
import {scoringProfileFromRaw, type SetsGamesProfile} from "./scoring";
import {
  applyGamesPoint,
  gamesEventText,
  gamesLiveHint,
  gamesPointLabels,
  type GamesClosed,
  type GamesLiveState,
} from "./live-games";

const TEAMS = {teamAId: "A", teamBId: "B"};
const FRESH: GamesLiveState = {sets: [], currentSetIndex: 0, currentGame: {a: 0, b: 0}, servingTeamId: "A"};

const plain = (sets: readonly {a: number; b: number; tb?: {a: number; b: number} | null}[]) =>
  sets.map((s) => (s.tb ? {a: s.a, b: s.b, tb: {a: s.tb.a, b: s.tb.b}} : {a: s.a, b: s.b}));

describe("sports/live-games · motor de games (vetores compartilhados com portais e app)", () => {
  for (const [i, v] of SCORING_VECTORS.liveVectors.entries()) {
    it(`caso ${i} (${v.profile} · ${v.points.length} pontos)`, () => {
      const profile = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile]) as SetsGamesProfile;
      let state: GamesLiveState = v.start ? {...v.start, sets: plain(v.start.sets)} : FRESH;
      let closed: GamesClosed | null = null;
      let winner: "A" | "B" | null = null;
      for (const ch of v.points) {
        const r = applyGamesPoint(state, ch as "A" | "B", profile, TEAMS);
        state = r;
        closed = r.closed;
        winner = r.winnerSide;
      }
      assert.deepEqual(plain(state.sets), plain(v.expect.sets));
      assert.equal(state.currentSetIndex, v.expect.currentSetIndex);
      assert.deepEqual(state.currentGame, v.expect.currentGame);
      assert.equal(state.servingTeamId, v.expect.servingTeamId);
      assert.equal(winner, v.expect.winnerSide);
      assert.equal(closed, v.expect.closed);
      if (v.labels) assert.deepEqual(gamesPointLabels(state, profile), v.labels);
      if (v.hint) assert.equal(gamesLiveHint(state, profile, TEAMS), v.hint);
    });
  }
  for (const [i, v] of SCORING_VECTORS.eventTextVectors.entries()) {
    it(`lance ${i} (${v.profile})`, () => {
      const p = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile]) as SetsGamesProfile;
      assert.equal(gamesEventText(p, v.setIndex, v.set, v.game), v.text);
    });
  }
});
