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

/** 14:00 em São Paulo (UTC-3) no dia 29/08/2026 — o "agora" fixo usado nos testes que precisam dele. */
const NOW = new Date('2026-08-29T14:00:00Z');

function ctxOf(partial: Partial<FocusViewContext> & Pick<FocusViewContext, 'matches'>): FocusViewContext {
  return {
    myTeamIds: new Set(['teamMine']),
    duoNameOf: (teamId, fallback) => (teamId ? `Dupla ${teamId}` : (fallback ?? 'A definir')),
    duoPlayersOf: () => [
      { initial: 'MA', photo: null },
      { initial: 'EN', photo: null },
    ],
    isMyTeam: (teamId) => teamId === 'teamMine',
    standingsOf: (): GroupStanding[] => [],
    nextMatch: null,
    ...partial,
  };
}

describe('nextMatchViewOf', () => {
  it('devolve null sem próxima partida', () => {
    expect(nextMatchViewOf(ctxOf({ matches: [] }), NOW)).toBeNull();
  });

  it('monta horário, quadra e lados a partir da partida', () => {
    const m = match({ id: 'm1', teamAId: 'teamMine', teamBId: 'teamRival', courtName: '3', scheduleTime: new Date('2026-08-29T15:10:00Z') });
    const view = nextMatchViewOf(ctxOf({ matches: [m], nextMatch: m }), NOW);
    expect(view?.matchId).toBe('m1');
    expect(view?.courtLabel).toBe('Quadra 3');
    expect(view?.sideA.isMe).toBe(true);
    expect(view?.sideB.isMe).toBe(false);
  });

  it('em quadra não mostra contagem regressiva', () => {
    const m = match({ id: 'm1', status: 'in progress', teamAId: 'teamMine', teamBId: 'teamRival', scheduleTime: new Date('2026-08-29T13:00:00Z') });
    const view = nextMatchViewOf(ctxOf({ matches: [m], nextMatch: m }), NOW);
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
    const [entry] = timelineOf(ctxOf({ matches: [done] }), [done]);
    expect(entry?.state).toBe('done');
    expect(entry?.outcome).toBe('win');
  });

  it('marca como "next" a partida que é a próxima do atleta', () => {
    const upcoming = match({ id: 'm2', teamAId: 'teamMine', teamBId: 'teamRival', scheduleTime: new Date('2026-08-29T15:00:00Z') });
    const [entry] = timelineOf(ctxOf({ matches: [upcoming], nextMatch: upcoming }), [upcoming]);
    expect(entry?.state).toBe('next');
  });

  it('inverte o placar quando o atleta está do lado B — mySetLine não pode ficar sob o lado A', () => {
    const done = match({
      id: 'm1',
      status: 'completed',
      teamAId: 'teamRival',
      teamBId: 'teamMine',
      winnerId: 'teamMine',
      sets: [
        { a: 15, b: 21 },
        { a: 19, b: 21 },
      ],
      scheduleTime: new Date('2026-08-29T12:00:00Z'),
    });
    const [entry] = timelineOf(ctxOf({ matches: [done] }), [done]);
    expect(entry?.outcome).toBe('win');
    expect(entry?.outcomeLabel).toBe('V 2–0');
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

  it('losses vem das partidas encerradas do grupo, não do campo bruto da classificação', () => {
    // O campo `losses` do standing bruto propositalmente NÃO bate com a contagem real — se
    // `standingsViewOf` algum dia passar a repassar `s.losses` direto em vez de recalcular via
    // `lossesOf`, este teste denuncia.
    const standings: GroupStanding[] = [{ teamId: 'teamMine', wins: 2, losses: 5, setsWon: 4, setsLost: 2, gamesWon: 0, gamesLost: 0, points: 6 }];
    const lost = match({ id: 'm1', poolId: 'pool-a', status: 'completed', teamAId: 'teamMine', teamBId: 'teamRival', winnerId: 'teamRival' });
    const rows = standingsViewOf(ctxOf({ matches: [lost], standingsOf: () => standings }), 'pool-a', 1, 'teamMine');
    expect(rows[0]?.losses).toBe(1);
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
    expect(note).toEqual({ tone: 'win', text: 'Grupo encerrado em 1º. Você avançou para o mata-mata.' });
  });

  it('grupo encerrado sem classificar avisa quantos passaram, em tom neutro', () => {
    const standings: GroupStanding[] = [
      { teamId: 'teamRival', wins: 2, losses: 0, setsWon: 4, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 6 },
      { teamId: 'teamMine', wins: 0, losses: 2, setsWon: 0, setsLost: 4, gamesWon: 0, gamesLost: 0, points: 0 },
    ];
    const done = match({ id: 'm1', poolId: 'pool-a', status: 'completed', teamAId: 'teamMine', teamBId: 'teamRival', winnerId: 'teamRival' });
    const note = qualificationNoteOf(ctxOf({ matches: [done], standingsOf: () => standings }), 'pool-a', { qualifiersPerGroup: 1 }, 'teamMine');
    expect(note).toEqual({ tone: 'neutral', text: 'Grupo encerrado em 2º. Passavam os 1 primeiros.' });
  });

  it('grupo em andamento avisa quantas partidas faltam', () => {
    const standings: GroupStanding[] = [{ teamId: 'teamMine', wins: 1, losses: 0, setsWon: 2, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 3 }];
    const pending = match({ id: 'm1', poolId: 'pool-a', status: 'Scheduled', teamAId: 'teamMine', teamBId: 'teamRival' });
    const note = qualificationNoteOf(ctxOf({ matches: [pending], standingsOf: () => standings }), 'pool-a', { qualifiersPerGroup: 2 }, 'teamMine');
    expect(note?.tone).toBe('neutral');
    expect(note?.text).toContain('Falta 1 partida no grupo');
  });
});
