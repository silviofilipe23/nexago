import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import type { CenterArea } from '../domain/roles';
import { canAccessArea } from '../domain/roles';
import { CenterContextService } from './center-context.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return toObservable(auth.authReady).pipe(
    filter(Boolean),
    take(1),
    map(() => (auth.isAuthenticated() ? true : router.createUrlTree(['/entrar'], { queryParams: { redirect: state.url } }))),
  );
};

/** Telas de auth: quem já está logado vai direto pros centros. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return toObservable(auth.authReady).pipe(
    filter(Boolean),
    take(1),
    map(() => (auth.isAuthenticated() ? router.createUrlTree(['/centros']) : true)),
  );
};

/**
 * Área do painel (`data.area`). Espera os vínculos carregarem; sem acesso à área no centro da
 * URL, cai na tela de acesso negado DAQUELE centro (W6). Sem vínculo nenhum, o shell mostra o
 * bloqueio — então aqui só deixa passar.
 */
export const areaGuard: CanActivateFn = (route) => {
  const ctx = inject(CenterContextService);
  const router = inject(Router);
  const area = route.data['area'] as CenterArea;
  const centerId = route.parent?.paramMap.get('centerId') ?? route.paramMap.get('centerId') ?? '';
  return toObservable(ctx.ready).pipe(
    filter(Boolean),
    take(1),
    map(() => {
      const m = ctx.membershipFor(centerId);
      if (!m || m.status !== 'active' || canAccessArea(m, area)) {
        return true;
      }
      return router.createUrlTree(['/centro', centerId, 'acesso-negado'], { queryParams: { area } });
    }),
  );
};

/** `/centros` com um centro só (e sem convite pendente) entra direto nele. */
export const centersHomeGuard: CanActivateFn = (route) => {
  const ctx = inject(CenterContextService);
  const router = inject(Router);
  if (route.queryParamMap.get('lista') === '1') {
    return true;
  }
  return toObservable(ctx.ready).pipe(
    filter(Boolean),
    take(1),
    map(() => {
      const last = ctx.lastCenterId();
      if (ctx.activeMemberships().length === 1 && ctx.pendingInvites().length === 0 && last) {
        return router.createUrlTree(['/centro', last, 'dashboard']);
      }
      return true;
    }),
  );
};
