import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from '../data/firestore';
import { initialsOf } from '../data/mock-data';
import {
  chunkIds,
  fetchProfileDisplays,
  fetchTeamsByIds,
  teamMemberIds,
  type OrganizerTeamPlayers,
  type ProfileDisplay,
} from '../data/teams-repository';

/** Rosto de atleta no card da chave / placar — foto quando o perfil tem. */
export interface BracketFace {
  name: string;
  initials: string;
  photoUrl: string | null;
}

/** Quinteto é o elenco máximo das categorias de equipe no NexaGO. */
const MAX_TEAM_FACES = 5;

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function uniqueIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Quebra rótulo "A / B / C" em nomes — fallback quando ainda não há `teamId`. */
export function facesFromLabel(teamLabel: string): BracketFace[] {
  const parts = teamLabel
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  const names = parts.length > 0 ? parts.slice(0, MAX_TEAM_FACES) : [teamLabel];
  return names.map((name) => ({
    name,
    initials: initialsOf(name),
    photoUrl: null,
  }));
}

/** Um rosto por uid — perfil ausente vira iniciais, não some do stack. */
export function facesFromMemberIds(
  memberIds: readonly string[],
  profiles: ReadonlyMap<string, ProfileDisplay>,
): BracketFace[] {
  return uniqueIds(memberIds)
    .slice(0, MAX_TEAM_FACES)
    .map((id) => {
      const p = profiles.get(id);
      const name = p?.name ?? 'Atleta';
      return {
        name,
        initials: initialsOf(name),
        photoUrl: p?.photoUrl ?? null,
      };
    });
}

/** Rostos do elenco a partir do doc `teams` (memberUids ou player1/player2). */
export function facesFromTeam(
  team: OrganizerTeamPlayers,
  profiles: ReadonlyMap<string, ProfileDisplay>,
): BracketFace[] {
  return facesFromMemberIds(teamMemberIds(team), profiles);
}

/**
 * Elenco da inscrição (`participantUids`) — fonte completa do roster.
 * O `teamName` padrão só junta 3 primeiros nomes, então o rótulo da partida
 * NÃO serve pra contar atletas de quarteto/quinteto.
 */
async function fetchInscriptionRosters(
  db: Firestore,
  projectId: string,
  teamIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const chunks = chunkIds(teamIds);
  if (chunks.length === 0) return result;
  const col = collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions');
  const snaps = await Promise.all(
    chunks.map((chunk) => getDocs(query(col, where('teamId', 'in', chunk)))),
  );
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const teamId = optionalStr(data['teamId']);
      if (!teamId) continue;
      const raw = data['participantUids'];
      const uids = Array.isArray(raw)
        ? uniqueIds(raw.filter((x): x is string => typeof x === 'string'))
        : [];
      // Inscrição com elenco maior ganha — evita sobrescrever quarteto com doc parcial.
      const prev = result.get(teamId);
      if (!prev || uids.length > prev.length) result.set(teamId, uids);
    }
  }
  return result;
}

/** Prefere inscrição (elenco completo); senão memberUids do time; senão player1/2. */
export function resolveTeamRoster(
  team: OrganizerTeamPlayers | undefined,
  inscriptionUids: readonly string[] | undefined,
): string[] {
  if (inscriptionUids && inscriptionUids.length > 0) {
    return uniqueIds(inscriptionUids).slice(0, MAX_TEAM_FACES);
  }
  if (team) return teamMemberIds(team).slice(0, MAX_TEAM_FACES);
  return [];
}

/** Resolve fotos dos times em lotes — teams + inscrições + public_profiles. */
export async function fetchBracketFaces(
  teamIds: readonly string[],
): Promise<Map<string, BracketFace[]>> {
  const result = new Map<string, BracketFace[]>();
  const projectId = environment.firebase.projectId;
  const ids = [...new Set(teamIds.filter((id) => id.length > 0))];
  if (!projectId || ids.length === 0) return result;

  const db = organizerFirestore();
  const [teams, inscriptionRosters] = await Promise.all([
    fetchTeamsByIds(db, projectId, ids),
    fetchInscriptionRosters(db, projectId, ids),
  ]);

  const rosterByTeam = new Map<string, string[]>();
  for (const teamId of ids) {
    const roster = resolveTeamRoster(teams.get(teamId), inscriptionRosters.get(teamId));
    if (roster.length > 0) rosterByTeam.set(teamId, roster);
  }

  const playerIds = [...new Set([...rosterByTeam.values()].flat())];
  const profiles = await fetchProfileDisplays(db, playerIds);
  for (const [teamId, roster] of rosterByTeam) {
    const faces = facesFromMemberIds(roster, profiles);
    if (faces.length > 0) result.set(teamId, faces);
  }
  return result;
}

/** Preferência: faces hidratadas do time; senão iniciais do rótulo. */
export function facesForTeam(
  facesByTeam: ReadonlyMap<string, BracketFace[]>,
  teamId: string,
  fallbackLabel: string,
): BracketFace[] {
  if (teamId) {
    const faces = facesByTeam.get(teamId);
    if (faces && faces.length > 0) return faces;
  }
  return facesFromLabel(fallbackLabel);
}
