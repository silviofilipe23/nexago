import {FieldValue, Firestore, Timestamp} from "firebase-admin/firestore";
import {artifactsPublicDataBase} from "./firebase-paths";

/**
 * Etapas que pontuaram no ranking geral de um esporte:
 * `rankingStages/{sportCode}` com `stages.{tournamentId} = {year, at}`.
 *
 * É o que falta para o app mostrar "subiu/caiu N posições na última etapa".
 * Cada doc por esporte já guarda `results[]` com o torneio de cada pontuação,
 * então o ranking de ANTES sai de tirar dele a última etapa — em qualquer
 * recorte (gênero, nível, formato). Uma posição gravada pronta não serviria:
 * o app renumera a lista no recorte que o atleta abriu.
 *
 * `at` é a hora da partida que pontuou por último no torneio (escrita por
 * merge, sem leitura: a última premiação ganha). Leitura pública; escrita só
 * pelas functions e pelos scripts (Admin SDK).
 */
export function rankingStagesPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/rankingStages`;
}

export interface RankingStageParams {
  sportCode: string;
  tournamentId: string;
  year: number;
  at: Date;
}

/** Payload do merge: só a chave do torneio muda, as outras etapas ficam. */
export function rankingStagePayload(params: RankingStageParams): Record<string, unknown> {
  return {
    sport: params.sportCode,
    stages: {
      [params.tournamentId]: {year: params.year, at: Timestamp.fromDate(params.at)},
    },
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function recordRankingStage(
  db: Firestore,
  projectId: string,
  params: RankingStageParams,
): Promise<void> {
  await db
    .collection(rankingStagesPath(projectId))
    .doc(params.sportCode)
    .set(rankingStagePayload(params), {merge: true});
}

/**
 * Backfill: torneios que aparecem nos `results[]` dos docs por esporte, por
 * esporte, com o ano do resultado (o maior, se o torneio cruzou o ano).
 */
export function collectRankingStageTournaments(
  docs: Array<{sport?: unknown; results?: unknown}>,
): Map<string, Map<string, number>> {
  const bySport = new Map<string, Map<string, number>>();
  for (const doc of docs) {
    const sport = typeof doc.sport === "string" ? doc.sport.trim() : "";
    if (!sport || !Array.isArray(doc.results)) continue;
    const stages = bySport.get(sport) ?? new Map<string, number>();
    for (const raw of doc.results) {
      if (raw == null || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const tournamentId = String(row.tournamentId ?? "").trim();
      if (!tournamentId) continue;
      const year = Number(row.year) || 0;
      stages.set(tournamentId, Math.max(stages.get(tournamentId) ?? 0, year));
    }
    if (stages.size > 0) bySport.set(sport, stages);
  }
  return bySport;
}
