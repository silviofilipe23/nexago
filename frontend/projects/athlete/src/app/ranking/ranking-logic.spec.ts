import {
  assignRanks,
  buildAthleteRankingRows,
  buildSubtitle,
  buildTeamRankingRows,
  displayNameFrom,
  filterBySearch,
  initialsFrom,
  levelLabelForRank,
  levelRankFromLabel,
  matchesGenderFilter,
  normalizeAthleteGender,
  normalizeTeamGender,
  podiumRows,
  restRows,
  sortByPointsDesc,
  sumBestNPoints,
  teamDisplayName,
  teamInitials,
  yearOptions,
  type RankingProfileLite,
  type RankingTeamLite,
  type RawPointsRow,
} from './ranking-logic';
import type { RankingRow } from './athlete-ranking.models';

describe('levelRankFromLabel', () => {
  it('maps every real label/code to its rank, legacy aliases included', () => {
    expect(levelRankFromLabel('Iniciante 1')).toBe(0);
    expect(levelRankFromLabel('iniciante_1')).toBe(0);
    expect(levelRankFromLabel('iniciante')).toBe(0);
    expect(levelRankFromLabel('Iniciante 2')).toBe(1);
    expect(levelRankFromLabel('Intermediário 1')).toBe(2);
    expect(levelRankFromLabel('intermediario')).toBe(2);
    expect(levelRankFromLabel('Intermediário 2')).toBe(3);
    expect(levelRankFromLabel('Open')).toBe(5);
    expect(levelRankFromLabel('livre')).toBe(5);
  });

  it('returns null for empty/unknown values', () => {
    expect(levelRankFromLabel(null)).toBeNull();
    expect(levelRankFromLabel(undefined)).toBeNull();
    expect(levelRankFromLabel('')).toBeNull();
    expect(levelRankFromLabel('nível desconhecido')).toBeNull();
  });
});

describe('levelLabelForRank', () => {
  it('returns the Portuguese label for each real rank', () => {
    expect(levelLabelForRank(0)).toBe('Iniciante 1');
    expect(levelLabelForRank(1)).toBe('Iniciante 2');
    expect(levelLabelForRank(2)).toBe('Intermediário 1');
    expect(levelLabelForRank(3)).toBe('Intermediário 2');
    expect(levelLabelForRank(5)).toBe('Open');
  });
});

describe('sumBestNPoints', () => {
  it('sums only the top N values', () => {
    expect(sumBestNPoints([100, 300, 50, 200, 10, 400], 5)).toBe(1050);
  });

  it('sums everything when there are fewer than N values', () => {
    expect(sumBestNPoints([100, 200], 5)).toBe(300);
  });

  it('returns 0 for an empty list', () => {
    expect(sumBestNPoints([], 5)).toBe(0);
  });
});

describe('assignRanks', () => {
  it('assigns sequential 1-based ranks by array position', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(assignRanks(rows).map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

describe('sortByPointsDesc', () => {
  it('sorts by points descending without mutating the input', () => {
    const input = [{ points: 10 }, { points: 30 }, { points: 20 }];
    const sorted = sortByPointsDesc(input);
    expect(sorted.map((r) => r.points)).toEqual([30, 20, 10]);
    expect(input.map((r) => r.points)).toEqual([10, 30, 20]);
  });
});

describe('buildSubtitle', () => {
  it('combines level label and tournament count, pluralized', () => {
    expect(buildSubtitle('Intermediário 2', 8)).toBe('Intermediário 2 · 8 torneios');
    expect(buildSubtitle('Open', 1)).toBe('Open · 1 torneio');
  });

  it('omits the level when unresolved', () => {
    expect(buildSubtitle(null, 3)).toBe('3 torneios');
  });
});

describe('normalizeAthleteGender / normalizeTeamGender', () => {
  it('normalizes common Portuguese/English spellings for an individual athlete', () => {
    expect(normalizeAthleteGender('Masculino')).toBe('male');
    expect(normalizeAthleteGender('feminino')).toBe('female');
    expect(normalizeAthleteGender('male')).toBe('male');
    expect(normalizeAthleteGender(null)).toBeNull();
  });

  it('recognizes "misto" only for teams', () => {
    expect(normalizeTeamGender('Misto')).toBe('mixed');
    expect(normalizeTeamGender('Masculino')).toBe('male');
    expect(normalizeTeamGender('')).toBeNull();
  });
});

describe('matchesGenderFilter', () => {
  it('matches everything for "all"', () => {
    expect(matchesGenderFilter('all', null)).toBe(true);
    expect(matchesGenderFilter('all', 'female')).toBe(true);
  });

  it('requires an exact match otherwise, excluding unresolved gender', () => {
    expect(matchesGenderFilter('male', 'male')).toBe(true);
    expect(matchesGenderFilter('male', 'female')).toBe(false);
    expect(matchesGenderFilter('male', null)).toBe(false);
  });
});

describe('displayNameFrom / initialsFrom', () => {
  it('prefers the real name; falls back to a shortened id', () => {
    expect(displayNameFrom('Ana Souza', 'abc123456')).toBe('Ana Souza');
    expect(displayNameFrom(null, 'abc123456')).toBe('Atleta abc123');
    expect(displayNameFrom('  ', 'ab')).toBe('Atleta');
  });

  it('builds initials from first+last name, falling back to the id', () => {
    expect(initialsFrom('Ana Souza', 'abc123456')).toBe('AS');
    expect(initialsFrom('Ana', 'abc123456')).toBe('A');
    expect(initialsFrom(null, 'abc123456')).toBe('AB');
    expect(initialsFrom(null, '')).toBe('AT');
  });
});

describe('teamDisplayName / teamInitials', () => {
  it('prefers the team name, then combines first names, then falls back', () => {
    expect(teamDisplayName('Praia FC', 'João Silva', 'Ana Souza')).toBe('Praia FC');
    expect(teamDisplayName(null, 'João Silva', 'Ana Souza')).toBe('João & Ana');
    expect(teamDisplayName(null, 'João Silva', null)).toBe('João');
    expect(teamDisplayName(null, null, null)).toBe('Dupla');
  });

  it('combines one initial per player', () => {
    expect(teamInitials('João Silva', 'Ana Souza', 'team-id')).toBe('JA');
    expect(teamInitials(null, null, 'team-id-1')).toBe('TE');
  });
});

describe('filterBySearch', () => {
  const rows = [{ displayName: 'Ana Souza' }, { displayName: 'Bruno Lima' }];

  it('filters case-insensitively by display name', () => {
    expect(filterBySearch(rows, 'ana').map((r) => r.displayName)).toEqual(['Ana Souza']);
  });

  it('returns everything for a blank query', () => {
    expect(filterBySearch(rows, '   ').length).toBe(2);
  });
});

describe('podiumRows / restRows', () => {
  const rows: RankingRow[] = [1, 2, 3, 4, 5].map((rank) => ({
    rank,
    entityId: `e${rank}`,
    displayName: `E${rank}`,
    subtitle: '',
    points: 100 - rank,
    tournamentsCount: 1,
    initials: 'EE',
    avatarUrl: null,
    isCurrentUser: false,
  }));

  it('splits at rank 3', () => {
    expect(podiumRows(rows).map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(restRows(rows).map((r) => r.rank)).toEqual([4, 5]);
  });
});

describe('yearOptions', () => {
  it('returns the current year plus two past years', () => {
    expect(yearOptions(2026)).toEqual([2026, 2025, 2024]);
  });
});

describe('buildAthleteRankingRows', () => {
  const raw: RawPointsRow[] = [
    { entityId: 'a1', points: 100, tournamentsCount: 3 },
    { entityId: 'a2', points: 300, tournamentsCount: 5 },
    { entityId: 'a3', points: 200, tournamentsCount: 2 },
  ];
  const profiles = new Map<string, RankingProfileLite>([
    ['a1', { fullName: 'João Silva', gender: 'Masculino', primarySportId: 'VOLEI_PRAIA', levelsBySport: { VOLEI_PRAIA: 'Intermediário 1' }, avatarUrl: null }],
    ['a2', { fullName: 'Ana Souza', gender: 'Feminino', primarySportId: 'VOLEI_PRAIA', levelsBySport: { VOLEI_PRAIA: 'Open' }, avatarUrl: 'https://x/a2.png' }],
    ['a3', { fullName: 'Bia Lima', gender: 'Feminino', primarySportId: 'VOLEI_PRAIA', levelsBySport: { VOLEI_PRAIA: 'Iniciante 1' }, avatarUrl: null }],
  ]);

  it('sorts by points desc and assigns contiguous ranks', () => {
    const rows = buildAthleteRankingRows(raw, profiles, 'all', null, null);
    expect(rows.map((r) => r.entityId)).toEqual(['a2', 'a3', 'a1']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('filters by gender and re-ranks the remaining rows contiguously', () => {
    const rows = buildAthleteRankingRows(raw, profiles, 'female', null, null);
    expect(rows.map((r) => r.entityId)).toEqual(['a2', 'a3']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('filters by level rank (Open = 5)', () => {
    const rows = buildAthleteRankingRows(raw, profiles, 'all', 5, null);
    expect(rows.map((r) => r.entityId)).toEqual(['a2']);
  });

  it('marks the current user and builds a level+count subtitle', () => {
    const rows = buildAthleteRankingRows(raw, profiles, 'all', null, 'a1');
    const a1 = rows.find((r) => r.entityId === 'a1')!;
    expect(a1.isCurrentUser).toBe(true);
    expect(a1.displayName).toBe('João Silva');
    expect(a1.subtitle).toBe('Intermediário 1 · 3 torneios');
  });

  it('falls back to a generic subtitle when the profile is missing', () => {
    const rows = buildAthleteRankingRows(
      [{ entityId: 'unknown123', points: 10, tournamentsCount: 1 }],
      new Map(),
      'all',
      null,
      null,
    );
    expect(rows[0]!.displayName).toBe('Atleta unknow');
    expect(rows[0]!.subtitle).toBe('1 torneio');
  });
});

describe('buildTeamRankingRows', () => {
  const raw: RawPointsRow[] = [
    { entityId: 't1', points: 500, tournamentsCount: 4 },
    { entityId: 't2', points: 700, tournamentsCount: 6 },
  ];
  const teams = new Map<string, RankingTeamLite>([
    ['t1', { teamName: null, player1Id: 'p1', player2Id: 'p2', gender: 'Misto' }],
    ['t2', { teamName: 'Praia FC', player1Id: 'p3', player2Id: 'p4', gender: 'Masculino' }],
  ]);
  const profiles = new Map<string, RankingProfileLite>([
    ['p1', { fullName: 'João Silva', gender: 'Masculino', primarySportId: 'VOLEI_PRAIA', levelsBySport: { VOLEI_PRAIA: 'Iniciante 1' }, avatarUrl: null }],
    ['p2', { fullName: 'Ana Souza', gender: 'Feminino', primarySportId: 'VOLEI_PRAIA', levelsBySport: { VOLEI_PRAIA: 'Intermediário 2' }, avatarUrl: null }],
    ['p3', { fullName: 'Bruno Reis', gender: 'Masculino', primarySportId: 'VOLEI_PRAIA', levelsBySport: { VOLEI_PRAIA: 'Open' }, avatarUrl: null }],
    ['p4', { fullName: 'Caio Dias', gender: 'Masculino', primarySportId: 'VOLEI_PRAIA', levelsBySport: { VOLEI_PRAIA: 'Open' }, avatarUrl: null }],
  ]);

  it('builds a display name from the team name, else combined first names', () => {
    const rows = buildTeamRankingRows(raw, teams, profiles, 'all', null, null);
    const t1 = rows.find((r) => r.entityId === 't1')!;
    const t2 = rows.find((r) => r.entityId === 't2')!;
    expect(t1.displayName).toBe('João & Ana');
    expect(t2.displayName).toBe('Praia FC');
  });

  it('uses the team gender field (including "mixed") for the gender filter', () => {
    expect(buildTeamRankingRows(raw, teams, profiles, 'mixed', null, null).map((r) => r.entityId)).toEqual(['t1']);
    expect(buildTeamRankingRows(raw, teams, profiles, 'male', null, null).map((r) => r.entityId)).toEqual(['t2']);
  });

  it('uses the stronger player\'s level rank for the team level filter', () => {
    // t1: max(Iniciante 1=0, Intermediário 2=3) = 3
    const rows = buildTeamRankingRows(raw, teams, profiles, 'all', 3, null);
    expect(rows.map((r) => r.entityId)).toEqual(['t1']);
  });

  it('flags the current user if they are either player on the team', () => {
    const rows = buildTeamRankingRows(raw, teams, profiles, 'all', null, 'p2');
    expect(rows.find((r) => r.entityId === 't1')!.isCurrentUser).toBe(true);
    expect(rows.find((r) => r.entityId === 't2')!.isCurrentUser).toBe(false);
  });
});
