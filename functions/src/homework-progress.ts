/**
 * T9 · Treino em casa — o aluno marca as séries do dia da tarefa que o professor mandou no
 * feedback da aula (`lessonPlanViews/{viewId}.feedback.homework`).
 *
 * `homeworkProgress/{viewId}`: o aluno e o professor da visão leem (rules); só esta callable grava,
 * conferindo que a visão é do aluno, que tem tarefa e que o dia está na janela da tarefa (os
 * [HOMEWORK_WINDOW_DAYS] dias a partir do envio do feedback, até hoje). Feedback reenviado com outra
 * tarefa começa a contagem de novo.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {addDaysToDateKey, isValidDateKey} from "./arena-recurring-booking";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {LESSON_PLAN_VIEWS, parseHomework} from "./professor-lesson-plans";

export const HOMEWORK_PROGRESS = "homeworkProgress";
/** A tarefa vale por uma semana a partir do dia em que o feedback chegou. */
export const HOMEWORK_WINDOW_DAYS = 7;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toDate(v: unknown): Date | null {
  return v != null && typeof (v as {toDate?: unknown}).toDate === "function" ? (v as {toDate(): Date}).toDate() : null;
}

export interface HomeworkProgressResult {
  /** `YYYY-MM-DD` → séries feitas naquele dia. */
  days: Record<string, number>;
  /** Dias com todas as séries. */
  daysDone: number;
  startKey: string;
  endKey: string;
}

export async function saveHomeworkProgressCore(
  db: Firestore,
  uid: string,
  raw: Record<string, unknown>,
  now: Date,
): Promise<HomeworkProgressResult> {
  const viewId = str(raw["viewId"]);
  if (!viewId || viewId.includes("/") || viewId.length > 300) throw new HttpsError("invalid-argument", "Tarefa inválida.");
  const todayKey = dayKeyFromEventDate(now);
  const dayKey = str(raw["dayKey"]) || todayKey;
  if (!isValidDateKey(dayKey)) throw new HttpsError("invalid-argument", "Dia inválido.");
  const setsDone = Number(raw["setsDone"]);
  if (!Number.isInteger(setsDone) || setsDone < 0) throw new HttpsError("invalid-argument", "Séries inválidas.");

  const view = (await db.collection(LESSON_PLAN_VIEWS).doc(viewId).get()).data();
  if (!view || view["athleteId"] !== uid) throw new HttpsError("not-found", "Tarefa não encontrada.");
  const feedback = (view["feedback"] ?? {}) as Record<string, unknown>;
  const homework = parseHomework(feedback["homework"]);
  const sentAt = toDate(feedback["sentAt"]);
  if (!homework || !sentAt) throw new HttpsError("failed-precondition", "Esta aula não tem tarefa para casa.");
  if (setsDone > homework.sets) throw new HttpsError("invalid-argument", `A tarefa tem ${homework.sets} séries.`);

  const startKey = dayKeyFromEventDate(sentAt);
  const endKey = addDaysToDateKey(startKey, HOMEWORK_WINDOW_DAYS - 1);
  if (dayKey > todayKey) throw new HttpsError("failed-precondition", "Ainda não chegou esse dia.");
  if (dayKey < startKey || dayKey > endKey) throw new HttpsError("failed-precondition", "O prazo desta tarefa acabou.");

  const ref = db.collection(HOMEWORK_PROGRESS).doc(viewId);
  return db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    // Tarefa reenviada (outro envio) zera a contagem.
    const sameRound = current != null && current["startKey"] === startKey && current["homeworkName"] === homework.name;
    const days: Record<string, number> = sameRound ? {...(current["days"] as Record<string, number> ?? {})} : {};
    if (setsDone === 0) delete days[dayKey];
    else days[dayKey] = setsDone;
    tx.set(ref, {
      viewId,
      athleteId: uid,
      professorUid: str(view["professorUid"]),
      planId: str(view["planId"]),
      homeworkName: homework.name,
      sets: homework.sets,
      daysTarget: homework.daysTarget,
      startKey,
      endKey,
      days,
      daysDone: Object.values(days).filter((n) => n >= homework.sets).length,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      days,
      daysDone: Object.values(days).filter((n) => n >= homework.sets).length,
      startKey,
      endKey,
    };
  });
}

export const saveHomeworkProgress = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return saveHomeworkProgressCore(getFirestore(), uid, (request.data ?? {}) as Record<string, unknown>, new Date());
});
