/**
 * Aula da carteira do professor independente (B9): a reserva que o professor faz COMO PROFESSOR
 * (`createArenaBooking`, `asProfessor`) ligada a um aluno da carteira dele. A ligação mora em
 * `professorLessons/{bookingId}` — fora da reserva, que a arena lê: a arena vê só a quadra
 * reservada por professor, nunca o aluno nem o que ele paga (spec da carteira, fase 3/4).
 *
 * Situação da aula = situação da reserva (o app lê a reserva); este doc não repete status.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError} from "firebase-functions/v2/https";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {PROFESSORS, PROFESSOR_STUDENTS} from "./professor-wallet-model";
import type {ProfessorBookingStamp} from "./arena-professor-permissions";

export const PROFESSOR_LESSONS = "professorLessons";
export const PROFESSOR_LESSON_TYPE = "professor_lesson_scheduled";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export interface ProfessorLessonStudent {
  athleteId: string;
  name: string;
}

/**
 * Antes da transação da reserva: o aluno tem de estar ATIVO na carteira de quem reserva e a reserva
 * tem de ser como professor de vínculo independente. Sem `professorStudentId` não faz nada.
 */
export async function resolveProfessorLessonStudent(
  db: Firestore,
  professorUid: string,
  rawStudentId: unknown,
  stamp: ProfessorBookingStamp | null,
): Promise<ProfessorLessonStudent | null> {
  const studentId = str(rawStudentId);
  if (!studentId) return null;
  if (studentId.includes("/")) throw new HttpsError("invalid-argument", "Aluno inválido.");
  if (!stamp || stamp.professorRelationshipType !== "INDEPENDENT") {
    throw new HttpsError("failed-precondition",
      "Aula para aluno da carteira só na reserva como professor independente.");
  }
  const student = (await db.collection(PROFESSORS).doc(professorUid).collection(PROFESSOR_STUDENTS).doc(studentId).get()).data();
  if (!student || student["status"] !== "active") {
    throw new HttpsError("failed-precondition", "Este aluno não está ativo na sua carteira.");
  }
  return {athleteId: studentId, name: str(student["name"]) || "Aluno"};
}

/** Depois da reserva criada: grava a ligação. Falha aqui não desfaz a reserva (só fica sem aluno). */
export async function recordProfessorLesson(
  db: Firestore,
  input: {
    bookingId: string;
    professorUid: string;
    student: ProfessorLessonStudent;
    arenaId: string;
    arenaName: string;
    courtName: string;
    date: string;
    startTime: string;
    endTime: string;
    courtCostReais: number;
  },
): Promise<void> {
  try {
    const professor = (await db.collection("users").doc(input.professorUid).get()).data();
    await db.collection(PROFESSOR_LESSONS).doc(input.bookingId).set({
      professorUid: input.professorUid,
      professorName: str(professor?.["fullName"]) || "Professor",
      athleteId: input.student.athleteId,
      studentName: input.student.name,
      bookingId: input.bookingId,
      arenaId: input.arenaId,
      arenaName: input.arenaName,
      courtName: input.courtName,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      courtCostReais: input.courtCostReais,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.error(`recordProfessorLesson ${input.bookingId}: não gravou a aula`, e);
  }
}

function ddMm(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return d && m ? `${d}/${m}` : dateKey;
}

/** Aviso ao aluno quando a aula nasce. */
export const onProfessorLessonCreated = onDocumentCreated({
  document: `${PROFESSOR_LESSONS}/{bookingId}`,
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (event) => {
  const data = event.data?.data();
  const athleteId = str(data?.["athleteId"]);
  if (!data || !athleteId) return;
  try {
    await deliverNotificationToUser({
      userId: athleteId,
      title: `Aula marcada com ${str(data["professorName"]) || "seu professor"}`,
      body: `${ddMm(str(data["date"]))} às ${str(data["startTime"])} · ${str(data["arenaName"])} · ${str(data["courtName"])}`,
      type: PROFESSOR_LESSON_TYPE,
      data: {bookingId: event.params.bookingId, url: "/discover?tab=agenda"},
      requireInteraction: false,
    });
  } catch (e) {
    logger.warn(`onProfessorLessonCreated ${event.params.bookingId}: push falhou`, e);
  }
});
