import { generateKeywords, searchQueryTokens } from '@nexago/search-keywords';
import { athletePublicProfileFromDoc, rankAthleteDirectory } from './public-profiles-repository';

function candidate(id: string, fullName: string, nickname = '', keywords?: string[]) {
  const data: Record<string, unknown> = {
    fullName,
    hasAthleteRole: true,
    keywords: keywords ?? generateKeywords([fullName, nickname]),
  };
  if (nickname) data['nickname'] = nickname;
  return { data, profile: athletePublicProfileFromDoc(id, data) };
}

describe('rankAthleteDirectory', () => {
  it('nome composto corta quem casa só com uma das palavras', () => {
    const results = rankAthleteDirectory(
      [
        candidate('a', 'João Silva'),
        candidate('b', 'Maria Silva'),
        candidate('c', 'João Pedro Silva'),
      ],
      searchQueryTokens('joão silva'),
    );

    expect(results.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('sem casamento completo devolve quem casou com a âncora', () => {
    const results = rankAthleteDirectory(
      [candidate('a', 'Maria Souza'), candidate('b', 'Ana Souza')],
      searchQueryTokens('joao souza'),
    );

    expect(results.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('apelido colado acha quem tem separador', () => {
    const results = rankAthleteDirectory(
      [candidate('a', 'Ana Paula', '@ana_paula')],
      searchQueryTokens('anapaula'),
    );

    expect(results.map((r) => r.id)).toEqual(['a']);
  });

  it('termo com acento acha quem foi indexado sem', () => {
    const results = rankAthleteDirectory(
      [candidate('a', 'Joao Goncalves')],
      searchQueryTokens('João Gonçalves'),
    );

    expect(results.map((r) => r.id)).toEqual(['a']);
  });

  it('keywords velho não esconde quem casa pelo nome', () => {
    const results = rankAthleteDirectory(
      [candidate('a', 'Rafael Souza', '', ['ra', 'raf', 'rafa', 'rafae', 'rafael'])],
      searchQueryTokens('rafael souza'),
    );

    expect(results.map((r) => r.id)).toEqual(['a']);
  });
});
