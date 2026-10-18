import {
  arenaCount,
  citiesByCount,
  mapSquadAmbassador,
  matchesFilter,
  placeLabel,
  regionLabel,
  sortAmbassadors,
  squadCodeLink,
  tierCounts,
  type SquadAmbassador,
} from './squad';

function amb(over: Partial<SquadAmbassador> & Pick<SquadAmbassador, 'id'>): SquadAmbassador {
  return {
    name: 'Atleta',
    photoUrl: null,
    tier: 'ath',
    code: 'ATLETA10',
    city: 'Goiânia',
    state: 'GO',
    arenaName: null,
    sport: null,
    elo: null,
    eloIndex: null,
    tournaments: null,
    ...over,
  };
}

describe('mapSquadAmbassador', () => {
  it('lê o espelho público', () => {
    const a = mapSquadAmbassador('joao', {
      name: 'João Victor', photoUrl: 'https://cdn/joao.jpg', tier: 'amb', code: 'JOAO10', city: 'Goiânia',
      state: 'GO', arenaName: 'Arena Errejota', sport: 'beachTennis', elo: 'Elite II', eloIndex: 10, tournaments: 12,
    });
    expect(a).toEqual({
      id: 'joao', name: 'João Victor', photoUrl: 'https://cdn/joao.jpg', tier: 'amb', code: 'JOAO10', city: 'Goiânia',
      state: 'GO', arenaName: 'Arena Errejota', sport: 'beachTennis', elo: 'Elite II', eloIndex: 10, tournaments: 12,
    });
  });

  it('descarta doc sem nome, com nível desconhecido ou código inválido', () => {
    expect(mapSquadAmbassador('x', { tier: 'amb', code: 'JOAO10' })).toBeNull();
    expect(mapSquadAmbassador('x', { name: 'A', tier: 'vip', code: 'JOAO10' })).toBeNull();
    expect(mapSquadAmbassador('x', { name: 'A', tier: 'amb', code: 'jo' })).toBeNull();
  });

  it('foto sem http(s) e números estranhos viram nulo', () => {
    const a = mapSquadAmbassador('x', {
      name: 'A', tier: 'ath', code: 'ANA10', photoUrl: 'javascript:alert(1)', tournaments: -2, eloIndex: 1.5,
    })!;
    expect(a.photoUrl).toBeNull();
    expect(a.tournaments).toBeNull();
    expect(a.eloIndex).toBeNull();
  });
});

describe('squadCodeLink', () => {
  it('aponta para o portal do atleta com ?squad=, que a atribuição já entende', () => {
    expect(squadCodeLink('JOAO10')).toBe('https://atleta.nexago.com.br/?squad=JOAO10');
  });
});

describe('sortAmbassadors', () => {
  it('Pro → Captain → Ambassador → Athlete; dentro do nível, Elo e depois torneios', () => {
    const list = [
      amb({ id: 'ath', tier: 'ath', eloIndex: 15 }),
      amb({ id: 'amb-baixo', tier: 'amb', eloIndex: 3 }),
      amb({ id: 'amb-alto', tier: 'amb', eloIndex: 9 }),
      amb({ id: 'cap', tier: 'cap' }),
      amb({ id: 'pro', tier: 'pro' }),
      amb({ id: 'amb-sem-elo', tier: 'amb', tournaments: 30 }),
    ];
    expect(sortAmbassadors(list).map((a) => a.id)).toEqual(['pro', 'cap', 'amb-alto', 'amb-baixo', 'amb-sem-elo', 'ath']);
  });
});

describe('filtros', () => {
  const list = [
    amb({ id: 'a', name: 'Ana Clara Dias', tier: 'ath', city: 'Goiânia', arenaName: 'Arena Errejota', code: 'ANA10' }),
    amb({ id: 'b', name: 'Rayssa Brito', tier: 'pro', city: 'Brasília', arenaName: 'Arena Lago', code: 'RAYSSA10' }),
    amb({ id: 'c', name: 'Marcos Reis', tier: 'cap', city: 'Goiânia', arenaName: 'Arena CFC', code: 'MARCOS10' }),
    amb({ id: 'd', name: 'Carla Mendes', tier: 'amb', city: 'Brasília', arenaName: 'arena lago', code: 'CARLA10' }),
    amb({ id: 'e', name: 'Bruno Reis', tier: 'ath', city: 'Goiânia', arenaName: null, code: 'BRUNO10' }),
  ];

  it('busca por nome, arena, cidade ou código, sem acento nem caixa', () => {
    const q = (query: string) => list.filter((a) => matchesFilter(a, { tier: 'all', city: null, query })).map((a) => a.id);
    expect(q('reis')).toEqual(['c', 'e']);
    expect(q('ERREJOTA')).toEqual(['a']);
    expect(q('brasilia')).toEqual(['b', 'd']);
    expect(q('rayssa10')).toEqual(['b']);
    expect(q('  ')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('nível e cidade combinam', () => {
    const out = list.filter((a) => matchesFilter(a, { tier: 'ath', city: 'Goiânia', query: '' }));
    expect(out.map((a) => a.id)).toEqual(['a', 'e']);
  });

  it('conta por nível, cidades da mais para a menos representada, arenas sem repetir', () => {
    expect(tierCounts(list)).toEqual({ all: 5, pro: 1, cap: 1, amb: 1, ath: 2 });
    expect(citiesByCount(list)).toEqual(['Goiânia', 'Brasília']);
    expect(arenaCount(list)).toBe(3);
    expect(regionLabel(list)).toBe('Goiânia, Brasília e região');
    expect(regionLabel([list[0]!])).toBe('Goiânia e região');
    expect(regionLabel([])).toBe('');
  });

  it('local = cidade · arena; sem cidade cai para a UF', () => {
    expect(placeLabel(list[1]!)).toBe('Brasília · Arena Lago');
    expect(placeLabel(amb({ id: 'x', city: null, state: 'GO', arenaName: 'Arena CFC' }))).toBe('GO · Arena CFC');
    expect(placeLabel(amb({ id: 'x', city: null, state: null }))).toBe('');
  });
});
