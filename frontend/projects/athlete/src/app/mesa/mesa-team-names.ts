import type { Firestore } from 'firebase/firestore';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../data/public-profiles-repository';
import { fetchTeamsByIds, type ArenaTeam } from '../data/teams-repository';
import { duoNameOf } from '../profile/public-profile-activity';

/** Nomes das duplas pra mesa: `teams` → `public_profiles`, mesmo join (e mesmo `duoNameOf`) do
 *  `TournamentLiveStore`. Fica separado do store das telas de atleta porque a mesa carrega um
 *  torneio inteiro sem depender da casca do torneio. */
export interface MesaTeamNames {
  teams: ReadonlyMap<string, ArenaTeam>;
  profiles: ReadonlyMap<string, AthletePublicProfile>;
}

export const EMPTY_TEAM_NAMES: MesaTeamNames = { teams: new Map(), profiles: new Map() };

export async function fetchTeamNamesFor(db: Firestore, projectId: string, teamIds: readonly string[]): Promise<MesaTeamNames> {
  const ids = [...new Set(teamIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return EMPTY_TEAM_NAMES;
  const teams = await fetchTeamsByIds(db, projectId, ids);
  const profileIds = [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]);
  const profiles = await fetchPublicProfilesByIds(db, profileIds);
  return { teams, profiles };
}

/** Rótulo da dupla; `fallback` é a descrição do slot na chave ("Vencedor J5"), usada só quando
 *  o time não existe mais — nunca como nome. */
export function teamLabelOf(names: MesaTeamNames, teamId: string, fallback: string | null): string {
  return duoNameOf(teamId, names.teams, names.profiles, fallback);
}
