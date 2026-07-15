import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { TournamentGenderCat } from './tournaments-repository';

/** `leagues/{id}` (top-level, leitura pública) — etapas são só referências a `tournaments/{id}`
 *  reais (`stage.tournamentIds`); não existe "status da etapa" no Firestore, é derivado
 *  olhando pro(s) torneio(s) referenciados. Espelha `LeagueDocumentMapper` (Flutter). */

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function genderCatOf(raw: unknown): TournamentGenderCat {
  const v = optionalStr(raw)?.toLowerCase() ?? '';
  if (v.includes('fem') || v === 'f') return 'F';
  if (v.includes('mist') || v.includes('mix')) return 'Mix';
  return 'M';
}

export interface LeagueStage {
  id: string;
  name: string;
  order: number;
  dateLabel: string | null;
  tournamentIds: string[];
}

export interface LeagueCategory {
  id: string;
  categoryName: string;
  genderType: TournamentGenderCat;
}

export type LeagueCountingStagesMode = 'best_4_of_6' | 'best_3_of_5' | 'all_stages';

export interface League {
  id: string;
  name: string;
  seasonLabel: string | null;
  city: string | null;
  state: string | null;
  organizationName: string | null;
  description: string | null;
  coverUrl: string | null;
  rawStatus: string | null;
  isDraftOrCancelled: boolean;
  seasonStartAt: Date | null;
  seasonEndAt: Date | null;
  plannedStagesCount: number | null;
  grandFinalEnabled: boolean;
  grandFinalSpots: number;
  countingStagesMode: LeagueCountingStagesMode;
  stages: LeagueStage[];
  categories: LeagueCategory[];
}

function stageFromRaw(raw: unknown): LeagueStage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = optionalStr(o['id']);
  if (!id) return null;
  return {
    id,
    name: optionalStr(o['name']) ?? id,
    order: typeof o['order'] === 'number' ? o['order'] : 0,
    dateLabel: optionalStr(o['dateLabel']),
    tournamentIds: Array.isArray(o['tournamentIds']) ? o['tournamentIds'].filter((x): x is string => typeof x === 'string') : [],
  };
}

function categoryFromRaw(raw: unknown): LeagueCategory | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = optionalStr(o['categoryId']) ?? optionalStr(o['id']) ?? optionalStr(o['categoryName']) ?? optionalStr(o['name']);
  if (!id) return null;
  return { id, categoryName: optionalStr(o['categoryName']) ?? optionalStr(o['name']) ?? id, genderType: genderCatOf(o['genderType']) };
}

function leagueFromDoc(id: string, data: Record<string, unknown>): League {
  const statusRaw = (optionalStr(data['listingStatus']) ?? optionalStr(data['status']) ?? '').toLowerCase();
  const countingMode = optionalStr(data['countingStagesMode']);
  return {
    id,
    name: optionalStr(data['name']) ?? 'Liga',
    seasonLabel: optionalStr(data['seasonLabel']) ?? optionalStr(data['season']),
    city: optionalStr(data['city']),
    state: optionalStr(data['state']),
    organizationName: optionalStr(data['organizationName']),
    description: optionalStr(data['description']),
    coverUrl: optionalStr(data['coverUrl']) ?? optionalStr(data['imageUrl']),
    rawStatus: statusRaw || null,
    isDraftOrCancelled: statusRaw.includes('draft') || statusRaw.includes('programado') || statusRaw.includes('cancel'),
    seasonStartAt: toDate(data['seasonStartAt']),
    seasonEndAt: toDate(data['seasonEndAt']),
    plannedStagesCount: typeof data['plannedStagesCount'] === 'number' ? data['plannedStagesCount'] : null,
    grandFinalEnabled: data['grandFinalEnabled'] === true,
    grandFinalSpots: typeof data['grandFinalSpots'] === 'number' ? data['grandFinalSpots'] : 16,
    countingStagesMode: countingMode === 'best_3_of_5' || countingMode === 'all_stages' ? countingMode : 'best_4_of_6',
    stages: Array.isArray(data['stages']) ? data['stages'].map(stageFromRaw).filter((s): s is LeagueStage => s != null) : [],
    categories: Array.isArray(data['categories']) ? data['categories'].map(categoryFromRaw).filter((c): c is LeagueCategory => c != null) : [],
  };
}

export async function fetchAllLeagues(db: Firestore): Promise<League[]> {
  const snap = await getDocs(collection(db, 'leagues'));
  return snap.docs.map((d) => leagueFromDoc(d.id, d.data() as Record<string, unknown>)).filter((l) => !l.isDraftOrCancelled);
}

export async function fetchLeague(db: Firestore, id: string): Promise<League | null> {
  const snap = await getDoc(doc(db, 'leagues', id));
  if (!snap.exists()) return null;
  return leagueFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

export interface LeagueStageResult {
  tournamentId: string;
  points: number;
  place: number | null;
}

export interface LeagueRankingRow {
  id: string;
  refId: string;
  rank: number;
  displayName: string;
  effectivePoints: number;
  rawPoints: number;
  stagesPlayed: number;
  stageResults: LeagueStageResult[];
}

function effectivePointsForMode(stagePoints: readonly number[], mode: LeagueCountingStagesMode): number {
  const sorted = [...stagePoints].sort((a, b) => b - a);
  if (mode === 'all_stages') return sorted.reduce((s, p) => s + p, 0);
  const n = mode === 'best_3_of_5' ? 3 : 4;
  return sorted.slice(0, n).reduce((s, p) => s + p, 0);
}

async function fetchLeagueRanking(db: Firestore, projectId: string, leagueId: string, collectionName: string, categoryId: string | null, mode: LeagueCountingStagesMode, refField: string): Promise<LeagueRankingRow[]> {
  const constraints = categoryId
    ? [where('leagueId', '==', leagueId), where('categoryId', '==', categoryId)]
    : [where('leagueId', '==', leagueId)];
  const snap = await getDocs(query(collection(db, 'artifacts', projectId, 'public', 'data', collectionName), ...constraints));

  const rows = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const rawStageResults = Array.isArray(data['stageResults']) ? (data['stageResults'] as Record<string, unknown>[]) : [];
    const stageResults: LeagueStageResult[] = rawStageResults
      .map((s) => ({
        tournamentId: optionalStr(s['tournamentId']) ?? '',
        points: typeof s['points'] === 'number' ? s['points'] : 0,
        place: typeof s['place'] === 'number' ? s['place'] : null,
      }))
      .filter((s) => s.tournamentId.length > 0);
    const stagePoints = stageResults.map((s) => s.points);
    const rawPoints = typeof data['rawPoints'] === 'number' ? data['rawPoints'] : stagePoints.reduce((s, p) => s + p, 0);
    const effectivePoints = typeof data['effectivePoints'] === 'number' ? data['effectivePoints'] : effectivePointsForMode(stagePoints, mode);
    return {
      id: d.id,
      refId: optionalStr(data[refField]) ?? d.id,
      effectivePoints,
      rawPoints,
      stagesPlayed: stageResults.length,
      stageResults,
    };
  });

  rows.sort((a, b) => b.effectivePoints - a.effectivePoints || a.refId.localeCompare(b.refId));
  return rows.map((r, i) => ({ ...r, rank: i + 1, displayName: '' }));
}

export async function fetchLeagueTeamRanking(db: Firestore, projectId: string, leagueId: string, categoryId: string | null, mode: LeagueCountingStagesMode): Promise<LeagueRankingRow[]> {
  return fetchLeagueRanking(db, projectId, leagueId, 'leagueTeamRankings', categoryId, mode, 'teamId');
}

export async function fetchLeagueAthleteRanking(db: Firestore, projectId: string, leagueId: string, categoryId: string | null, mode: LeagueCountingStagesMode): Promise<LeagueRankingRow[]> {
  return fetchLeagueRanking(db, projectId, leagueId, 'leagueAthleteRankings', categoryId, mode, 'athleteId');
}
