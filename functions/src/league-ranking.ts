import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {isMatchCompleted} from "./match-status";

const DEFAULT_LEAGUE_POINTS: Record<string, number> = {
  "1": 450,
  "2": 280,
  "3": 180,
  "4": 120,
  quarters: 80,
  groups: 40,
};

export type CountingStagesMode =
  | "best_4_of_6"
  | "best_3_of_5"
  | "all_stages";

export type LeaguePlacementBucket = "quarters" | "groups";

export interface LeaguePlacementAward {
  teamId: string;
  place?: number;
  bucket?: LeaguePlacementBucket;
}

export interface LeaguePlacementContext {
  hasThirdPlaceMatch: boolean;
  isDoubleElimination?: boolean;
  maxLbRound?: number;
  /**
   * Rodada da FINAL do mata-mata (eliminatória simples / grupos+mata-mata).
   * Usada para descobrir a semifinal (= final − 1). Sem ela, assume-se chave
   * de 4 (round 1 = semifinal), comportamento legado.
   */
  knockoutFinalRound?: number;
}

function leagueTeamRankingsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/leagueTeamRankings`;
}

function leagueAthleteRankingsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/leagueAthleteRankings`;
}

function artifactsTeamsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/teams`;
}

function artifactsMatchesPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/matches`;
}

function artifactsInscriptionsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/inscriptions`;
}

export function normalizeMatchType(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/_/g, " ");
}

function isFinalMatchType(matchType: string): boolean {
  return (
    matchType === "final" ||
    matchType === "grand final" ||
    matchType === "grand_final"
  );
}

function isThirdPlaceMatchType(matchType: string): boolean {
  return matchType === "third place" || matchType === "3rd place";
}

function isSemiFinalMatchType(matchType: string): boolean {
  return matchType.includes("semi");
}

function isQuarterFinalMatchType(matchType: string): boolean {
  return matchType.includes("quarter") || matchType === "qf";
}

export function pointsForPlace(
  table: Record<string, number>,
  place: number,
): number {
  const key = String(place);
  const configured = table[key];
  if (typeof configured === "number" && !Number.isNaN(configured)) {
    return Math.max(0, Math.round(configured));
  }
  return DEFAULT_LEAGUE_POINTS[key] ?? 0;
}

export function pointsForBucket(
  table: Record<string, number>,
  bucket: LeaguePlacementBucket,
): number {
  const configured = table[bucket];
  if (typeof configured === "number" && !Number.isNaN(configured)) {
    return Math.max(0, Math.round(configured));
  }
  return DEFAULT_LEAGUE_POINTS[bucket] ?? 0;
}

export function placementPoints(
  table: Record<string, number>,
  award: LeaguePlacementAward,
): number {
  if (award.place != null) {
    return pointsForPlace(table, award.place);
  }
  if (award.bucket != null) {
    return pointsForBucket(table, award.bucket);
  }
  return 0;
}

export function parseCountingStagesMode(raw: unknown): CountingStagesMode {
  const value = String(raw ?? "").trim();
  if (value === "best_3_of_5") return "best_3_of_5";
  if (value === "all_stages") return "all_stages";
  return "best_4_of_6";
}

export function effectivePointsFromStageResults(
  stageResults: Array<{points?: unknown}>,
  mode: CountingStagesMode,
): number {
  const points = stageResults
    .map((row) => Math.max(0, Math.round(Number(row.points) || 0)))
    .sort((a, b) => b - a);

  if (mode === "all_stages") {
    return points.reduce((sum, value) => sum + value, 0);
  }

  const take = mode === "best_3_of_5" ? 3 : 4;
  return points.slice(0, take).reduce((sum, value) => sum + value, 0);
}

function rawPointsFromStageResults(
  stageResults: Array<{points?: unknown}>,
): number {
  return stageResults.reduce(
    (sum, row) => sum + Math.max(0, Math.round(Number(row.points) || 0)),
    0,
  );
}

function winnerAndLoser(match: Record<string, unknown>): {
  winnerId: string;
  loserId: string;
} | null {
  const winnerId = (match.winnerId as string | undefined)?.trim();
  if (!winnerId) return null;

  const teamAId = (match.teamAId as string | undefined)?.trim() ?? "";
  const teamBId = (match.teamBId as string | undefined)?.trim() ?? "";
  const loserId = winnerId === teamAId ? teamBId : teamAId;
  if (!loserId) return null;

  return {winnerId, loserId};
}

function resolveDoubleEliminationLbPlacement(
  loserId: string,
  lbRound: number,
  maxLbRound: number,
): LeaguePlacementAward {
  if (maxLbRound <= 0) {
    return {teamId: loserId, bucket: "quarters"};
  }
  if (lbRound === maxLbRound) {
    return {teamId: loserId, place: 3};
  }
  if (lbRound === maxLbRound - 1 && maxLbRound >= 2) {
    return {teamId: loserId, place: 4};
  }
  return {teamId: loserId, bucket: "quarters"};
}

/** Resolve colocações de liga concedidas ao encerrar uma partida. */
export function resolveLeaguePlacementsFromMatch(
  match: Record<string, unknown>,
  context: LeaguePlacementContext,
): LeaguePlacementAward[] {
  if (!isMatchCompleted(match.status)) return [];

  const teams = winnerAndLoser(match);
  if (!teams) return [];

  const {winnerId, loserId} = teams;
  const matchType = normalizeMatchType(match.matchType);
  const isGroup =
    match.isGroupMatch === true || matchType === "group" || matchType === "groups";

  if (isGroup) return [];

  if (isFinalMatchType(matchType)) {
    return [
      {teamId: winnerId, place: 1},
      {teamId: loserId, place: 2},
    ];
  }

  if (context.isDoubleElimination) {
    if (matchType === "wb") return [];
    if (matchType === "lb") {
      const lbRound = (match.round as number | undefined) ?? 0;
      const maxLbRound = context.maxLbRound ?? 0;
      return [resolveDoubleEliminationLbPlacement(loserId, lbRound, maxLbRound)];
    }
  }

  if (isThirdPlaceMatchType(matchType)) {
    return [
      {teamId: winnerId, place: 3},
      {teamId: loserId, place: 4},
    ];
  }

  if (isSemiFinalMatchType(matchType)) {
    if (context.hasThirdPlaceMatch) return [];
    return [{teamId: loserId, place: 3}];
  }

  if (isQuarterFinalMatchType(matchType)) {
    return [{teamId: loserId, bucket: "quarters"}];
  }

  if (matchType === "knockout") {
    const round = (match.round as number | undefined) ?? 0;
    const finalRound = context.knockoutFinalRound ?? 0;
    // Semifinal = rodada imediatamente anterior à final. Numa chave de 4 a
    // 1ª rodada já é a semifinal; numa de 8/16 a semifinal é a 2ª/3ª rodada —
    // por isso NÃO dá para fixar "round 1 = semifinal".
    const semifinalRound = finalRound > 1 ? finalRound - 1 : 1;
    if (round === semifinalRound) {
      if (context.hasThirdPlaceMatch) return [];
      return [{teamId: loserId, place: 3}];
    }
    if (round > 0) {
      // Qualquer outra rodada do mata-mata (1ª rodada, oitavas, quartas…):
      // eliminado antes da semifinal.
      return [{teamId: loserId, bucket: "quarters"}];
    }
  }

  if (matchType === "wb" || matchType === "lb") {
    return [];
  }

  return [];
}

function upsertStageResult(
  stageResults: Array<Record<string, unknown>>,
  tournamentId: string,
  newEntry: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const existing = stageResults.find(
    (row) => row.tournamentId === tournamentId,
  );
  const newPoints = Math.max(0, Math.round(Number(newEntry.points) || 0));
  const existingPoints = Math.max(
    0,
    Math.round(Number(existing?.points) || 0),
  );
  const existingPlace = existing?.place;
  const existingBucket = existing?.placementBucket;
  const newPlace = newEntry.place;
  const newBucket = newEntry.placementBucket;

  if (
    existing &&
    existingPoints === newPoints &&
    existingPlace === newPlace &&
    existingBucket === newBucket
  ) {
    return stageResults;
  }
  const filtered = stageResults.filter(
    (row) => row.tournamentId !== tournamentId,
  );
  filtered.push(newEntry);
  return filtered;
}

async function loadKnockoutTeamIds(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<Set<string>> {
  const snap = await db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const ids = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const matchType = normalizeMatchType(data.matchType);
    const isGroup =
      data.isGroupMatch === true ||
      matchType === "group" ||
      matchType === "groups";
    if (isGroup) continue;

    const teamAId = (data.teamAId as string | undefined)?.trim();
    const teamBId = (data.teamBId as string | undefined)?.trim();
    if (teamAId) ids.add(teamAId);
    if (teamBId) ids.add(teamBId);
  }
  return ids;
}

async function loadCategoryBracketContext(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<{
  isDoubleElimination: boolean;
  maxLbRound: number;
  knockoutFinalRound: number;
  hasThirdPlaceMatch: boolean;
}> {
  const snap = await db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  let maxLbRound = 0;
  let isDoubleElimination = false;
  let knockoutFinalRound = 0;
  let hasThirdPlaceMatch = false;
  for (const doc of snap.docs) {
    const matchType = normalizeMatchType(doc.data().matchType);
    if (isThirdPlaceMatchType(matchType)) {
      hasThirdPlaceMatch = true;
    }
    if (matchType === "wb" || matchType === "lb") {
      isDoubleElimination = true;
    }
    if (matchType === "lb") {
      const round = (doc.data().round as number | undefined) ?? 0;
      if (round > maxLbRound) maxLbRound = round;
    }
    // Rodada da final do mata-mata SE/grupos (Final está sempre na última
    // rodada da cadeia "knockout"→"Final"). Ignora a fase de grupos (round 0).
    if (matchType === "knockout" || isFinalMatchType(matchType)) {
      const round = (doc.data().round as number | undefined) ?? 0;
      if (round > knockoutFinalRound) knockoutFinalRound = round;
    }
  }
  return {isDoubleElimination, maxLbRound, knockoutFinalRound, hasThirdPlaceMatch};
}

async function loadTeamAthleteIds(
  db: Firestore,
  projectId: string,
  teamId: string,
): Promise<string[]> {
  const snap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
  if (!snap.exists) return [];
  const data = snap.data() ?? {};
  const ids = new Set<string>();
  const player1Id = (data.player1Id as string | undefined)?.trim();
  const player2Id = (data.player2Id as string | undefined)?.trim();
  if (player1Id) ids.add(player1Id);
  if (player2Id && player2Id !== player1Id) ids.add(player2Id);
  return [...ids];
}

async function loadPaidTeamIds(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<Set<string>> {
  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const ids = new Set<string>();
  for (const doc of snap.docs) {
    if (doc.data().isPaid !== true) continue;
    if (doc.data().waitlist === true) continue;
    const teamId = (doc.data().teamId as string | undefined)?.trim();
    if (teamId) ids.add(teamId);
  }
  return ids;
}

async function upsertLeagueRankingDocument(
  db: Firestore,
  projectId: string,
  params: {
    collectionPath: string;
    docId: string;
    identity: Record<string, string>;
    tournamentId: string;
    stageId: string;
    stageOrder: number;
    points: number;
    award: LeaguePlacementAward;
    countingMode: CountingStagesMode;
    matchId?: string;
  },
): Promise<boolean> {
  const ref = db.collection(params.collectionPath).doc(params.docId);
  const existing = await ref.get();
  const prev = existing.data() ?? {};
  const stageResults =
    (prev.stageResults as Array<Record<string, unknown>> | undefined) ?? [];

  const newEntry: Record<string, unknown> = {
    tournamentId: params.tournamentId,
    stageId: params.stageId,
    stageOrder: params.stageOrder,
    points: params.points,
    awardedAt: FieldValue.serverTimestamp(),
  };
  if (params.award.place != null) newEntry.place = params.award.place;
  if (params.award.bucket != null) {
    newEntry.placementBucket = params.award.bucket;
  }
  if (params.matchId) newEntry.matchId = params.matchId;

  const merged = upsertStageResult(
    stageResults,
    params.tournamentId,
    newEntry,
  );
  if (merged === stageResults) return false;

  const rawPoints = rawPointsFromStageResults(merged);
  const effectivePoints = effectivePointsFromStageResults(
    merged,
    params.countingMode,
  );

  await ref.set(
    {
      ...params.identity,
      stageResults: merged,
      rawPoints,
      effectivePoints,
      totalPoints: effectivePoints,
      countingStagesMode: params.countingMode,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  return true;
}

async function awardPlacement(
  db: Firestore,
  projectId: string,
  params: {
    leagueId: string;
    categoryId: string;
    teamId: string;
    tournamentId: string;
    stageId: string;
    stageOrder: number;
    pointsTable: Record<string, number>;
    countingMode: CountingStagesMode;
    award: LeaguePlacementAward;
    matchId?: string;
  },
): Promise<boolean> {
  const points = placementPoints(params.pointsTable, params.award);
  if (points <= 0) return false;

  const teamDocId = `${params.leagueId}_${params.categoryId}_${params.teamId}`;
  const teamUpdated = await upsertLeagueRankingDocument(db, projectId, {
    collectionPath: leagueTeamRankingsPath(projectId),
    docId: teamDocId,
    identity: {
      leagueId: params.leagueId,
      categoryId: params.categoryId,
      teamId: params.teamId,
    },
    tournamentId: params.tournamentId,
    stageId: params.stageId,
    stageOrder: params.stageOrder,
    points,
    award: params.award,
    countingMode: params.countingMode,
    matchId: params.matchId,
  });
  if (!teamUpdated) return false;

  const athleteIds = await loadTeamAthleteIds(db, projectId, params.teamId);
  await Promise.all(
    athleteIds.map((athleteId) =>
      upsertLeagueRankingDocument(db, projectId, {
        collectionPath: leagueAthleteRankingsPath(projectId),
        docId: `${params.leagueId}_${params.categoryId}_${athleteId}`,
        identity: {
          leagueId: params.leagueId,
          categoryId: params.categoryId,
          athleteId,
        },
        tournamentId: params.tournamentId,
        stageId: params.stageId,
        stageOrder: params.stageOrder,
        points,
        award: params.award,
        countingMode: params.countingMode,
        matchId: params.matchId,
      }),
    ),
  );
  return true;
}

async function tryAwardGroupsPlacements(
  db: Firestore,
  projectId: string,
  params: {
    leagueId: string;
    categoryId: string;
    tournamentId: string;
    stageId: string;
    stageOrder: number;
    pointsTable: Record<string, number>;
    countingMode: CountingStagesMode;
    matchId?: string;
  },
): Promise<number> {
  const [paidTeamIds, knockoutTeamIds] = await Promise.all([
    loadPaidTeamIds(db, projectId, params.tournamentId, params.categoryId),
    loadKnockoutTeamIds(db, projectId, params.tournamentId, params.categoryId),
  ]);

  let updated = 0;
  for (const teamId of paidTeamIds) {
    if (knockoutTeamIds.has(teamId)) continue;
    const awarded = await awardPlacement(db, projectId, {
      ...params,
      teamId,
      award: {teamId, bucket: "groups"},
    });
    if (awarded) updated++;
  }
  return updated;
}

function isNonGroupCompletedMatch(match: Record<string, unknown>): boolean {
  if (!isMatchCompleted(match.status)) return false;
  const matchType = normalizeMatchType(match.matchType);
  return !(
    match.isGroupMatch === true ||
    matchType === "group" ||
    matchType === "groups"
  );
}

/** Atualiza `leagueTeamRankings` conforme a colocação da partida encerrada. */
export async function tryAwardLeagueStagePointsForMatch(
  db: Firestore,
  projectId: string,
  match: Record<string, unknown>,
): Promise<{awarded: boolean; teamsUpdated: number}> {
  if (!isMatchCompleted(match.status)) {
    return {awarded: false, teamsUpdated: 0};
  }

  const tournamentId = (match.tournamentId as string | undefined)?.trim();
  const categoryId = (match.categoryId as string | undefined)?.trim();
  if (!tournamentId || !categoryId) {
    return {awarded: false, teamsUpdated: 0};
  }

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) return {awarded: false, teamsUpdated: 0};
  const tournament = tournamentSnap.data()!;
  const leagueId = (tournament.leagueId as string | undefined)?.trim();
  if (!leagueId) return {awarded: false, teamsUpdated: 0};

  const leagueSnap = await db.doc(`leagues/${leagueId}`).get();
  if (!leagueSnap.exists) return {awarded: false, teamsUpdated: 0};
  const league = leagueSnap.data()!;
  const pointsTable =
    (league.rankingPointsByPlace as Record<string, number> | undefined) ??
    DEFAULT_LEAGUE_POINTS;
  const countingMode = parseCountingStagesMode(league.countingStagesMode);
  const stageId = (tournament.leagueStageId as string | undefined) ?? "";
  const stageOrder = (tournament.leagueStageOrder as number | undefined) ?? 0;
  const matchId = (match.id as string | undefined)?.trim();

  const bracketContext = await loadCategoryBracketContext(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  const placements = resolveLeaguePlacementsFromMatch(match, {
    hasThirdPlaceMatch: bracketContext.hasThirdPlaceMatch,
    isDoubleElimination: bracketContext.isDoubleElimination,
    maxLbRound: bracketContext.maxLbRound,
    knockoutFinalRound: bracketContext.knockoutFinalRound,
  });

  let teamsUpdated = 0;
  const baseParams = {
    leagueId,
    categoryId,
    tournamentId,
    stageId,
    stageOrder,
    pointsTable,
    countingMode,
    matchId,
  };

  for (const award of placements) {
    const awarded = await awardPlacement(db, projectId, {
      ...baseParams,
      teamId: award.teamId,
      award,
    });
    if (awarded) teamsUpdated++;
  }

  if (isNonGroupCompletedMatch(match)) {
    teamsUpdated += await tryAwardGroupsPlacements(db, projectId, baseParams);
  }

  return {awarded: teamsUpdated > 0, teamsUpdated};
}

/** @deprecated Use [tryAwardLeagueStagePointsForMatch]. */
export async function tryAwardLeagueStageFinalPlaces(
  db: Firestore,
  projectId: string,
  match: Record<string, unknown>,
): Promise<{awarded: boolean}> {
  const result = await tryAwardLeagueStagePointsForMatch(db, projectId, match);
  return {awarded: result.awarded};
}
