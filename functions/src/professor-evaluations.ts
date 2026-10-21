/**
 * Avaliação do aluno pelo professor (canvas A6 / W6 e a nota do aluno em B3): uma por aluno por
 * mês, notas 0–10 por fundamento do esporte, nota geral (média), comentário, até 3 focos do próximo
 * mês e nível sugerido. Rascunho → enviada (push ao aluno, que passa a ler).
 *
 * `professorEvaluations/{professorUid}_{athleteId}_{YYYY-MM}`: o professor lê as dele; o aluno lê as
 * ENVIADAS dele. Só a callable grava (valida o vínculo — a mesma régua de quem o professor vê — e os
 * fundamentos do esporte). Não confundir com `coaches/{uid}/evaluations` (treinador de equipe).
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {isStudentOfProfessor} from "./professor-messages";

export const PROFESSOR_EVALUATIONS = "professorEvaluations";
export const EVALUATION_PUSH_TYPE = "professor_evaluation";
export const EVALUATION_LEVELS = ["iniciante", "intermediario", "avancado"] as const;

/** Fundamentos por esporte (chave estável → rótulo). */
export const EVALUATION_FUNDAMENTALS: Record<string, Array<[string, string]>> = {
  beachTennis: [["saque", "Saque"], ["forehand", "Forehand"], ["backhand", "Backhand"], ["voleio", "Voleio"], ["smash", "Smash"], ["posicionamento", "Posicionamento"]],
  beachVolleyball: [["saque", "Saque"], ["recepcao", "Recepção"], ["levantamento", "Levantamento"], ["ataque", "Ataque"], ["bloqueio", "Bloqueio"], ["defesa", "Defesa"]],
  indoorVolleyball: [["saque", "Saque"], ["recepcao", "Recepção"], ["levantamento", "Levantamento"], ["ataque", "Ataque"], ["bloqueio", "Bloqueio"], ["defesa", "Defesa"]],
  footvolley: [["saque", "Saque"], ["recepcao", "Recepção"], ["levantamento", "Levantamento"], ["ataque", "Ataque"], ["defesa", "Defesa"], ["posicionamento", "Posicionamento"]],
  tennis: [["saque", "Saque"], ["forehand", "Forehand"], ["backhand", "Backhand"], ["voleio", "Voleio"], ["devolucao", "Devolução"], ["posicionamento", "Posicionamento"]],
  padel: [["saque", "Saque"], ["forehand", "Forehand"], ["backhand", "Backhand"], ["voleio", "Voleio"], ["bandeja", "Bandeja"], ["posicionamento", "Posicionamento"]],
  /** Qualquer outro esporte. */
  other: [["tecnica", "Técnica"], ["tatica", "Tática"], ["fisico", "Físico"], ["mental", "Mental"]],
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

export const evaluationId = (professorUid: string, athleteId: string, period: string) => `${professorUid}_${athleteId}_${period}`;

export interface EvaluationInput {
  athleteId: string;
  period: string;
  sport: string;
  scores: Record<string, number>;
  comment: string;
  focus: string[];
  suggestedLevel: string | null;
  send: boolean;
}

export function parseEvaluationInput(raw: Record<string, unknown>, todayKey: string): EvaluationInput {
  const athleteId = str(raw["athleteId"]);
  if (!athleteId || athleteId.includes("/")) invalid("Aluno inválido.");
  const period = str(raw["period"]) || todayKey.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period > todayKey.slice(0, 7)) invalid("Mês da avaliação inválido.");
  const sport = str(raw["sport"]) || "beachTennis";
  const template = EVALUATION_FUNDAMENTALS[sport];
  if (!template) invalid("Esporte sem fundamentos de avaliação.");
  const rawScores = (raw["scores"] ?? {}) as Record<string, unknown>;
  const scores: Record<string, number> = {};
  for (const [key] of template) {
    const v = Number(rawScores[key]);
    if (!Number.isFinite(v) || v < 0 || v > 10) invalid("Dê uma nota de 0 a 10 para cada fundamento.");
    scores[key] = Math.round(v * 2) / 2;
  }
  if (Object.keys(rawScores).some((k) => !template.some(([t]) => t === k))) invalid("Fundamento desconhecido.");
  const comment = str(raw["comment"]).slice(0, 1000);
  const focus = Array.isArray(raw["focus"]) ? raw["focus"].map(str).filter(Boolean).slice(0, 3).map((f) => f.slice(0, 60)) : [];
  const level = str(raw["suggestedLevel"]);
  const suggestedLevel = (EVALUATION_LEVELS as readonly string[]).includes(level) ? level : null;
  return {athleteId, period, sport, scores, comment, focus, suggestedLevel, send: raw["send"] === true};
}

export function overallOf(scores: Record<string, number>): number {
  const values = Object.values(scores);
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0;
}

/** Período anterior (`YYYY-MM`). */
function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface EvaluationDeps {
  now: () => Date;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

const defaultDeps: EvaluationDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

export async function saveProfessorEvaluationCore(
  db: Firestore,
  uid: string,
  raw: Record<string, unknown>,
  deps: EvaluationDeps = defaultDeps,
): Promise<{evaluationId: string; status: "draft" | "sent"; overall: number; previousOverall: number | null}> {
  const now = deps.now();
  const input = parseEvaluationInput(raw, dayKeyFromEventDate(now));
  if (input.athleteId === uid) invalid("Você não pode avaliar a si mesmo.");
  if (!(await isStudentOfProfessor(db, uid, input.athleteId, now))) {
    throw new HttpsError("permission-denied", "Você só avalia alunos das suas turmas ou da sua carteira.");
  }
  const id = evaluationId(uid, input.athleteId, input.period);
  const ref = db.collection(PROFESSOR_EVALUATIONS).doc(id);
  const [before, prev, professor, athlete] = await Promise.all([
    ref.get(),
    db.collection(PROFESSOR_EVALUATIONS).doc(evaluationId(uid, input.athleteId, previousPeriod(input.period))).get(),
    db.collection("users").doc(uid).get(),
    db.collection("users").doc(input.athleteId).get(),
  ]);
  const overall = overallOf(input.scores);
  const prevData = prev.data();
  const previousOverall = prevData && prevData["status"] === "sent" ? Number(prevData["overall"]) : null;
  const previousScores = prevData && prevData["status"] === "sent" ? (prevData["scores"] as Record<string, number>) : null;
  const alreadySent = before.data()?.["status"] === "sent";
  const status = input.send || alreadySent ? "sent" : "draft";
  const professorName = str(professor.data()?.["fullName"]) || "Seu professor";
  await ref.set({
    professorUid: uid,
    professorName,
    athleteId: input.athleteId,
    athleteName: str(athlete.data()?.["fullName"]) || str(athlete.data()?.["nickname"]) || "Aluno",
    period: input.period,
    sport: input.sport,
    scores: input.scores,
    previousScores,
    overall,
    previousOverall,
    comment: input.comment,
    focus: input.focus,
    suggestedLevel: input.suggestedLevel,
    status,
    updatedAt: FieldValue.serverTimestamp(),
    ...(before.exists ? {} : {createdAt: FieldValue.serverTimestamp()}),
    ...(input.send && !alreadySent ? {sentAt: Timestamp.fromDate(now)} : {}),
  }, {merge: true});
  if (input.send && !alreadySent) {
    try {
      await deps.notify({
        userId: input.athleteId,
        title: `Nova avaliação de ${professorName}`,
        body: `Nota geral ${overall.toFixed(1)}${previousOverall != null ? ` (${overall - previousOverall >= 0 ? "+" : ""}${(overall - previousOverall).toFixed(1)})` : ""}. Toque para ver.`,
        type: EVALUATION_PUSH_TYPE,
        data: {evaluationId: id, url: `/avaliacao/${id}`},
      });
    } catch (e) {
      logger.warn(`saveProfessorEvaluation ${id}: push falhou`, e);
    }
  }
  return {evaluationId: id, status, overall, previousOverall};
}

export async function deleteProfessorEvaluationCore(db: Firestore, uid: string, id: string): Promise<void> {
  const ref = db.collection(PROFESSOR_EVALUATIONS).doc(str(id) || "_");
  const data = id && !id.includes("/") ? (await ref.get()).data() : undefined;
  if (!data || data["professorUid"] !== uid) throw new HttpsError("not-found", "Avaliação não encontrada.");
  if (data["status"] === "sent") throw new HttpsError("failed-precondition", "Avaliação enviada não pode ser apagada.");
  await ref.delete();
}

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

export const saveProfessorEvaluation = onCall({
  region: CLIENT_FACING_REGIONS, timeoutSeconds: 60, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (r) => saveProfessorEvaluationCore(getFirestore(), requireUid(r), (r.data ?? {}) as Record<string, unknown>));

export const deleteProfessorEvaluation = onCall({region: CLIENT_FACING_REGIONS}, async (r) => {
  await deleteProfessorEvaluationCore(getFirestore(), requireUid(r), str((r.data as Record<string, unknown> | null)?.["evaluationId"]));
  return {ok: true};
});
