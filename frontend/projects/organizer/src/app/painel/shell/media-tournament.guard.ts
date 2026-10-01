import { inject, Injector } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateChildFn } from '@angular/router';
import { from } from 'rxjs';
import { filter, map, switchMap, take } from 'rxjs/operators';
import { mediaRedirectFor } from '../data/media-access';

/** `eventos/:id/**`: a mídia só alcança a Transmissão. Espera a lista de torneios do usuário
 *  (é ela que traz `myRole`) — decidir antes disso deixaria a mídia ver uma tela de operação nos
 *  primeiros frames. Quem não é mídia passa sem custo extra além dessa espera, que as telas do
 *  torneio já fazem.
 *
 *  O contexto do chaveamento entra por IMPORT DINÂMICO: este guard é referenciado em
 *  `app.routes.ts` (bundle inicial), e o contexto puxa o SDK do Firestore — importá-lo estático
 *  punha ~265 kB a mais na tela de login. */
export const mediaTournamentGuard: CanActivateChildFn = (route, state) => {
  const router = inject(Router);
  const injector = inject(Injector);
  // `canActivateChild` roda também pros NETOS (`categorias/:catId/jogos`), cujo pai direto não
  // tem `:id` — e o app não liga `paramsInheritanceStrategy: 'always'`. Sobe a árvore inteira.
  const tournamentId = route.pathFromRoot.map((r) => r.paramMap.get('id')).find((id) => !!id) ?? '';
  return from(import('../chaveamento/chaveamento-context.service')).pipe(
    switchMap(({ ChaveamentoContextService }) => {
      const ctx = injector.get(ChaveamentoContextService);
      ctx.ensureLoaded();
      return toObservable(ctx.loadingTournaments, { injector }).pipe(
        filter((loading) => !loading),
        take(1),
        map(() => ctx.tournaments().find((t) => t.id === tournamentId)?.myRole ?? null),
      );
    }),
    map((role) => {
      const alvo = mediaRedirectFor(role, state.url, tournamentId);
      return alvo ? router.parseUrl(alvo) : true;
    }),
  );
};
