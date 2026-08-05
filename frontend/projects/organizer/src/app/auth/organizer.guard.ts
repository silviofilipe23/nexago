import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from './auth.service';

/**
 * Bloqueia /painel pra quem está autenticado mas não tem a claim `organizer`
 * (ex.: atleta que nunca completou o autocadastro de organizador). O super
 * admin passa sem o papel `organizer`: ele entra pra dar suporte a torneio de
 * qualquer organizador. Assume `authGuard` já rodou antes na mesma rota — não
 * checa `isAuthenticated`.
 */
export const organizerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return toObservable(auth.authReady).pipe(
    filter((ready) => ready),
    take(1),
    map(() => {
      if (auth.canAccessPanel()) {
        return true;
      }
      return router.createUrlTree(['/entrar']);
    }),
  );
};
