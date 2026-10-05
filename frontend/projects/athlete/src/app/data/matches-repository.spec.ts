import { matchClosedSets, matchSetWins, setTargetPointsOf, withFallbackSport, type TournamentMatch } from './matches-repository';

function liveMatch(partial: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    status: 'In Progress',
    resultA: null,
    resultB: null,
    sets: [],
    liveScore: null,
    bestOf: 3,
    currentSetIndex: null,
    sport: null,
    ...partial,
  } as TournamentMatch;
}

describe('setTargetPointsOf (esporte)', () => {
  it('futevôlei: 18 nos sets regulares e 15 no decisivo de MD3', () => {
    expect(setTargetPointsOf(0, 3, 'footvolley')).toBe(18);
    expect(setTargetPointsOf(1, 3, 'footvolley')).toBe(18);
    expect(setTargetPointsOf(2, 3, 'footvolley')).toBe(15);
    expect(setTargetPointsOf(0, 1, 'footvolley')).toBe(18);
  });

  it('sem sport (partida antiga) ou outro esporte segue 21/15', () => {
    expect(setTargetPointsOf(0, 3)).toBe(21);
    expect(setTargetPointsOf(0, 3, null)).toBe(21);
    expect(setTargetPointsOf(0, 3, 'beachVolleyball')).toBe(21);
    expect(setTargetPointsOf(2, 3)).toBe(15);
  });
});

describe('sets fechados ao vivo por esporte', () => {
  const sets = [{ a: 18, b: 16 }, { a: 5, b: 3 }];

  it('futevôlei: 18×16 fecha o set 1 e o 5×3 segue em andamento', () => {
    const m = liveMatch({ sets, sport: 'footvolley' });
    expect(matchClosedSets(m)).toEqual([{ a: 18, b: 16 }]);
    expect(matchSetWins(m)).toEqual([1, 0]);
  });

  it('sem sport o mesmo 18×16 ainda não fechou (alvo 21)', () => {
    const m = liveMatch({ sets });
    expect(matchClosedSets(m)).toEqual([]);
    expect(matchSetWins(m)).toEqual([0, 0]);
  });
});

describe('withFallbackSport', () => {
  it('preenche só as partidas sem sport com o do torneio', () => {
    const out = withFallbackSport([liveMatch({ id: 'a' }), liveMatch({ id: 'b', sport: 'beachVolleyball' })], 'footvolley');
    expect(out.map((m) => m.sport)).toEqual(['footvolley', 'beachVolleyball']);
  });

  it('sem esporte no torneio devolve as partidas como estão', () => {
    expect(withFallbackSport([liveMatch({ id: 'a' })], null)[0]!.sport).toBeNull();
  });
});
