import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { from, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** Mesma regra de `functions/src/athlete-tournament-access.ts#isOnboardingCompleted`. */
function isOnboardingCompleted(data: Record<string, unknown> | null): boolean {
  if (!data) return false;
  if (data['isProfileComplete'] === true) return true;
  if (data['onboardingCompleted'] === true) return true;
  const sportOnboarding = data['sportOnboarding'];
  if (
    sportOnboarding != null &&
    typeof sportOnboarding === 'object' &&
    (sportOnboarding as Record<string, unknown>)['completedAt'] != null
  ) {
    return true;
  }
  return false;
}

/** Carrega firebase/app + firebase/firestore só quando o guard roda (evita inchar o bundle inicial). */
async function fetchOnboardingDoc(uid: string): Promise<Record<string, unknown> | null> {
  const [{ getApps, initializeApp }, { doc, getDoc, getFirestore }] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
  ]);
  const cfg = environment.firebase;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  const db = getFirestore(app);
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

/** Redireciona pro onboarding quem ainda não completou (checagem real no `users/{uid}`). */
export const onboardingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.authReady).pipe(
    filter((ready) => ready),
    take(1),
    switchMap(() => {
      const uid = auth.user()?.uid;
      const cfg = environment.firebase;
      if (!uid || cfg == null || (cfg.apiKey ?? '').length === 0) {
        return of(true);
      }
      return from(fetchOnboardingDoc(uid)).pipe(
        switchMap((data) => {
          if (isOnboardingCompleted(data)) {
            return of(true);
          }
          return of(router.createUrlTree(['/onboarding']));
        }),
        catchError(() => of(true)),
      );
    }),
  );
};
