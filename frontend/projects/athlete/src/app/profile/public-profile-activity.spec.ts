import type { ArenaMatch } from '../data/teams-repository';
import {
  buildMatchRow,
  matchScoreLabel,
  matchesWithinDays,
  teamDetailLabel,
  teamDisplayName,
  winStreakOf,
  type PublicProfileMatchRow,
} from './public-profile-activity';

function makeMatch(overrides: Partial<ArenaMatch> = {}): ArenaMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'c1',
    matchType: 'Final',
    status: 'Completed',
    winnerId: 'teamA',
    teamAId: 'teamA',
    teamBId: 'teamB',
    teamADescription: 'Rafa & Tonho',
    teamBDescription: 'Ana R. & Beto L.',
    resultA: null,
    resultB: null,
    sets: [],
    scheduleTime: null,
    matchEndedAt: new Date(2026, 5, 28),
    courtName: null,
    ...overrides,
  };
}

function makeRow(overrides: Partial<PublicProfileMatchRow> = {}): PublicProfileMatchRow {
  return {
    id: 'r1',
    date: new Date(2026, 5, 28),
    result: 'W',
    opponent: 'Ana R. & Beto L.',
    contextLabel: 'Open · Final',
    score: '2–0',
    dateLabel: '28/06',
    tournamentId: 't1',
    ...overrides,
  };
}

describe('public-profile-activity', () => {
  describe('teamDisplayName', () => {
    it('prefers the stored team name', () => {
      expect(teamDisplayName({ teamName: 'Rafa & Tonho', player1Id: 'a', player2Id: 'b' }, undefined, undefined)).toBe('Rafa & Tonho');
    });

    it('falls back to the first names of both athletes', () => {
      const name = teamDisplayName(
        { teamName: null, player1Id: 'a', player2Id: 'b' },
        { displayName: 'Rafaela Nunes' } as never,
        { displayName: 'Carla Menezes' } as never,
      );
      expect(name).toBe('Rafaela / Carla');
    });
  });

  describe('teamDetailLabel', () => {
    it('shows the doubles ranking position when the pair scored', () => {
      expect(teamDetailLabel(1, 18, 4)).toBe('#1 no ranking de duplas · 18 vitórias');
    });

    it('falls back to the win/loss balance without a ranking position', () => {
      expect(teamDetailLabel(null, 1, 2)).toBe('1 vitória · 2 derrotas');
    });

    it('says so when the pair has no match at all', () => {
      expect(teamDetailLabel(null, 0, 0)).toBe('Sem partidas registradas ainda');
    });
  });

  describe('matchScoreLabel', () => {
    it('counts set wins from sets[] in the athlete perspective', () => {
      const match = makeMatch({ sets: [{ a: 21, b: 18 }, { a: 21, b: 15 }] });
      expect(matchScoreLabel(match, true)).toBe('2–0');
      expect(matchScoreLabel(match, false)).toBe('0–2');
    });

    it('reads the legacy resultA/resultB format', () => {
      const match = makeMatch({ resultA: '21,18,15', resultB: '18,21,12' });
      expect(matchScoreLabel(match, true)).toBe('2–1');
    });

    it('shows a dash when there is no score recorded', () => {
      expect(matchScoreLabel(makeMatch(), true)).toBe('—');
    });
  });

  describe('buildMatchRow', () => {
    const tournamentNames = new Map([['t1', 'Open Goiânia Beach']]);

    it('builds a win row from the athlete side A', () => {
      const row = buildMatchRow(makeMatch({ sets: [{ a: 21, b: 18 }, { a: 21, b: 15 }] }), new Set(['teamA']), tournamentNames);
      expect(row).toEqual(
        jasmine.objectContaining({
          result: 'W',
          opponent: 'Ana R. & Beto L.',
          contextLabel: 'Open Goiânia Beach · Final',
          score: '2–0',
          dateLabel: '28/06',
        }),
      );
    });

    it('builds a loss row from the athlete side B', () => {
      const row = buildMatchRow(makeMatch({ sets: [{ a: 21, b: 18 }, { a: 21, b: 15 }] }), new Set(['teamB']), tournamentNames);
      expect(row).toEqual(jasmine.objectContaining({ result: 'L', opponent: 'Rafa & Tonho', score: '0–2' }));
    });

    it('keeps only the round label when the tournament name is unknown', () => {
      const row = buildMatchRow(makeMatch({ matchType: 'group' }), new Set(['teamA']), new Map());
      expect(row?.contextLabel).toBe('Fase de grupos');
    });

    it('falls back to a generic opponent when the match has no description', () => {
      const row = buildMatchRow(makeMatch({ teamBDescription: null }), new Set(['teamA']), tournamentNames);
      expect(row?.opponent).toBe('Adversário');
    });

    it('ignores matches the athlete did not play', () => {
      expect(buildMatchRow(makeMatch(), new Set(['other']), tournamentNames)).toBeNull();
    });

    it('ignores matches without a winner or without a date', () => {
      expect(buildMatchRow(makeMatch({ winnerId: null }), new Set(['teamA']), tournamentNames)).toBeNull();
      expect(buildMatchRow(makeMatch({ matchEndedAt: null }), new Set(['teamA']), tournamentNames)).toBeNull();
    });

    it('uses the scheduled time when the match has no end timestamp', () => {
      const row = buildMatchRow(makeMatch({ matchEndedAt: null, scheduleTime: new Date(2026, 5, 7) }), new Set(['teamA']), tournamentNames);
      expect(row?.dateLabel).toBe('07/06');
    });
  });

  describe('winStreakOf', () => {
    it('counts wins from the most recent match backwards', () => {
      const rows = [makeRow({ id: '1' }), makeRow({ id: '2' }), makeRow({ id: '3', result: 'L' }), makeRow({ id: '4' })];
      expect(winStreakOf(rows)).toBe(2);
    });

    it('is zero when the most recent match is a loss', () => {
      expect(winStreakOf([makeRow({ result: 'L' }), makeRow()])).toBe(0);
    });
  });

  describe('matchesWithinDays', () => {
    it('keeps only matches inside the window', () => {
      const now = new Date(2026, 6, 1);
      const rows = [makeRow({ id: 'recent', date: new Date(2026, 5, 20) }), makeRow({ id: 'old', date: new Date(2026, 3, 1) })];
      expect(matchesWithinDays(rows, 30, now).map((r) => r.id)).toEqual(['recent']);
    });
  });
});
