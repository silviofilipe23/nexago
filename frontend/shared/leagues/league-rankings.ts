import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { LeagueCountingStagesMode } from './league.model';

/** Ranking materializado da liga, escrito por `functions/src/league-ranking.ts` a cada partida
 *  encerrada, em `artifacts/{projectId}/public/data/leagueTeamRankings` (duplas) e
 *  `…/leagueAthleteRankings` (atletas). Cada doc guarda `stageResults[]` com os pontos por
 *  etapa; `effectivePoints` já vem calculado, e o recálculo local é só fallback pra docs
 *  antigos — mesma regra de `effectivePointsForMode` (`league_ranking_logic.dart`).
 *
 *  A busca filtra só por `leagueId` (igualdade única, sem índice composto) e o recorte por
 *  categoria acontece em memória, no `rankLeagueRows` — o volume por liga é de centenas de
 *  docs no pior caso, e assim trocar de categoria na tela não refaz a query. */

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export interface LeagueStageResult {
  tournamentId: string;
  points: number;
  place: number | null;
}

export interface LeagueRankingEntry {
  /** Id do doc de ranking. */
  id: string;
  /** `teamId` (duplas) ou `athleteId` (atletas). */
  refId: string;
  /** Categoria da liga a que esta pontuação pertence — o ranking é sempre por categoria. */
  categoryId: string | null;
  effectivePoints: number;
  rawPoints: number;
  stagesPlayed: number;
  stageResults: LeagueStageResult[];
}

export type LeagueRankingRow = LeagueRankingEntry & { rank: number };

export type LeagueRankingScope = 'teams' | 'athletes';

/** Soma dos N melhores resultados conforme o modo de contagem da liga. */
export function effectivePointsForMode(stagePoints: readonly number[], mode: LeagueCountingStagesMode): number {
  const sorted = [...stagePoints].sort((a, b) => b - a);
  if (mode === 'all_stages') return sorted.reduce((sum, p) => sum + p, 0);
  const take = mode === 'best_3_of_5' ? 3 : 4;
  return sorted.slice(0, take).reduce((sum, p) => sum + p, 0);
}

const COLLECTION_BY_SCOPE: Record<LeagueRankingScope, string> = {
  teams: 'leagueTeamRankings',
  athletes: 'leagueAthleteRankings',
};

const REF_FIELD_BY_SCOPE: Record<LeagueRankingScope, string> = {
  teams: 'teamId',
  athletes: 'athleteId',
};

export function leagueRankingEntryFromDoc(
  id: string,
  data: Record<string, unknown>,
  refField: string,
  mode: LeagueCountingStagesMode,
): LeagueRankingEntry {
  const rawStageResults = Array.isArray(data['stageResults']) ? (data['stageResults'] as Record<string, unknown>[]) : [];
  const stageResults: LeagueStageResult[] = rawStageResults
    .map((s) => ({
      tournamentId: optionalStr(s['tournamentId']) ?? '',
      points: typeof s['points'] === 'number' ? s['points'] : 0,
      place: typeof s['place'] === 'number' ? s['place'] : null,
    }))
    .filter((s) => s.tournamentId.length > 0);
  const stagePoints = stageResults.map((s) => s.points);
  return {
    id,
    refId: optionalStr(data[refField]) ?? id,
    categoryId: optionalStr(data['categoryId']),
    effectivePoints: typeof data['effectivePoints'] === 'number' ? data['effectivePoints'] : effectivePointsForMode(stagePoints, mode),
    rawPoints: typeof data['rawPoints'] === 'number' ? data['rawPoints'] : stagePoints.reduce((sum, p) => sum + p, 0),
    stagesPlayed: stageResults.length,
    stageResults,
  };
}

/** Recorta por categoria (quando informada), ordena por pontos efetivos e numera as posições —
 *  desempate estável pelo refId, como no `buildLeagueAthleteRankingRows` do app. */
export function rankLeagueRows<T extends LeagueRankingEntry>(
  rows: readonly T[],
  categoryId?: string | null,
): (T & { rank: number })[] {
  const scoped = categoryId ? rows.filter((r) => r.categoryId === categoryId) : rows;
  return [...scoped]
    .sort((a, b) => b.effectivePoints - a.effectivePoints || a.refId.localeCompare(b.refId))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Todas as pontuações da liga no escopo pedido, sem posição — use `rankLeagueRows` pra
 *  recortar por categoria e numerar. */
export async function fetchLeagueRanking(
  db: Firestore,
  projectId: string,
  params: { leagueId: string; scope: LeagueRankingScope; mode: LeagueCountingStagesMode },
): Promise<LeagueRankingEntry[]> {
  const { leagueId, scope, mode } = params;
  const refField = REF_FIELD_BY_SCOPE[scope];
  const snap = await getDocs(
    query(collection(db, 'artifacts', projectId, 'public', 'data', COLLECTION_BY_SCOPE[scope]), where('leagueId', '==', leagueId)),
  );
  return snap.docs.map((d) => leagueRankingEntryFromDoc(d.id, d.data() as Record<string, unknown>, refField, mode));
}
