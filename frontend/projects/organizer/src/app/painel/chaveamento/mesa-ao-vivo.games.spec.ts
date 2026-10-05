import { liveMatchFromDoc } from '@nexago/live-scoring';
import { mesaGamesView } from './mesa-ao-vivo.component';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };
const TENNIS = { ...BT, noAd: false, decidingSet: 'full' };

function doc(extra: Record<string, unknown>): Record<string, unknown> {
  return { teamAId: 'A', teamBId: 'B', status: 'In Progress', bestOf: 3, servingTeamId: 'A', ...extra };
}

describe('mesa ao vivo · exibição de games', () => {
  it('partida de pontos não tem visão de games', () => {
    expect(mesaGamesView(liveMatchFromDoc('m', doc({ sets: [{ a: 10, b: 8 }] })))).toBeNull();
  });

  it('game com vantagem mostra AD/40 e os games do set', () => {
    const v = mesaGamesView(liveMatchFromDoc('m', doc({ scoringProfile: TENNIS, sets: [{ a: 3, b: 2 }], currentSetIndex: 0, currentGame: { a: 4, b: 3 } })))!;
    expect([v.mainA, v.mainB]).toEqual(['AD', '40']);
    expect([v.gamesA, v.gamesB]).toEqual([3, 2]);
    expect(v.rulesLabel).toBe('até 6 games');
    expect(v.tiebreak).toBeFalse();
  });

  it('tie-break em 6-6 mostra os pontos e avisa no rótulo', () => {
    const v = mesaGamesView(liveMatchFromDoc('m', doc({ scoringProfile: BT, sets: [{ a: 6, b: 6 }], currentSetIndex: 0, currentGame: { a: 3, b: 2 } })))!;
    expect([v.mainA, v.mainB]).toEqual(['3', '2']);
    expect(v.rulesLabel).toBe('até 6 games · tie-break até 7');
    expect(v.tiebreak).toBeTrue();
    expect(v.hint).toBe('tie-break');
  });

  it('set decisivo de beach tennis é super tie-break', () => {
    const v = mesaGamesView(liveMatchFromDoc('m', doc({ scoringProfile: BT, sets: [{ a: 6, b: 3 }, { a: 3, b: 6 }], currentSetIndex: 2, currentGame: { a: 9, b: 8 } })))!;
    expect(v.rulesLabel).toBe('super tie-break até 10');
    expect(v.hint).toBe('match point');
  });
});
