import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { ArenaAccessService } from '../painel/data/arena-access.service';
import { ArenaContextService } from '../painel/data/arena-context.service';
import type { ArenaArea } from '../painel/data/arena-roles.model';

/** Bloqueia a rota quando o cargo do usuário não alcança a área. Espera o
 *  contexto carregar antes de decidir — senão um membro seria expulso da
 *  própria rota no primeiro frame, antes de o espelho de staff chegar. */
export function arenaAreaGuard(area: ArenaArea): CanActivateFn {
  return () => {
    const access = inject(ArenaAccessService);
    const context = inject(ArenaContextService);
    const router = inject(Router);
    return toObservable(context.loading).pipe(
      filter((loading) => !loading),
      take(1),
      map(() => (access.canRead(area) ? true : router.createUrlTree(['/painel']))),
    );
  };
}

/** Só o dono: Equipe e Planos. */
export const arenaOwnerGuard: CanActivateFn = () => {
  const access = inject(ArenaAccessService);
  const context = inject(ArenaContextService);
  const router = inject(Router);
  return toObservable(context.loading).pipe(
    filter((loading) => !loading),
    take(1),
    map(() => (access.isOwner() ? true : router.createUrlTree(['/painel']))),
  );
};
