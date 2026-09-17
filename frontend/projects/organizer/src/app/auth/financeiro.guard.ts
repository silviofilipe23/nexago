import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, filter, from, map, of, switchMap, take } from 'rxjs';
import { canSeeFinanceiro } from '../painel/data/tournament-role';
import { listMyTournaments } from '../painel/data/tournaments-repository';
import { AuthService } from './auth.service';

/**
 * Bloqueia /painel/financeiro pra quem só administra evento (papel `eventAdmin`): dono e
 * gestor de pelo menos um torneio entram, o resto é mandado pro Início. Mesmo predicado
 * do item de menu (`canSeeFinanceiro`) — a tela é conveniência, não segurança: quem
 * protege o dinheiro de verdade são as rules (leitura do caixa) e a callable de saque,
 * que recusam o administrador mesmo com `tournamentId` forjado.
 *
 * Falha na leitura dos torneios NÃO tranca a rota: em erro, libera e deixa a tela
 * mostrar seu próprio estado vazio/erro. Trancar por instabilidade de rede esconderia o
 * Financeiro de quem tem direito de verdade — e a proteção real não é daqui.
 *
 * `authGuard`/`organizerGuard` já rodaram na rota-mãe `/painel`, então `authReady` já
 * deve estar `true` aqui; o `filter`/`take(1)` é só o mesmo padrão defensivo dos dois
 * guards existentes, não uma segunda espera de verdade.
 */
export const financeiroGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return toObservable(auth.authReady).pipe(
    filter((ready) => ready),
    take(1),
    switchMap(() => {
      const uid = auth.user()?.uid;
      if (!uid) return of(router.createUrlTree(['/entrar']));
      return from(listMyTournaments(uid)).pipe(
        map((tournaments) => (canSeeFinanceiro(tournaments) ? true : router.createUrlTree(['/painel/inicio']))),
        catchError(() => of(true)),
      );
    }),
  );
};
