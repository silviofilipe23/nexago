/**
 * Avaliar aulas · A1 por push: quando a chamada FECHA (arena: `status` vira `completed`; centro:
 * vira `done`), cada aluno PRESENTE com conta NexaGO recebe "Como foi a aula?", que abre o
 * formulário daquele treino (`/treinos/avaliar/{key}`).
 *
 * Particular não tem chamada: o cartão "Como foi o treino?" no hub cobre.
 * Chamada fechada depois da janela de avaliação não avisa (não daria mais para avaliar).
 */
import * as logger from "firebase-functions/logger";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {ARENA_CLASS_SESSIONS, ARENA_CLASSES, CLASS_STUDENTS} from "./arena-class-constants";
import {str} from "./arena-class";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {CLASS_REVIEWS, CLASS_REVIEW_WINDOW_DAYS, reviewKey} from "./class-review";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";

export const CLASS_REVIEW_REQUEST_PUSH_TYPE = "class_review_request";
const DAY_MS = 86_400_000;

type Data = Record<string, unknown>;

/** Chamada acabou de fechar nesta escrita. */
export function justClosed(before: Data | undefined, after: Data | undefined, closedStatus: string): boolean {
  return !!after && str(after["status"]) === closedStatus && str(before?.["status"]) !== closedStatus;
}

/** Aula ainda dentro da janela de avaliar (pela data; fechar a chamada no dia seguinte vale). */
export function withinReviewWindow(dateKey: string, now: Date): boolean {
  const day = Date.parse(`${dateKey}T00:00:00-03:00`);
  if (Number.isNaN(day)) return false;
  return now.getTime() - day <= CLASS_REVIEW_WINDOW_DAYS * DAY_MS;
}

/** Ids da chamada marcados como presentes (arena guarda `{mark}`; centro guarda a string). */
export function presentStudentIds(attendance: unknown): string[] {
  if (!attendance || typeof attendance !== "object") return [];
  return Object.entries(attendance as Data)
    .filter(([, v]) => v === "present" || (v && typeof v === "object" && (v as Data)["mark"] === "present"))
    .map(([k]) => k);
}

/** Uids dos presentes da aula da arena: encaixe pelo `extras.athleteId`, aluno da turma pelo
 *  `classStudents.athleteId` (aluno sem conta fica de fora). */
export async function arenaPresentUids(db: Firestore, session: Data): Promise<string[]> {
  const ids = presentStudentIds(session["attendance"]);
  if (!ids.length) return [];
  const extras = (session["extras"] ?? {}) as Record<string, Data>;
  const classId = str(session["classId"]);
  const uids = new Set<string>();
  const regulars: string[] = [];
  for (const id of ids) {
    const fromExtra = str(extras[id]?.["athleteId"]);
    if (fromExtra) uids.add(fromExtra);
    else regulars.push(id);
  }
  if (classId && regulars.length) {
    const refs = regulars.map((id) => db.collection(ARENA_CLASSES).doc(classId).collection(CLASS_STUDENTS).doc(id));
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      const uid = str(s.data()?.["athleteId"]);
      if (uid) uids.add(uid);
    }
  }
  return [...uids];
}

/** Uids dos presentes da aula do centro (cadastro `students/{id}.uid`). */
export async function centerPresentUids(db: Firestore, centerId: string, session: Data): Promise<string[]> {
  const ids = presentStudentIds(session["attendance"]);
  if (!ids.length) return [];
  const students = db.collection(TRAINING_CENTERS).doc(centerId).collection("students");
  const snaps = await db.getAll(...ids.map((id) => students.doc(id)));
  return [...new Set(snaps.map((s) => str(s.data()?.["uid"])).filter(Boolean))];
}

export interface ReviewRequest {
  uid: string;
  key: string;
  title: string;
}

/** Avisa quem ainda não avaliou; devolve quantos receberam. */
export async function sendReviewRequests(
  db: Firestore,
  requests: ReviewRequest[],
  send: (r: ReviewRequest) => Promise<void>,
): Promise<number> {
  let sent = 0;
  for (const r of requests) {
    const already = await db.collection(CLASS_REVIEWS).doc(`${r.key}_${r.uid}`).get();
    if (already.exists) continue;
    try {
      await send(r);
      sent++;
    } catch (err) {
      logger.warn("class-review-notify: push falhou", {uid: r.uid, key: r.key, err});
    }
  }
  return sent;
}

async function pushReviewRequest(r: ReviewRequest): Promise<void> {
  await deliverNotificationToUser({
    userId: r.uid,
    title: "Como foi a aula?",
    body: `${r.title} · avalie a aula, o professor e o local em 20 segundos.`,
    type: CLASS_REVIEW_REQUEST_PUSH_TYPE,
    data: {url: `/treinos/avaliar/${r.key}`, reviewKey: r.key},
    requireInteraction: false,
  });
}

const PUSH_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];

export async function onArenaSessionClosedCore(
  db: Firestore,
  sessionId: string,
  before: Data | undefined,
  after: Data | undefined,
  now: Date,
  send: (r: ReviewRequest) => Promise<void>,
): Promise<number> {
  if (!justClosed(before, after, "completed") || !after) return 0;
  if (!withinReviewWindow(str(after["date"]), now)) return 0;
  const uids = await arenaPresentUids(db, after);
  const key = reviewKey("arena", {sessionId});
  const title = str(after["className"]) || "Aula";
  return sendReviewRequests(db, uids.map((uid) => ({uid, key, title})), send);
}

export async function onCenterSessionClosedCore(
  db: Firestore,
  centerId: string,
  sessionId: string,
  before: Data | undefined,
  after: Data | undefined,
  now: Date,
  send: (r: ReviewRequest) => Promise<void>,
): Promise<number> {
  if (!justClosed(before, after, "done") || !after) return 0;
  if (!withinReviewWindow(str(after["date"]), now)) return 0;
  const uids = await centerPresentUids(db, centerId, after);
  const key = reviewKey("center", {centerId, sessionId});
  const title = str(after["className"]) || "Aula";
  return sendReviewRequests(db, uids.map((uid) => ({uid, key, title})), send);
}

export const onArenaClassSessionReviewRequest = onDocumentUpdated(
  {document: `${ARENA_CLASS_SESSIONS}/{sessionId}`, secrets: PUSH_SECRETS},
  async (event) => {
    await onArenaSessionClosedCore(
      getFirestore(), event.params.sessionId,
      event.data?.before.data(), event.data?.after.data(), new Date(), pushReviewRequest,
    );
  },
);

export const onTrainingCenterSessionReviewRequest = onDocumentUpdated(
  {document: `${TRAINING_CENTERS}/{centerId}/sessions/{sessionId}`, secrets: PUSH_SECRETS},
  async (event) => {
    await onCenterSessionClosedCore(
      getFirestore(), event.params.centerId, event.params.sessionId,
      event.data?.before.data(), event.data?.after.data(), new Date(), pushReviewRequest,
    );
  },
);
