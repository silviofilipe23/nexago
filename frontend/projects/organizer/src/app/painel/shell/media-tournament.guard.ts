import { inject } from '@angular/core';
import { Router, type CanActivateChildFn } from '@angular/router';
import { mediaRedirectFor } from '../data/media-access';
import { StaffRoleLookup } from './staff-role-lookup';

/** `eventos/:id/**`: a mídia só alcança a Transmissão — qualquer outra rota do torneio, mesmo
 *  digitada à mão, volta pra ela. Decide pelo espelho de equipe de UM torneio
 *  (`StaffRoleLookup`), sem tocar no contexto do chaveamento. */
export const mediaTournamentGuard: CanActivateChildFn = async (route, state) => {
  const router = inject(Router);
  const lookup = inject(StaffRoleLookup);
  // `canActivateChild` roda também pros NETOS (`categorias/:catId/jogos`), cujo pai direto não
  // tem `:id` — e o app não liga `paramsInheritanceStrategy: 'always'`. Sobe a árvore inteira.
  const tournamentId = route.pathFromRoot.map((r) => r.paramMap.get('id')).find((id) => !!id) ?? '';
  const role = await lookup.roleIn(tournamentId);
  const alvo = mediaRedirectFor(role, state.url, tournamentId);
  return alvo ? router.parseUrl(alvo) : true;
};
