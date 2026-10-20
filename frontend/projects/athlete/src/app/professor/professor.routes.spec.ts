import { chromeHiddenForUrl } from '../app';
import { routes } from '../app.routes';
import { authGuard } from '../auth/auth.guard';
import { onboardingGuard } from '../auth/onboarding.guard';
import { PROFESSOR_ROUTES } from './professor.routes';

/** `/professor/arenas` e `/professor/arenas/{linkId}` são o `webUrl` dos avisos
 *  `professor_link_*` — sem a rota o push caía no `**` → painel. */
describe('rotas do professor', () => {
  it('exigem login e onboarding, antes do fallback', () => {
    const route = routes.find((r) => r.path === 'professor');
    expect(route).toBeDefined();
    expect(route!.canActivate).toEqual([authGuard, onboardingGuard]);
    expect(routes.indexOf(route!)).toBeLessThan(routes.findIndex((r) => r.path === '**'));
  });

  it('lista e detalhe nas URLs dos avisos', () => {
    expect(PROFESSOR_ROUTES.map((r) => r.path)).toEqual(['', 'arenas', 'arenas/:linkId']);
    expect(PROFESSOR_ROUTES[0]!.redirectTo).toBe('arenas');
  });

  it('usam a moldura do painel (sem o container da raiz)', () => {
    expect(chromeHiddenForUrl('/professor/arenas')).toBe(true);
    expect(chromeHiddenForUrl('/professor/arenas/a1_u1')).toBe(true);
    expect(chromeHiddenForUrl('/professores')).toBe(false);
  });
});
