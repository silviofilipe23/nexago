import { ALL_TOURNAMENTS_PAGE_SIZE, allTournamentsHasMore, allTournamentsPlan } from './tournaments-repository';

/** Consulta da aba Plataforma (super admin). O ponto sensível é a troca de ordenação
 *  na busca: `orderBy('startAt')` descarta em silêncio todo torneio sem data de início,
 *  então é a ordenação por `name` que alcança rascunho sem data. */
describe('allTournamentsPlan', () => {
  it('ordena por startAt desc na primeira página', () => {
    expect(allTournamentsPlan('', false)).toEqual({ orderField: 'startAt', usesCursor: false });
  });

  it('usa o cursor ao paginar', () => {
    expect(allTournamentsPlan('', true)).toEqual({ orderField: 'startAt', usesCursor: true });
  });

  it('troca para orderBy(name) na busca — é o caminho que enxerga torneio sem startAt', () => {
    expect(allTournamentsPlan('copa', false).orderField).toBe('name');
  });

  it('ignora o cursor na busca: o intervalo de prefixo não pagina', () => {
    expect(allTournamentsPlan('copa', true).usesCursor).toBe(false);
  });
});

describe('allTournamentsHasMore', () => {
  it('oferece mais quando a página veio cheia', () => {
    expect(allTournamentsHasMore('', ALL_TOURNAMENTS_PAGE_SIZE)).toBe(true);
  });

  it('não oferece mais quando a página veio incompleta', () => {
    expect(allTournamentsHasMore('', ALL_TOURNAMENTS_PAGE_SIZE - 1)).toBe(false);
  });

  it('nunca oferece mais na busca, mesmo com a página cheia', () => {
    expect(allTournamentsHasMore('copa', ALL_TOURNAMENTS_PAGE_SIZE)).toBe(false);
  });
});
