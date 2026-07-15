import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';

/** Espelha `TournamentsRepository`/`TournamentMatchesRepository` (Flutter) — só o doc real
 *  `tournaments/{id}` (o fallback legado `artifacts/.../tournaments` não tem regra própria e
 *  cai no catch-all "deny all" do firestore.rules, então nunca é lido) + `matches` +
 *  `leagueTeamRankings`/`leagueAthleteRankings`, todos `allow read: if true`. */

function numberOf(data: Record<string, unknown>, key: string): number {
  const v = data[key];
  return typeof v === 'number' ? v : 0;
}

function stringOf(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function boolOf(data: Record<string, unknown>, key: string): boolean {
  return data[key] === true;
}

function dateOf(data: Record<string, unknown>, key: string): Date | null {
  const v = data[key] as { toDate?: () => Date } | undefined;
  return v?.toDate?.() ?? null;
}

export interface TournamentCategoryRaw {
  categoryId: string;
  categoryName: string;
  entryFee: number;
  maxTeams: number;
  spotsLeft: number;
  level: string | null;
  genderType: string | null;
  bracketFormat: string | null;
  registrationClosed: boolean;
}

export interface TournamentRaw {
  id: string;
  name: string;
  city: string | null;
  locationName: string | null;
  startAt: Date | null;
  endAt: Date | null;
  format: string | null;
  capacity: number;
  enrolledCount: number;
  featured: boolean;
  liveMatchesNow: number;
  listingStatus: string | null;
  leagueId: string | null;
  leagueStageId: string | null;
  leagueStageOrder: number;
  leagueStageName: string | null;
  regulationsText: string | null;
  categories: TournamentCategoryRaw[];
}

function categoryFromRaw(raw: unknown): TournamentCategoryRaw | null {
  if (raw == null || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const categoryId = stringOf(data, 'categoryId') ?? stringOf(data, 'id');
  if (!categoryId) return null;
  return {
    categoryId,
    categoryName: stringOf(data, 'categoryName') ?? stringOf(data, 'name') ?? 'Categoria',
    entryFee: numberOf(data, 'entryFee'),
    maxTeams: numberOf(data, 'maxTeams'),
    spotsLeft: numberOf(data, 'spotsLeft'),
    level: stringOf(data, 'level'),
    genderType: stringOf(data, 'genderType'),
    bracketFormat: stringOf(data, 'bracketFormat'),
    registrationClosed: boolOf(data, 'registrationClosed'),
  };
}

function tournamentFromDoc(id: string, data: Record<string, unknown>): TournamentRaw {
  const categoriesRaw = Array.isArray(data['categories']) ? (data['categories'] as unknown[]) : [];
  return {
    id,
    name: stringOf(data, 'name') ?? 'Torneio',
    city: stringOf(data, 'city'),
    locationName: stringOf(data, 'locationName') ?? stringOf(data, 'location'),
    startAt: dateOf(data, 'startAt'),
    endAt: dateOf(data, 'endAt'),
    format: stringOf(data, 'format'),
    capacity: numberOf(data, 'capacity'),
    enrolledCount: numberOf(data, 'enrolledCount'),
    featured: boolOf(data, 'featured'),
    liveMatchesNow: numberOf(data, 'liveMatchesNow'),
    listingStatus: stringOf(data, 'listingStatus') ?? stringOf(data, 'status'),
    leagueId: stringOf(data, 'leagueId'),
    leagueStageId: stringOf(data, 'leagueStageId'),
    leagueStageOrder: numberOf(data, 'leagueStageOrder'),
    leagueStageName: stringOf(data, 'leagueStageName'),
    regulationsText: stringOf(data, 'regulationsText'),
    categories: categoriesRaw.map(categoryFromRaw).filter((c): c is TournamentCategoryRaw => c != null),
  };
}

export async function fetchTournaments(db: Firestore, take = 100): Promise<TournamentRaw[]> {
  const snap = await getDocs(query(collection(db, 'tournaments')));
  return snap.docs.slice(0, take).map((d) => tournamentFromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function fetchTournamentById(db: Firestore, tournamentId: string): Promise<TournamentRaw | null> {
  const snap = await getDoc(doc(db, 'tournaments', tournamentId));
  if (!snap.exists()) return null;
  return tournamentFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

// --- Partidas (chaves/grupos) ---

export interface MatchRaw {
  matchId: string;
  categoryId: string;
  matchType: string | null;
  round: number;
  matchNumber: number;
  poolId: string | null;
  isGroupMatch: boolean;
  teamAId: string | null;
  teamBId: string | null;
  teamAName: string | null;
  teamBName: string | null;
  winnerId: string | null;
  resultA: string;
  resultB: string;
  status: string | null;
  scheduleTime: Date | null;
}

function matchFromDoc(id: string, data: Record<string, unknown>): MatchRaw {
  return {
    matchId: id,
    categoryId: stringOf(data, 'categoryId') ?? '',
    matchType: stringOf(data, 'matchType'),
    round: numberOf(data, 'round'),
    matchNumber: numberOf(data, 'matchNumber'),
    poolId: stringOf(data, 'poolId'),
    isGroupMatch: boolOf(data, 'isGroupMatch'),
    teamAId: stringOf(data, 'teamAId'),
    teamBId: stringOf(data, 'teamBId'),
    teamAName: stringOf(data, 'teamADescription'),
    teamBName: stringOf(data, 'teamBDescription'),
    winnerId: stringOf(data, 'winnerId'),
    resultA: stringOf(data, 'resultA') ?? '',
    resultB: stringOf(data, 'resultB') ?? '',
    status: stringOf(data, 'status'),
    scheduleTime: dateOf(data, 'scheduleTime'),
  };
}

function artifactsCollection(db: Firestore, projectId: string, name: string) {
  return collection(db, `artifacts/${projectId}/public/data/${name}`);
}

/** Espelha `TournamentMatchesRepository.watchByCategory` — duas igualdades (`tournamentId` +
 *  `categoryId`), já cobertas por índice composto existente (`firestore.indexes.json`). */
export async function fetchMatchesByCategory(db: Firestore, projectId: string, tournamentId: string, categoryId: string): Promise<MatchRaw[]> {
  const snap = await getDocs(
    query(artifactsCollection(db, projectId, 'matches'), where('tournamentId', '==', tournamentId), where('categoryId', '==', categoryId)),
  );
  return snap.docs.map((d) => matchFromDoc(d.id, d.data() as Record<string, unknown>));
}

export interface LeagueRankingRowRaw {
  entityId: string;
  displayName: string;
  totalPoints: number;
  pointsByStage: Readonly<Record<string, number>>;
}

async function fetchLeagueRankingCollection(db: Firestore, projectId: string, collectionName: string, leagueId: string): Promise<LeagueRankingRowRaw[]> {
  const snap = await getDocs(query(artifactsCollection(db, projectId, collectionName), where('leagueId', '==', leagueId)));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const pointsByStageRaw = data['pointsByStage'];
    return {
      entityId: d.id,
      displayName: stringOf(data, 'displayName') ?? stringOf(data, 'name') ?? 'Atleta',
      totalPoints: numberOf(data, 'totalPoints'),
      pointsByStage: pointsByStageRaw != null && typeof pointsByStageRaw === 'object' ? (pointsByStageRaw as Record<string, number>) : {},
    };
  });
}

export function fetchLeagueTeamRanking(db: Firestore, projectId: string, leagueId: string): Promise<LeagueRankingRowRaw[]> {
  return fetchLeagueRankingCollection(db, projectId, 'leagueTeamRankings', leagueId);
}

export function fetchLeagueAthleteRanking(db: Firestore, projectId: string, leagueId: string): Promise<LeagueRankingRowRaw[]> {
  return fetchLeagueRankingCollection(db, projectId, 'leagueAthleteRankings', leagueId);
}

// --- Ligas (`leagues/{id}`, top-level, allow read: if true) ---

export interface LeagueStageRaw {
  id: string;
  name: string;
  order: number;
  dateLabel: string | null;
  tournamentIds: string[];
}

export interface LeagueRaw {
  id: string;
  name: string;
  seasonLabel: string | null;
  city: string | null;
  organizationName: string | null;
  description: string | null;
  listingStatus: string | null;
  countingStagesModeRaw: string | null;
  stages: LeagueStageRaw[];
}

function leagueFromDoc(id: string, data: Record<string, unknown>): LeagueRaw {
  const stagesRaw = Array.isArray(data['stages']) ? (data['stages'] as unknown[]) : [];
  const stages: LeagueStageRaw[] = stagesRaw
    .filter((s): s is Record<string, unknown> => s != null && typeof s === 'object')
    .map((s, i) => ({
      id: stringOf(s, 'id') ?? `stage-${i}`,
      name: stringOf(s, 'name') ?? 'Etapa',
      order: numberOf(s, 'order') || i + 1,
      dateLabel: stringOf(s, 'dateLabel'),
      tournamentIds: Array.isArray(s['tournamentIds']) ? (s['tournamentIds'] as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    }))
    .sort((a, b) => a.order - b.order);

  return {
    id,
    name: stringOf(data, 'name') ?? 'Liga',
    seasonLabel: stringOf(data, 'seasonLabel') ?? stringOf(data, 'season'),
    city: stringOf(data, 'city'),
    organizationName: stringOf(data, 'organizationName'),
    description: stringOf(data, 'description'),
    listingStatus: stringOf(data, 'listingStatus') ?? stringOf(data, 'status'),
    countingStagesModeRaw: stringOf(data, 'countingStagesMode'),
    stages,
  };
}

export async function fetchLeagues(db: Firestore): Promise<LeagueRaw[]> {
  const snap = await getDocs(collection(db, 'leagues'));
  return snap.docs.map((d) => leagueFromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function fetchLeagueById(db: Firestore, leagueId: string): Promise<LeagueRaw | null> {
  const snap = await getDoc(doc(db, 'leagues', leagueId));
  if (!snap.exists()) return null;
  return leagueFromDoc(snap.id, snap.data() as Record<string, unknown>);
}
