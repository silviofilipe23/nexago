import { rosterSizeFromMemberUids } from '@nexago/live-scoring';
import type { Firestore } from 'firebase/firestore';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../data/public-profiles-repository';
import { fetchTeamsByIds, teamMemberIds, type ArenaTeam } from '../data/teams-repository';
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
  const profileIds = [...teams.values()].flatMap((t) => teamMemberIds(t));
  const profiles = await fetchPublicProfilesByIds(db, profileIds);
  return { teams, profiles };
}

/** Rótulo da dupla; `fallback` é a descrição do slot na chave ("Vencedor J5"), usada só quando
 *  o time não existe mais — nunca como nome. */
export function teamLabelOf(names: MesaTeamNames, teamId: string, fallback: string | null): string {
  return duoNameOf(teamId, names.teams, names.profiles, fallback);
}

/** Nome do atleta pela POSIÇÃO no elenco (1..N) — a ordem de `memberUids` (na dupla legada,
 *  `player1Id`/`player2Id`) que o doc da partida usa pra dizer quem está sacando (ver
 *  `serving-player.ts`). Cai em "Atleta N" enquanto o join não chegou ou o perfil não tem nome:
 *  o que importa na mesa é a posição, que é o que fica gravado. */
export function playerNameOf(names: MesaTeamNames, teamId: string, slot: number): string {
  const team = teamId ? names.teams.get(teamId) : undefined;
  const uid = team ? teamMemberIds(team)[slot - 1] : undefined;
  const name = (uid ? names.profiles.get(uid)?.displayName : '')?.trim() ?? '';
  return name || `Atleta ${slot}`;
}

/** Atletas do elenco (1 individual, 2 dupla, 3–5 equipe) pelo `memberUids` gravado — a dupla
 *  procurando parceiro segue dupla. Sem o time carregado ainda, dupla. */
export function rosterSizeOf(names: MesaTeamNames, teamId: string): number {
  const team = teamId ? names.teams.get(teamId) : undefined;
  return rosterSizeFromMemberUids(team?.memberUids);
}
