import type { ArenaMatch, ArenaTeam } from '../data/teams-repository';
import type { AthletePublicProfile } from '../data/public-profiles-repository';
import {
  buildMatchRow,
  duoNameOf,
  matchScoreLabel,
  matchesWithinDays,
  teamDetailLabel,
  teamDisplayName,
  winStreakOf,
  type PublicProfileMatchRow,
} from './public-profile-activity';

function makeTeam(overrides: Partial<ArenaTeam> = {}): ArenaTeam {
  return { id: 'teamB', player1Id: 'u1', player2Id: 'u2', teamName: null, gender: null, createdAt: null, ...overrides };
}

function profileMap(entries: Record<string, string>): Map<string, AthletePublicProfile> {
  return new Map(Object.entries(entries).map(([id, displayName]) => [id, { id, displayName } as AthletePublicProfile]));
}

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

  describe('duoNameOf', () => {
    it('prefers the registered team name', () => {
      const teams = new Map([['teamB', makeTeam({ teamName: 'Ana & Beto' })]]);
      expect(duoNameOf('teamB', teams, new Map(), '2º Grupo C')).toBe('Ana & Beto');
    });

    it('builds the name from both athletes first names', () => {
      const teams = new Map([['teamB', makeTeam()]]);
      expect(duoNameOf('teamB', teams, profileMap({ u1: 'Ana Ribeiro', u2: 'Beto Lima' }), '2º Grupo C')).toBe('Ana / Beto');
    });

    it('does not repeat the athlete when the pair is still looking for a partner', () => {
      const teams = new Map([['teamB', makeTeam({ player1Id: 'u1', player2Id: 'u1' })]]);
      expect(duoNameOf('teamB', teams, profileMap({ u1: 'Ana Ribeiro' }), null)).toBe('Ana');
    });

    it('falls back to the match description only when the team is unknown', () => {
      expect(duoNameOf('gone', new Map(), new Map(), '2º Grupo C')).toBe('2º Grupo C');
      expect(duoNameOf('', new Map(), new Map(), null)).toBe('Adversário');
    });
  });

  describe('buildMatchRow', () => {
    const tournamentNames = new Map([['t1', 'Open Goiânia Beach']]);
    const opponentTeams = new Map([
      ['teamA', makeTeam({ id: 'teamA', player1Id: 'a1', player2Id: 'a2' })],
      ['teamB', makeTeam({ id: 'teamB', player1Id: 'b1', player2Id: 'b2' })],
    ]);
    const opponentProfiles = profileMap({ a1: 'Rafaela Nunes', a2: 'Antonio Souza', b1: 'Ana Ribeiro', b2: 'Beto Lima' });
    const resolve = (id: string, fallback: string | null) => duoNameOf(id, opponentTeams, opponentProfiles, fallback);

    it('builds a win row from the athlete side A', () => {
      const row = buildMatchRow(makeMatch({ sets: [{ a: 21, b: 18 }, { a: 21, b: 15 }] }), new Set(['teamA']), tournamentNames, resolve);
      expect(row).toEqual(
        jasmine.objectContaining({
          result: 'W',
          opponent: 'Ana / Beto',
          contextLabel: 'Open Goiânia Beach · Final',
          score: '2–0',
          dateLabel: '28/06',
        }),
      );
    });

    it('builds a loss row from the athlete side B', () => {
      const row = buildMatchRow(makeMatch({ sets: [{ a: 21, b: 18 }, { a: 21, b: 15 }] }), new Set(['teamB']), tournamentNames, resolve);
      expect(row).toEqual(jasmine.objectContaining({ result: 'L', opponent: 'Rafaela / Antonio', score: '0–2' }));
    });

    it('never shows the bracket seeding description when the opponent team is known', () => {
      const row = buildMatchRow(makeMatch({ teamBDescription: '2º Grupo C' }), new Set(['teamA']), tournamentNames, resolve);
      expect(row?.opponent).toBe('Ana / Beto');
    });

    it('keeps only the round label when the tournament name is unknown', () => {
      const row = buildMatchRow(makeMatch({ matchType: 'group' }), new Set(['teamA']), new Map(), resolve);
      expect(row?.contextLabel).toBe('Fase de grupos');
    });

    it('falls back to a generic opponent when neither the team nor the description resolve', () => {
      const row = buildMatchRow(makeMatch({ teamBId: 'gone', teamBDescription: null }), new Set(['teamA']), tournamentNames, resolve);
      expect(row?.opponent).toBe('Adversário');
    });

    it('ignores matches the athlete did not play', () => {
      expect(buildMatchRow(makeMatch(), new Set(['other']), tournamentNames, resolve)).toBeNull();
    });

    it('ignores matches without a winner or without a date', () => {
      expect(buildMatchRow(makeMatch({ winnerId: null }), new Set(['teamA']), tournamentNames, resolve)).toBeNull();
      expect(buildMatchRow(makeMatch({ matchEndedAt: null }), new Set(['teamA']), tournamentNames, resolve)).toBeNull();
    });

    it('uses the scheduled time when the match has no end timestamp', () => {
      const row = buildMatchRow(
        makeMatch({ matchEndedAt: null, scheduleTime: new Date(2026, 5, 7) }),
        new Set(['teamA']),
        tournamentNames,
        resolve,
      );
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
