import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, filter, map, switchMap, take } from 'rxjs/operators';
import { from, of } from 'rxjs';
import { athleteFirestore } from '../data/firestore';
import { fetchMyStaffTournaments } from '../data/tournament-staff-repository';
import { AuthService } from './auth.service';

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
      const db = athleteFirestore();
      if (!uid || !db) return of(router.createUrlTree(['/painel']));
      return from(fetchMyStaffTournaments(db, uid)).pipe(
        map((entries) => (entries.length > 0 ? true : router.createUrlTree(['/painel']))),
        // Falha de leitura (rede/rules) não pode trancar quem é da equipe: quem não puder
        // escrever esbarra na regra do servidor de qualquer forma.
        catchError(() => of(true)),
      );
    }),
  );
};
