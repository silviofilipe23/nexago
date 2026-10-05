import { effectiveScoringProfile } from '@nexago/sports';
import { placarPayload, placarRows } from './placar.component';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };

describe('placar · perfil de placar da partida', () => {
  it('partida de pontos: linhas e payload como hoje', () => {
    const p = effectiveScoringProfile(undefined, 3);
    expect(placarRows(p, [{ a: 21, b: 19 }, { a: 15, b: 21 }, { a: 15, b: 13 }]).map((r) => r.label))
      .toEqual(['até 21', 'até 21', 'até 15']);
    expect(placarPayload(p, [{ a: 21, b: 19, tb: { a: 1, b: 0 } }])).toEqual([{ a: 21, b: 19 }]);
  });

  it('beach tennis: tie-break em 7-6 e super tie-break no 3º set', () => {
    const p = effectiveScoringProfile(BT, 3);
    const sets = [{ a: 7, b: 6, tb: { a: 7, b: 3 } }, { a: 2, b: 6 }, { a: 0, b: 0, tb: { a: 10, b: 7 } }];
    expect(placarRows(p, sets).map((r) => r.kind)).toEqual(['games_tiebreak', 'games', 'super_tiebreak']);
    expect(placarPayload(p, sets)).toEqual([
      { a: 7, b: 6, tb: { a: 7, b: 3 } },
      { a: 2, b: 6 },
      { a: 1, b: 0, tb: { a: 10, b: 7 } },
    ]);
  });

  it('chip em MD1 numa partida de games valida com o perfil de games', () => {
    const p = effectiveScoringProfile(BT, 1);
    expect(placarRows(p, [{ a: 6, b: 3 }])[0]!.label).toBe('até 6 games');
  });
});
