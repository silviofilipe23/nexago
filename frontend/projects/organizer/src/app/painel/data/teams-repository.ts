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

/** Limite de ids por `where(documentId(), 'in', …)` no Firestore. */
const IN_LIMIT = 10;

/** Ids únicos e não vazios, em lotes do tamanho que o `in` aceita. */
export function chunkIds(ids: readonly string[], size = IN_LIMIT): string[][] {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

async function chunkedByIds<T>(db: Firestore, path: string[], ids: readonly string[], pick: (data: Record<string, unknown>) => T): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  const chunks = chunkIds(ids);
  if (chunks.length === 0) return result;
  const col = collection(db, path[0]!, ...path.slice(1));
  // Os lotes são independentes: em série cada um esperava a latência do anterior, e um torneio
  // de 100 duplas (200 atletas) enfileirava 20 idas ao servidor só pra resolver nomes.
  const snaps = await Promise.all(chunks.map((chunk) => getDocs(query(col, where(documentId(), 'in', chunk)))));
  for (const snap of snaps) {
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

export interface ProfileDisplay {
  name: string;
  photoUrl: string | null;
}

/** Nome + foto de exibição (`public_profiles`) — mesmos fallbacks de foto do join das
 *  inscrições (`inscriptions-repository.ts`). Uids sem doc ficam fora do mapa. */
export async function fetchProfileDisplays(db: Firestore, uids: readonly string[]): Promise<Map<string, ProfileDisplay>> {
  return chunkedByIds<ProfileDisplay>(db, ['public_profiles'], uids, (data) => ({
    name: optionalStr(data['nickname']) ?? optionalStr(data['fullName']) ?? optionalStr(data['name']) ?? 'Atleta',
    photoUrl:
      optionalStr(data['profilePhotoUrl']) ?? optionalStr(data['avatarUrl']) ?? optionalStr(data['photoURL']) ?? optionalStr(data['photoUrl']),
  }));
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

/** Rótulo de cada dupla a partir de times e nomes JÁ carregados — sem I/O, pra quem já tem os
 *  dois mapas em mãos não pagar uma segunda passada em `teams`/`public_profiles`.
 *  `profileNames` só traz quem tem nome: uid ausente = perfil sem nome, e o time sem nenhum
 *  nome fica fora do mapa pra quem chama decidir o fallback. */
export function teamNamesFrom(
  teams: ReadonlyMap<string, OrganizerTeamPlayers>,
  profileNames: ReadonlyMap<string, string>,
): Map<string, string> {
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

/** Rótulo das duplas buscando times e perfis do zero — para quem só tem os `teamId` na mão. */
export async function fetchTeamNames(db: Firestore, projectId: string, teamIds: readonly string[]): Promise<Map<string, string>> {
  const teams = await fetchTeamsByIds(db, projectId, teamIds);
  const playerIds = [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]);
  return teamNamesFrom(teams, await fetchProfileNames(db, playerIds));
}
