import {
  buildMatchRow,
  computeRecord,
  displayNameFrom,
  filterBySearch,
  initialsFrom,
  levelLabelForRank,
  levelRankFromLabel,
  matchesGenderFilter,
  normalizeAthleteGender,
  normalizeTeamGender,
  teamDisplayName,
  teamInitials,
  type MatchRaw,
} from './teams-logic';

describe('levelRankFromLabel / levelLabelForRank', () => {
  it('maps labels to ranks and back', () => {
    expect(levelRankFromLabel('Intermediário 2')).toBe(3);
    expect(levelRankFromLabel('open')).toBe(5);
    expect(levelRankFromLabel(null)).toBeNull();
    expect(levelLabelForRank(0)).toBe('Iniciante 1');
    expect(levelLabelForRank(5)).toBe('Open');
  });
});

describe('normalizeAthleteGender / normalizeTeamGender', () => {
  it('normalizes common spellings, "misto" only for teams', () => {
    expect(normalizeAthleteGender('Masculino')).toBe('male');
    expect(normalizeAthleteGender(null)).toBeNull();
    expect(normalizeTeamGender('Misto')).toBe('mixed');
    expect(normalizeTeamGender('Feminino')).toBe('female');
  });
});

describe('matchesGenderFilter', () => {
  it('matches everything for "all", exact otherwise', () => {
    expect(matchesGenderFilter('all', null)).toBe(true);
    expect(matchesGenderFilter('male', 'male')).toBe(true);
    expect(matchesGenderFilter('male', null)).toBe(false);
  });
});

describe('displayNameFrom / initialsFrom', () => {
  it('prefers the real name, falls back to a shortened id', () => {
    expect(displayNameFrom('Ana Souza', 'abc123456')).toBe('Ana Souza');
    expect(displayNameFrom(null, 'abc123456')).toBe('Atleta abc123');
    expect(initialsFrom('Ana Souza', 'x')).toBe('AS');
    expect(initialsFrom(null, 'abc123456')).toBe('AB');
  });
});

describe('teamDisplayName / teamInitials', () => {
  it('prefers the team name, then combines first names, then falls back to "Dupla"', () => {
    expect(teamDisplayName('Praia FC', 'João Silva', 'Ana Souza')).toBe('Praia FC');
    expect(teamDisplayName(null, 'João Silva', 'Ana Souza')).toBe('João & Ana');
    expect(teamDisplayName(null, null, null)).toBe('Dupla');
  });

  it('combines one initial per player', () => {
    expect(teamInitials('João Silva', 'Ana Souza', 'team-id')).toBe('JA');
  });
});

describe('filterBySearch', () => {
  it('filters case-insensitively by display name', () => {
    const rows = [{ displayName: 'Praia FC' }, { displayName: 'Areia Clube' }];
    expect(filterBySearch(rows, 'praia').map((r) => r.displayName)).toEqual(['Praia FC']);
  });
});

describe('computeRecord', () => {
  const matches: MatchRaw[] = [
    { matchId: 'm1', teamAId: 't1', teamBId: 't2', winnerId: 't1', resultA: '2', resultB: '0', status: 'completed', endedAtMs: 1000 },
    { matchId: 'm2', teamAId: 't3', teamBId: 't1', winnerId: 't3', resultA: '2', resultB: '1', status: 'completed', endedAtMs: 2000 },
    { matchId: 'm3', teamAId: 't1', teamBId: 't4', winnerId: null, resultA: '', resultB: '', status: 'in_progress', endedAtMs: null },
  ];

  it('counts only decided (completed, with a winner) matches', () => {
    expect(computeRecord(matches, 't1')).toEqual({ wins: 1, losses: 1 });
  });
});

describe('buildMatchRow', () => {
  const match: MatchRaw = {
    matchId: 'm1',
    teamAId: 't1',
    teamBId: 't2',
    winnerId: 't1',
    resultA: '21-15,21-18',
    resultB: '15-21,18-21',
    status: 'completed',
    endedAtMs: new Date('2026-06-01T00:00:00').getTime(),
  };

  it('orients the score from the team perspective and reports the result', () => {
    const row = buildMatchRow(match, 't1', 'Time Rival');
    expect(row.result).toBe('win');
    expect(row.scoreLabel).toBe('21-15,21-18 x 15-21,18-21');
    expect(row.opponentName).toBe('Time Rival');
  });

  it('flips the score order when the team is teamB', () => {
    const row = buildMatchRow(match, 't2', 'Time A');
    expect(row.result).toBe('loss');
    expect(row.scoreLabel).toBe('15-21,18-21 x 21-15,21-18');
  });
});
