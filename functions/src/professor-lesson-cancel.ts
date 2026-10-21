/**
 * Aula da carteira cancelada pelo professor (App do Professor · E5b/E5c): o app cancela a reserva
 * como já fazia (`cancelBooking`, a rule de dono confere; PIX pendente sai pela callable dele) e
 * depois chama esta para avisar o ALUNO com o motivo — antes ele ficava sabendo só se o professor
 * mandasse mensagem. Avisa uma vez só (`cancelNotifiedAt` em `professorLessons/{bookingId}`).
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {CANCEL_REASON_LABELS} from "./arena-class";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {PROFESSOR_LESSONS} from "./professor-lessons";

export const PROFESSOR_LESSON_CANCELED_TYPE = "professor_lesson_canceled";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function ddMm(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return d && m ? `${d}/${m}` : dateKey;
}

export function professorLessonCanceledBody(input: {
  professorName: string;
  date: string;
  startTime: string;
  arenaName: string;
  reason: string;
}): string {
  const first = input.professorName.trim().split(/\s+/)[0] || "Seu professor";
  const label = CANCEL_REASON_LABELS[input.reason] ?? "";
  const where = input.arenaName ? ` na ${input.arenaName}` : "";
  return `${first} cancelou a aula de ${ddMm(input.date)} às ${input.startTime}${where}` +
    `${label ? ` (${label})` : ""}.`;
}

export interface ProfessorLessonCancelDeps {
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) =>
    Promise<void>;
}

const defaultDeps: ProfessorLessonCancelDeps = {
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

export async function notifyProfessorLessonCanceledCore(
  db: Firestore,
  uid: string,
  bookingId: string,
  reason: string,
  deps: ProfessorLessonCancelDeps = defaultDeps,
): Promise<{notified: number}> {
  if (!bookingId || bookingId.includes("/")) throw new HttpsError("invalid-argument", "Aula inválida.");
  if (!(reason in CANCEL_REASON_LABELS)) throw new HttpsError("invalid-argument", "Motivo inválido.");
  const lessonRef = db.collection(PROFESSOR_LESSONS).doc(bookingId);
  const lesson = (await lessonRef.get()).data();
  if (!lesson) throw new HttpsError("not-found", "Aula não encontrada.");
  if (str(lesson["professorUid"]) !== uid) throw new HttpsError("permission-denied", "Esta aula não é sua.");
  const status = str((await db.collection("arenaBookings").doc(bookingId).get()).data()?.["status"]);
  if (status !== "canceled" && status !== "cancelled") {
    throw new HttpsError("failed-precondition", "A reserva desta aula não foi cancelada.");
  }
  if (lesson["cancelNotifiedAt"] != null) return {notified: 0};

  const athleteId = str(lesson["athleteId"]);
  await lessonRef.set({
    cancelReason: reason,
    cancelNotifiedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  if (!athleteId) return {notified: 0};
  try {
    await deps.notify({
      userId: athleteId,
      title: "Aula cancelada",
      body: professorLessonCanceledBody({
        professorName: str(lesson["professorName"]),
        date: str(lesson["date"]),
        startTime: str(lesson["startTime"]),
        arenaName: str(lesson["arenaName"]),
        reason,
      }),
      type: PROFESSOR_LESSON_CANCELED_TYPE,
      data: {bookingId, url: "/discover?tab=agenda"},
    });
    return {notified: 1};
  } catch (e) {
    logger.warn(`notifyProfessorLessonCanceled ${bookingId}: push falhou`, e);
    return {notified: 0};
  }
}

export const notifyProfessorLessonCanceled = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const raw = (request.data ?? {}) as Record<string, unknown>;
  return notifyProfessorLessonCanceledCore(getFirestore(), uid, str(raw["bookingId"]), str(raw["reason"]) || "other");
});
