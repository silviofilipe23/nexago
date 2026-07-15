import {
  bracketFormatHasGroupsPhase,
  bracketFormatLabel,
  buildBracketRounds,
  buildCategoryBracketData,
  buildCategoryGroups,
  buildDiscoveryLeague,
  buildDiscoveryTournament,
  buildGroupStandings,
  buildSingleEliminationRounds,
  buildTournamentDetailCategories,
  buildTournamentDetailView,
  distinctPoolIds,
  genderTypeFromRaw,
  isDoubleEliminationBracketFormat,
  listingStatusFromRaw,
} from './tournament-logic';
import type { LeagueRaw, MatchRaw, TournamentCategoryRaw, TournamentRaw } from './tournament-repository';

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

describe('buildTournamentDetailCategories / buildTournamentDetailView', () => {
  const categories: TournamentCategoryRaw[] = [
    { categoryId: 'c1', categoryName: 'Masculino Open', entryFee: 80, maxTeams: 16, spotsLeft: 2, level: 'Open', genderType: 'MASCULINO', bracketFormat: 'Single Elimination', registrationClosed: false },
    { categoryId: 'c2', categoryName: 'Feminino Open', entryFee: 60, maxTeams: 16, spotsLeft: 0, level: null, genderType: 'FEMININO', bracketFormat: 'Pool Play + SE', registrationClosed: true },
  ];

  it('maps each category with its own real spots/price/level', () => {
    const offers = buildTournamentDetailCategories(categories);
    expect(offers[0]).toEqual({
      id: 'c1', name: 'Masculino Open', genderLabel: 'Masculino', level: 'Open', spotsLeft: 2, spotsTotal: 16, priceLabel: 'R$ 80', registrationClosed: false,
    });
    expect(offers[1]!.level).toBe('Livre');
    expect(offers[1]!.registrationClosed).toBe(true);
  });

  it('builds the detail view with a single-day date, map query and bracket state from listing status', () => {
    const raw: TournamentRaw = {
      id: 't1', name: 'Etapa Garden', city: 'Goiânia', locationName: 'Arena CFC',
      startAt: new Date('2026-08-01T00:00:00'), endAt: null, format: 'Duplas', capacity: 32, enrolledCount: 30,
      featured: false, liveMatchesNow: 0, listingStatus: 'live', leagueId: null, leagueStageId: null,
      leagueStageOrder: 0, leagueStageName: null, regulationsText: null, categories,
    };
    const view = buildTournamentDetailView(raw, 'live');
    expect(view.mapQuery).toBe('Arena CFC, Goiânia');
    expect(view.bracketState).toBe('live');
    expect(view.categories.length).toBe(2);
    expect(view.dateDetail).toContain('2026');
  });

  it('formats a date range when start and end differ, and falls back to "soon" for open/almost_full', () => {
    const raw: TournamentRaw = {
      id: 't1', name: 'Etapa Garden', city: 'Goiânia', locationName: null,
      startAt: new Date('2026-08-01T00:00:00'), endAt: new Date('2026-08-02T00:00:00'), format: 'Duplas', capacity: 32,
      enrolledCount: 0, featured: false, liveMatchesNow: 0, listingStatus: 'open', leagueId: null, leagueStageId: null,
      leagueStageOrder: 0, leagueStageName: null, regulationsText: null, categories: [],
    };
    const view = buildTournamentDetailView(raw, 'open');
    expect(view.dateDetail).toContain('a');
    expect(view.mapQuery).toBe('Goiânia, Goiânia');
    expect(view.bracketState).toBe('soon');
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

describe('buildBracketRounds / buildCategoryGroups / buildCategoryBracketData', () => {
  const knockoutMatch: MatchRaw = {
    matchId: 'm1', categoryId: 'c1', matchType: 'knockout', round: 2, matchNumber: 1, poolId: null, isGroupMatch: false,
    teamAId: 'ta', teamBId: 'tb', teamAName: 'Time A', teamBName: 'Time B', winnerId: 'ta', resultA: '2', resultB: '1',
    status: 'Completed', scheduleTime: null,
  };
  const semiMatch: MatchRaw = { ...knockoutMatch, matchId: 'm2', round: 1, matchNumber: 1, winnerId: null, resultA: '', resultB: '', status: 'In Progress' };
  const tbdMatch: MatchRaw = { ...knockoutMatch, matchId: 'm3', round: 1, matchNumber: 2, teamAId: null, teamBId: null, teamAName: null, teamBName: null, winnerId: null, resultA: '', resultB: '', status: 'Scheduled' };

  it('labels the last round Final and the previous one Semifinal, mapping status/score/winner', () => {
    const rounds = buildBracketRounds([knockoutMatch, semiMatch, tbdMatch]);
    expect(rounds.map((r) => r.label)).toEqual(['Semifinal', 'Final']);
    const final = rounds[1]!.matches[0]!;
    expect(final.status).toBe('done');
    expect(final.sideA).toEqual({ duo: { id: 'ta', name: 'Time A' }, score: 2, winner: true });
    expect(final.sideB.winner).toBe(false);
    const semi = rounds[0]!.matches.find((m) => m.id === 'm2')!;
    expect(semi.status).toBe('live');
    const tbd = rounds[0]!.matches.find((m) => m.id === 'm3')!;
    expect(tbd.status).toBe('tbd');
    expect(tbd.sideA.duo).toBeNull();
  });

  it('groups standings by pool with an A/B/C letter derived from position', () => {
    const groupMatch: MatchRaw = {
      matchId: 'g1', categoryId: 'c1', matchType: 'group', round: 1, matchNumber: 1, poolId: 'grupo-x', isGroupMatch: true,
      teamAId: 't1', teamBId: 't2', teamAName: 'Dupla 1', teamBName: 'Dupla 2', winnerId: 't1', resultA: '2', resultB: '0',
      status: 'Completed', scheduleTime: null,
    };
    const groups = buildCategoryGroups([groupMatch]);
    expect(groups.length).toBe(1);
    expect(groups[0]!.letter).toBe('A');
    expect(groups[0]!.standings[0]!.duo).toEqual({ id: 't1', name: 'Dupla 1' });
  });

  it('marks double-elimination categories as unsupported without building rounds', () => {
    const data = buildCategoryBracketData('c1', 'Aberto', 'Double Elimination', [knockoutMatch]);
    expect(data.format).toBe('unsupported');
    expect(data.bracketRounds).toEqual([]);
  });

  it('builds groups + knockout for a pool-play-then-elimination category', () => {
    const groupMatch: MatchRaw = {
      matchId: 'g1', categoryId: 'c1', matchType: 'group', round: 1, matchNumber: 1, poolId: 'A', isGroupMatch: true,
      teamAId: 't1', teamBId: 't2', teamAName: 'Dupla 1', teamBName: 'Dupla 2', winnerId: 't1', resultA: '2', resultB: '0',
      status: 'Completed', scheduleTime: null,
    };
    const data = buildCategoryBracketData('c1', 'Aberto', 'Pool Play + SE', [groupMatch, knockoutMatch]);
    expect(data.format).toBe('grupos');
    expect(data.groups.length).toBe(1);
    expect(data.bracketRounds.length).toBe(1);
  });
});
