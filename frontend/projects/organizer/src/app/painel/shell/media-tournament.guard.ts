import { inject, Injector } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateChildFn } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { ChaveamentoContextService } from '../chaveamento/chaveamento-context.service';
import { mediaRedirectFor } from '../data/media-access';

/** `eventos/:id/**`: a mídia só alcança a Transmissão. Espera a lista de torneios do usuário
 *  (é ela que traz `myRole`) — decidir antes disso deixaria a mídia ver uma tela de operação nos
 *  primeiros frames. Quem não é mídia passa sem custo extra além dessa espera, que as telas do
 *  torneio já fazem. */
export const mediaTournamentGuard: CanActivateChildFn = (route, state) => {
  const ctx = inject(ChaveamentoContextService);
  const router = inject(Router);
  const injector = inject(Injector);
  // `canActivateChild` roda também pros NETOS (`categorias/:catId/jogos`), cujo pai direto não
  // tem `:id` — e o app não liga `paramsInheritanceStrategy: 'always'`. Sobe a árvore inteira.
  const tournamentId = route.pathFromRoot.map((r) => r.paramMap.get('id')).find((id) => !!id) ?? '';
  ctx.ensureLoaded();
  return toObservable(ctx.loadingTournaments, { injector }).pipe(
    filter((loading) => !loading),
    take(1),
    map(() => {
      const role = ctx.tournaments().find((t) => t.id === tournamentId)?.myRole ?? null;
      const alvo = mediaRedirectFor(role, state.url, tournamentId);
      return alvo ? router.parseUrl(alvo) : true;
    }),
  );
};
