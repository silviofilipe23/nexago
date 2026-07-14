import {
  collection,
  documentId,
  getDoc,
  getDocs,
  doc,
  limit,
  query,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { MatchRaw } from './teams-logic';

/** Espelha `TournamentTeamsRepository`/`team_public_profile_providers.dart` — mesmas coleções
 *  do app Flutter (`teams`, `teamRankings`, `matches`, `public_profiles`), sem Cloud Function
 *  nova (todas já são `allow read: if true` ou `if request.auth != null`). */

const WHERE_IN_CHUNK_SIZE = 10;

function publicDataPath(projectId: string, collectionName: string): string {
  return `artifacts/${projectId}/public/data/${collectionName}`;
}

function numberOf(data: Record<string, unknown>, key: string): number {
  const v = data[key];
  return typeof v === 'number' ? v : 0;
}

function stringOf(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export interface TeamRaw {
  teamId: string;
  teamName: string | null;
  player1Id: string | null;
  player2Id: string | null;
  gender: string | null;
}

function teamRawFromDoc(d: QueryDocumentSnapshot): TeamRaw {
  const data = d.data() as Record<string, unknown>;
  return {
    teamId: d.id,
    teamName: stringOf(data, 'teamName'),
    player1Id: stringOf(data, 'player1Id'),
    player2Id: stringOf(data, 'player2Id'),
    gender: stringOf(data, 'gender'),
  };
}

export interface TeamProfileLite {
  fullName: string | null;
  city: string | null;
  gender: string | null;
  primarySportId: string | null;
  levelsBySport: Readonly<Record<string, string>> | null;
}

/** Times em que `uid` é jogador (`player1Id==uid` OU `player2Id==uid` — duas queries de
 *  igualdade simples, sem índice novo, mesma estratégia de `teamIdsForAthlete`). */
export async function fetchMyTeams(db: Firestore, projectId: string, uid: string): Promise<TeamRaw[]> {
  const col = collection(db, publicDataPath(projectId, 'teams'));
  const [snapA, snapB] = await Promise.all([
    getDocs(query(col, where('player1Id', '==', uid))),
    getDocs(query(col, where('player2Id', '==', uid))),
  ]);
  const byId = new Map<string, TeamRaw>();
  for (const d of [...snapA.docs, ...snapB.docs]) byId.set(d.id, teamRawFromDoc(d));
  return [...byId.values()];
}

/** Página de times pra "Descobrir equipes" — sem `orderBy` (evita índice composto novo),
 *  filtro por gênero/nível/cidade e busca acontecem em memória no cliente. */
export async function fetchTeamsPage(db: Firestore, projectId: string, take = 60): Promise<TeamRaw[]> {
  const snap = await getDocs(query(collection(db, publicDataPath(projectId, 'teams')), limit(take)));
  return snap.docs.map(teamRawFromDoc);
}

export async function fetchTeamById(db: Firestore, projectId: string, teamId: string): Promise<TeamRaw | null> {
  const snap = await getDoc(doc(db, publicDataPath(projectId, 'teams'), teamId));
  if (!snap.exists()) return null;
  return teamRawFromDoc(snap as QueryDocumentSnapshot);
}

/** Times adversários pra resolver o nome de exibição no histórico de partidas de um time. */
export async function fetchTeamsByIds(db: Firestore, projectId: string, teamIds: readonly string[]): Promise<Map<string, TeamRaw>> {
  const uniqueIds = [...new Set(teamIds)];
  const col = collection(db, publicDataPath(projectId, 'teams'));
  const result = new Map<string, TeamRaw>();
  await Promise.all(
    chunk(uniqueIds, WHERE_IN_CHUNK_SIZE).map(async (ids) => {
      if (ids.length === 0) return;
      const snap = await getDocs(query(col, where(documentId(), 'in', ids)));
      for (const d of snap.docs) result.set(d.id, teamRawFromDoc(d));
    }),
  );
  return result;
}

export async function fetchTeamRankings(
  db: Firestore,
  projectId: string,
  teamIds: readonly string[],
): Promise<Map<string, { points: number; tournamentsCount: number }>> {
  const uniqueIds = [...new Set(teamIds)];
  const col = collection(db, publicDataPath(projectId, 'teamRankings'));
  const result = new Map<string, { points: number; tournamentsCount: number }>();
  await Promise.all(
    chunk(uniqueIds, WHERE_IN_CHUNK_SIZE).map(async (ids) => {
      if (ids.length === 0) return;
      const snap = await getDocs(query(col, where(documentId(), 'in', ids)));
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        result.set(d.id, { points: numberOf(data, 'totalPoints'), tournamentsCount: numberOf(data, 'tournamentsCount') });
      }
    }),
  );
  return result;
}

export async function fetchPublicProfilesLite(db: Firestore, uids: readonly string[]): Promise<Map<string, TeamProfileLite>> {
  const uniqueIds = [...new Set(uids.map((id) => id.trim()).filter(Boolean))];
  const col = collection(db, 'public_profiles');
  const result = new Map<string, TeamProfileLite>();
  await Promise.all(
    chunk(uniqueIds, WHERE_IN_CHUNK_SIZE).map(async (ids) => {
      if (ids.length === 0) return;
      const snap = await getDocs(query(col, where(documentId(), 'in', ids)));
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const sportOnboarding = (data['sportOnboarding'] ?? {}) as Record<string, unknown>;
        const levelsBySportRaw = sportOnboarding['levelsBySport'];
        result.set(d.id, {
          fullName: stringOf(data, 'fullName') ?? stringOf(data, 'name'),
          city: stringOf(data, 'city'),
          gender: stringOf(data, 'gender'),
          primarySportId: typeof sportOnboarding['primarySportId'] === 'string' ? (sportOnboarding['primarySportId'] as string) : null,
          levelsBySport:
            levelsBySportRaw != null && typeof levelsBySportRaw === 'object' ? (levelsBySportRaw as Record<string, string>) : null,
        });
      }
    }),
  );
  return result;
}

/** Partidas decididas OU em andamento de um time (`teamAId==id` OU `teamBId==id`), mais
 *  recentes primeiro. */
export async function fetchTeamMatches(db: Firestore, projectId: string, teamId: string): Promise<MatchRaw[]> {
  const col = collection(db, publicDataPath(projectId, 'matches'));
  const [snapA, snapB] = await Promise.all([
    getDocs(query(col, where('teamAId', '==', teamId))),
    getDocs(query(col, where('teamBId', '==', teamId))),
  ]);
  const byId = new Map<string, MatchRaw>();
  for (const d of [...snapA.docs, ...snapB.docs]) {
    const data = d.data() as Record<string, unknown>;
    const endedAt = data['matchEndedAt'] as { toMillis?: () => number } | undefined;
    byId.set(d.id, {
      matchId: d.id,
      teamAId: stringOf(data, 'teamAId') ?? '',
      teamBId: stringOf(data, 'teamBId') ?? '',
      winnerId: stringOf(data, 'winnerId'),
      resultA: stringOf(data, 'resultA') ?? '',
      resultB: stringOf(data, 'resultB') ?? '',
      status: stringOf(data, 'status') ?? '',
      endedAtMs: endedAt?.toMillis?.() ?? null,
    });
  }
  return [...byId.values()].sort((a, b) => (b.endedAtMs ?? 0) - (a.endedAtMs ?? 0));
}
