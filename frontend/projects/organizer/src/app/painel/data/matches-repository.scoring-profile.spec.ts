import { rawMatchFromDoc } from './matches-repository';

describe('rawMatchFromDoc · perfil de placar e tie-break', () => {
  it('lê o perfil carimbado e preserva o tb dos sets', () => {
    const r = rawMatchFromDoc('m1', {
      tournamentId: 't1',
      teamAId: 'A',
      teamBId: 'B',
      scoringProfile: { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 },
      sets: [{ a: 7, b: 6, tb: { a: 7, b: 4 } }, { a: 6, b: 2 }],
    });
    expect(r.scoringProfile?.kind).toBe('sets_games');
    expect(r.sets[0]).toEqual({ a: 7, b: 6, tb: { a: 7, b: 4 } });
    expect(r.sets[1]).toEqual({ a: 6, b: 2 });
  });

  it('partida sem carimbo: perfil nulo', () => {
    expect(rawMatchFromDoc('m1', { tournamentId: 't1' }).scoringProfile).toBeNull();
  });
});
