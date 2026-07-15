import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { ArenaContextService } from '../painel/data/arena-context.service';

/** Redireciona pra `/painel/selecionar-arena` enquanto o gestor logado tiver mais de uma arena
 *  e nenhuma tiver sido escolhida ainda. Aplicado junto de `authGuard` em toda rota `painel/*`,
 *  exceto a própria rota do seletor (senão vira loop). */
export const arenaSelectionGuard: CanActivateFn = () => {
  const arenaContext = inject(ArenaContextService);
  const router = inject(Router);
  return toObservable(arenaContext.loading).pipe(
    filter((loading) => !loading),
    take(1),
    map(() => {
      if (arenaContext.needsSelection()) {
        return router.createUrlTree(['/painel/selecionar-arena']);
      }
      return true;
    }),
  );
};
