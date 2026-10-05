import {
  applyGamesPoint,
  gamesEventText,
  gamesLiveHint,
  gamesPointLabels,
  scoringProfileFromRaw,
  type GamesClosed,
  type GamesLiveState,
  type SetsGamesProfile,
} from '@nexago/sports';
import { SCORING_VECTORS } from '../../../../../../shared/sports/vectors.generated';

const TEAMS = { teamAId: 'A', teamBId: 'B' };
const FRESH: GamesLiveState = { sets: [], currentSetIndex: 0, currentGame: { a: 0, b: 0 }, servingTeamId: 'A' };

const plain = (sets: readonly { a: number; b: number; tb?: { a: number; b: number } | null }[]) =>
  sets.map((s) => (s.tb ? { a: s.a, b: s.b, tb: { a: s.tb.a, b: s.tb.b } } : { a: s.a, b: s.b }));

describe('@nexago/sports · motor de games da mesa (vetores compartilhados com o app)', () => {
  SCORING_VECTORS.liveVectors.forEach((v, i) => {
    it(`caso ${i} (${v.profile} · ${v.points.length} pontos)`, () => {
      const profile = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile]) as SetsGamesProfile;
      let state: GamesLiveState = v.start ? { ...v.start, sets: plain(v.start.sets) } : FRESH;
      let closed: GamesClosed | null = null;
      let winner: 'A' | 'B' | null = null;
      for (const ch of v.points) {
        const r = applyGamesPoint(state, ch as 'A' | 'B', profile, TEAMS);
        state = r;
        closed = r.closed;
        winner = r.winnerSide;
      }
      expect(plain(state.sets)).toEqual(plain(v.expect.sets));
      expect(state.currentSetIndex).toBe(v.expect.currentSetIndex);
      expect(state.currentGame).toEqual(v.expect.currentGame);
      expect(state.servingTeamId).toBe(v.expect.servingTeamId);
      expect(winner).toBe(v.expect.winnerSide);
      expect(closed).toBe(v.expect.closed);
      if (v.labels) expect(gamesPointLabels(state, profile)).toEqual(v.labels);
      if (v.hint) expect(gamesLiveHint(state, profile, TEAMS)).toBe(v.hint);
    });
  });
});

describe('@nexago/sports · texto do lance de games (ponto a ponto)', () => {
  SCORING_VECTORS.eventTextVectors.forEach((v, i) => {
    it(`lance ${i} (${v.profile})`, () => {
      const p = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile]) as SetsGamesProfile;
      expect(gamesEventText(p, v.setIndex, v.set, v.game)).toBe(v.text);
    });
  });
});

