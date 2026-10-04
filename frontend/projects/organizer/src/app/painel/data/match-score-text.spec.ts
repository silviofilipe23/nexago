import { rawMatchFromDoc } from './matches-repository';
import { bracketSetsWonOf } from '../chaveamento/chaveamento.component';
import type { TournamentMatch } from './matches-repository';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };

describe('placar textual da partida (chave, jogos, grupos, agenda, página pública)', () => {
  it('games: tie-break por extenso e super tie-break com os pontos dele', () => {
    const raw = rawMatchFromDoc('m1', { status: 'Completed', bestOf: 3, scoringProfile: BT, sets: [{ a: 6, b: 4 }, { a: 6, b: 7, tb: { a: 5, b: 7 } }, { a: 1, b: 0, tb: { a: 10, b: 8 } }] });
    expect(raw.score).toBe('6-4, 6-7 (5-7), 10-8');
  });

  it('pontos: igual a hoje', () => {
    const raw = rawMatchFromDoc('m1', { status: 'Completed', bestOf: 3, sets: [{ a: 21, b: 15 }, { a: 18, b: 21 }] });
    expect(raw.score).toBe('21-15, 18-21');
  });
});

describe('bracketSetsWonOf (número do card da chave)', () => {
  const m = (o: Partial<TournamentMatch>) => ({ status: 'completed', bestOf: 3, sets: [], score: null, liveScore: null, currentSetIndex: null, ...o }) as unknown as TournamentMatch;

  it('games: conta pelo perfil, inclusive com tie-break no texto', () => {
    expect(bracketSetsWonOf(m({ scoringProfile: BT as never, sets: [{ a: 6, b: 4 }, { a: 6, b: 7, tb: { a: 5, b: 7 } }, { a: 1, b: 0, tb: { a: 10, b: 8 } }], score: '6-4, 6-7 (5-7), 10-8' }))).toEqual([2, 1]);
  });

  it('games ao vivo: o set em andamento não conta', () => {
    expect(bracketSetsWonOf(m({ status: 'in_progress', scoringProfile: BT as never, sets: [{ a: 6, b: 4 }, { a: 2, b: 1 }], currentSetIndex: 1, score: '6-4, 2-1' }))).toEqual([1, 0]);
  });

  it('pontos: lê o placar textual como sempre', () => {
    expect(bracketSetsWonOf(m({ sets: [{ a: 21, b: 15 }, { a: 18, b: 21 }], score: '21-15, 18-21' }))).toEqual([1, 1]);
    expect(bracketSetsWonOf(m({ score: null }))).toBeNull();
  });
});
