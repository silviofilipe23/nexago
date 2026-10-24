/**
 * Ações do ALUNO no Centro de Treinamento (app do atleta, Treinos v2): responder à aula
 * ("Vou" / "Não vou"), aceitar o convite que o centro fez pelo e-mail e pagar a fatura no app
 * (Pix copia-e-cola + "Já paguei · verificar").
 *
 * As coleções do centro são só da equipe (rules); o aluno age por aqui, sempre pelo próprio
 * cadastro (`students.uid == auth.uid`).
 */
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore, Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {
  defaultCenterBillingDeps,
  issueCenterInvoiceAs,
  queryCenterInvoiceProviderAs,
  type CenterBillingDeps,
} from "./training-center-billing";
import {asaasArenaSecrets} from "./asaas-client";
import {WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {eventDateFromDayKeyAndTime} from "./event-timezone";
import {str} from "./arena-class";
import {CENTER_STUDENT_ABSENCE_TYPE, defaultNotifyDeps, deliverCenterNotice, type NotifyDeps} from "./training-center-notify";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {blockedEnrollmentIds} from "./training-center-contracts-model";

type Data = Record<string, unknown>;

function requireAuth(auth: CallableRequest["auth"]): {uid: string; email: string; verified: boolean; name: string} {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const token = (auth.token ?? {}) as Data;
  return {
    uid: auth.uid,
    email: str(token["email"]).toLowerCase(),
    verified: token["email_verified"] === true,
    name: str(token["name"]),
  };
}

function safeId(v: unknown, label: string): string {
  const s = str(v);
  if (!s || s.includes("/")) throw new HttpsError("invalid-argument", `${label} inválido.`);
  return s;
}

const centerRef = (db: Firestore, centerId: string) => db.collection(TRAINING_CENTERS).doc(centerId);

/** O cadastro do aluno no centro (bloqueado não age). */
export async function findMyStudent(
  db: Firestore, centerId: string, uid: string,
): Promise<{id: string; ref: DocumentReference; data: Data}> {
  const snap = await centerRef(db, centerId).collection("students").where("uid", "==", uid).limit(1).get();
  const doc = snap.docs[0];
  if (!doc || doc.data()["status"] === "blocked") {
    throw new HttpsError("permission-denied", "Você não é aluno deste centro.");
  }
  return {id: doc.id, ref: doc.ref, data: doc.data() as Data};
}

// ---------------------------------------------------------------------------
// "Vou" / "Não vou"
// ---------------------------------------------------------------------------

export type SessionResponse = "going" | "not_going";

export interface RespondResult {
  response: SessionResponse;
  /** Avisou dentro do prazo do centro: falta justificada (vira reposição quando a chamada fecha). */
  excused: boolean;
}

/** Instante de início da aula (`date` + `startTime`, parede de São Paulo). */
export function sessionStartAt(session: Data): Date | null {
  const date = str(session["date"]);
  const [h, m] = str(session["startTime"]).split(":").map(Number);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(h) || !Number.isFinite(m)) return null;
  return eventDateFromDayKeyAndTime(date, h!, m!);
}

/**
 * O que gravar na aula para a resposta do aluno (puro). "Não vou" dentro do prazo do centro, sem
 * marca da equipe, vira falta justificada marcada pelo aluno; "Vou" desfaz só essa marca.
 */
export function planSessionResponse(input: {
  session: Data; studentId: string; response: SessionResponse; now: Date; start: Date;
  noticeHours: number; makeupOnNotice: boolean;
}): {update: Data; excused: boolean} {
  const {session, studentId, response, now, start} = input;
  const attendance = {...((session["attendance"] ?? {}) as Data)};
  const byStudent = {...((session["attendanceByStudent"] ?? {}) as Data)};
  const mark = str(attendance[studentId]);
  const rsvps = {...((session["rsvps"] ?? {}) as Data), [studentId]: {response, at: Timestamp.fromDate(now)}};
  let changed = false;
  let excused = false;
  if (response === "not_going") {
    const inTime = input.makeupOnNotice && start.getTime() - now.getTime() >= input.noticeHours * 3600_000;
    if (inTime && !mark) {
      attendance[studentId] = "excused";
      byStudent[studentId] = true;
      changed = true;
    }
    excused = inTime && (changed || mark === "excused");
  } else if (mark === "excused" && byStudent[studentId] === true) {
    delete attendance[studentId];
    delete byStudent[studentId];
    changed = true;
  }
  return {update: {rsvps, ...(changed ? {attendance, attendanceByStudent: byStudent} : {})}, excused};
}

export async function respondCenterSessionCore(
  db: Firestore, uid: string, raw: unknown, now: Date, deps: NotifyDeps = defaultNotifyDeps,
): Promise<RespondResult> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = safeId(d["centerId"], "Centro");
  const sessionId = safeId(d["sessionId"], "Aula");
  const raw0 = d["response"];
  if (raw0 !== "going" && raw0 !== "not_going") {
    throw new HttpsError("invalid-argument", "Resposta inválida.");
  }
  const response: SessionResponse = raw0;
  const student = await findMyStudent(db, centerId, uid);
  const ref = centerRef(db, centerId).collection("sessions").doc(sessionId);
  const center = (await centerRef(db, centerId).get()).data() ?? {};
  const policies = (center["policies"] ?? {}) as Data;
  const noticeHours = typeof policies["excusedNoticeHours"] === "number" ? policies["excusedNoticeHours"] as number : 4;
  const makeupOnNotice = policies["excusedAbsenceMakeup"] !== false;

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const s = snap.data();
    if (!s) throw new HttpsError("not-found", "Aula não encontrada.");
    const cls = (await tx.get(centerRef(db, centerId).collection("classes").doc(str(s["classId"])))).data() ?? {};
    const roster = Array.isArray(cls["rosterStudentIds"]) ? cls["rosterStudentIds"] as unknown[] : [];
    const makeups = Array.isArray(s["makeupStudentIds"]) ? s["makeupStudentIds"] as unknown[] : [];
    if (!roster.includes(student.id) && !makeups.includes(student.id)) {
      throw new HttpsError("permission-denied", "Esta aula não é da sua turma.");
    }
    if (s["status"] !== "scheduled" || s["finalizedAt"]) {
      throw new HttpsError("failed-precondition", "A chamada desta aula já foi fechada.");
    }
    const start = sessionStartAt(s);
    if (!start || now.getTime() >= start.getTime()) {
      throw new HttpsError("failed-precondition", "A aula já começou. Fale com o professor.");
    }
    const plan = planSessionResponse({
      session: s, studentId: student.id, response, now, start, noticeHours, makeupOnNotice,
    });
    // Transação: relê e regrava os mapas inteiros (sem pisar em outro aluno).
    tx.update(ref, plan.update);
    const excused = plan.excused;
    const before = ((s["rsvps"] ?? {}) as Data)[student.id] as Data | undefined;
    return {excused, session: s, alreadyNotGoing: str(before?.["response"]) === "not_going"};
  });
  // Avisa o professor da aula (uma vez: trocar de "não vou" para "não vou" não repete).
  const coachUid = str(result.session["coachUid"]);
  if (response === "not_going" && !result.alreadyNotGoing && coachUid && coachUid !== uid) {
    const s = result.session;
    const d = str(s["date"]).split("-");
    const when = d.length === 3 ? `${d[2]}/${d[1]} ${str(s["startTime"])}` : str(s["startTime"]);
    await deliverCenterNotice(db, deps, {
      centerId, center, event: "student_absence", uids: [coachUid],
      title: `${str(student.data["name"]) || "Um aluno"} não vai à aula`,
      body: `${str(s["className"]) || "Aula"} · ${when} · ${result.excused ? "avisou no prazo, vira reposição" : "avisou em cima da hora"}.`,
      type: CENTER_STUDENT_ABSENCE_TYPE,
      data: {centerId, sessionId},
    }).catch((e) => logger.warn(`respondTrainingCenterSession ${centerId}/${sessionId}: aviso ao professor falhou`, e));
  }
  return {response, excused: result.excused};
}

// ---------------------------------------------------------------------------
// Convite do centro (cadastro feito pelo e-mail)
// ---------------------------------------------------------------------------

export interface AcceptInviteResult {
  accepted: boolean;
}

export async function answerCenterInviteCore(
  db: Firestore, auth: {uid: string; email: string; verified: boolean; name: string}, raw: unknown, now: Date,
): Promise<AcceptInviteResult> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = safeId(d["centerId"], "Centro");
  const studentId = safeId(d["studentId"], "Convite");
  const accept = d["accept"] === true;
  if (!auth.email || !auth.verified) {
    throw new HttpsError("failed-precondition", "Confirme seu e-mail para aceitar o convite do centro.");
  }
  const ref = centerRef(db, centerId).collection("students").doc(studentId);
  if (accept) {
    const already = await centerRef(db, centerId).collection("students").where("uid", "==", auth.uid).limit(1).get();
    if (!already.empty) throw new HttpsError("already-exists", "Você já é aluno deste centro.");
  }
  const at = Timestamp.fromDate(now);
  await db.runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data();
    if (!s || s["status"] !== "invited" || str(s["uid"]) || str(s["email"]).toLowerCase() !== auth.email) {
      throw new HttpsError("failed-precondition", "Este convite não está mais disponível.");
    }
    tx.update(ref, accept ?
      {uid: auth.uid, status: "active", lgpdConsentAt: at, inviteAnsweredAt: at} :
      {status: "inactive", inviteAnsweredAt: at, inviteDeclined: true});
    tx.set(centerRef(db, centerId).collection("auditLogs").doc(), {
      at,
      actorUid: auth.uid,
      actorName: auth.name || str(s["name"]) || "Aluno",
      action: accept ? "student.invite_accepted" : "student.invite_declined",
      entity: "student",
      entityId: studentId,
      detail: `${str(s["name"]) || "Aluno"} ${accept ? "aceitou o convite pelo app" : "recusou o convite pelo app"}`,
      reason: "",
    });
  });
  return {accepted: accept};
}

// ---------------------------------------------------------------------------
// Fatura no app (Pix copia-e-cola e verificação)
// ---------------------------------------------------------------------------

async function myInvoice(db: Firestore, uid: string, raw: unknown) {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = safeId(d["centerId"], "Centro");
  const invoiceId = safeId(d["invoiceId"], "Fatura");
  const student = await findMyStudent(db, centerId, uid);
  const ref = centerRef(db, centerId).collection("invoices").doc(invoiceId);
  const inv = (await ref.get()).data();
  if (!inv || str(inv["studentId"]) !== student.id) throw new HttpsError("not-found", "Fatura não encontrada.");
  return {centerId, invoiceId, ref, inv, student};
}

export interface InvoicePixResult {
  status: string;
  invoiceUrl: string;
  pixPayload: string;
}

/**
 * Pix da fatura em aberto. Sem fatura no provedor ainda, gera agora (sem push: o aluno já está na
 * tela), com o CPF do perfil do atleta.
 */
export async function myCenterInvoicePixCore(
  db: Firestore, uid: string, raw: unknown, deps: CenterBillingDeps = defaultCenterBillingDeps,
): Promise<InvoicePixResult> {
  const {centerId, invoiceId, inv, student} = await myInvoice(db, uid, raw);
  const status = str(inv["status"]);
  if (status !== "pending") return {status, invoiceUrl: "", pixPayload: ""};
  const enrollmentId = str(inv["enrollmentId"]);
  if (enrollmentId && (await blockedEnrollmentIds(centerRef(db, centerId), student.id)).has(enrollmentId)) {
    throw new HttpsError("failed-precondition", "Assine o contrato da matrícula para liberar o pagamento.");
  }
  let paymentId = str(inv["providerRef"]);
  let invoiceUrl = str(inv["providerUrl"]);
  if (!paymentId) {
    const actor = {uid, name: str(student.data["name"]) || "Aluno (app)"};
    const issued = await issueCenterInvoiceAs(db, actor, {centerId, invoiceId, cpfCnpj: null}, deps, {silent: true});
    paymentId = issued.providerRef;
    invoiceUrl = issued.invoiceUrl;
  }
  let pixPayload = "";
  try {
    pixPayload = await deps.pixPayload(paymentId);
  } catch (e) {
    logger.warn(`getMyTrainingCenterInvoicePix ${centerId}/${invoiceId}: sem Pix copia-e-cola`, e);
  }
  return {status, invoiceUrl, pixPayload};
}

export interface InvoiceCheckResult {
  /** Status da fatura depois da consulta (`approved` = paga). */
  status: string;
}

export async function checkMyCenterInvoiceCore(
  db: Firestore, uid: string, raw: unknown, deps: CenterBillingDeps = defaultCenterBillingDeps,
): Promise<InvoiceCheckResult> {
  const {centerId, invoiceId, inv, student} = await myInvoice(db, uid, raw);
  if (inv["status"] !== "pending" || !str(inv["providerRef"])) return {status: str(inv["status"])};
  const actor = {uid, name: str(student.data["name"]) || "Aluno (app)"};
  const result = await queryCenterInvoiceProviderAs(db, actor, centerId, invoiceId, deps);
  return {status: result.invoiceStatus ?? str(inv["status"])};
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

const BILLING_OPTS = {
  region: CLIENT_FACING_REGIONS,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
};

export const respondTrainingCenterSession = onCall({
  region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) =>
  respondCenterSessionCore(getFirestore(), requireAuth(request.auth).uid, request.data, new Date()));

export const answerTrainingCenterInvite = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  answerCenterInviteCore(getFirestore(), requireAuth(request.auth), request.data, new Date()));

export const getMyTrainingCenterInvoicePix = onCall(BILLING_OPTS, async (request) =>
  myCenterInvoicePixCore(getFirestore(), requireAuth(request.auth).uid, request.data));

export const checkMyTrainingCenterInvoice = onCall(BILLING_OPTS, async (request) =>
  checkMyCenterInvoiceCore(getFirestore(), requireAuth(request.auth).uid, request.data));
