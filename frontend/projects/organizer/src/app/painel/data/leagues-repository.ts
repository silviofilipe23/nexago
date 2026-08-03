import {
  cancelLeague as cancelLeagueShared,
  closeLeagueSeason as closeLeagueSeasonShared,
  fetchLeague,
  fetchLeaguesByManager,
  fetchLeagueRanking,
  type League,
  type LeagueCountingStagesMode,
  type LeagueRankingEntry,
  type LeagueRankingScope,
} from '@nexago/leagues';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from './firestore';
import { fetchProfileNames, fetchTeamNames } from './teams-repository';

/** Adaptador do `@nexago/leagues` pro portal do organizador: injeta a instância do Firestore e
 *  o `projectId` (path dos rankings materializados) e resolve os nomes de exibição — duplas
 *  por `teams`/`public_profiles`, atletas direto por `public_profiles`. O mapeamento de
 *  `leagues/{id}` e a regra de pontos efetivos vivem no shared, junto com o portal do atleta. */

export async function listMyLeagues(uid: string): Promise<League[]> {
  return fetchLeaguesByManager(organizerFirestore(), uid);
}

export async function getLeague(id: string): Promise<League | null> {
  return fetchLeague(organizerFirestore(), id);
}

export async function closeLeagueSeason(leagueId: string, uid: string): Promise<void> {
  return closeLeagueSeasonShared(organizerFirestore(), leagueId, uid);
}

export async function cancelLeague(leagueId: string, uid: string): Promise<void> {
  return cancelLeagueShared(organizerFirestore(), leagueId, uid);
}

/** Pontuação do ranking já com o nome pronto pra exibição, ainda sem posição — quem recorta
 *  por categoria e numera é o `rankLeagueRows`. */
export interface LeagueRankingNamedEntry extends LeagueRankingEntry {
  displayName: string;
}

/** Todas as pontuações da liga no escopo pedido, com nomes resolvidos numa leva só. */
export async function listLeagueRanking(params: {
  leagueId: string;
  scope: LeagueRankingScope;
  mode: LeagueCountingStagesMode;
}): Promise<LeagueRankingNamedEntry[]> {
  const projectId = environment.firebase.projectId;
  if (!projectId) return [];
  const db = organizerFirestore();
  const rows = await fetchLeagueRanking(db, projectId, params);
  if (rows.length === 0) return [];

  const refIds = rows.map((r) => r.refId);
  const names =
    params.scope === 'teams' ? await fetchTeamNames(db, projectId, refIds) : await fetchProfileNames(db, refIds);

  const fallback = params.scope === 'teams' ? 'Dupla' : 'Atleta';
  return rows.map((r) => ({ ...r, displayName: names.get(r.refId) ?? fallback }));
}
