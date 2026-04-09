import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Blocks unauthenticated users from matching the route; sends them to `/login`. */
export const authGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady;
  if (auth.user()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

/**
 * Em `/login`: organizador/super admin vai ao painel; qualquer outro usuário autenticado é deslogado
 * (este app é só para staff).
 */
export const loginPageGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady;
  const u = auth.user();
  if (!u) {
    return true;
  }
  await auth.refreshIdToken();
  if (auth.canAccessBackoffice()) {
    if (!auth.canManageUsers() && auth.hasRole('organizer')) {
      return router.createUrlTree(['/operacional']);
    }
    return router.createUrlTree(['/']);
  }
  await auth.signOut();
  return true;
};

/** Backoffice: admin da plataforma, gestor de torneios ou super admin; demais são deslogados. */
export const organizerGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady;
  if (!auth.user()) {
    return router.createUrlTree(['/login']);
  }
  await auth.refreshIdToken();
  if (auth.canAccessBackoffice()) {
    return true;
  }
  await auth.signOut();
  return router.createUrlTree(['/login']);
};

/** Rotas só para admin da plataforma / super admin (ex.: gestão de usuários). */
export const platformAdminGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady;
  await auth.refreshIdToken();
  if (auth.canManageUsers()) {
    return true;
  }
  return router.createUrlTree(['/operacional']);
};
