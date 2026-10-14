import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { CoachContextService } from './coach-context.service';
import type { AccessMode, PanelArea } from './coach-roles.model';

/**
 * Libera a rota se o cargo do painel ativo cobre `data.area` no modo `data.mode` (padrão leitura).
 * Sem nenhum painel → /sem-acesso; sem permissão → volta ao Início (que todo cargo acessa:
 * `atletas` em leitura).
 *
 * Só use depois de `authGuard` e `coachGuard` no `canActivate` (ordem `[authGuard, coachGuard,
 * areaGuard]`): `CoachContextService.ready` fica `false` enquanto não há usuário logado, então este
 * guard esperaria para sempre; os dois anteriores já aguardam o auth e exigem um usuário.
 */
export const areaGuard: CanActivateFn = (route) => {
  const ctx = inject(CoachContextService);
  const router = inject(Router);
  const area = route.data['area'] as PanelArea | undefined;
  const mode = (route.data['mode'] as AccessMode | undefined) ?? 'read';
  return toObservable(ctx.ready).pipe(
    filter((ready) => ready),
    take(1),
    map(() => {
      if (ctx.contexts().length === 0) {
        return router.createUrlTree(['/sem-acesso']);
      }
      if (!area || ctx.can(area, mode)) {
        return true;
      }
      return router.createUrlTree(['/painel']);
    }),
  );
};
