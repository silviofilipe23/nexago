import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { persistRedirectIntent } from './redirect-intent';

/** Link feito para quem AINDA não tem conta (`/convite-dupla/:id`): sem sessão, a porta é o
 *  cadastro, não o login — "Já tem conta? Entrar" do cadastro leva o mesmo `?redirect=`.
 *
 *  Repassa os query params do link (`ref` = indicação, `de` = quem chamou) para o cadastro dizer
 *  quem convidou e registrar o vínculo, como o app faz com o mesmo link. Repassa sem nomeá-los:
 *  importar as constantes de `partner-invite.ts` aqui as levaria para o bundle inicial. Com
 *  sessão, deixa o `authGuard` e o `onboardingGuard` seguirem. */
export const signupFirstGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return toObservable(auth.authReady).pipe(
    filter((ready) => ready),
    take(1),
    map(() => {
      if (auth.isAuthenticated()) return true;
      persistRedirectIntent(state.url);
      return router.createUrlTree(['/cadastro'], {
        queryParams: { ...route.queryParams, redirect: state.url },
      });
    }),
  );
};
