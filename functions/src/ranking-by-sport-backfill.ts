import {FieldPath, getFirestore, type Firestore} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {superAdminOrThrow} from "./rating-triggers";
import {getFirebaseProjectId} from "./firebase-paths";
import {loadTeamAthleteIds} from "./league-ranking";
import {tournamentSportToLevelSportCode} from "./category-level-eligibility";
import {
  RANKING_SCALE_VERSION,
  tournamentCategoryResultsPath,
  upsertRankingBySportDocs,
  type GlobalRankingResultEntry,
} from "./tournament-ranking";

export interface RankingsBySportBackfillPage {
  /** Resultados lidos nesta página. */
  processed: number;
  /** Resultados que ganharam (ou ganhariam, no dryRun) o campo `sport`. */
  stamped: number;
  /** Docs por esporte (dupla + atletas) criados ou alterados (ou que seriam). */
  upserted: number;
  /** Resultados de torneio sem esporte reconhecido (ficam só no legado). */
  skippedUnknownSport: number;
  nextStartAfterId: string | null;
  done: boolean;
}

/**
 * Uma página do backfill do ranking por esporte (fase 3a): percorre
 * `tournamentCategoryResults` por id, resolve o esporte pelo torneio, grava
 * `sport` no resultado e faz o upsert da entrada nos docs por esporte da dupla
 * e dos atletas. Idempotente — o upsert é por `tournamentId_categoryId`, então
 * repetir não duplica nem muda nada. O legado (`athleteRankings`/`teamRankings`)
 * não é tocado. `dryRun` lê tudo e só conta.
 */
export async function runRankingsBySportBackfillPage(
  db: Firestore,
  projectId: string,
  opts: {pageSize: number; startAfterId?: string; dryRun: boolean},
): Promise<RankingsBySportBackfillPage> {
  let query = db
    .collection(tournamentCategoryResultsPath(projectId))
    .orderBy(FieldPath.documentId())
    .limit(opts.pageSize);
  if (opts.startAfterId) query = query.startAfter(opts.startAfterId);
  const snap = await query.get();

  const sportByTournament = new Map<string, string | null>();
  const sportOf = async (tournamentId: string): Promise<string | null> => {
    if (!sportByTournament.has(tournamentId)) {
      const tournament = await db.doc(`tournaments/${tournamentId}`).get();
      sportByTournament.set(
        tournamentId,
        tournamentSportToLevelSportCode(tournament.data()?.sport),
      );
    }
    return sportByTournament.get(tournamentId) ?? null;
  };

  let stamped = 0;
  let upserted = 0;
  let skippedUnknownSport = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const tournamentId = String(data.tournamentId ?? "").trim();
    const categoryId = String(data.categoryId ?? "").trim();
    const teamId = String(data.teamId ?? "").trim();
    if (!tournamentId || !categoryId || !teamId) continue;

    const sportCode = await sportOf(tournamentId);
    if (!sportCode) {
      skippedUnknownSport++;
      continue;
    }

    if (data.sport !== sportCode) {
      stamped++;
      if (!opts.dryRun) await doc.ref.set({sport: sportCode}, {merge: true});
    }

    // Doc por esporte nasce na escala atual: resultado ainda não migrado entra ×10.
    const rawPoints = Number(data.pointsEarned) || 0;
    const points =
      (Number(data.scaleVersion) || 0) >= RANKING_SCALE_VERSION
        ? rawPoints
        : Math.round(rawPoints * 10);
    const entry: GlobalRankingResultEntry = {
      tournamentId,
      categoryId,
      finalPlace: Number(data.finalPlace) || 0,
      points,
      year: Number(data.year) || 0,
      sport: sportCode,
    };
    upserted += await upsertRankingBySportDocs(db, projectId, {
      teamId,
      athleteIds: await loadTeamAthleteIds(db, projectId, teamId),
      sportCode,
      entry,
      dryRun: opts.dryRun,
    });
  }

  const done = snap.docs.length < opts.pageSize;
  return {
    processed: snap.docs.length,
    stamped,
    upserted,
    skippedUnknownSport,
    nextStartAfterId: snap.docs.length ? snap.docs[snap.docs.length - 1].id : null,
    done,
  };
}

/**
 * Backfill admin do ranking por esporte. Repetir com `startAfterId` do retorno
 * até `done`; `dryRun` só conta. Não roda sozinho: é chamado por super admin.
 */
export const backfillRankingsBySport = onCall(
  {region: CLIENT_FACING_REGIONS, timeoutSeconds: 540},
  async (request) => {
    await superAdminOrThrow(request.auth?.uid);
    const pageSize =
      typeof request.data?.pageSize === "number" && request.data.pageSize > 0
        ? Math.min(request.data.pageSize, 500)
        : 300;
    const startAfterId =
      typeof request.data?.startAfterId === "string" ? request.data.startAfterId : undefined;
    const dryRun = request.data?.dryRun === true;

    const result = await runRankingsBySportBackfillPage(getFirestore(), getFirebaseProjectId(), {
      pageSize,
      startAfterId,
      dryRun,
    });
    logger.info(
      `backfillRankingsBySport: ${result.processed} resultado(s), ${result.stamped} com sport, ` +
        `${result.upserted} doc(s) por esporte, ${result.skippedUnknownSport} sem esporte, ` +
        `dryRun=${dryRun}, done=${result.done}`,
    );
    return {success: true, ...result};
  },
);
