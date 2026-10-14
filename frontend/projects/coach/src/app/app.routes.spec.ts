import { routes } from './app.routes';
import { authGuard } from './auth/auth.guard';
import { coachGuard } from './auth/coach.guard';
import { areaGuard } from './painel/access/area.guard';
import { NAV_ITEMS } from './painel/ui/panel-shell.component';

const painelRoutes = routes.filter((r) => r.path === 'painel' || r.path?.startsWith('painel/'));

/** Tabela do plano (Task 6 Step 3) como literal explícito: área errada numa rota falha aqui. */
const EXPECTED: Record<string, [string, 'read' | 'write']> = {
  painel: ['atletas', 'read'],
  'painel/equipes': ['atletas', 'read'],
  'painel/equipes/nova': ['atletas', 'write'],
  'painel/equipes/:id/editar': ['atletas', 'write'],
  'painel/atletas': ['atletas', 'read'],
  'painel/atletas/comparar': ['atletas', 'read'],
  'painel/atletas/novo': ['atletas', 'write'],
  'painel/atletas/plano-evolucao': ['fisico', 'read'],
  'painel/atletas/plano-evolucao/novo': ['fisico', 'write'],
  'painel/treinos': ['treinos', 'read'],
  'painel/presenca': ['treinos', 'read'],
  'painel/agenda': ['treinos', 'read'],
  'painel/historico': ['treinos', 'read'],
  'painel/historico/relatorios': ['treinos', 'read'],
  'painel/treinos/novo': ['treinos', 'write'],
  'painel/treinos/:id/editar': ['treinos', 'write'],
  'painel/convocacoes': ['convocacoes', 'read'],
  'painel/convocacoes/nova': ['convocacoes', 'write'],
  'painel/avaliacoes': ['avaliacoes', 'read'],
  'painel/avaliacoes/nova': ['avaliacoes', 'write'],
  'painel/lesoes': ['saude', 'read'],
  'painel/lesoes/novo': ['saude', 'write'],
  'painel/torneios': ['atletas', 'read'],
  'painel/torneios/estatisticas': ['atletas', 'read'],
  'painel/permissoes': ['equipe', 'read'],
  'painel/financeiro': ['financeiro', 'read'],
  'painel/financeiro/planos': ['financeiro', 'read'],
  'painel/financeiro/planos/novo': ['financeiro', 'write'],
  'painel/comunicacao': ['comunicacao', 'read'],
  'painel/perfil': ['principal', 'read'],
  'painel/biblioteca': ['principal', 'read'],
  'painel/ia': ['principal', 'read'],
  'painel/ia/evolucao-rating': ['principal', 'read'],
  'painel/ia/recomendacao-categoria': ['principal', 'read'],
  'painel/ia/descoberta-talentos': ['principal', 'read'],
  'painel/ia/gestao-metas': ['principal', 'read'],
  'painel/ia/analise-pos-torneio': ['principal', 'read'],
};

describe('rotas do painel', () => {
  it('canActivate é exatamente [authGuard, coachGuard, areaGuard] em toda rota painel*', () => {
    for (const r of painelRoutes) {
      expect(r.canActivate).withContext(`${r.path}`).toEqual([authGuard, coachGuard, areaGuard]);
    }
  });

  it('cada rota painel* tem a área e o modo da tabela do plano (e a tabela cobre todas)', () => {
    expect(painelRoutes.map((r) => r.path).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const r of painelRoutes) {
      const [area, mode] = EXPECTED[r.path!];
      expect(r.data?.['area']).withContext(`área de ${r.path}`).toBe(area);
      expect((r.data?.['mode'] as string | undefined) ?? 'read').withContext(`modo de ${r.path}`).toBe(mode);
    }
  });

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
