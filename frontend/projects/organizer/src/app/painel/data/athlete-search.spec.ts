import { generateKeywords, searchQueryTokens } from '@nexago/search-keywords';
import { athleteIdentity, rankAthleteSearch, type AthleteSearchResult } from './athlete-search-repository';

function candidate(
  uid: string,
  displayName: string,
  nickname = '',
  keywords?: string[],
): { data: Record<string, unknown>; athlete: AthleteSearchResult } {
  return {
    data: { keywords: keywords ?? generateKeywords([displayName, nickname]) },
    athlete: { uid, displayName, nickname, photoUrl: null },
  };
}

describe('rankAthleteSearch', () => {
  it('nome composto corta quem casa só com uma das palavras', () => {
    const results = rankAthleteSearch(
      [
        candidate('a', 'João Silva'),
        candidate('b', 'Maria Silva'),
        candidate('c', 'João Pedro Silva'),
      ],
      searchQueryTokens('joão silva'),
    );

    expect(results.map((r) => r.uid)).toEqual(['a', 'c']);
  });

  it('sem casamento completo devolve quem casou com a âncora', () => {
    const results = rankAthleteSearch(
      [candidate('a', 'Maria Souza'), candidate('b', 'Ana Souza')],
      searchQueryTokens('joao souza'),
    );

    expect(results.map((r) => r.uid).sort()).toEqual(['a', 'b']);
  });

  it('casamento exato vem na frente do resto', () => {
    const results = rankAthleteSearch(
      [
        candidate('meio', 'Mariana Costa', 'mari'),
        candidate('exato', 'Ana Silva', 'ana'),
        candidate('comeco', 'Ana Beatriz', 'aninha'),
      ],
      searchQueryTokens('ana'),
    );

    expect(results[0].uid).toBe('exato');
    expect(results[1].uid).toBe('comeco');
  });

  it('apelido colado acha quem tem separador', () => {
    const results = rankAthleteSearch(
      [candidate('a', 'Ana Paula', '@ana_paula')],
      searchQueryTokens('anapaula'),
    );

    expect(results.map((r) => r.uid)).toEqual(['a']);
  });

  it('keywords velho não esconde quem casa pelo nome', () => {
    const results = rankAthleteSearch(
      [candidate('a', 'Rafael Souza', '', ['ra', 'raf', 'rafa', 'rafae', 'rafael'])],
      searchQueryTokens('rafael souza'),
    );

    expect(results.map((r) => r.uid)).toEqual(['a']);
  });
});

/** O rótulo de sempre (`athleteDisplayName`) é o apelido; pra escolher o atleta CERTO na busca o
 *  organizador precisa do nome completo junto — dois "Bia" só se separam por ele. */
describe('athleteIdentity', () => {
  it('separa nome completo e apelido', () => {
    expect(athleteIdentity({ displayName: 'Beatriz Lima', nickname: 'Bia' })).toEqual({
      fullName: 'Beatriz Lima',
      nickname: 'Bia',
    });
  });

  it('sem apelido, só o nome completo', () => {
    expect(athleteIdentity({ displayName: 'Beatriz Lima', nickname: '' })).toEqual({
      fullName: 'Beatriz Lima',
      nickname: '',
    });
  });

  // Perfil sem nome nenhum chega como "Usuário" do repositório — "Usuário “Bia”" não diz nada.
  it('sem nome completo, o apelido vira o nome e não se repete', () => {
    expect(athleteIdentity({ displayName: 'Usuário', nickname: 'Bia' })).toEqual({ fullName: 'Bia', nickname: '' });
  });

  it('apelido igual ao nome (só muda caixa/acento) não aparece duas vezes', () => {
    expect(athleteIdentity({ displayName: 'Júlia', nickname: 'julia' })).toEqual({ fullName: 'Júlia', nickname: '' });
  });
});
