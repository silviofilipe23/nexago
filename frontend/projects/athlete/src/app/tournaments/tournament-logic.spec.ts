import {
  bracketFormatHasGroupsPhase,
  bracketFormatLabel,
  buildDiscoveryLeague,
  buildDiscoveryTournament,
  buildGroupStandings,
  buildSingleEliminationRounds,
  distinctPoolIds,
  genderTypeFromRaw,
  isDoubleEliminationBracketFormat,
  listingStatusFromRaw,
} from './tournament-logic';
import type { LeagueRaw, MatchRaw, TournamentRaw } from './tournament-repository';

describe('genderTypeFromRaw', () => {
  it('maps the three real Firestore tags', () => {
    expect(genderTypeFromRaw('MASCULINO')).toBe('M');
    expect(genderTypeFromRaw('FEMININO')).toBe('F');
    expect(genderTypeFromRaw('MISTO')).toBe('Mix');
    expect(genderTypeFromRaw(null)).toBeNull();
    expect(genderTypeFromRaw('unknown')).toBeNull();
  });
});

describe('listingStatusFromRaw', () => {
  it('passes through known statuses and falls back to "open"', () => {
    expect(listingStatusFromRaw('live')).toBe('live');
    expect(listingStatusFromRaw('encerrado')).toBe('ended');
    expect(listingStatusFromRaw(null)).toBe('open');
  });
});

describe('bracketFormatLabel / isDoubleEliminationBracketFormat / bracketFormatHasGroupsPhase', () => {
  it('labels known formats in Portuguese', () => {
    expect(bracketFormatLabel('Single Elimination')).toBe('Eliminatória simples');
    expect(bracketFormatLabel('Double Elimination')).toBe('Dupla eliminatória');
    expect(bracketFormatLabel('Pool Play + SE')).toBe('Fase de Grupos + Mata-mata');
  });

  it('detects double elimination formats', () => {
    expect(isDoubleEliminationBracketFormat('Double Elimination')).toBe(true);
    expect(isDoubleEliminationBracketFormat('Dupla eliminação')).toBe(true);
    expect(isDoubleEliminationBracketFormat('Single Elimination')).toBe(false);
  });

  it('detects a groups phase, excluding single/double elimination', () => {
    expect(bracketFormatHasGroupsPhase('Pool Play + SE')).toBe(true);
    expect(bracketFormatHasGroupsPhase('Round Robin')).toBe(true);
    expect(bracketFormatHasGroupsPhase('Single Elimination')).toBe(false);
    expect(bracketFormatHasGroupsPhase('Double Elimination')).toBe(false);
  });
});

describe('buildDiscoveryTournament', () => {
  const raw: TournamentRaw = {
    id: 't1',
    name: 'Etapa Garden',
    city: 'Goiânia',
    locationName: 'Arena CFC',
    startAt: new Date('2026-08-01T00:00:00'),
    endAt: null,
    format: 'Duplas',
    capacity: 32,
    enrolledCount: 30,
    featured: false,
    liveMatchesNow: 0,
    listingStatus: 'open',
    leagueId: 'l1',
    leagueStageId: 's1',
    leagueStageOrder: 1,
    leagueStageName: 'Etapa 1',
    regulationsText: null,
    categories: [
      { categoryId: 'c1', categoryName: 'Masculino Open', entryFee: 80, maxTeams: 16, spotsLeft: 2, level: 'Open', genderType: 'MASCULINO', bracketFormat: 'Single Elimination', registrationClosed: false },
      { categoryId: 'c2', categoryName: 'Feminino Open', entryFee: 60, maxTeams: 16, spotsLeft: 0, level: 'Open', genderType: 'FEMININO', bracketFormat: 'Pool Play + SE', registrationClosed: true },
    ],
  };

  it('maps gender categories, cheapest price and near-capacity status', () => {
    const t = buildDiscoveryTournament(raw, false);
    expect(t.categories.sort()).toEqual(['F', 'M']);
    expect(t.priceValue).toBe(60);
    expect(t.spotsLeft).toBe(2);
    expect(t.status).toBe('almost_full'); // 2 left out of 32 capacity, within the 10% threshold
    expect(t.format).toBe('Dupla');
  });

  it('carries the enrolled flag through from the caller (not a doc field)', () => {
    expect(buildDiscoveryTournament(raw, true).enrolled).toBe(true);
    expect(buildDiscoveryTournament(raw, false).enrolled).toBe(false);
  });
});

describe('buildDiscoveryLeague', () => {
  it('maps stages sorted by order', () => {
    const raw: LeagueRaw = {
      id: 'l1',
      name: 'Liga Universitária',
      seasonLabel: 'Temporada 2026',
      city: 'Goiânia',
      stages: [
        { id: 's2', name: 'Etapa 2', order: 2, dateLabel: null, tournamentIds: ['t2'] },
        { id: 's1', name: 'Etapa 1', order: 1, dateLabel: null, tournamentIds: ['t1'] },
      ],
    };
    const league = buildDiscoveryLeague(raw);
    expect(league.stages.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('buildSingleEliminationRounds', () => {
  const baseMatch: MatchRaw = {
    matchId: '',
    categoryId: 'c1',
    matchType: 'knockout',
    round: 0,
    matchNumber: 0,
    poolId: null,
    isGroupMatch: false,
    teamAId: 'ta',
    teamBId: 'tb',
    teamAName: 'Time A',
    teamBName: 'Time B',
    winnerId: null,
    resultA: '',
    resultB: '',
    status: 'scheduled',
    scheduleTime: null,
  };

  it('groups by round and sorts matches within a round by matchNumber, ignoring group matches', () => {
    const matches: MatchRaw[] = [
      { ...baseMatch, matchId: 'm1', round: 2, matchNumber: 1 },
      { ...baseMatch, matchId: 'm2', round: 1, matchNumber: 2 },
      { ...baseMatch, matchId: 'm3', round: 1, matchNumber: 1 },
      { ...baseMatch, matchId: 'm4', round: 1, matchNumber: 3, isGroupMatch: true },
    ];
    const rounds = buildSingleEliminationRounds(matches);
    expect(rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(rounds[0]!.matches.map((m) => m.matchId)).toEqual(['m3', 'm2']);
  });
});

describe('buildGroupStandings / distinctPoolIds', () => {
  const baseMatch: MatchRaw = {
    matchId: '',
    categoryId: 'c1',
    matchType: 'group',
    round: 1,
    matchNumber: 1,
    poolId: 'A',
    isGroupMatch: true,
    teamAId: 't1',
    teamBId: 't2',
    teamAName: 'Time 1',
    teamBName: 'Time 2',
    winnerId: 't1',
    resultA: '2',
    resultB: '1',
    status: 'completed',
    scheduleTime: null,
  };

  it('computes wins/losses/sets and sorts by wins then set balance', () => {
    const matches: MatchRaw[] = [
      { ...baseMatch, matchId: 'm1' },
      { ...baseMatch, matchId: 'm2', teamAId: 't1', teamBId: 't3', teamAName: 'Time 1', teamBName: 'Time 3', winnerId: 't3', resultA: '0', resultB: '2' },
    ];
    const standings = buildGroupStandings(matches, 'A');
    const t1 = standings.find((r) => r.teamId === 't1')!;
    expect(t1.wins).toBe(1);
    expect(t1.losses).toBe(1);
    expect(t1.setsFor).toBe(2);
    expect(t1.setsAgainst).toBe(3);
  });

  it('ignores matches from a different pool and undecided matches', () => {
    const matches: MatchRaw[] = [{ ...baseMatch, matchId: 'm1', poolId: 'B' }, { ...baseMatch, matchId: 'm2', winnerId: null }];
    expect(buildGroupStandings(matches, 'A')).toEqual([]);
  });

  it('lists distinct pool ids', () => {
    const matches: MatchRaw[] = [{ ...baseMatch, matchId: 'm1', poolId: 'A' }, { ...baseMatch, matchId: 'm2', poolId: 'B' }, { ...baseMatch, matchId: 'm3', poolId: 'A' }];
    expect(distinctPoolIds(matches)).toEqual(['A', 'B']);
  });
});
