import type { LivePointEvent } from '@nexago/live-scoring';
import { matchFromDoc, type TournamentMatch } from '../../data/matches-repository';
import { pointByPointSetsOf, type PointByPointSet } from './match-point-by-point';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };

function doc(extra: Record<string, unknown>): TournamentMatch {
  return matchFromDoc('m1', { tournamentId: 't', categoryId: 'c', teamAId: 'A', teamBId: 'B', status: 'In Progress', bestOf: 3, scoringProfile: BT, ...extra });
}

function ev(seq: number, side: 'A' | 'B', setIndex: number, score: [number, number], game: [number, number], type = 'point'): LivePointEvent {
  return { id: `e${seq}`, seq, type, side, setIndex, scoreA: score[0], scoreB: score[1], gameA: game[0], gameB: game[1], ts: null };
}

const texts = (s: PointByPointSet) => s.blocks.flatMap((b) => b.points).map((p) => p.text ?? `${p.left}-${p.right}`);

describe('ponto a ponto · partida de games', () => {
  it('cada ponto do game é uma linha (games iguais não são escrita repetida)', () => {
    const events = [ev(1, 'A', 0, [0, 0], [1, 0]), ev(2, 'A', 0, [0, 0], [2, 0]), ev(3, 'B', 0, [0, 0], [2, 1]), ev(4, 'A', 0, [0, 0], [3, 1]), ev(5, 'A', 0, [1, 0], [0, 0])];
    const [set] = pointByPointSetsOf({ match: doc({ sets: [{ a: 1, b: 0 }], currentSetIndex: 0 }), events, mySide: 'A' });
    expect(texts(set!)).toEqual(['0-0 · 15-0', '0-0 · 30-0', '0-0 · 30-15', '0-0 · 40-15', '1-0']);
    expect(set!.missingCount).toBe(0);
  });

  it('na ótica do lado B as colunas trocam', () => {
    const events = [ev(1, 'B', 0, [2, 3], [0, 1])];
    const [set] = pointByPointSetsOf({ match: doc({ sets: [{ a: 2, b: 3 }], currentSetIndex: 0 }), events, mySide: 'B' });
    expect(texts(set!)).toEqual(['3-2 · 15-0']);
  });

  it('ponto que fecha o set ganha o selo; super tie-break mostra os pontos e fecha em 10-8', () => {
    const events = [ev(1, 'A', 0, [6, 4], [0, 0]), ev(2, 'A', 2, [0, 0], [9, 8]), ev(3, 'A', 2, [1, 0], [0, 0])];
    const sets = pointByPointSetsOf({
      match: doc({ status: 'Completed', winnerId: 'A', sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 1, b: 0, tb: { a: 10, b: 8 } }] }),
      events,
      mySide: 'A',
    });
    const first = sets.find((s) => s.setIndex === 0)!;
    expect(first.blocks.flatMap((b) => b.points).at(-1)!.closesSet).toBeTrue();
    const stb = sets.find((s) => s.setIndex === 2)!;
    expect(texts(stb)).toEqual(['9-8', '10-8']);
    expect(stb.blocks.flatMap((b) => b.points).at(-1)!.closesSet).toBeTrue();
  });

  it('pendência contada em games', () => {
    const events = [ev(1, 'A', 0, [3, 2], [0, 0])];
    const [set] = pointByPointSetsOf({ match: doc({ sets: [{ a: 3, b: 2 }], currentSetIndex: 0 }), events, mySide: 'A' });
    expect(set!.missingCount).toBe(4);
    expect(set!.missingUnit).toBe('games');
  });

  it('tie-break normal: o 7-6 fecha o set (tb do doc)', () => {
    const events = [ev(1, 'A', 0, [6, 6], [6, 3]), ev(2, 'A', 0, [7, 6], [0, 0])];
    const [set] = pointByPointSetsOf({ match: doc({ status: 'Completed', winnerId: 'A', sets: [{ a: 7, b: 6, tb: { a: 7, b: 3 } }, { a: 6, b: 0 }] }), events, mySide: 'A' });
    const rows = set!.blocks.flatMap((b) => b.points);
    expect(texts(set!)).toEqual(['6-6 · 6-3', '7-6']);
    expect(rows.at(-1)!.closesSet).toBeTrue();
  });
});

