import { routes } from './app.routes';
import { NAV_ITEMS } from './painel/ui/panel-shell.component';

const painelRoutes = routes.filter((r) => r.path === 'painel' || r.path?.startsWith('painel/'));

describe('rotas do painel', () => {
  it('toda rota painel/* declara data.area e usa o areaGuard', () => {
    // Hoje são 37 rotas; o piso evita que o filtro passe a não pegar nada sem o teste perceber.
    expect(painelRoutes.length).toBeGreaterThanOrEqual(37);
    for (const r of painelRoutes) {
      expect(r.data?.['area']).withContext(`${r.path} sem data.area`).toBeDefined();
      expect((r.canActivate ?? []).length).withContext(`${r.path} sem areaGuard`).toBe(3);
    }
  });

  it('rotas de criação/edição exigem escrita', () => {
    const writeRoutes = painelRoutes.filter((x) => /(^|\/)(nova|novo)$|\/editar$/.test(x.path ?? ''));
    expect(writeRoutes.length).toBeGreaterThan(0);
    for (const r of writeRoutes) {
      expect(r.data?.['mode']).withContext(`${r.path} deveria ser write`).toBe('write');
    }
  });

  it('o menu lateral e as rotas concordam sobre a área de cada tela', () => {
    for (const item of NAV_ITEMS) {
      const route = painelRoutes.find((r) => `/${r.path}` === item.route);
      expect(route).withContext(`item ${item.id} sem rota`).toBeDefined();
      expect(route?.data?.['area']).withContext(`área de ${item.id}`).toBe(item.area);
    }
  });
});
