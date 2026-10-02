import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, filter, map, switchMap, take } from 'rxjs/operators';
import { from, of } from 'rxjs';
import { AuthService } from './auth.service';

/** Carrega o Firestore e o repositório só quando o guard roda — mesmo motivo do
 *  `onboardingGuard`: import estático aqui punha o SDK inteiro no bundle inicial do portal.
 *  `null` = sem config do Firebase (mesma guarda de `athleteFirestore`). */
async function countMyStaffTournaments(uid: string): Promise<number | null> {
  const [{ athleteFirestore }, { fetchMyStaffTournaments }] = await Promise.all([
    import('../data/firestore'),
    import('../data/tournament-staff-repository'),
  ]);
  const db = athleteFirestore();
  if (!db) return null;
  return (await fetchMyStaffTournaments(db, uid)).length;
}

/** Fecha `/mesa*` pra quem não é equipe de nenhum torneio — defesa em profundidade, não a
 *  autoridade: quem manda são as rules (`canScoreTournament`) e o `assertCanScoreTournament`
 *  dos callables. Serve pra não deixar uma tela de operação vazia acessível por link solto.
 *
 *  Sem filtro por cargo: gestor ativo também opera (as rules já permitem), como no app. */
export const staffGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.authReady).pipe(
    filter((ready) => ready),
    take(1),
    switchMap(() => {
      const uid = auth.user()?.uid;
      if (!uid) return of(router.createUrlTree(['/painel']));
      return from(countMyStaffTournaments(uid)).pipe(
        map((count) => (count != null && count > 0 ? true : router.createUrlTree(['/painel']))),
        // Falha de leitura (rede/rules) não pode trancar quem é da equipe: quem não puder
        // escrever esbarra na regra do servidor de qualquer forma.
        catchError(() => of(true)),
      );
    }),
  );
};
