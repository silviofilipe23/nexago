import { collection, documentId, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { sumBestNPoints } from './ranking-logic';
import type { RankingProfileLite, RankingTeamLite, RawPointsRow } from './ranking-logic';

/** Espelha `NexagoArtifactsPaths`/`ranking_repository.dart` — mesmas coleções do app Flutter,
 *  sem Cloud Function nova (leitura direta, `allow read: if true` em todas). */

const BEST_N_RESULTS = 5;
const WHERE_IN_CHUNK_SIZE = 10; // limite do Firestore pra `documentId() in [...]`.

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

export async function fetchAthleteRankingGeneral(db: Firestore, projectId: string): Promise<RawPointsRow[]> {
  const snap = await getDocs(collection(db, publicDataPath(projectId, 'athleteRankings')));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return { entityId: d.id, points: numberOf(data, 'totalPoints'), tournamentsCount: numberOf(data, 'tournamentsCount') };
  });
}

export async function fetchTeamRankingGeneral(db: Firestore, projectId: string): Promise<RawPointsRow[]> {
  const snap = await getDocs(collection(db, publicDataPath(projectId, 'teamRankings')));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return { entityId: d.id, points: numberOf(data, 'totalPoints'), tournamentsCount: numberOf(data, 'tournamentsCount') };
  });
}

interface CategoryResult {
  teamId: string;
  pointsEarned: number;
}

/** `tournamentCategoryResults` do ano — tenta `year` numérico, cai pra string (docs legados). */
async function fetchYearCategoryResults(db: Firestore, projectId: string, year: number): Promise<CategoryResult[]> {
  const col = collection(db, publicDataPath(projectId, 'tournamentCategoryResults'));
  let snap = await getDocs(query(col, where('year', '==', year)));
  if (snap.empty) {
    snap = await getDocs(query(col, where('year', '==', String(year))));
  }
  return snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .map((data) => ({ teamId: stringOf(data, 'teamId') ?? '', pointsEarned: numberOf(data, 'pointsEarned') }))
    .filter((r) => r.teamId.length > 0);
}

export async function fetchTeamsByIds(db: Firestore, projectId: string, teamIds: readonly string[]): Promise<Map<string, RankingTeamLite>> {
  const uniqueIds = [...new Set(teamIds)];
  const col = collection(db, publicDataPath(projectId, 'teams'));
  const result = new Map<string, RankingTeamLite>();
  await Promise.all(
    chunk(uniqueIds, WHERE_IN_CHUNK_SIZE).map(async (ids) => {
      const snap = await getDocs(query(col, where(documentId(), 'in', ids)));
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        result.set(d.id, {
          teamName: stringOf(data, 'teamName'),
          player1Id: stringOf(data, 'player1Id'),
          player2Id: stringOf(data, 'player2Id'),
          gender: stringOf(data, 'gender'),
        });
      }
    }),
  );
  return result;
}

export async function fetchPublicProfiles(db: Firestore, uids: readonly string[]): Promise<Map<string, RankingProfileLite>> {
  const uniqueIds = [...new Set(uids.map((id) => id.trim()).filter(Boolean))];
  const col = collection(db, 'public_profiles');
  const result = new Map<string, RankingProfileLite>();
  await Promise.all(
    chunk(uniqueIds, WHERE_IN_CHUNK_SIZE).map(async (ids) => {
      const snap = await getDocs(query(col, where(documentId(), 'in', ids)));
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const sportOnboarding = (data['sportOnboarding'] ?? {}) as Record<string, unknown>;
        const levelsBySportRaw = sportOnboarding['levelsBySport'];
        result.set(d.id, {
          fullName: stringOf(data, 'fullName') ?? stringOf(data, 'name'),
          gender: stringOf(data, 'gender'),
          primarySportId: typeof sportOnboarding['primarySportId'] === 'string' ? (sportOnboarding['primarySportId'] as string) : null,
          levelsBySport:
            levelsBySportRaw != null && typeof levelsBySportRaw === 'object'
              ? (levelsBySportRaw as Record<string, string>)
              : null,
          avatarUrl: stringOf(data, 'profilePhotoUrl') ?? stringOf(data, 'avatarUrl'),
        });
      }
    }),
  );
  return result;
}

/** Pontos por atleta no ano: cada resultado credita os dois jogadores da dupla; a pontuação
 *  final é a soma dos `BEST_N_RESULTS` melhores lançamentos do ano (espelha `sumBestNPoints`). */
export async function fetchAthleteRankingByYear(db: Firestore, projectId: string, year: number): Promise<RawPointsRow[]> {
  const results = await fetchYearCategoryResults(db, projectId, year);
  if (results.length === 0) return [];

  const teams = await fetchTeamsByIds(
    db,
    projectId,
    results.map((r) => r.teamId),
  );

  const pointsByAthlete = new Map<string, number[]>();
  for (const result of results) {
    const team = teams.get(result.teamId);
    for (const athleteId of [team?.player1Id, team?.player2Id]) {
      if (!athleteId) continue;
      const list = pointsByAthlete.get(athleteId) ?? [];
      list.push(result.pointsEarned);
      pointsByAthlete.set(athleteId, list);
    }
  }

  return [...pointsByAthlete.entries()].map(([entityId, points]) => ({
    entityId,
    points: sumBestNPoints(points, BEST_N_RESULTS),
    tournamentsCount: points.length,
  }));
}

export async function fetchTeamRankingByYear(db: Firestore, projectId: string, year: number): Promise<RawPointsRow[]> {
  const results = await fetchYearCategoryResults(db, projectId, year);
  if (results.length === 0) return [];

  const pointsByTeam = new Map<string, number[]>();
  for (const result of results) {
    const list = pointsByTeam.get(result.teamId) ?? [];
    list.push(result.pointsEarned);
    pointsByTeam.set(result.teamId, list);
  }

  return [...pointsByTeam.entries()].map(([entityId, points]) => ({
    entityId,
    points: sumBestNPoints(points, BEST_N_RESULTS),
    tournamentsCount: points.length,
  }));
}
