import { buildGroupStandings, matchClosedSets, matchFromDoc, matchLiveCurrentSet, matchSetWins, type TournamentMatch } from './matches-repository';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: false, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };

function doc(extra: Record<string, unknown>): TournamentMatch {
  return matchFromDoc('m1', { tournamentId: 't', categoryId: 'c', teamAId: 'A', teamBId: 'B', status: 'In Progress', bestOf: 3, scoringProfile: BT, ...extra });
}

describe('placar por perfil · partida de games', () => {
  it('lê scoringProfile, tb e currentGame do doc', () => {
    const m = doc({ sets: [{ a: 7, b: 6, tb: { a: 7, b: 4 } }], currentGame: { a: 2, b: 1 } });
    expect(m.scoringProfile?.kind).toBe('sets_games');
    expect(m.sets).toEqual([{ a: 7, b: 6, tb: { a: 7, b: 4 } }]);
    expect(m.currentGame).toEqual({ a: 2, b: 1 });
  });

  it('6-4 fecha o set; o game em andamento vem em 0/15/30/40', () => {
    const m = doc({ sets: [{ a: 6, b: 4 }, { a: 2, b: 1 }], currentSetIndex: 1, currentGame: { a: 3, b: 1 } });
    expect(matchSetWins(m)).toEqual([1, 0]);
    expect(matchClosedSets(m)).toEqual([{ a: 6, b: 4 }]);
    expect(matchLiveCurrentSet(m)).toEqual({ setNumber: 2, a: 2, b: 1, game: { a: '40', b: '15' }, tiebreak: false });
  });

  it('5-4 não fecha; 6-6 em tie-break mostra pontos corridos', () => {
    expect(matchSetWins(doc({ sets: [{ a: 5, b: 4 }], currentSetIndex: 0 }))).toEqual([0, 0]);
    const tb = doc({ sets: [{ a: 6, b: 6 }], currentSetIndex: 0, currentGame: { a: 4, b: 2 } });
    expect(matchLiveCurrentSet(tb)).toEqual({ setNumber: 1, a: 6, b: 6, game: { a: '4', b: '2' }, tiebreak: true });
  });

  it('partida de pontos: igual a hoje, sem game', () => {
    const m = doc({ scoringProfile: null, sets: [{ a: 21, b: 15 }, { a: 14, b: 11 }], currentSetIndex: 1, currentGame: { a: 3, b: 1 } });
    expect(matchSetWins(m)).toEqual([1, 0]);
    expect(matchLiveCurrentSet(m)).toEqual({ setNumber: 2, a: 14, b: 11 });
  });
});

describe('buildGroupStandings · critério por tipo', () => {
  /** Ciclo A>B, B>C, C>A: A e B empatam em vitórias e saldo de games (+3); B tem saldo de sets
   *  maior, A venceu o confronto direto. Mesmo caso de `functions/src/group-standings.test.ts`. */
  function cycle(profile: unknown): TournamentMatch[] {
    const m = (a: string, b: string, winnerId: string, sets: unknown[]) =>
      matchFromDoc(`${a}${b}`, { categoryId: 'c', poolId: 'P', teamAId: a, teamBId: b, winnerId, status: 'Completed', isGroupMatch: true, bestOf: 3, scoringProfile: profile, sets });
    return [
      m('A', 'B', 'A', [{ a: 4, b: 6 }, { a: 6, b: 4 }, { a: 1, b: 0 }]),
      m('B', 'C', 'B', [{ a: 6, b: 4 }, { a: 6, b: 4 }]),
      m('A', 'C', 'C', [{ a: 6, b: 2 }, { a: 6, b: 7 }, { a: 0, b: 1 }]),
    ];
  }

  it('games: saldo de sets antes do confronto direto', () => {
    expect(buildGroupStandings(cycle(BT), 'c', 'P').map((r) => r.teamId)).toEqual(['B', 'A', 'C']);
  });

  it('pontos: saldo de pontos e confronto direto, como sempre', () => {
    expect(buildGroupStandings(cycle(null), 'c', 'P').map((r) => r.teamId)).toEqual(['A', 'B', 'C']);
  });
});
