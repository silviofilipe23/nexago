import { liveMatchFromDoc } from '@nexago/live-scoring';
import { gamesFlagOf, gamesMainOf, gamesRuleLineOf } from './mesa-board';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };

function m(extra: Record<string, unknown>) {
  return liveMatchFromDoc('m', { teamAId: 'A', teamBId: 'B', status: 'In Progress', bestOf: 3, servingTeamId: 'A', ...extra });
}

describe('painel da mesa · partida de games', () => {
  it('partida de pontos não tem leitura de games', () => {
    const p = m({ sets: [{ a: 10, b: 8 }] });
    expect(gamesMainOf(p, 'A')).toBeNull();
    expect(gamesRuleLineOf(p)).toBeNull();
  });

  it('placar do game e bandeira de set', () => {
    const p = m({ scoringProfile: BT, sets: [{ a: 5, b: 0 }], currentSetIndex: 0, currentGame: { a: 3, b: 1 } });
    expect(gamesMainOf(p, 'A')).toBe('40');
    expect(gamesMainOf(p, 'B')).toBe('15');
    expect(gamesFlagOf(p, 'A')).toBe('set');
    expect(gamesFlagOf(p, 'B')).toBeNull();
    expect(gamesRuleLineOf(p)).toBe('1º set · até 6 games');
  });

  it('tie-break e super tie-break na linha da regra', () => {
    expect(gamesRuleLineOf(m({ scoringProfile: BT, sets: [{ a: 6, b: 6 }], currentSetIndex: 0 }))).toBe('1º set · tie-break até 7');
    expect(gamesRuleLineOf(m({ scoringProfile: BT, sets: [{ a: 6, b: 3 }, { a: 3, b: 6 }], currentSetIndex: 2 }))).toBe('3º set · super tie-break até 10');
  });
});
