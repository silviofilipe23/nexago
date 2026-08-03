import { collection, documentId, getDocs, query, where, type Firestore } from 'firebase/firestore';

/** Nome de exibição de duplas — porta fiel de `_pairLabel`
 *  (`tournament_match_enrichment_service.dart`, Flutter): usa `teamName` do doc em
 *  `artifacts/{projectId}/public/data/teams` quando preenchido; senão resolve
 *  `player1Id`/`player2Id` em `public_profiles` (nickname → fullName → name) e monta
 *  "Jogador1 / Jogador2". Usado onde só temos o `teamId` cru (inscrições, partidas de rodada
 *  1 — que vêm de SEED direto e nunca ganham `teamADescription`/`teamBDescription`). */

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export interface OrganizerTeamPlayers {
  teamName: string | null;
  player1Id: string;
  player2Id: string;
  isLookingForPartner: boolean;
}

async function chunkedByIds<T>(db: Firestore, path: string[], ids: readonly string[], pick: (data: Record<string, unknown>) => T): Promise<Map<string, T>> {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const result = new Map<string, T>();
  if (unique.length === 0) return result;
  const col = collection(db, path[0]!, ...path.slice(1));
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const snap = await getDocs(query(col, where(documentId(), 'in', chunk)));
    for (const d of snap.docs) result.set(d.id, pick(d.data() as Record<string, unknown>));
  }
  return result;
}

/** Nomes de exibição de atletas (`nickname` → `fullName` → `name`) — uids sem nome ficam fora
 *  do mapa pra quem chama decidir o fallback. */
export async function fetchProfileNames(db: Firestore, uids: readonly string[]): Promise<Map<string, string>> {
  const profiles = await chunkedByIds(db, ['public_profiles'], uids, (data) => optionalStr(data['nickname']) ?? optionalStr(data['fullName']) ?? optionalStr(data['name']) ?? '');
  const names = new Map<string, string>();
  for (const [uid, name] of profiles) if (name) names.set(uid, name);
  return names;
}

export async function fetchTeamsByIds(
  db: Firestore,
  projectId: string,
  teamIds: readonly string[],
): Promise<Map<string, OrganizerTeamPlayers>> {
  return chunkedByIds<OrganizerTeamPlayers>(db, ['artifacts', projectId, 'public', 'data', 'teams'], teamIds, (data) => ({
    teamName: optionalStr(data['teamName']),
    player1Id: optionalStr(data['player1Id']) ?? '',
    player2Id: optionalStr(data['player2Id']) ?? '',
    isLookingForPartner: data['isLookingForPartner'] === true,
  }));
}

export async function fetchTeamNames(db: Firestore, projectId: string, teamIds: readonly string[]): Promise<Map<string, string>> {
  const teams = await fetchTeamsByIds(db, projectId, teamIds);

  const playerIds = [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]);
  const profileNames = await fetchProfileNames(db, playerIds);

  const result = new Map<string, string>();
  for (const [teamId, team] of teams) {
    if (team.teamName) {
      result.set(teamId, team.teamName);
      continue;
    }
    const p1 = profileNames.get(team.player1Id) ?? '';
    const p2 = profileNames.get(team.player2Id) ?? '';
    if (team.isLookingForPartner) {
      if (p1) result.set(teamId, p1);
      continue;
    }
    if (p1 && p2 && p1 !== p2) result.set(teamId, `${p1} / ${p2}`);
    else if (p1) result.set(teamId, p1);
    else if (p2) result.set(teamId, p2);
  }
  return result;
}
