import {
  deriveTeamGender,
  normalizeRankingGender,
  rankingEntryOf,
  teamFormatOf,
  type RankingParticipant,
} from './ranking-positions';

function p(over: Partial<RankingParticipant> & { id: string; points: number }): RankingParticipant {
  return { tournaments: 1, sport: 'beachVolleyball', gender: 'female', format: null, ...over };
}

describe('rankingEntryOf', () => {
  const todos: RankingParticipant[] = [
    p({ id: 'h1', points: 900, gender: 'male' }),
    p({ id: 'a', points: 800, tournaments: 6 }),
    p({ id: 'b', points: 700 }),
    p({ id: 'bt', points: 750, sport: 'beachTennis' }),
    p({ id: 'c', points: 500 }),
    p({ id: 'sem', points: 600, gender: null }),
  ];

  it('posição conta só o mesmo esporte e o mesmo gênero — o recorte que o app mostra', () => {
    expect(rankingEntryOf(todos, 'a')).toEqual({ position: 1, points: 800, tournaments: 6 });
    expect(rankingEntryOf(todos, 'b')?.position).toBe(2);
    expect(rankingEntryOf(todos, 'c')?.position).toBe(3);
    expect(rankingEntryOf(todos, 'bt')?.position).toBe(1);
    expect(rankingEntryOf(todos, 'h1')?.position).toBe(1);
  });

  it('gênero desconhecido só existe no recorte "Todos" — conta todo mundo do esporte', () => {
    expect(rankingEntryOf(todos, 'sem')?.position).toBe(4);
  });

  it('dupla e equipe disputam no próprio formato', () => {
    const times = [
      p({ id: 'trio', points: 999, format: 'trio' }),
      p({ id: 'd1', points: 500, format: 'dupla' }),
      p({ id: 'd2', points: 400, format: 'dupla' }),
    ];
    expect(rankingEntryOf(times, 'd2')?.position).toBe(2);
    expect(rankingEntryOf(times, 'trio')?.position).toBe(1);
  });

  it('empate fica na ordem de chegada, como no app', () => {
    const empate = [p({ id: 'x', points: 100 }), p({ id: 'y', points: 100 })];
    expect(rankingEntryOf(empate, 'y')?.position).toBe(2);
  });

  it('fora do ranking não tem posição', () => {
    expect(rankingEntryOf(todos, 'nada')).toBeNull();
  });
});

describe('normalizeRankingGender / deriveTeamGender / teamFormatOf', () => {
  it('lê as grafias reais dos docs', () => {
    expect(normalizeRankingGender('Feminino')).toBe('female');
    expect(normalizeRankingGender('m')).toBe('male');
    expect(normalizeRankingGender('Mista')).toBe('mixed');
    expect(normalizeRankingGender('')).toBeNull();
  });

  it('gênero do doc vence; sem ele deriva do elenco', () => {
    expect(deriveTeamGender('Masculino', ['Feminino'])).toBe('male');
    expect(deriveTeamGender(null, ['Feminino', 'f'])).toBe('female');
    expect(deriveTeamGender(null, ['Feminino', 'Masculino'])).toBe('mixed');
    expect(deriveTeamGender(null, [null])).toBeNull();
  });

  it('teamSize vence; sem ele, o tamanho do elenco', () => {
    expect(teamFormatOf(4, 2)).toBe('quarteto');
    expect(teamFormatOf(null, 3)).toBe('trio');
    expect(teamFormatOf(null, 2)).toBe('dupla');
    expect(teamFormatOf(null, 7)).toBe('quinteto');
  });
});
