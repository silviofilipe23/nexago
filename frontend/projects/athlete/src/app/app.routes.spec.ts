import { routes } from './app.routes';
import { authGuard } from './auth/auth.guard';

/** Rotas que existem justamente para quem ainda não tem sessão. */
const PUBLIC_PATHS = new Set([
  '',
  'entrar',
  'cadastro',
  'esqueci-senha',
  'email-enviado',
  'redefinir-senha',
  '**',
]);

describe('app.routes', () => {
  // O perfil compartilhado já ficou sem guard uma vez: as rules de `public_profiles` exigem
  // login, então o visitante deslogado tomava permission-denied e via "LINK INVÁLIDO" em vez
  // de ser mandado pro login com o perfil em ?redirect=.
  it('perfil público de atleta exige authGuard', () => {
    const route = routes.find((r) => r.path === 'atletas/:handle');
    expect(route).toBeDefined();
    expect(route!.canActivate).toContain(authGuard);
  });

  it('toda rota autenticada passa pelo authGuard', () => {
    const unguarded = routes
      .filter((r) => !PUBLIC_PATHS.has(r.path ?? ''))
      .filter((r) => !(r.canActivate ?? []).includes(authGuard))
      .map((r) => r.path);

    expect(unguarded).toEqual([]);
  });
});
