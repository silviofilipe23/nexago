import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {EVENT_TIME_ZONE} from "./event-timezone";
import {getFirebaseProjectId} from "./firebase-paths";
import {
  deliverNotificationToUser,
  type DeliverNotificationInput,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {rankingStagesPath} from "./ranking-stages";
import {sportLabel} from "./sports/catalog";
import {athleteRankingsBySportPath} from "./tournament-ranking";
import {DAY_MS, REVIEW_LOOKBACK_DAYS} from "./tournament-review-constants";
import {tournamentLabel} from "./tournament-review-notifications";
import {reviewCandidateReason} from "./tournament-review-window";

/**
 * Push "poste sua posição no story" depois de um torneio que pontuou no ranking geral.
 *
 * Quem recebe: todo atleta com resultado do torneio no doc por esporte (`results[]` de
 * `athleteRankingsBySport`) — inclusive quem caiu de posição; o editor do story abre com a
 * variação desligada nesse caso. O toque abre o ranking do esporte e da temporada com o editor
 * do story por cima (`/competir/ranking?story=1`). O app da loja que não conhece `story=1` só
 * abre o ranking.
 *
 * Quais torneios: os de `rankingStages/{esporte}` (só entra quem pontuou de fato) que terminaram
 * nos últimos dias — o mesmo "terminou" da avaliação (`reviewCandidateReason`).
 */

export const RANKING_STORY_PUSH_TYPE = "ranking_story_share";

/** Um doc por torneio já avisado (só o servidor lê e escreve). */
export const RANKING_STORY_PUSHES_COLLECTION = "rankingStoryPushes";

/**
 * Kill-switch: doc `appConfig/rankingStoryPush`. Ausente ou inválido = desligado. Ligar só com o
 * build que abre o story live na loja (`scripts/set-ranking-story-push-flag.js`).
 */
export const RANKING_STORY_PUSH_CONFIG_PATH = "appConfig/rankingStoryPush";

/** Etapa que pontuou há mais que isso não entra: a última partida pontuada é do último dia, e o
 *  torneio só conta como encerrado se terminou nos últimos `REVIEW_LOOKBACK_DAYS`. Corta também o
 *  torneio antigo marcado como concluído só agora. */
const STAGE_LOOKBACK_DAYS = REVIEW_LOOKBACK_DAYS + 2;

export type Notify = (input: DeliverNotificationInput) => Promise<unknown>;

export async function rankingStoryPushEnabled(db: Firestore): Promise<boolean> {
  const snap = await db.doc(RANKING_STORY_PUSH_CONFIG_PATH).get();
  return snap.exists && (snap.data() as Record<string, unknown>).enabled === true;
}

export interface RecentRankingStage {
  sportCode: string;
  tournamentId: string;
  year: number;
}

/** Etapas pontuadas nos últimos dias, de todos os esportes. */
export function recentRankingStages(
  docs: ReadonlyArray<{id: string; data: Record<string, unknown>}>,
  nowMs: number,
): RecentRankingStage[] {
  const since = nowMs - STAGE_LOOKBACK_DAYS * DAY_MS;
  const out: RecentRankingStage[] = [];
  for (const doc of docs) {
    const sportCode = typeof doc.data.sport === "string" && doc.data.sport.trim() ?
      doc.data.sport.trim() :
      doc.id;
    const stages = doc.data.stages;
    if (stages == null || typeof stages !== "object") continue;
    for (const [tournamentId, raw] of Object.entries(stages as Record<string, unknown>)) {
      if (raw == null || typeof raw !== "object") continue;
      const stage = raw as Record<string, unknown>;
      const at = stage.at instanceof Timestamp ? stage.at.toMillis() : null;
      if (at == null || at < since || at > nowMs) continue;
      out.push({sportCode, tournamentId, year: Number(stage.year) || new Date(at).getUTCFullYear()});
    }
  }
  return out;
}

/** Atleta → torneios (dos pedidos) em que pontuou. Um atleta em duas categorias conta uma vez. */
export function rankingStoryRecipients(
  docs: ReadonlyArray<Record<string, unknown>>,
  tournamentIds: ReadonlySet<string>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const doc of docs) {
    const uid = typeof doc.athleteId === "string" ? doc.athleteId.trim() : "";
    if (!uid || !Array.isArray(doc.results)) continue;
    for (const raw of doc.results) {
      if (raw == null || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const tournamentId = String(row.tournamentId ?? "").trim();
      if (!tournamentIds.has(tournamentId) || !(Number(row.points) > 0)) continue;
      const list = out.get(uid) ?? [];
      if (!list.includes(tournamentId)) list.push(tournamentId);
      out.set(uid, list);
    }
  }
  return out;
}

/** Rota do app: o ranking do esporte e da temporada, com o editor do story por cima. */
export function rankingStoryRoute(sportCode: string, year: number): string {
  return `/competir/ranking?story=1&esporte=${encodeURIComponent(sportCode)}&ano=${year}`;
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** Sem a posição no texto: o app renumera o ranking no recorte e desempata pela ordem da lista,
 *  então um número calculado aqui podia não bater com o do card. */
export function rankingStoryNotification(p: {
  uid: string;
  sportCode: string;
  year: number;
  tournaments: ReadonlyArray<{id: string; name: string}>;
}): DeliverNotificationInput {
  const title = p.tournaments.length > 1 ?
    `Seus pontos de ${p.tournaments.length} torneios entraram no ranking` :
    `Seus pontos do ${tournamentLabel(p.tournaments[0]?.name ?? "")} entraram no ranking`;
  const sport = lowerFirst(sportLabel(p.sportCode) ?? "");
  return {
    userId: p.uid,
    title,
    body: `Toque para ver sua posição no ranking${sport ? ` de ${sport}` : ""} e postar no story.`,
    type: RANKING_STORY_PUSH_TYPE,
    data: {
      tournamentId: p.tournaments[0]?.id ?? "",
      sport: p.sportCode,
      year: String(p.year),
      url: rankingStoryRoute(p.sportCode, p.year),
    },
    requireInteraction: false,
  };
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as {code?: unknown})?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

interface ReadyTournament {
  tournamentId: string;
  year: number;
  name: string;
}

/**
 * Uma execução do job. Por esporte, um push por atleta mesmo com dois torneios no mesmo dia (o
 * story junta as etapas do mesmo fim de semana). Marca o torneio ANTES de mandar (`create`, que
 * falha se outra execução já marcou): se cair no meio, melhor um push a menos que dois.
 */
export async function runRankingStoryPushSweep(
  db: Firestore,
  nowMs: number,
  notify: Notify = deliverNotificationToUser,
  projectId: string = getFirebaseProjectId(),
): Promise<{tournaments: number; notified: number}> {
  const stats = {tournaments: 0, notified: 0};
  if (!(await rankingStoryPushEnabled(db))) return stats;

  const stagesSnap = await db.collection(rankingStagesPath(projectId)).get();
  const stages = recentRankingStages(
    stagesSnap.docs.map((doc) => ({id: doc.id, data: doc.data() as Record<string, unknown>})),
    nowMs,
  );

  const readyBySport = new Map<string, ReadyTournament[]>();
  for (const stage of stages) {
    try {
      const marker = await db.collection(RANKING_STORY_PUSHES_COLLECTION).doc(stage.tournamentId).get();
      if (marker.exists) continue;
      const snap = await db.collection("tournaments").doc(stage.tournamentId).get();
      if (!snap.exists) continue;
      const tournament = snap.data() as Record<string, unknown>;
      if (reviewCandidateReason(tournament, nowMs) == null) continue;
      const ready = readyBySport.get(stage.sportCode) ?? [];
      ready.push({
        tournamentId: stage.tournamentId,
        year: stage.year,
        name: typeof tournament.name === "string" ? tournament.name.trim() : "",
      });
      readyBySport.set(stage.sportCode, ready);
    } catch (error) {
      logger.error("rankingStoryPush: falha ao avaliar torneio", {tournamentId: stage.tournamentId, error});
    }
  }

  const now = Timestamp.fromMillis(nowMs);
  for (const [sportCode, ready] of readyBySport) {
    try {
      const claimed: ReadyTournament[] = [];
      for (const t of ready) {
        try {
          await db.collection(RANKING_STORY_PUSHES_COLLECTION).doc(t.tournamentId).create({
            tournamentId: t.tournamentId,
            tournamentName: t.name,
            sport: sportCode,
            year: t.year,
            createdAt: now,
          });
          claimed.push(t);
        } catch (error) {
          if (!isAlreadyExists(error)) throw error;
        }
      }
      if (claimed.length === 0) continue;

      const athletesSnap = await db
        .collection(athleteRankingsBySportPath(projectId))
        .where("sport", "==", sportCode)
        .select("athleteId", "results")
        .get();
      const byId = new Map(claimed.map((t) => [t.tournamentId, t]));
      const recipients = rankingStoryRecipients(
        athletesSnap.docs.map((doc) => doc.data() as Record<string, unknown>),
        new Set(byId.keys()),
      );
      const inputs = [...recipients].map(([uid, ids]) => {
        const tournaments = ids.map((id) => byId.get(id)!);
        return rankingStoryNotification({
          uid,
          sportCode,
          year: Math.max(...tournaments.map((t) => t.year)),
          tournaments: tournaments.map((t) => ({id: t.tournamentId, name: t.name})),
        });
      });
      await Promise.all(inputs.map((input) =>
        notify(input).catch((error) => {
          logger.warn("rankingStoryPush: push falhou", {userId: input.userId, error});
        }),
      ));
      await Promise.all(claimed.map((t) =>
        db.collection(RANKING_STORY_PUSHES_COLLECTION).doc(t.tournamentId).update({
          recipients: [...recipients.values()].filter((ids) => ids.includes(t.tournamentId)).length,
          sentAt: now,
        }),
      ));
      stats.tournaments += claimed.length;
      stats.notified += inputs.length;
    } catch (error) {
      logger.error("rankingStoryPush: falha ao avisar", {sportCode, error});
    }
  }
  return stats;
}

/**
 * 12:00 de São Paulo, todo dia: o dia seguinte ao torneio, duas horas depois do pedido de
 * avaliação (10:00), para os dois pushes não chegarem juntos. `now` é o horário agendado.
 */
export const rankingStoryDailyPush = onSchedule(
  {
    schedule: "0 12 * * *",
    timeZone: EVENT_TIME_ZONE,
    timeoutSeconds: 300,
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    const scheduled = Date.parse(event.scheduleTime);
    const nowMs = Number.isFinite(scheduled) ? scheduled : Date.now();
    const stats = await runRankingStoryPushSweep(getFirestore(), nowMs);
    logger.info("rankingStoryDailyPush", stats);
  },
);
