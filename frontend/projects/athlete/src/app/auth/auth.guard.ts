import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { persistRedirectIntent } from './redirect-intent';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return toObservable(auth.authReady).pipe(
    filter((ready) => ready),
    take(1),
    map(() => {
      if (auth.isAuthenticated()) {
        return true;
      }
      // `state.url` é o destino tentado; `router.url` ainda seria a rota anterior
      // ('/' num deep-link em carga inicial, ex.: vindo do site).
      persistRedirectIntent(state.url);
      return router.createUrlTree(['/entrar'], {
        queryParams: { redirect: state.url },
      });
    }),
  );
};
