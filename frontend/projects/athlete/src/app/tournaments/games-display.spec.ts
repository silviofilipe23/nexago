import { matchClosedDisplaySets, matchFromDoc, type TournamentMatch } from '../data/matches-repository';
import { mesaScoreLabel } from '../mesa/mesa-matches.selectors';
import { closedPartialsLabelOf, inProgressCaptionOf, liveScoreLineOf } from './tournament-format';
import { displaySetsOf, liveSideScoreOf } from './tournament-live.selectors';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: false, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };

function doc(extra: Record<string, unknown>): TournamentMatch {
  return matchFromDoc('m1', { tournamentId: 't', categoryId: 'c', teamAId: 'A', teamBId: 'B', status: 'In Progress', bestOf: 3, scoringProfile: BT, ...extra });
}

describe('exibição de partida de games (portal do atleta)', () => {
  it('linha ao vivo com o ponto do game', () => {
    const m = doc({ sets: [{ a: 6, b: 4 }, { a: 5, b: 4 }], currentSetIndex: 1, currentGame: { a: 3, b: 1 } });
    expect(liveScoreLineOf(m)).toBe('1–0 · 2º set 5-4 · 40-15');
    expect(mesaScoreLabel(m)).toBe('1×0 · 5-4 · 40-15');
  });

  it('tie-break em 6-6: pontos corridos na linha', () => {
    const m = doc({ sets: [{ a: 6, b: 6 }], currentSetIndex: 0, currentGame: { a: 4, b: 2 } });
    expect(liveScoreLineOf(m)).toBe('0–0 · 1º set 6-6 · 4-2');
  });

  it('legenda do set em andamento traz o ponto do game (detalhe da partida)', () => {
    const m = doc({ sets: [{ a: 6, b: 4 }, { a: 5, b: 4 }], currentSetIndex: 1, currentGame: { a: 3, b: 1 } });
    const live = displaySetsOf(m).at(-1)!;
    expect(inProgressCaptionOf(live, 'agora')).toBe('agora · 40-15');
    expect(inProgressCaptionOf({ index: 2, a: 14, b: 11, inProgress: true }, 'agora')).toBe('agora');
  });

  it('placar do lado na lista: super tie-break usa os pontos dele', () => {
    const stb = doc({ sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 0, b: 0 }], currentSetIndex: 2, currentGame: { a: 7, b: 5 } });
    expect(liveSideScoreOf(stb, 'A')).toEqual({ mine: 7, theirs: 5 });
    const pts = doc({ scoringProfile: null, sets: [{ a: 21, b: 15 }, { a: 14, b: 11 }], currentSetIndex: 1 });
    expect(liveSideScoreOf(pts, 'B')).toEqual({ mine: 11, theirs: 14 });
  });

  it('super tie-break em andamento: só os pontos dele', () => {
    const m = doc({ sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 0, b: 0 }], currentSetIndex: 2, currentGame: { a: 7, b: 5 } });
    expect(liveScoreLineOf(m)).toBe('1–1 · super tie-break 7-5');
    expect(mesaScoreLabel(m)).toBe('1×1 · 7-5');
    expect(displaySetsOf(m).at(-1)).toEqual({ index: 3, a: 7, b: 5, inProgress: true });
  });

  it('set novo 0-0 com o game começado aparece como em andamento', () => {
    const m = doc({ sets: [{ a: 6, b: 4 }, { a: 0, b: 0 }], currentSetIndex: 1, currentGame: { a: 1, b: 0 } });
    expect(displaySetsOf(m).at(-1)).toEqual({ index: 2, a: 0, b: 0, inProgress: true, game: { a: '15', b: '0' } });
  });

  it('encerrada: parciais com tie-break por extenso e super tie-break em pontos', () => {
    const m = doc({ status: 'Completed', winnerId: 'A', sets: [{ a: 6, b: 4 }, { a: 6, b: 7, tb: { a: 5, b: 7 } }, { a: 1, b: 0, tb: { a: 10, b: 8 } }] });
    expect(closedPartialsLabelOf(m)).toBe('6-4 · 6-7 (5-7) · 10-8');
    expect(displaySetsOf(m).map((s) => [s.a, s.b])).toEqual([[6, 4], [6, 7], [10, 8]]);
    expect(matchClosedDisplaySets(m)).toEqual([{ a: 6, b: 4 }, { a: 6, b: 7 }, { a: 10, b: 8 }]);
  });

  it('partida de pontos: igual a hoje', () => {
    const m = doc({ scoringProfile: null, sets: [{ a: 21, b: 15 }, { a: 14, b: 11 }], currentSetIndex: 1, currentGame: { a: 3, b: 1 } });
    expect(liveScoreLineOf(m)).toBe('1–0 · 2º set 14-11');
    expect(mesaScoreLabel(m)).toBe('1×0 · 14-11');
    expect(displaySetsOf(m).at(-1)).toEqual({ index: 2, a: 14, b: 11, inProgress: true });
    const done = doc({ scoringProfile: null, status: 'Completed', sets: [{ a: 21, b: 19, tb: { a: 7, b: 5 } }] });
    expect(closedPartialsLabelOf(done)).toBe('21-19');
  });
});
