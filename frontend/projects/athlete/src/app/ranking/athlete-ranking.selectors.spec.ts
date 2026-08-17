import type { RankingParticipant } from './athlete-ranking.models';
import {
  CITY_ALL,
  deriveTeamGender,
  hasSearchQuery,
  normalizeRankingGender,
  rankParticipants,
  searchRanking,
  teamFormatOf,
  athleteProfileLink,
  teamProfileLink,
  type RankingSlice,
} from './athlete-ranking.selectors';

function participant(partial: Partial<RankingParticipant> & Pick<RankingParticipant, 'id' | 'points'>): RankingParticipant {
  return {
    name: `Atleta ${partial.id}`,
    city: 'Goiânia',
    level: 'Iniciante 1',
    sport: 'beachVolleyball',
    gender: null,
    format: null,
    trend: 0,
    avatars: [{ url: null, initials: 'AT' }],
    profileLink: null,
    ...partial,
  };
}

const ALL_SPORTS: RankingSlice = { sport: 'beachVolleyball', level: 'all', city: CITY_ALL, gender: 'all', format: 'all' };

/** Ranking com 5 atletas de vôlei de praia: 100, 80, 60, 40 e 20 pontos. */
function sample(): RankingParticipant[] {
  return [
    participant({ id: 'c', points: 60, name: 'Carlos Prado' }),
    participant({ id: 'a', points: 100, name: 'Ana Souza' }),
    participant({ id: 'e', points: 20, name: 'Eva Lima', city: 'Aparecida de Goiânia', level: 'Open' }),
    participant({ id: 'b', points: 80, name: 'Bruno 22', level: 'Open' }),
    participant({ id: 'd', points: 40, name: 'Diego 22' }),
  ];
}

describe('rankParticipants', () => {
  it('numera 1..N por pontos decrescentes', () => {
    const ranked = rankParticipants(sample(), ALL_SPORTS);

    expect(ranked.map((r) => [r.rank, r.id])).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
      [4, 'd'],
      [5, 'e'],
    ]);
  });

  it('descarta outros esportes', () => {
    const rows = [...sample(), participant({ id: 'x', points: 999, sport: 'beachTennis' })];

    expect(rankParticipants(rows, ALL_SPORTS).some((r) => r.id === 'x')).toBe(false);
  });

  it('renumera dentro do recorte de cidade', () => {
    const ranked = rankParticipants(sample(), { ...ALL_SPORTS, city: 'Aparecida de Goiânia' });

    expect(ranked).toEqual([jasmine.objectContaining({ id: 'e', rank: 1 })]);
  });

  it('renumera dentro do recorte de categoria', () => {
    const ranked = rankParticipants(sample(), { ...ALL_SPORTS, level: 'Open' });

    expect(ranked.map((r) => [r.rank, r.id])).toEqual([
      [1, 'b'],
      [2, 'e'],
    ]);
  });

  it('renumera dentro do recorte de gênero; sem gênero conhecido só entra em "Todos"', () => {
    const rows = [
      participant({ id: 'f1', points: 50, gender: 'female' }),
      participant({ id: 'm1', points: 100, gender: 'male' }),
      participant({ id: 'f2', points: 80, gender: 'female' }),
      participant({ id: 'na', points: 90, gender: null }),
    ];

    expect(rankParticipants(rows, { ...ALL_SPORTS, gender: 'female' }).map((r) => [r.rank, r.id])).toEqual([
      [1, 'f2'],
      [2, 'f1'],
    ]);
    expect(rankParticipants(rows, ALL_SPORTS).length).toBe(4);
  });

  it('renumera dentro do recorte de formato; linha sem formato (individual) só entra em "Todos"', () => {
    const rows = [
      participant({ id: 'd1', points: 100, format: 'dupla' }),
      participant({ id: 't1', points: 40, format: 'trio' }),
      participant({ id: 't2', points: 90, format: 'trio' }),
      participant({ id: 'solo', points: 70, format: null }),
    ];

    expect(rankParticipants(rows, { ...ALL_SPORTS, format: 'trio' }).map((r) => [r.rank, r.id])).toEqual([
      [1, 't2'],
      [2, 't1'],
    ]);
    expect(rankParticipants(rows, ALL_SPORTS).length).toBe(4);
  });
});

describe('normalizeRankingGender', () => {
  it('normaliza as grafias reais dos docs (paridade com o app)', () => {
    expect(normalizeRankingGender('Masculino')).toBe('male');
    expect(normalizeRankingGender('m')).toBe('male');
    expect(normalizeRankingGender('male')).toBe('male');
    expect(normalizeRankingGender('Feminino')).toBe('female');
    expect(normalizeRankingGender('f')).toBe('female');
    expect(normalizeRankingGender('Misto')).toBe('mixed');
    expect(normalizeRankingGender('Mista')).toBe('mixed');
    expect(normalizeRankingGender('mixed')).toBe('mixed');
  });

  it('devolve null para vazio ou desconhecido', () => {
    expect(normalizeRankingGender(null)).toBeNull();
    expect(normalizeRankingGender('  ')).toBeNull();
    expect(normalizeRankingGender('outro')).toBeNull();
  });
});

describe('deriveTeamGender', () => {
  it('o campo gender do time vence quando existe', () => {
    expect(deriveTeamGender('Feminino', ['Masculino', 'Masculino'])).toBe('female');
  });

  it('sem gender no time, deriva dos perfis: iguais mantém, diferentes vira misto', () => {
    expect(deriveTeamGender(null, ['Masculino', 'Masculino'])).toBe('male');
    expect(deriveTeamGender(null, ['Feminino', 'Masculino'])).toBe('mixed');
    expect(deriveTeamGender(null, ['Feminino', 'Feminino', 'Feminino'])).toBe('female');
  });

  it('perfil sem gênero não bloqueia: usa os conhecidos; nenhum conhecido dá null', () => {
    expect(deriveTeamGender(null, ['Masculino', null])).toBe('male');
    expect(deriveTeamGender(null, [null, null])).toBeNull();
  });
});

describe('teamFormatOf', () => {
  it('teamSize da equipe nomeada (3–5) define o formato', () => {
    expect(teamFormatOf(3, 1)).toBe('trio');
    expect(teamFormatOf(4, 2)).toBe('quarteto');
    expect(teamFormatOf(5, 5)).toBe('quinteto');
  });

  it('sem teamSize cai no elenco; dupla legada (sem memberUids) é dupla', () => {
    expect(teamFormatOf(null, 0)).toBe('dupla');
    expect(teamFormatOf(null, 2)).toBe('dupla');
    expect(teamFormatOf(null, 4)).toBe('quarteto');
  });
});

describe('searchRanking', () => {
  it('preserva a posição real do ranking em vez de renumerar o resultado', () => {
    const ranked = rankParticipants(sample(), ALL_SPORTS);

    // O bug era este: "Diego 22" é o 4º e aparecia como 1º (e no pódio) ao buscar.
    expect(searchRanking(ranked, '22').map((r) => [r.rank, r.id])).toEqual([
      [2, 'b'],
      [4, 'd'],
    ]);
  });

  it('não altera a lista base, então pódio e "Sua posição" continuam íntegros', () => {
    const ranked = rankParticipants(sample(), ALL_SPORTS);
    const before = [...ranked];

    searchRanking(ranked, 'diego');

    expect(ranked).toEqual(before);
  });

  it('casa por nome e por cidade', () => {
    const ranked = rankParticipants(sample(), ALL_SPORTS);

    expect(searchRanking(ranked, 'ana souza').map((r) => r.id)).toEqual(['a']);
    expect(searchRanking(ranked, 'aparecida').map((r) => r.id)).toEqual(['e']);
  });

  it('ignora caixa e acento', () => {
    const ranked = rankParticipants(sample(), ALL_SPORTS);

    expect(searchRanking(ranked, 'GOIANIA').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('devolve vazio para busca em branco', () => {
    const ranked = rankParticipants(sample(), ALL_SPORTS);

    expect(searchRanking(ranked, '   ')).toEqual([]);
  });
});

describe('athleteProfileLink', () => {
  it('leva ao perfil público do atleta', () => {
    expect(athleteProfileLink('uid-123', true)).toEqual(['/atletas', 'uid-123']);
  });

  it('não vira link sem espelho público', () => {
    // Linha órfã: `athleteRankings` sobrevive à exclusão do atleta e a rota só teria
    // "perfil publico nao encontrado" pra mostrar.
    expect(athleteProfileLink('uid-123', false)).toBeNull();
  });

  it('não vira link sem id', () => {
    expect(athleteProfileLink('', true)).toBeNull();
  });
});

describe('teamProfileLink', () => {
  it('leva ao perfil da dupla', () => {
    expect(teamProfileLink('team-9', true)).toEqual(['/equipes', 'team-9']);
  });

  it('não vira link para dupla incompleta', () => {
    // `TeamPublicProfileComponent` recusa carregar quem ainda procura parceiro.
    expect(teamProfileLink('team-9', false)).toBeNull();
  });

  it('não vira link sem id', () => {
    expect(teamProfileLink('', true)).toBeNull();
  });
});

describe('hasSearchQuery', () => {
  it('só liga o modo busca com texto de verdade', () => {
    expect(hasSearchQuery('')).toBe(false);
    expect(hasSearchQuery('   ')).toBe(false);
    expect(hasSearchQuery('22')).toBe(true);
  });
});
