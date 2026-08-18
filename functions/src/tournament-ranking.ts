import {
  FieldValue,
  Timestamp,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {isMatchCompleted} from "./match-status";
import {
  loadCategoryBracketContext,
  loadKnockoutTeamIds,
  loadPaidTeamIds,
  loadTeamAthleteIds,
  normalizeMatchType,
  resolveLeaguePlacementsFromMatch,
  type LeaguePlacementAward,
} from "./league-ranking";
import {parseMatchPlayedAt} from "./tournament-match-gamification";
import {shouldProcessRatingUpdate as shouldAwardForMatch} from "./rating-engine";
import {artifactsPublicDataBase} from "./firebase-paths";
import {categoryPreset, LEGACY_CATEGORY_WEIGHT} from "./category-presets";
import {findCategory} from "./tournament-registration-guards";

/**
 * Ranking global por pontos (estilo federação) — preenche o schema que o app
 * já lê (`tournamentCategoryResults`, `athleteRankings`, `teamRankings`),
 * reutilizando a resolução de colocações da engine de liga mas SEM o gate de
 * `leagueId`: todo torneio pontua.
 *
 * Tabela autoritativa base 1000 (fase 3 — ×10 da base histórica 100, paridade
 * de PROPORÇÕES com `pointsByPlace` de
 * `nexago_app/lib/features/ranking/domain/ranking_constants.dart`, que dá 330
 * aos lugares 5-8). Pontos = base × `pointsMultiplier`, onde
 * `pointsMultiplier = presetWeight × tournaments/{id}.rankingWeight ×
 * bracketSizeFactor(paidTeamsCount)` (`rankingWeight` default 1.0, grade do
 * torneio). `presetWeight` NUNCA é lido de um campo gravado: deriva de
 * `categoryPreset(category)` a partir de `level`/`minLevel` da categoria a
 * cada premiação — categoria sem preset reconhecido (legada) cai em
 * `LEGACY_CATEGORY_WEIGHT` (1). `bracketSizeFactor` (D7) protege o topo do
 * ranking de chaves minúsculas premiando pódio cheio: some sozinho quando as
 * duplas pagas da categoria chegam a 8. Arredondamento acontece uma única
 * vez, no fim (`globalPointsForAward`).
 */
export const DEFAULT_GLOBAL_POINTS: Record<string, number> = {
  "1": 1000,
  "2": 800,
  "3": 600,
  "4": 500,
  quarters: 330,
  groups: 100,
};

/** Menos de 10 duplas pagas = desafio: não pontua no ranking global. */
export const MIN_TEAMS_FOR_GLOBAL_RANKING = 10;

/** Etapa de liga é isenta; torneio avulso exige toggle ligado e categoria cheia. */
export function isGlobalRankingEligible(params: {
  isLeagueStage: boolean;
  rankingEnabled: boolean;
  paidTeamsCount: number;
}): boolean {
  if (params.isLeagueStage) return true;
  return (
    params.rankingEnabled &&
    params.paidTeamsCount >= MIN_TEAMS_FOR_GLOBAL_RANKING
  );
}

/**
 * Modulador por tamanho de chave (D7): protege o ranking de chaves
 * minúsculas no topo (Elite de 3 duplas valendo pódio cheio). Baseado nas
 * duplas PAGAS da categoria — mesma contagem do gate de desafio. Some
 * sozinho quando as chaves enchem.
 */
export function bracketSizeFactor(paidTeamsCount: number): number {
  if (paidTeamsCount >= 8) return 1;
  if (paidTeamsCount >= 4) return 0.6;
  return 0.25;
}

export function tournamentCategoryResultsPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/tournamentCategoryResults`;
}

export function athleteRankingsPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/athleteRankings`;
}

export function teamRankingsPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/teamRankings`;
}

/** Colocação persistida: 1-4 direto; quartas→5; fase de grupos→9. */
export function finalPlaceForAward(award: LeaguePlacementAward): number {
  if (award.place != null) return award.place;
  return award.bucket === "quarters" ? 5 : 9;
}

export function globalPointsForAward(
  award: LeaguePlacementAward,
  multiplier: number,
): number {
  const base =
    award.place != null
      ? DEFAULT_GLOBAL_POINTS[String(award.place)] ?? 0
      : award.bucket != null
        ? DEFAULT_GLOBAL_POINTS[award.bucket] ?? 0
        : 0;
  const safeMultiplier =
    Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return Math.max(0, Math.round(base * safeMultiplier));
}

export interface GlobalRankingResultEntry {
  tournamentId: string;
  categoryId: string;
  finalPlace: number;
  points: number;
  year: number;
}

/**
 * Agregados do doc de ranking: `pointsByYear[y]` soma TODOS os resultados do
 * ano — sem descarte — e `totalPoints` soma os anos.
 */
export function aggregateRankingResults(
  results: GlobalRankingResultEntry[],
): {
  totalPoints: number;
  tournamentsCount: number;
  pointsByYear: Record<string, number>;
} {
  const byYear = new Map<string, number[]>();
  for (const result of results) {
    const key = String(result.year);
    const list = byYear.get(key) ?? [];
    list.push(Math.max(0, Math.round(result.points)));
    byYear.set(key, list);
  }
  const pointsByYear: Record<string, number> = {};
  let totalPoints = 0;
  for (const [year, points] of byYear) {
    const yearPoints = points.reduce((sum, value) => sum + value, 0);
    pointsByYear[year] = yearPoints;
    totalPoints += yearPoints;
  }
  return {totalPoints, tournamentsCount: results.length, pointsByYear};
}

function parseResults(raw: unknown): GlobalRankingResultEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: GlobalRankingResultEntry[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const tournamentId = String(row.tournamentId ?? "").trim();
    const categoryId = String(row.categoryId ?? "").trim();
    if (!tournamentId || !categoryId) continue;
    out.push({
      tournamentId,
      categoryId,
      finalPlace: Number(row.finalPlace) || 0,
      points: Number(row.points) || 0,
      year: Number(row.year) || 0,
    });
  }
  return out;
}

/** Upsert de `results[]` por `tournamentId_categoryId`; devolve null se nada mudou. */
export function upsertRankingResult(
  results: GlobalRankingResultEntry[],
  entry: GlobalRankingResultEntry,
): GlobalRankingResultEntry[] | null {
  const existing = results.find(
    (row) =>
      row.tournamentId === entry.tournamentId &&
      row.categoryId === entry.categoryId,
  );
  if (
    existing &&
    existing.finalPlace === entry.finalPlace &&
    existing.points === entry.points &&
    existing.year === entry.year
  ) {
    return null;
  }
  const filtered = results.filter(
    (row) =>
      !(
        row.tournamentId === entry.tournamentId &&
        row.categoryId === entry.categoryId
      ),
  );
  filtered.push(entry);
  return filtered;
}

async function upsertGlobalRankingDoc(
  db: Firestore,
  params: {
    collectionPath: string;
    docId: string;
    identity: Record<string, string>;
    entry: GlobalRankingResultEntry;
  },
): Promise<boolean> {
  const ref = db.collection(params.collectionPath).doc(params.docId);
  const snap = await ref.get();
  const prev = snap.data() ?? {};
  const results = parseResults(prev.results);

  const merged = upsertRankingResult(results, params.entry);
  if (merged == null) return false;

  const aggregates = aggregateRankingResults(merged);
  await ref.set(
    {
      ...params.identity,
      results: merged,
      totalPoints: aggregates.totalPoints,
      tournamentsCount: aggregates.tournamentsCount,
      pointsByYear: aggregates.pointsByYear,
      lastUpdated: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  return true;
}

async function awardGlobalPlacement(
  db: Firestore,
  projectId: string,
  params: {
    tournamentId: string;
    categoryId: string;
    award: LeaguePlacementAward;
    pointsMultiplier: number;
    year: number;
    completedAt: Date;
  },
): Promise<boolean> {
  const {tournamentId, categoryId, award} = params;
  const teamId = award.teamId;
  const points = globalPointsForAward(award, params.pointsMultiplier);
  if (points <= 0) return false;
  const finalPlace = finalPlaceForAward(award);

  // Resultado por categoria (contrato do model Dart `TournamentCategoryResult`).
  const resultRef = db
    .collection(tournamentCategoryResultsPath(projectId))
    .doc(`${tournamentId}_${categoryId}_${teamId}`);
  const resultSnap = await resultRef.get();
  const prevResult = resultSnap.data();
  if (
    prevResult?.finalPlace === finalPlace &&
    prevResult?.pointsEarned === points
  ) {
    return false;
  }
  await resultRef.set({
    tournamentId,
    categoryId,
    teamId,
    finalPlace,
    pointsEarned: points,
    year: params.year,
    completedAt: Timestamp.fromDate(params.completedAt),
  });

  const entry: GlobalRankingResultEntry = {
    tournamentId,
    categoryId,
    finalPlace,
    points,
    year: params.year,
  };

  await upsertGlobalRankingDoc(db, {
    collectionPath: teamRankingsPath(projectId),
    docId: teamId,
    identity: {teamId},
    entry,
  });

  const athleteIds = await loadTeamAthleteIds(db, projectId, teamId);
  await Promise.all(
    athleteIds.map((athleteId) =>
      upsertGlobalRankingDoc(db, {
        collectionPath: athleteRankingsPath(projectId),
        docId: athleteId,
        identity: {athleteId},
        entry,
      }),
    ),
  );
  return true;
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

/**
 * Concede pontos de ranking global pela partida encerrada — espelha
 * `tryAwardLeagueStagePointsForMatch`, mas incondicional a `leagueId`.
 */
export async function tryAwardGlobalRankingForMatch(
  db: Firestore,
  projectId: string,
  match: Record<string, unknown>,
): Promise<{awarded: boolean; teamsUpdated: number}> {
  if (!isMatchCompleted(match.status)) {
    return {awarded: false, teamsUpdated: 0};
  }
  const tournamentId = String(match.tournamentId ?? "").trim();
  const categoryId = String(match.categoryId ?? "").trim();
  if (!tournamentId || !categoryId) {
    return {awarded: false, teamsUpdated: 0};
  }

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) return {awarded: false, teamsUpdated: 0};
  const tournament = tournamentSnap.data() ?? {};
  const rankingWeight = Number(tournament.rankingWeight ?? 1);
  const isLeagueStage = String(tournament.leagueId ?? "").trim().length > 0;
  const rankingEnabled = tournament.rankingEnabled !== false;

  // Peso do preset NUNCA vem de campo gravado: deriva de level/minLevel da
  // categoria a cada premiação (à prova de adulteração no cliente).
  const category = findCategory(tournament as never, categoryId);
  const preset = categoryPreset(category);
  const presetWeight = preset?.weight ?? LEGACY_CATEGORY_WEIGHT;

  const completedAt = parseMatchPlayedAt(match);
  const year = completedAt.getFullYear();

  const bracketContext = await loadCategoryBracketContext(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  const placements = resolveLeaguePlacementsFromMatch(match, bracketContext);
  const shouldAwardGroupsBucket = isNonGroupCompletedMatch(match);
  if (placements.length === 0 && !shouldAwardGroupsBucket) {
    return {awarded: false, teamsUpdated: 0};
  }

  // Gate de desafio: avaliado a cada premiação, com a mesma contagem de pagas
  // que o bucket "groups" usa (query única, reaproveitada abaixo).
  const paidTeamIds = await loadPaidTeamIds(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  if (
    !isGlobalRankingEligible({
      isLeagueStage,
      rankingEnabled,
      paidTeamsCount: paidTeamIds.size,
    })
  ) {
    logger.info(
      `globalRanking: ${tournamentId}/${categoryId} inelegível ` +
        `(liga=${isLeagueStage}, rankingEnabled=${rankingEnabled}, pagas=${paidTeamIds.size})`,
    );
    return {awarded: false, teamsUpdated: 0};
  }

  const pointsMultiplier =
    presetWeight * rankingWeight * bracketSizeFactor(paidTeamIds.size);
  const baseParams = {tournamentId, categoryId, pointsMultiplier, year, completedAt};
  let teamsUpdated = 0;
  for (const award of placements) {
    if (await awardGlobalPlacement(db, projectId, {...baseParams, award})) {
      teamsUpdated++;
    }
  }

  // Times pagos que não chegaram ao mata-mata pontuam pela fase de grupos
  // (mesma regra da liga: só a partir da 1ª partida de mata-mata concluída).
  if (shouldAwardGroupsBucket) {
    const knockoutTeamIds = await loadKnockoutTeamIds(
      db,
      projectId,
      tournamentId,
      categoryId,
    );
    for (const teamId of paidTeamIds) {
      if (knockoutTeamIds.has(teamId)) continue;
      const awarded = await awardGlobalPlacement(db, projectId, {
        ...baseParams,
        award: {teamId, bucket: "groups"},
      });
      if (awarded) teamsUpdated++;
    }
  }

  return {awarded: teamsUpdated > 0, teamsUpdated};
}

/**
 * Trigger desacoplado no mesmo path de matches (coexiste com o advance de
 * chave e o XP, padrão `onTournamentMatchCompletedAwardXp`).
 */
export const onTournamentMatchCompletedAwardGlobalPoints = onDocumentUpdated(
  "artifacts/{appId}/public/data/matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!shouldAwardForMatch(before, after) || !after) return;

    try {
      const result = await tryAwardGlobalRankingForMatch(
        getFirestore(),
        event.params.appId,
        {...after, id: event.params.matchId},
      );
      if (result.teamsUpdated > 0) {
        logger.info(
          `globalRanking: ${result.teamsUpdated} time(s) atualizados pela partida ${event.params.matchId}`,
        );
      }
    } catch (error) {
      logger.error(
        `globalRanking: falha na partida ${event.params.matchId}`,
        error,
      );
    }
  },
);
