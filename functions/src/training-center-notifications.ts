/**
 * Avisos do Centro de Treinamento (push + histórico in-app via `deliverNotificationToUser`):
 * - aula de hoje em diante cancelada, reaberta ou alterada só nesta data → alunos da turma e
 *   encaixados (com conta e com "avisos de aula" ligado); professor novo recebe aviso próprio;
 * - convite de equipe → a conta NexaGO daquele e-mail, se já existir;
 * - vaga oferecida pelo botão manual da fila (a automática avisa no gatilho da fila) e matrícula
 *   confirmada → o aluno.
 *
 * Sem e-mail: o projeto não tem provedor; quem ainda não tem conta não é avisado (follow-up).
 * O app ainda não tem telas de centro, então o `data` não leva `url` (o toque abre o inbox).
 *
 * Gatilhos do Firestore entregam "pelo menos uma vez": cada aviso reserva
 * `trainingCenters/{c}/notificationLog/{eventId}` com `create()` antes de enviar — evento repetido
 * não manda push duas vezes.
 */
import * as logger from "firebase-functions/logger";
import {onDocumentCreated, onDocumentWritten} from "firebase-functions/v2/firestore";
import {getAuth} from "firebase-admin/auth";
import {Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {TRAINING_CENTERS, brlFromCents} from "./training-center-billing-model";
import {
  CENTER_ENROLLMENT_NOTICE_TYPE,
  CENTER_INVITE_NOTICE_TYPE,
  CENTER_SEAT_OFFER_TYPE,
  CENTER_SESSION_NOTICE_TYPE,
  coachTakeoverNotice,
  confirmedNotice,
  enrollmentNoticeKind,
  inviteNotice,
  seatOfferNotice,
  sessionAudience,
  sessionNotice,
  studentPushUid,
  type Notice,
} from "./training-center-notifications-model";
import {dayKeyIn} from "./training-center-waitlist-model";

type Data = Record<string, unknown>;

export interface NoticeDeps {
  now: () => Date;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
  uidByEmail: (email: string) => Promise<string | null>;
}

export const defaultNoticeDeps: NoticeDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
  uidByEmail: async (email) => {
    try {
      return (await getAuth().getUserByEmail(email)).uid;
    } catch {
      return null;
    }
  },
};

/** Reserva o evento; `false` = já processado (gatilho repetido). */
async function claim(db: Firestore, centerId: string, eventId: string, kind: string, now: Date): Promise<boolean> {
  try {
    await db.doc(`${TRAINING_CENTERS}/${centerId}/notificationLog/${eventId}`).create({kind, at: Timestamp.fromDate(now)});
    return true;
  } catch {
    return false;
  }
}

async function send(deps: NoticeDeps, uids: string[], notice: Notice, type: string, data: Record<string, string>): Promise<number> {
  let sent = 0;
  for (const userId of [...new Set(uids)]) {
    try {
      await deps.notify({userId, title: notice.title, body: notice.body, type, data});
      sent++;
    } catch (e) {
      logger.warn("training-center notice: push falhou", {userId, type, e});
    }
  }
  return sent;
}

export async function handleSessionNotice(
  db: Firestore, deps: NoticeDeps, centerId: string, sessionId: string, eventId: string,
  before: Data | undefined, after: Data | undefined,
): Promise<number> {
  const centerSnap = await db.doc(`${TRAINING_CENTERS}/${centerId}`).get();
  const center = centerSnap.data() as Data | undefined;
  const today = dayKeyIn(deps.now(), String(center?.["timezone"] ?? "America/Sao_Paulo"));
  const notice = sessionNotice(before, after, today);
  if (!notice || !after) return 0;
  if (!(await claim(db, centerId, eventId, `session.${notice.kind}`, deps.now()))) return 0;

  const cls = (await db.doc(`${TRAINING_CENTERS}/${centerId}/classes/${String(after["classId"] ?? "")}`).get()).data() as Data | undefined;
  const studentIds = sessionAudience(cls, after);
  const students = await Promise.all(studentIds.map((id) => db.doc(`${TRAINING_CENTERS}/${centerId}/students/${id}`).get()));
  const uids = students.map((d) => studentPushUid(d.data() as Data | undefined)).filter((x): x is string => !!x);
  const data = {centerId, sessionId};
  let sent = await send(deps, uids, notice, CENTER_SESSION_NOTICE_TYPE, data);
  if (notice.newCoachUid) {
    sent += await send(deps, [notice.newCoachUid], coachTakeoverNotice(after), CENTER_SESSION_NOTICE_TYPE, data);
  }
  return sent;
}

export async function handleInviteNotice(
  db: Firestore, deps: NoticeDeps, centerId: string, inviteId: string, eventId: string, invite: Data | undefined,
): Promise<number> {
  if (!invite || invite["status"] !== "pending") return 0;
  const email = String(invite["email"] ?? "").trim().toLowerCase();
  if (!email) return 0;
  const uid = await deps.uidByEmail(email);
  if (!uid) return 0;
  if (!(await claim(db, centerId, eventId, "invite", deps.now()))) return 0;
  const centerName = String(invite["centerName"] ?? "") ||
    String(((await db.doc(`${TRAINING_CENTERS}/${centerId}`).get()).data() as Data | undefined)?.["name"] ?? "");
  return send(deps, [uid], inviteNotice(invite, centerName), CENTER_INVITE_NOTICE_TYPE, {centerId, inviteId});
}

export async function handleEnrollmentNotice(
  db: Firestore, deps: NoticeDeps, centerId: string, enrollmentId: string, eventId: string,
  before: Data | undefined, after: Data | undefined,
): Promise<number> {
  const kind = enrollmentNoticeKind(before, after);
  if (!kind || !after) return 0;
  const student = (await db.doc(`${TRAINING_CENTERS}/${centerId}/students/${String(after["studentId"] ?? "")}`).get()).data() as Data | undefined;
  const uid = typeof student?.["uid"] === "string" && student["uid"] ? (student["uid"] as string) : null;
  if (!uid) return 0;
  if (!(await claim(db, centerId, eventId, `enrollment.${kind}`, deps.now()))) return 0;
  const center = (await db.doc(`${TRAINING_CENTERS}/${centerId}`).get()).data() as Data | undefined;
  const centerName = String(center?.["name"] ?? "");
  const className = String(after["className"] ?? "");
  const data = {centerId, enrollmentId};
  if (kind === "confirmed") {
    return send(deps, [uid], confirmedNotice(className, centerName), CENTER_ENROLLMENT_NOTICE_TYPE, data);
  }
  const contract = (after["contract"] ?? {}) as Data;
  const holdMs = (after["holdUntil"] as {toMillis?: () => number} | null)?.toMillis?.();
  const hours = holdMs ? Math.max(1, Math.round((holdMs - deps.now().getTime()) / 3600_000)) : 24;
  const notice = seatOfferNotice(className, centerName, hours, brlFromCents(Number(contract["priceCents"] ?? 0)));
  return send(deps, [uid], notice, CENTER_SEAT_OFFER_TYPE, data);
}

const PUSH_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];

export const onTrainingCenterSessionNotice = onDocumentWritten({
  document: `${TRAINING_CENTERS}/{centerId}/sessions/{sessionId}`,
  secrets: PUSH_SECRETS,
}, async (event) => {
  await handleSessionNotice(
    getFirestore(), defaultNoticeDeps, event.params.centerId, event.params.sessionId, event.id,
    event.data?.before?.data(), event.data?.after?.data(),
  );
});

export const onTrainingCenterInviteNotice = onDocumentCreated({
  document: `${TRAINING_CENTERS}/{centerId}/centerInvites/{inviteId}`,
  secrets: PUSH_SECRETS,
}, async (event) => {
  await handleInviteNotice(getFirestore(), defaultNoticeDeps, event.params.centerId, event.params.inviteId, event.id, event.data?.data());
});

export const onTrainingCenterEnrollmentNotice = onDocumentWritten({
  document: `${TRAINING_CENTERS}/{centerId}/enrollments/{enrollmentId}`,
  secrets: PUSH_SECRETS,
}, async (event) => {
  await handleEnrollmentNotice(
    getFirestore(), defaultNoticeDeps, event.params.centerId, event.params.enrollmentId, event.id,
    event.data?.before?.data(), event.data?.after?.data(),
  );
});
