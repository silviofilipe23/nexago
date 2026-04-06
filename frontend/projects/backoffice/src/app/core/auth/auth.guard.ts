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

/** If already signed in, visiting `/login` redirects to home. */
export const loginPageGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady;
  if (auth.user()) {
    return router.createUrlTree(['/']);
  }
  return true;
};
