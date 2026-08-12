import type { GroupStanding, TournamentMatch } from '../../data/matches-repository';
import {
  liveRowsOf,
  lossesOf,
  nextMatchViewOf,
  qualificationNoteOf,
  standingLineOf,
  standingsViewOf,
  timelineOf,
  type FocusViewContext,
} from './focus-views';

function match(partial: Partial<TournamentMatch> & Pick<TournamentMatch, 'id'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'group',
    poolId: 'pool-a',
    teamAId: 'A',
    teamBId: 'B',
    teamADescription: null,
    teamBDescription: null,
    status: 'Scheduled',
    resultA: null,
    resultB: null,
    sets: [],
    winnerId: null,
    isGroupMatch: true,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    scheduleTime: null,
    courtName: null,
    liveScore: null,
    matchStartedAt: null,
    checkIn: { teamA: null, teamB: null },
    queueStatus: null,
    bestOf: 3,
    currentSetIndex: null,
    ...partial,
  };
}

function ctxOf(partial: Partial<FocusViewContext> & Pick<FocusViewContext, 'matches'>): FocusViewContext {
  return {
    myTeamIds: new Set(['teamMine']),
    now: new Date('2026-08-29T14:00:00Z'),
    duoNameOf: (teamId, fallback) => (teamId ? `Dupla ${teamId}` : (fallback ?? 'A definir')),
    duoPlayersOf: () => [
      { initial: 'MA', photo: null },
      { initial: 'EN', photo: null },
    ],
    isMyTeam: (teamId) => teamId === 'teamMine',
    standingsOf: (): GroupStanding[] => [],
    nextMatch: null,
    dayTimeline: [],
    ...partial,
  };
}

describe('nextMatchViewOf', () => {
  it('devolve null sem próxima partida', () => {
    expect(nextMatchViewOf(ctxOf({ matches: [] }))).toBeNull();
  });

  it('monta horário, quadra e lados a partir da partida', () => {
    const m = match({ id: 'm1', teamAId: 'teamMine', teamBId: 'teamRival', courtName: '3', scheduleTime: new Date('2026-08-29T15:10:00Z') });
    const view = nextMatchViewOf(ctxOf({ matches: [m], nextMatch: m }));
    expect(view?.matchId).toBe('m1');
    expect(view?.courtLabel).toBe('Quadra 3');
    expect(view?.sideA.isMe).toBe(true);
    expect(view?.sideB.isMe).toBe(false);
  });

  it('em quadra não mostra contagem regressiva', () => {
    const m = match({ id: 'm1', status: 'in progress', teamAId: 'teamMine', teamBId: 'teamRival', scheduleTime: new Date('2026-08-29T13:00:00Z') });
    const view = nextMatchViewOf(ctxOf({ matches: [m], nextMatch: m }));
    expect(view?.live).toBe(true);
    expect(view?.countdown).toBeNull();
  });
});

describe('timelineOf', () => {
  it('marca a partida encerrada com o resultado sob a ótica do atleta', () => {
    const done = match({
      id: 'm1',
      status: 'completed',
      teamAId: 'teamMine',
      teamBId: 'teamRival',
      winnerId: 'teamMine',
      sets: [{ a: 21, b: 15 }, { a: 21, b: 12 }],
      scheduleTime: new Date('2026-08-29T12:00:00Z'),
    });
    const [entry] = timelineOf(ctxOf({ matches: [done], dayTimeline: [done] }));
    expect(entry?.state).toBe('done');
    expect(entry?.outcome).toBe('win');
  });

  it('marca como "next" a partida que é a próxima do atleta', () => {
    const upcoming = match({ id: 'm2', teamAId: 'teamMine', teamBId: 'teamRival', scheduleTime: new Date('2026-08-29T15:00:00Z') });
    const [entry] = timelineOf(ctxOf({ matches: [upcoming], dayTimeline: [upcoming], nextMatch: upcoming }));
    expect(entry?.state).toBe('next');
  });
});

describe('liveRowsOf', () => {
  it('filtra as partidas ao vivo pela categoria informada', () => {
    const live = match({ id: 'm1', categoryId: 'c1', status: 'in progress' });
    const otherCategory = match({ id: 'm2', categoryId: 'c2', status: 'in progress' });
    const rows = liveRowsOf(ctxOf({ matches: [live, otherCategory] }), 'c1');
    expect(rows.map((r) => r.matchId)).toEqual(['m1']);
  });

  it('sem categoria devolve o torneio inteiro', () => {
    const live = match({ id: 'm1', categoryId: 'c1', status: 'in progress' });
    const rows = liveRowsOf(ctxOf({ matches: [live] }), null);
    expect(rows.map((r) => r.matchId)).toEqual(['m1']);
  });
});

describe('standingLineOf / lossesOf', () => {
  it('devolve null sem teamId ou poolId', () => {
    expect(standingLineOf(ctxOf({ matches: [] }), '', 'pool-a')).toBeNull();
    expect(standingLineOf(ctxOf({ matches: [] }), 'teamMine', '')).toBeNull();
  });

  it('monta a linha de posição a partir da classificação e conta as derrotas encerradas no grupo', () => {
    const standings: GroupStanding[] = [
      { teamId: 'teamMine', wins: 2, losses: 1, setsWon: 4, setsLost: 2, gamesWon: 0, gamesLost: 0, points: 6 },
    ];
    const lost = match({ id: 'm1', poolId: 'pool-a', status: 'completed', teamAId: 'teamMine', teamBId: 'teamRival', winnerId: 'teamRival' });
    const ctx = ctxOf({ matches: [lost], standingsOf: () => standings });
    expect(standingLineOf(ctx, 'teamMine', 'pool-a')).toBe('1º do grupo · 2V 1D');
    expect(lossesOf(ctx, 'pool-a', 'teamMine')).toBe(1);
  });
});

describe('standingsViewOf', () => {
  it('devolve lista vazia sem grupo em foco', () => {
    expect(standingsViewOf(ctxOf({ matches: [] }), '', 2, null)).toEqual([]);
  });

  it('marca a linha do atleta e quem se classifica pela posição', () => {
    const standings: GroupStanding[] = [
      { teamId: 'teamMine', wins: 2, losses: 0, setsWon: 4, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 6 },
      { teamId: 'teamRival', wins: 0, losses: 2, setsWon: 0, setsLost: 4, gamesWon: 0, gamesLost: 0, points: 0 },
    ];
    const rows = standingsViewOf(ctxOf({ matches: [], standingsOf: () => standings }), 'pool-a', 1, 'teamMine');
    expect(rows[0]).toEqual(jasmine.objectContaining({ rank: 1, isMe: true, qualifies: true, wins: 2, sets: '4–0' }));
    expect(rows[1]).toEqual(jasmine.objectContaining({ rank: 2, isMe: false, qualifies: false }));
  });
});

describe('qualificationNoteOf', () => {
  it('sem grupo ou categoria em foco devolve null', () => {
    expect(qualificationNoteOf(ctxOf({ matches: [] }), '', null, null)).toBeNull();
  });

  it('grupo encerrado e classificado avisa em tom de vitória', () => {
    const standings: GroupStanding[] = [{ teamId: 'teamMine', wins: 2, losses: 0, setsWon: 4, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 6 }];
    const done = match({ id: 'm1', poolId: 'pool-a', status: 'completed', teamAId: 'teamMine', teamBId: 'teamRival', winnerId: 'teamMine' });
    const note = qualificationNoteOf(ctxOf({ matches: [done], standingsOf: () => standings }), 'pool-a', { qualifiersPerGroup: 1 }, 'teamMine');
    expect(note?.tone).toBe('win');
  });

  it('grupo em andamento avisa quantas partidas faltam', () => {
    const standings: GroupStanding[] = [{ teamId: 'teamMine', wins: 1, losses: 0, setsWon: 2, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 3 }];
    const pending = match({ id: 'm1', poolId: 'pool-a', status: 'Scheduled', teamAId: 'teamMine', teamBId: 'teamRival' });
    const note = qualificationNoteOf(ctxOf({ matches: [pending], standingsOf: () => standings }), 'pool-a', { qualifiersPerGroup: 2 }, 'teamMine');
    expect(note?.tone).toBe('neutral');
    expect(note?.text).toContain('Falta 1 partida no grupo');
  });
});
