import { mediaRedirectFor, tournamentMenuFor } from './media-access';

describe('mediaRedirectFor', () => {
  it('quem não é mídia passa sem desvio', () => {
    expect(mediaRedirectFor('manager', '/painel/eventos/t1/inscricoes', 't1')).toBeNull();
    expect(mediaRedirectFor(null, '/painel/eventos/t1', 't1')).toBeNull();
  });

  it('mídia na Transmissão fica', () => {
    expect(mediaRedirectFor('media', '/painel/eventos/t1/transmissao', 't1')).toBeNull();
    expect(mediaRedirectFor('media', '/painel/eventos/t1/transmissao?x=1', 't1')).toBeNull();
  });

  it('mídia em qualquer outra tela do torneio vai pra Transmissão — inclusive por URL direta', () => {
    for (const url of [
      '/painel/eventos/t1',
      '/painel/eventos/t1/inscricoes',
      '/painel/eventos/t1/equipe',
      '/painel/eventos/t1/categorias/c1/jogos',
      '/painel/eventos/t1/categorias/c1/ao-vivo/m1',
    ]) {
      expect(mediaRedirectFor('media', url, 't1')).toBe('/painel/eventos/t1/transmissao');
    }
  });
});

describe('tournamentMenuFor', () => {
  it('mídia vê só a Transmissão; o resto, o menu completo', () => {
    expect(tournamentMenuFor('media')).toBe('transmissao');
    expect(tournamentMenuFor('eventAdmin')).toBe('completo');
    expect(tournamentMenuFor(null)).toBe('completo');
  });
});
