/**
 * Comunicados do professor para os alunos (canvas F1–F5, F7): aviso, enquete, cancelamento ou
 * financeiro; rascunho, agendado ou enviado; relatório de leitura e respostas.
 *
 * Destinatários = a mesma régua de quem o professor VÊ: alunos com conta das turmas dele nas
 * arenas em que o vínculo libera "Gerenciar as próprias aulas" (`loadProfessorStudentsCore`) e os
 * alunos ATIVOS da carteira. O servidor resolve a lista no envio — o cliente só escolhe turmas e
 * a carteira. O aluno lê por `recipientIds` (rules) e marca leitura/resposta por callable.
 *
 * `professorNotices/{id}` + `professorNotices/{id}/recipients/{athleteId}` (leitura, resposta).
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {loadProfessorStudentsCore} from "./professor-students";
import {PROFESSORS, PROFESSOR_STUDENTS} from "./professor-wallet-model";

export const PROFESSOR_NOTICES = "professorNotices";
export const PROFESSOR_NOTICE_RECIPIENTS = "recipients";
export const PROFESSOR_NOTICE_TYPE = "professor_notice";
export const NOTICE_KINDS = ["aviso", "enquete", "cancelamento", "financeiro"] as const;
export type NoticeKind = typeof NOTICE_KINDS[number];
export const MAX_NOTICE_RECIPIENTS = 300;
const MAX_POLL_OPTIONS = 5;

export interface NoticeDeps {
  now: () => Date;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

const defaultDeps: NoticeDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

export interface NoticeAudience {
  classIds: string[];
  wallet: boolean;
}

export interface NoticeDraft {
  kind: NoticeKind;
  title: string;
  body: string;
  pollOptions: string[];
  audience: NoticeAudience;
  /** `null` = agora. */
  scheduledAt: Date | null;
  /** Lembrar quem não leu/respondeu nesta hora (opcional). */
  remindAt: Date | null;
}

function dateOf(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseNoticeDraft(raw: Record<string, unknown>, now: Date): NoticeDraft {
  const kind = str(raw["kind"]) as NoticeKind;
  if (!(NOTICE_KINDS as readonly string[]).includes(kind)) invalid("Tipo de comunicado inválido.");
  const title = str(raw["title"]);
  if (!title || title.length > 80) invalid("Dê um título (até 80 caracteres).");
  const body = str(raw["body"]);
  if (!body || body.length > 2000) invalid("Escreva a mensagem (até 2000 caracteres).");
  const options = Array.isArray(raw["pollOptions"]) ? raw["pollOptions"].map(str).filter(Boolean) : [];
  const pollOptions = kind === "enquete" ? [...new Set(options)].slice(0, MAX_POLL_OPTIONS) : [];
  if (kind === "enquete" && pollOptions.length < 2) invalid("A enquete precisa de pelo menos 2 opções.");
  if (pollOptions.some((o) => o.length > 40)) invalid("Cada opção tem até 40 caracteres.");
  const audienceRaw = (raw["audience"] ?? {}) as Record<string, unknown>;
  const classIds = Array.isArray(audienceRaw["classIds"]) ?
    [...new Set(audienceRaw["classIds"].map(str).filter((id) => id && !id.includes("/")))].slice(0, 60) :
    [];
  const audience = {classIds, wallet: audienceRaw["wallet"] === true};
  const scheduledAt = dateOf(raw["scheduledAt"]);
  if (scheduledAt && scheduledAt.getTime() < now.getTime() - 60_000) invalid("O agendamento não pode estar no passado.");
  if (scheduledAt && scheduledAt.getTime() > now.getTime() + 60 * 86_400_000) invalid("Agende para no máximo 60 dias.");
  const remindAt = dateOf(raw["remindAt"]);
  if (remindAt && remindAt.getTime() <= (scheduledAt ?? now).getTime()) invalid("O lembrete tem de ser depois do envio.");
  return {kind, title, body, pollOptions, audience, scheduledAt, remindAt};
}

/** Alunos (com conta) que o professor pode avisar, por turma e da carteira. */
export async function resolveNoticeRecipients(db: Firestore, uid: string, audience: NoticeAudience, now: Date): Promise<string[]> {
  const ids = new Set<string>();
  if (audience.classIds.length) {
    const wanted = new Set(audience.classIds);
    const {students} = await loadProfessorStudentsCore(db, uid, dayKeyFromEventDate(now));
    for (const s of students) {
      if (s.athleteId && s.status === "active" && s.classes.some((c) => wanted.has(c.classId))) ids.add(s.athleteId);
    }
  }
  if (audience.wallet) {
    const wallet = await db.collection(PROFESSORS).doc(uid).collection(PROFESSOR_STUDENTS).where("status", "==", "active").get();
    for (const d of wallet.docs) ids.add(d.id);
  }
  ids.delete(uid);
  return [...ids].slice(0, MAX_NOTICE_RECIPIENTS);
}

const noticeRef = (db: Firestore, id: string) => db.collection(PROFESSOR_NOTICES).doc(id);

async function professorName(db: Firestore, uid: string): Promise<string> {
  return str((await db.collection("users").doc(uid).get()).data()?.["fullName"]) || "Seu professor";
}

/** Salva rascunho (sem enviar). Com `noticeId`, edita um rascunho/agendado do próprio professor. */
export async function saveProfessorNoticeCore(
  db: Firestore,
  uid: string,
  raw: Record<string, unknown>,
  deps: NoticeDeps = defaultDeps,
  status: "draft" | "scheduled" = "draft",
): Promise<{noticeId: string}> {
  const now = deps.now();
  const draft = parseNoticeDraft(raw, now);
  const id = str(raw["noticeId"]);
  const ref = id ? noticeRef(db, id) : db.collection(PROFESSOR_NOTICES).doc();
  if (id) {
    const current = (await ref.get()).data();
    if (!current || current["professorUid"] !== uid) throw new HttpsError("not-found", "Comunicado não encontrado.");
    if (current["status"] === "sent") throw new HttpsError("failed-precondition", "Comunicado já enviado não pode ser editado.");
  }
  await ref.set({
    professorUid: uid,
    professorName: await professorName(db, uid),
    kind: draft.kind,
    title: draft.title,
    body: draft.body,
    pollOptions: draft.pollOptions,
    audience: draft.audience,
    status,
    scheduledAt: draft.scheduledAt ? Timestamp.fromDate(draft.scheduledAt) : null,
    remindAt: draft.remindAt ? Timestamp.fromDate(draft.remindAt) : null,
    remindedAt: null,
    recipientIds: [],
    recipientCount: 0,
    readCount: 0,
    answers: {},
    updatedAt: FieldValue.serverTimestamp(),
    ...(id ? {} : {createdAt: FieldValue.serverTimestamp()}),
  }, {merge: true});
  return {noticeId: ref.id};
}

/** Envia agora (ou agenda, com `scheduledAt`). Resolve os destinatários na hora do envio. */
export async function sendProfessorNoticeCore(
  db: Firestore,
  uid: string,
  raw: Record<string, unknown>,
  deps: NoticeDeps = defaultDeps,
): Promise<{noticeId: string; status: "sent" | "scheduled"; recipientCount: number}> {
  const now = deps.now();
  const draft = parseNoticeDraft(raw, now);
  if (draft.scheduledAt && draft.scheduledAt.getTime() > now.getTime() + 60_000) {
    const {noticeId} = await saveProfessorNoticeCore(db, uid, raw, deps, "scheduled");
    return {noticeId, status: "scheduled", recipientCount: 0};
  }
  const {noticeId} = await saveProfessorNoticeCore(db, uid, raw, deps, "draft");
  const recipientCount = await deliverProfessorNotice(db, noticeId, deps);
  return {noticeId, status: "sent", recipientCount};
}

/** Entrega (envio imediato ou agendado): grava a lista, marca enviado e manda o push. */
export async function deliverProfessorNotice(db: Firestore, noticeId: string, deps: NoticeDeps = defaultDeps): Promise<number> {
  const ref = noticeRef(db, noticeId);
  const notice = (await ref.get()).data();
  if (!notice || notice["status"] === "sent") return 0;
  const uid = str(notice["professorUid"]);
  const audience = (notice["audience"] ?? {}) as NoticeAudience;
  const recipients = await resolveNoticeRecipients(db, uid, {
    classIds: Array.isArray(audience.classIds) ? audience.classIds : [],
    wallet: audience.wallet === true,
  }, deps.now());
  // Marca antes do push: o agendador nunca entrega duas vezes.
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data();
    if (!fresh || fresh["status"] === "sent") return false;
    tx.set(ref, {
      status: "sent", sentAt: FieldValue.serverTimestamp(), recipientIds: recipients, recipientCount: recipients.length,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return true;
  });
  if (!claimed) return 0;
  const title = `${str(notice["professorName"]) || "Seu professor"}: ${str(notice["title"])}`;
  const body = str(notice["body"]).slice(0, 140);
  for (const userId of recipients) {
    try {
      await deps.notify({
        userId, title, body, type: PROFESSOR_NOTICE_TYPE,
        data: {noticeId, url: `/aviso-professor/${noticeId}`},
      });
    } catch (e) {
      logger.warn(`deliverProfessorNotice ${noticeId}: push para ${userId} falhou`, e);
    }
  }
  return recipients.length;
}

export async function deleteProfessorNoticeCore(db: Firestore, uid: string, noticeId: string): Promise<void> {
  const ref = noticeRef(db, str(noticeId) || "_");
  const notice = (await ref.get()).data();
  if (!notice || notice["professorUid"] !== uid) throw new HttpsError("not-found", "Comunicado não encontrado.");
  if (notice["status"] === "sent") throw new HttpsError("failed-precondition", "Comunicado enviado não pode ser apagado.");
  await ref.delete();
}

/** O aluno abriu (e, na enquete, respondeu). Só quem está em `recipientIds`. */
export async function respondProfessorNoticeCore(
  db: Firestore,
  athleteUid: string,
  noticeId: string,
  answer: unknown,
): Promise<{answer: string | null}> {
  const ref = noticeRef(db, str(noticeId) || "_");
  return db.runTransaction(async (tx) => {
    const notice = (await tx.get(ref)).data();
    const recipients = Array.isArray(notice?.["recipientIds"]) ? notice!["recipientIds"] as string[] : [];
    if (!notice || notice["status"] !== "sent" || !recipients.includes(athleteUid)) {
      throw new HttpsError("not-found", "Comunicado não encontrado.");
    }
    const recipientRef = ref.collection(PROFESSOR_NOTICE_RECIPIENTS).doc(athleteUid);
    const before = (await tx.get(recipientRef)).data();
    const options = Array.isArray(notice["pollOptions"]) ? notice["pollOptions"] as string[] : [];
    const chosen = str(answer);
    if (chosen && !options.includes(chosen)) throw new HttpsError("invalid-argument", "Opção inválida.");
    const previous = str(before?.["answer"]) || null;
    const nextAnswer = chosen || previous;
    const patch: Record<string, unknown> = {updatedAt: FieldValue.serverTimestamp()};
    if (!before?.["readAt"]) patch["readCount"] = FieldValue.increment(1);
    // Contagem por ÍNDICE da opção: o texto pode ter ponto e viraria caminho de campo.
    if (chosen && chosen !== previous) {
      patch[`answers.${options.indexOf(chosen)}`] = FieldValue.increment(1);
      if (previous && options.includes(previous)) patch[`answers.${options.indexOf(previous)}`] = FieldValue.increment(-1);
    }
    tx.update(ref, patch);
    tx.set(recipientRef, {
      athleteId: athleteUid,
      readAt: before?.["readAt"] ?? FieldValue.serverTimestamp(),
      answer: nextAnswer,
      answeredAt: chosen ? FieldValue.serverTimestamp() : before?.["answeredAt"] ?? null,
    }, {merge: true});
    return {answer: nextAnswer};
  });
}

/** Lembra quem não leu (aviso) ou não respondeu (enquete). */
export async function remindProfessorNoticeCore(db: Firestore, noticeId: string, deps: NoticeDeps = defaultDeps, uid?: string): Promise<number> {
  const ref = noticeRef(db, str(noticeId) || "_");
  const notice = (await ref.get()).data();
  if (!notice || (uid && notice["professorUid"] !== uid)) throw new HttpsError("not-found", "Comunicado não encontrado.");
  if (notice["status"] !== "sent") throw new HttpsError("failed-precondition", "O comunicado ainda não foi enviado.");
  const recipients = Array.isArray(notice["recipientIds"]) ? notice["recipientIds"] as string[] : [];
  const done = await ref.collection(PROFESSOR_NOTICE_RECIPIENTS).get();
  const isPoll = notice["kind"] === "enquete";
  const ok = new Set(done.docs.filter((d) => (isPoll ? str(d.data()["answer"]) : d.data()["readAt"])).map((d) => d.id));
  const pending = recipients.filter((id) => !ok.has(id));
  for (const userId of pending) {
    try {
      await deps.notify({
        userId,
        title: `Lembrete: ${str(notice["title"])}`,
        body: isPoll ? "Responda a enquete do seu professor." : "Você tem um comunicado do seu professor.",
        type: PROFESSOR_NOTICE_TYPE,
        data: {noticeId: ref.id, url: `/aviso-professor/${ref.id}`},
      });
    } catch (e) {
      logger.warn(`remindProfessorNotice ${ref.id}: push para ${userId} falhou`, e);
    }
  }
  await ref.set({remindedAt: FieldValue.serverTimestamp()}, {merge: true});
  return pending.length;
}

/** Agendador: entrega os agendados vencidos e manda os lembretes marcados. */
export async function runProfessorNoticeSchedulerCore(db: Firestore, deps: NoticeDeps = defaultDeps): Promise<{sent: number; reminded: number}> {
  const now = Timestamp.fromDate(deps.now());
  const due = await db.collection(PROFESSOR_NOTICES).where("status", "==", "scheduled").where("scheduledAt", "<=", now).get();
  let sent = 0;
  for (const d of due.docs) {
    try {
      await deliverProfessorNotice(db, d.id, deps);
      sent++;
    } catch (e) {
      logger.error(`professorNoticeScheduler: envio ${d.id} falhou`, e);
    }
  }
  const remind = await db.collection(PROFESSOR_NOTICES).where("status", "==", "sent").where("remindAt", "<=", now).get();
  let reminded = 0;
  for (const d of remind.docs) {
    if (d.data()["remindedAt"]) continue;
    try {
      await remindProfessorNoticeCore(db, d.id, deps);
      reminded++;
    } catch (e) {
      logger.error(`professorNoticeScheduler: lembrete ${d.id} falhou`, e);
    }
  }
  return {sent, reminded};
}

// ---------------------------------------------------------------------------

function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}
const dataOf = (r: CallableRequest) => (r.data ?? {}) as Record<string, unknown>;
const PUSH_OPTS = {region: CLIENT_FACING_REGIONS, timeoutSeconds: 120, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]};

export const saveProfessorNotice = onCall({region: CLIENT_FACING_REGIONS}, async (r) =>
  saveProfessorNoticeCore(getFirestore(), requireUid(r), dataOf(r)));

export const sendProfessorNotice = onCall(PUSH_OPTS, async (r) =>
  sendProfessorNoticeCore(getFirestore(), requireUid(r), dataOf(r)));

export const deleteProfessorNotice = onCall({region: CLIENT_FACING_REGIONS}, async (r) => {
  await deleteProfessorNoticeCore(getFirestore(), requireUid(r), str(dataOf(r)["noticeId"]));
  return {ok: true};
});

export const remindProfessorNotice = onCall(PUSH_OPTS, async (r) =>
  ({reminded: await remindProfessorNoticeCore(getFirestore(), str(dataOf(r)["noticeId"]), defaultDeps, requireUid(r))}));

export const respondProfessorNotice = onCall({region: CLIENT_FACING_REGIONS}, async (r) =>
  respondProfessorNoticeCore(getFirestore(), requireUid(r), str(dataOf(r)["noticeId"]), dataOf(r)["answer"]));

/** Prévia da contagem de destinatários (tela "Para quem"). */
export const previewProfessorNoticeAudience = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (r) => {
  const uid = requireUid(r);
  const draft = (dataOf(r)["audience"] ?? {}) as Record<string, unknown>;
  const audience = {
    classIds: Array.isArray(draft["classIds"]) ? draft["classIds"].map(str).filter(Boolean).slice(0, 60) : [],
    wallet: draft["wallet"] === true,
  };
  const ids = await resolveNoticeRecipients(getFirestore(), uid, audience, new Date());
  return {recipientCount: ids.length};
});

export const professorNoticeScheduler = onSchedule({
  schedule: "every 15 minutes",
  timeZone: "America/Sao_Paulo",
  timeoutSeconds: 300,
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const result = await runProfessorNoticeSchedulerCore(getFirestore());
  if (result.sent || result.reminded) logger.info("professorNoticeScheduler", result);
});
