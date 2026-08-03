import { buildGroupStandings, type MatchSet, type TournamentMatch } from './matches-repository';

function matchOf(over: Partial<TournamentMatch> & { poolId: string; teamAId: string; teamBId: string }): TournamentMatch {
  return {
    id: 'm',
    tournamentId: 't',
    categoryId: 'c',
    round: 1,
    matchType: 'group',
    teamADescription: null,
    teamBDescription: null,
    status: 'scheduled',
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
    ...over,
  };
}

function completed(poolId: string, a: string, b: string, sets: MatchSet[], winnerId: string): TournamentMatch {
  return matchOf({ poolId, teamAId: a, teamBId: b, sets, winnerId, status: 'completed' });
}

describe('buildGroupStandings', () => {
  it('lista todas as duplas sorteadas no grupo antes de qualquer resultado', () => {
    const matches = [
      matchOf({ poolId: 'A', teamAId: 't1', teamBId: 't2' }),
      matchOf({ poolId: 'A', teamAId: 't3', teamBId: 't1' }),
    ];

    const rows = buildGroupStandings(matches, 'A');

    expect(rows.map((r) => r.teamId).sort()).toEqual(['t1', 't2', 't3']);
    expect(rows.every((r) => r.wins === 0 && r.losses === 0 && r.points === 0)).toBe(true);
  });

  it('não cria linha para slot ainda sem dupla', () => {
    const rows = buildGroupStandings([matchOf({ poolId: 'A', teamAId: 't1', teamBId: '' })], 'A');

    expect(rows.map((r) => r.teamId)).toEqual(['t1']);
  });

  it('ignora partidas de outros grupos', () => {
    const matches = [matchOf({ poolId: 'A', teamAId: 't1', teamBId: 't2' }), matchOf({ poolId: 'B', teamAId: 't8', teamBId: 't9' })];

    expect(buildGroupStandings(matches, 'A').map((r) => r.teamId).sort()).toEqual(['t1', 't2']);
  });

  it('conta vitória, derrota, sets e games só das partidas encerradas', () => {
    const matches = [
      completed('A', 't1', 't2', [{ a: 21, b: 15 }, { a: 18, b: 21 }, { a: 15, b: 12 }], 't1'),
      matchOf({ poolId: 'A', teamAId: 't1', teamBId: 't3', sets: [{ a: 10, b: 4 }] }),
    ];

    const [first] = buildGroupStandings(matches, 'A');

    expect(first).toEqual(jasmine.objectContaining({ teamId: 't1', wins: 1, losses: 0, setsWon: 2, setsLost: 1, points: 2 }));
    expect(first!.gamesWon).toBe(54);
    expect(first!.gamesLost).toBe(48);
  });

  it('registra a derrota de quem perdeu', () => {
    const rows = buildGroupStandings([completed('A', 't1', 't2', [{ a: 21, b: 15 }, { a: 21, b: 17 }], 't1')], 'A');
    const loser = rows.find((r) => r.teamId === 't2');

    expect(loser).toEqual(jasmine.objectContaining({ wins: 0, losses: 1, setsWon: 0, setsLost: 2 }));
  });

  it('ordena por vitórias, depois saldo de sets, depois saldo de games', () => {
    const matches = [
      completed('A', 't1', 't2', [{ a: 21, b: 10 }, { a: 21, b: 10 }], 't1'),
      completed('A', 't3', 't2', [{ a: 21, b: 19 }, { a: 19, b: 21 }, { a: 15, b: 13 }], 't3'),
    ];

    // t1 e t3 têm 1 vitória; t1 fecha em 2 sets (saldo +2) e t3 em 3 (saldo +1).
    expect(buildGroupStandings(matches, 'A').map((r) => r.teamId)).toEqual(['t1', 't3', 't2']);
  });

  it('aproveita o placar legado gravado em resultA/resultB', () => {
    const legacy = matchOf({
      poolId: 'A',
      teamAId: 't1',
      teamBId: 't2',
      status: 'completed',
      winnerId: 't1',
      resultA: '21,21',
      resultB: '15,12',
    });

    const winner = buildGroupStandings([legacy], 'A').find((r) => r.teamId === 't1');

    expect(winner).toEqual(jasmine.objectContaining({ setsWon: 2, setsLost: 0, gamesWon: 42, gamesLost: 27 }));
  });
});
