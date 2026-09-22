import type { Route } from '@angular/router';
import { routes } from './app.routes';

/** Acha uma rota descendo por `path` exatos, ex.: `['painel', 'eventos/:id', 'telao']`. */
function findRoute(list: readonly Route[], segments: readonly string[]): Route | null {
  let current: readonly Route[] = list;
  let found: Route | null = null;
  for (const segment of segments) {
    found = current.find((r) => r.path === segment) ?? null;
    if (!found) return null;
    current = found.children ?? [];
  }
  return found;
}

describe('app.routes', () => {
  it('serve o telão como aba do torneio', () => {
    expect(findRoute(routes, ['painel', 'eventos/:id', 'telao'])).not.toBeNull();
  });

  it('manda o link antigo do telão global pra lista de eventos', () => {
    expect(findRoute(routes, ['painel', 'telao'])?.redirectTo).toBe('eventos');
  });

  it('expõe a página pública do torneio sem guard', () => {
    const publica = findRoute(routes, ['t/:tournamentId']);
    expect(publica).not.toBeNull();
    expect(publica?.canActivate ?? []).toEqual([]);
  });

  it('abre a TV do telão sem login — é o link que vai pra smart TV da arena', () => {
    const tv = findRoute(routes, ['telao/:tournamentId']);
    expect(tv).not.toBeNull();
    expect(tv?.canActivate ?? []).toEqual([]);
  });

  it('mantém a CONFIGURAÇÃO do telão dentro do painel, que é guardado', () => {
    // O que é público é a exibição. Escolher quadras, ligar "em chamas" e
    // publicar a chamada continua sendo do organizador.
    expect(findRoute(routes, ['painel', 'eventos/:id', 'telao'])).not.toBeNull();
    expect((findRoute(routes, ['painel'])?.canActivate ?? []).length).toBe(2);
  });
});
