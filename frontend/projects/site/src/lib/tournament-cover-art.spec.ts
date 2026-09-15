import { tournamentCoverArt, tournamentCoverOrDefault } from '@nexago/tournament-covers';

describe('capa padrão do torneio', () => {
  it('resolve a arte pelo esporte, ignorando caixa e espaço', () => {
    for (const sport of ['beachVolleyball', 'BEACHVOLLEYBALL', ' beachvolleyball ']) {
      expect(tournamentCoverArt(sport)).toBe('/media/tournament-covers/volei_praia.webp');
    }
  });

  it('cada esporte traz a sua arte, não uma só genérica', () => {
    expect(tournamentCoverArt('indoorVolleyball')).toBe(
      '/media/tournament-covers/volei_quadra.webp',
    );
    expect(tournamentCoverArt('footvolley')).toBe('/media/tournament-covers/futevolei.webp');
    expect(tournamentCoverArt('beachTennis')).toBe('/media/tournament-covers/beach_tennis.webp');
  });

  it('esporte desconhecido devolve nulo em vez de caminho inventado', () => {
    // Torneio legado pode não ter `sport`. Sem arte o template cai no
    // gradiente, que segue sendo o último recurso.
    for (const sport of [null, undefined, '', '   ', 'xadrez']) {
      expect(tournamentCoverArt(sport)).withContext(`para ${sport}`).toBeNull();
    }
  });

  it('a arte não substitui a capa que o organizador subiu', () => {
    expect(tournamentCoverOrDefault('https://cdn.example.com/capa.jpg', 'beachVolleyball')).toBe(
      'https://cdn.example.com/capa.jpg',
    );
  });

  it('capa em branco conta como ausente', () => {
    // O Firestore guarda string vazia em torneio que teve a capa removida.
    expect(tournamentCoverOrDefault('   ', 'footvolley')).toBe(
      '/media/tournament-covers/futevolei.webp',
    );
  });

  it('sem capa e sem esporte devolve nulo pro template pintar o gradiente', () => {
    expect(tournamentCoverOrDefault(null, null)).toBeNull();
  });
});
