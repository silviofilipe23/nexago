/**
 * Trancar, pausa por lesão e cancelar a matrícula do CT (canvas T1–T11).
 *
 * `trainingCenters/{c}/enrollmentRequests/{id}` — só o servidor grava; a equipe lê (rules).
 *
 * - `requestTrainingCenterEnrollmentChange`: o ALUNO pede pelo app (ou a gestão registra no
 *   balcão). Trancamento dentro do limite é aprovado na hora; pausa por lesão espera a gestão
 *   revisar o atestado (ou aprova sozinha, se o centro configurou); cancelamento entra em aviso
 *   até o fim do ciclo pago (assinatura `canceling`) ou encerra já (pacote / política imediata).
 *   A oferta de retenção "trocar de plano" vira `pendingPlanChange` no próximo ciclo.
 * - `decideTrainingCenterEnrollmentRequest`: owner/admin aprova, recusa, pede outro documento ou
 *   desfaz um pedido agendado.
 * - `withdrawTrainingCenterEnrollmentRequest`: o aluno desiste (cancelamento em aviso, pausa
 *   ainda não começada ou atestado em análise).
 * - `runTrainingCenterEnrollmentRequests` (05:50, antes da cobrança das 06:00): começa as pausas
 *   do dia, fecha as que terminaram e encerra as matrículas cujo último dia passou (a vaga volta
 *   e a fila oferece sozinha — gatilho de `seatsTaken`).
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {Timestamp, getFirestore, type DocumentReference, type Firestore, type Transaction} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {SYSTEM} from "./training-center-billing";
import {TRAINING_CENTERS, canManageCenterBilling} from "./training-center-billing-model";
import {
  CANCEL_REASONS,
  ENROLLMENT_REQUESTS,
  OPEN_REQUEST_STATUSES,
  RequestRuleError,
  TYPE_LABEL,
  certificateFolder,
  discountUsedRecently,
  discountedCents,
  dueAction,
  pauseDaysUsed,
  planCancel,
  planPause,
  readCertificate,
  readExitPolicies,
  requestSummary,
  shortDayBr,
  type EnrollmentRequestStatus,
  type EnrollmentRequestType,
  type ExitPolicies,
} from "./training-center-enrollment-requests-model";
import {defaultNotifyDeps, deliverCenterNotice, managerUids, type NotifyDeps} from "./training-center-notify";
import {addDays} from "./training-center-subscription-model";
import {endEnrollment} from "./training-center-subscriptions";
import {dayKeyIn} from "./training-center-waitlist-model";

type Data = Record<string, unknown>;

export const CENTER_ENROLLMENT_REQUEST_TYPE = "training_center_enrollment_request";
export const CENTER_ENROLLMENT_REQUEST_STAFF_TYPE = "training_center_enrollment_request_staff";

const SUBSCRIPTIONS = "subscriptions";
const LIVE_SUBSCRIPTION = ["active", "past_due"];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeId(v: unknown, label: string): string {
  const s = str(v);
  if (!s || s.includes("/")) throw new HttpsError("invalid-argument", `${label} inválido.`);
  return s;
}

const centerRef = (db: Firestore, centerId: string) => db.collection(TRAINING_CENTERS).doc(centerId);

function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RequestRuleError) throw new HttpsError("failed-precondition", e.message);
    throw e;
  }
}

function audit(at: Timestamp, actor: {uid: string; name: string}, action: string, entityId: string, detail: string): Data {
  return {at, actorUid: actor.uid, actorName: actor.name, action, entity: "enrollment", entityId, detail, reason: ""};
}

interface Actor {
  uid: string;
  name: string;
  /** Gestão (owner/admin) registrando no balcão ou decidindo. */
  manager: boolean;
}

async function resolveActor(db: Firestore, uid: string | undefined, centerId: string, tokenName: string): Promise<Actor> {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const member = (await centerRef(db, centerId).collection("centerMembers").doc(uid).get()).data();
  if (canManageCenterBilling(member)) return {uid, name: str(member?.["displayName"]) || "Gestão", manager: true};
  return {uid, name: tokenName || "Aluno", manager: false};
}

async function requireManagerActor(db: Firestore, uid: string | undefined, centerId: string): Promise<Actor> {
  const a = await resolveActor(db, uid, centerId, "");
  if (!a.manager) throw new HttpsError("permission-denied", "Só owner ou admin do centro decide os pedidos.");
  return a;
}

interface CenterCtx {
  ref: DocumentReference;
  data: Data;
  today: string;
  policies: ExitPolicies;
}

async function loadCenterCtx(db: Firestore, centerId: string, now: Date): Promise<CenterCtx> {
  const ref = centerRef(db, centerId);
  const data = (await ref.get()).data();
  if (!data) throw new HttpsError("not-found", "Centro não encontrado.");
  if (data["status"] === "suspended") throw new HttpsError("failed-precondition", "O centro está suspenso.");
  return {ref, data, today: dayKeyIn(now, str(data["timezone"])), policies: readExitPolicies(data["policies"])};
}

async function pushStudent(db: Firestore, deps: NotifyDeps, c: CenterCtx, studentUid: string, title: string, body: string, data: Record<string, string>) {
  if (!studentUid) return;
  try {
    await deliverCenterNotice(db, deps, {
      centerId: c.ref.id, center: c.data, event: "enrollment_request_answered", uids: [studentUid],
      title, body, type: CENTER_ENROLLMENT_REQUEST_TYPE, data: {centerId: c.ref.id, ...data},
    });
  } catch (e) {
    logger.warn("enrollment request: push ao aluno falhou", e);
  }
}

async function pushStaff(db: Firestore, deps: NotifyDeps, c: CenterCtx, title: string, body: string, requestId: string) {
  try {
    await deliverCenterNotice(db, deps, {
      centerId: c.ref.id, center: c.data, event: "enrollment_request", uids: await managerUids(db, c.ref.id),
      title, body, type: CENTER_ENROLLMENT_REQUEST_STAFF_TYPE, data: {centerId: c.ref.id, requestId},
    });
  } catch (e) {
    logger.warn("enrollment request: push à gestão falhou", e);
  }
}

/** Matrícula ativa vira pausada (mesmo efeito do "Pausar" do portal; a assinatura espelha). */
function applyPauseInTx(tx: Transaction, c: CenterCtx, enrRef: DocumentReference, enr: Data, req: Data, at: Timestamp, actor: {uid: string; name: string}) {
  const reason = str(req["type"]) === "injury" ? "Pausa por lesão" : "Trancamento";
  tx.update(enrRef, {status: "paused", pausedUntil: str(req["pausedUntil"]), pauseReason: reason, pauseRequestId: str(req["id"])});
  tx.set(c.ref.collection("auditLogs").doc(), audit(at, actor, "enrollment.paused", enrRef.id,
    `${str(enr["studentName"])} → ${str(enr["className"])} · ${reason.toLowerCase()} até ${shortDayBr(str(req["endsOn"]))}`));
}

// ---------------------------------------------------------------------------
// Pedir (aluno) / registrar no balcão (gestão)
// ---------------------------------------------------------------------------

export interface RequestChangeResult {
  requestId: string;
  status: EnrollmentRequestStatus;
  startsOn: string | null;
  endsOn: string | null;
  lastDay: string | null;
}

export async function requestEnrollmentChangeCore(
  db: Firestore, auth: CallableRequest["auth"], raw: unknown, deps: NotifyDeps = defaultNotifyDeps,
): Promise<RequestChangeResult> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = safeId(d["centerId"], "Centro");
  const enrollmentId = safeId(d["enrollmentId"], "Matrícula");
  const type = str(d["type"]) as EnrollmentRequestType;
  if (!["pause", "injury", "cancel"].includes(type)) throw new HttpsError("invalid-argument", "Tipo de pedido inválido.");
  const actor = await resolveActor(db, auth?.uid, centerId, str((auth?.token as Data | undefined)?.["name"]));
  const now = deps.now();
  const c = await loadCenterCtx(db, centerId, now);
  const at = Timestamp.fromDate(now);

  const enrRef = c.ref.collection("enrollments").doc(enrollmentId);
  const enr = (await enrRef.get()).data();
  if (!enr) throw new HttpsError("not-found", "Matrícula não encontrada.");
  const studentId = str(enr["studentId"]);
  const studentDoc = studentId ? (await c.ref.collection("students").doc(studentId).get()).data() : undefined;
  const studentUid = str(studentDoc?.["uid"]);
  if (!actor.manager && (!studentUid || studentUid !== actor.uid || studentDoc?.["status"] === "blocked")) {
    throw new HttpsError("permission-denied", "Esta matrícula não é sua.");
  }
  const contract = (enr["contract"] ?? {}) as Data;
  const planType = str(contract["planType"]) || "monthly";
  const status = str(enr["status"]);

  const reqCol = c.ref.collection(ENROLLMENT_REQUESTS);
  const existing = (await reqCol.where("enrollmentId", "==", enrollmentId).get()).docs.map((x) => ({id: x.id, ref: x.ref, data: x.data() as Data}));
  const open = existing.filter((r) => OPEN_REQUEST_STATUSES.includes(str(r.data["status"]) as EnrollmentRequestStatus));
  // Atestado recusado por documento: o reenvio atualiza o mesmo pedido.
  const resubmit = type === "injury" ? open.find((r) => str(r.data["type"]) === "injury" && r.data["status"] === "needs_document") : undefined;
  const blocking = open.filter((r) => r !== resubmit && !(type === "cancel" && r.data["status"] === "active"));
  if (blocking.length) {
    throw new HttpsError("failed-precondition", `Já existe um pedido em andamento: ${TYPE_LABEL[str(blocking[0]!.data["type"]) as EnrollmentRequestType] ?? "pedido"}.`);
  }

  const base: Data = {
    enrollmentId,
    studentId,
    studentUid,
    studentName: str(enr["studentName"]),
    classId: str(enr["classId"]),
    className: str(enr["className"]),
    planName: str(contract["planName"]),
    planType,
    priceCents: num(contract["priceCents"]),
    type,
    source: actor.manager ? "desk" : "app",
    comment: str(d["comment"]).slice(0, 500),
    createdAt: at,
    createdByUid: actor.uid,
    createdByName: actor.manager ? actor.name : str(enr["studentName"]) || actor.name,
    decidedAt: null,
    decidedByName: "",
    decisionNote: "",
    updatedAt: at,
  };

  // ---- Pausa (trancamento / lesão) ----
  if (type === "pause" || type === "injury") {
    if (status !== "active") throw new HttpsError("failed-precondition", "Só dá para pausar uma matrícula ativa.");
    if (planType !== "monthly") throw new HttpsError("failed-precondition", "Pacote de aulas não tranca: as aulas valem até a validade.");
    const year = c.today.slice(0, 4);
    const used = pauseDaysUsed(existing.filter((r) => r !== resubmit).map((r) => r.data), year, c.policies.injuryCountsInLimit);
    const cert = rule(() => readCertificate(d["certificate"], actor.manager ? null : certificateFolder(centerId, actor.uid), c.today));
    if (type === "injury" && !cert && !actor.manager) throw new HttpsError("failed-precondition", "Envie o atestado médico.");
    const days = type === "injury" && cert && !num(d["days"]) ? num((d["certificate"] as Data)["daysOff"]) : num(d["days"]);
    const plan = rule(() => planPause({type, today: c.today, startsOn: str(d["startsOn"]) || c.today, days, policies: c.policies, usedDays: used}));
    const approved = type === "pause" || actor.manager || (c.policies.injuryPauseApproval === "auto" && !plan.overInjuryLimit);
    const startsNow = approved && plan.startsOn <= c.today;
    const reqStatus: EnrollmentRequestStatus = !approved ? "pending" : startsNow ? "active" : "scheduled";
    const ref = resubmit?.ref ?? reqCol.doc();
    const doc: Data = {
      ...(resubmit ? {} : base),
      ...(resubmit ? {comment: base["comment"], updatedAt: at} : {}),
      reason: type === "injury" ? (cert?.description || str(d["reason"]).slice(0, 200)) : str(d["reason"]).slice(0, 200),
      startsOn: plan.startsOn,
      endsOn: plan.endsOn,
      pausedUntil: plan.pausedUntil,
      days: plan.days,
      overLimit: plan.overInjuryLimit,
      certificate: cert ? {...cert, daysOff: num((d["certificate"] as Data)["daysOff"], plan.days)} : null,
      // Regra da alta congelada no pedido: mudar a política depois não muda pausa em curso.
      ...(type === "injury" && !resubmit ? {requireClearance: c.policies.requireMedicalClearance, clearanceStatus: "", clearance: null} : {}),
      status: reqStatus,
      ...(approved ? {decidedAt: at, decidedByName: actor.manager ? actor.name : "Automático"} : {}),
      appliedAt: startsNow ? at : null,
    };
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(enrRef)).data();
      if (!cur || cur["status"] !== "active") throw new HttpsError("failed-precondition", "A matrícula mudou. Atualize e tente de novo.");
      if (resubmit) tx.update(ref, doc);
      else tx.set(ref, doc);
      if (startsNow) applyPauseInTx(tx, c, enrRef, cur, {...doc, id: ref.id}, at, actor);
      tx.set(c.ref.collection("auditLogs").doc(), audit(at, actor, resubmit ? "enrollment_request.resubmitted" : "enrollment_request.created", enrollmentId,
        `${str(enr["studentName"])} · ${requestSummary({type, ...plan})}${approved ? "" : " · aguardando revisão do atestado"}`));
    });
    if (!actor.manager) {
      await pushStaff(db, deps, c,
        type === "injury" && !approved ? `${str(enr["studentName"])} pediu pausa por lesão` : `${str(enr["studentName"])} trancou a matrícula`,
        `${str(enr["className"])} · ${shortDayBr(plan.startsOn)} a ${shortDayBr(plan.endsOn)} (${plan.days} dias)${approved ? "" : " · revise o atestado"}`,
        ref.id);
    }
    return {requestId: ref.id, status: reqStatus, startsOn: plan.startsOn, endsOn: plan.endsOn, lastDay: null};
  }

  // ---- Cancelamento ----
  if (!["active", "paused"].includes(status)) throw new HttpsError("failed-precondition", "Esta matrícula não está ativa.");
  const reasonKey = str(d["reason"]);
  if (!CANCEL_REASONS[reasonKey]) throw new HttpsError("invalid-argument", "Escolha o motivo.");
  const offered = Array.isArray(d["retentionOffered"]) ?
    (d["retentionOffered"] as unknown[]).map(str).filter((x) => x === "pause" || x === "plan_change") : [];
  const subRef = c.ref.collection(SUBSCRIPTIONS).doc(enrollmentId);
  const sub = (await subRef.get()).data();
  const liveSub = sub && LIVE_SUBSCRIPTION.includes(str(sub["status"])) ? sub : null;
  const ref = reqCol.doc();

  // Aceitou o desconto de 1 mês em vez de sair: a próxima mensalidade sai com desconto.
  if (d["retainDiscount"] === true) {
    if (!c.policies.cancelRetention.includes("discount")) throw new HttpsError("failed-precondition", "Este centro não oferece desconto.");
    if (!liveSub) throw new HttpsError("failed-precondition", "O desconto vale para a mensalidade ativa.");
    if (discountUsedRecently(existing.map((r) => r.data), c.today)) {
      throw new HttpsError("failed-precondition", "Esta matrícula já ganhou um desconto de retenção no último ano.");
    }
    const percent = c.policies.retentionDiscountPercent;
    const price = num(liveSub["priceCents"]);
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(subRef)).data();
      if (!cur || !LIVE_SUBSCRIPTION.includes(str(cur["status"]))) throw new HttpsError("failed-precondition", "A assinatura mudou. Atualize e tente de novo.");
      tx.set(ref, {
        ...base, reason: reasonKey, status: "retained", lastDay: null,
        retention: {offered, accepted: "discount", percent, priceCents: discountedCents(price, percent)},
        decidedAt: at, decidedOn: c.today, decidedByName: "Aluno", effectiveFrom: str(cur["nextChargeDate"]),
      });
      tx.update(subRef, {pendingDiscount: {percent, requestId: ref.id, reason: "retention"}, updatedAt: at});
      tx.set(c.ref.collection("auditLogs").doc(), audit(at, actor, "enrollment_request.retained", enrollmentId,
        `${str(enr["studentName"])} desistiu de cancelar (${CANCEL_REASONS[reasonKey]}) · ${percent}% de desconto na mensalidade de ${shortDayBr(str(cur["nextChargeDate"]))}`));
    });
    await pushStaff(db, deps, c, `${str(enr["studentName"])} ficou com o desconto`,
      `Ia cancelar (${CANCEL_REASONS[reasonKey]}) e aceitou ${percent}% na próxima mensalidade.`, ref.id);
    return {requestId: ref.id, status: "retained", startsOn: null, endsOn: null, lastDay: null};
  }

  // Aceitou a troca de plano em vez de sair: muda no próximo ciclo, sem cancelar.
  const retainPlanId = str(d["retainPlanId"]);
  if (retainPlanId) {
    if (!liveSub) throw new HttpsError("failed-precondition", "A troca de plano vale para a mensalidade ativa.");
    const plan = (await c.ref.collection("plans").doc(retainPlanId).get()).data();
    if (!plan || plan["status"] !== "active" || plan["type"] !== "monthly") throw new HttpsError("failed-precondition", "Esse plano não está mais disponível.");
    const change = {
      planId: retainPlanId,
      planName: str(plan["name"]),
      priceCents: num(plan["priceCents"]),
      classesPerWeek: plan["classesPerWeek"] ?? null,
      makeupsPerMonth: plan["makeupsPerMonth"] ?? null,
      requestedAt: at,
      byName: str(enr["studentName"]) || actor.name,
    };
    await db.runTransaction(async (tx) => {
      tx.set(ref, {
        ...base, reason: reasonKey, status: "retained", lastDay: null,
        retention: {offered, accepted: "plan_change", planId: retainPlanId, planName: change.planName, priceCents: change.priceCents},
        decidedAt: at, decidedOn: c.today, decidedByName: "Aluno", effectiveFrom: str(liveSub["nextChargeDate"]),
      });
      tx.update(subRef, {pendingPlanChange: change, updatedAt: at});
      tx.set(c.ref.collection("auditLogs").doc(), audit(at, actor, "enrollment_request.retained", enrollmentId,
        `${str(enr["studentName"])} desistiu de cancelar (${CANCEL_REASONS[reasonKey]}) · troca para ${change.planName} a partir de ${shortDayBr(str(liveSub["nextChargeDate"]))}`));
    });
    await pushStaff(db, deps, c, `${str(enr["studentName"])} ficou com outro plano`,
      `Ia cancelar (${CANCEL_REASONS[reasonKey]}) e trocou para ${change.planName} no próximo ciclo.`, ref.id);
    return {requestId: ref.id, status: "retained", startsOn: null, endsOn: null, lastDay: null};
  }

  const plan = planCancel({planType, policies: c.policies, nextChargeDate: liveSub ? str(liveSub["nextChargeDate"]) || null : null, today: c.today});
  const doc: Data = {
    ...base,
    reason: reasonKey,
    lastDay: plan.lastDay,
    cancelAt: plan.cancelAt,
    retention: {offered, accepted: null},
    status: plan.endsNow ? "done" : "scheduled",
    decidedAt: at,
    decidedByName: actor.manager ? actor.name : "Automático",
    appliedAt: plan.endsNow ? at : null,
  };
  if (plan.endsNow) {
    await endEnrollment(db, c.ref, enrollmentId, "cancelled", "student_request",
      `cancelada a pedido (${CANCEL_REASONS[reasonKey]}) · vaga liberada`, at, async (tx) => () => {
        tx.set(ref, doc);
        tx.set(c.ref.collection("auditLogs").doc(), audit(at, actor, "enrollment_request.created", enrollmentId,
          `${str(enr["studentName"])} · cancelamento imediato · ${CANCEL_REASONS[reasonKey]}`));
      });
  } else {
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(subRef)).data();
      if (!cur || !LIVE_SUBSCRIPTION.includes(str(cur["status"]))) throw new HttpsError("failed-precondition", "A assinatura mudou. Atualize e tente de novo.");
      tx.set(ref, doc);
      tx.update(subRef, {
        status: "canceling", cancelAt: plan.cancelAt, cancelRequestedAt: at,
        cancelRequestedBy: actor.manager ? actor.name : `${str(enr["studentName"])} (app)`, cancelRequestId: ref.id, updatedAt: at,
      });
      tx.set(c.ref.collection("auditLogs").doc(), audit(at, actor, "enrollment_request.created", enrollmentId,
        `${str(enr["studentName"])} · cancelamento · último dia ${shortDayBr(plan.lastDay)} · ${CANCEL_REASONS[reasonKey]}`));
    });
  }
  if (!actor.manager) {
    await pushStaff(db, deps, c, `${str(enr["studentName"])} cancelou a matrícula`,
      `${str(enr["className"])} · ${CANCEL_REASONS[reasonKey]} · ${plan.endsNow ? "encerrada hoje" : `último dia ${shortDayBr(plan.lastDay)}`}`, ref.id);
  }
  return {requestId: ref.id, status: plan.endsNow ? "done" : "scheduled", startsOn: null, endsOn: null, lastDay: plan.lastDay};
}

// ---------------------------------------------------------------------------
// Desfazer (aluno desiste / gestão desfaz)
// ---------------------------------------------------------------------------

/** Volta a assinatura de `canceling` para ativa (o mesmo que "Desfazer" do portal). */
function undoCancelInTx(tx: Transaction, subRef: DocumentReference, sub: Data | undefined, at: Timestamp) {
  if (sub && sub["status"] === "canceling") {
    tx.update(subRef, {status: "active", cancelAt: null, cancelRequestedAt: null, cancelRequestedBy: null, cancelRequestId: null, updatedAt: at});
  }
}

async function undoRequest(
  db: Firestore, c: CenterCtx, reqRef: DocumentReference, actor: Actor, to: "withdrawn", note: string, at: Timestamp,
): Promise<Data> {
  return db.runTransaction(async (tx) => {
    const req = (await tx.get(reqRef)).data();
    if (!req) throw new HttpsError("not-found", "Pedido não encontrado.");
    const type = str(req["type"]) as EnrollmentRequestType;
    const st = str(req["status"]);
    const undoable = (type === "cancel" && st === "scheduled") ||
      ((type === "pause" || type === "injury") && ["scheduled", "pending", "needs_document"].includes(st));
    if (!undoable) throw new HttpsError("failed-precondition", "Este pedido não pode mais ser desfeito.");
    if (type === "cancel" && str(req["lastDay"]) < c.today) throw new HttpsError("failed-precondition", "O último dia já passou.");
    const subRef = c.ref.collection(SUBSCRIPTIONS).doc(str(req["enrollmentId"]));
    const sub = type === "cancel" ? (await tx.get(subRef)).data() : undefined;
    if (type === "cancel") undoCancelInTx(tx, subRef, sub, at);
    tx.update(reqRef, {status: to, decidedAt: at, decidedByName: actor.name, decisionNote: note, updatedAt: at});
    tx.set(c.ref.collection("auditLogs").doc(), audit(at, actor, "enrollment_request.withdrawn", str(req["enrollmentId"]),
      `${str(req["studentName"])} · ${TYPE_LABEL[type]} desfeito${actor.manager ? " pela gestão" : " pelo aluno"}${note ? ` · ${note}` : ""}`));
    return req;
  });
}

export async function withdrawEnrollmentRequestCore(
  db: Firestore, auth: CallableRequest["auth"], raw: unknown, deps: NotifyDeps = defaultNotifyDeps,
): Promise<{status: EnrollmentRequestStatus}> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = safeId(d["centerId"], "Centro");
  const requestId = safeId(d["requestId"], "Pedido");
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const now = deps.now();
  const c = await loadCenterCtx(db, centerId, now);
  const reqRef = c.ref.collection(ENROLLMENT_REQUESTS).doc(requestId);
  const req = (await reqRef.get()).data();
  if (!req || str(req["studentUid"]) !== auth.uid) throw new HttpsError("permission-denied", "Este pedido não é seu.");
  if (req["type"] === "cancel" && !c.policies.allowCancelWithdraw) {
    throw new HttpsError("failed-precondition", "Este centro não permite desistir do cancelamento pelo app. Fale com a recepção.");
  }
  const actor: Actor = {uid: auth.uid, name: str(req["studentName"]) || "Aluno", manager: false};
  await undoRequest(db, c, reqRef, actor, "withdrawn", "", Timestamp.fromDate(now));
  await pushStaff(db, deps, c, `${str(req["studentName"])} desistiu do pedido`,
    `${TYPE_LABEL[str(req["type"]) as EnrollmentRequestType]} · ${str(req["className"])} segue normal.`, requestId);
  return {status: "withdrawn"};
}

// ---------------------------------------------------------------------------
// Decidir (gestão)
// ---------------------------------------------------------------------------

export type RequestDecision = "approve" | "reject" | "needs_document" | "undo" | "clear";

export async function decideEnrollmentRequestCore(
  db: Firestore, uid: string | undefined, raw: unknown, deps: NotifyDeps = defaultNotifyDeps,
): Promise<{status: EnrollmentRequestStatus}> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = safeId(d["centerId"], "Centro");
  const requestId = safeId(d["requestId"], "Pedido");
  const decision = str(d["decision"]) as RequestDecision;
  if (!["approve", "reject", "needs_document", "undo", "clear"].includes(decision)) throw new HttpsError("invalid-argument", "Decisão inválida.");
  const note = str(d["note"]).slice(0, 400);
  if ((decision === "reject" || decision === "needs_document") && !note) {
    throw new HttpsError("invalid-argument", "Escreva para o aluno o motivo.");
  }
  const actor = await requireManagerActor(db, uid, centerId);
  const now = deps.now();
  const c = await loadCenterCtx(db, centerId, now);
  const at = Timestamp.fromDate(now);
  const reqRef = c.ref.collection(ENROLLMENT_REQUESTS).doc(requestId);

  if (decision === "clear") {
    const req = await clearReturn(db, c, reqRef, actor, note, at);
    await pushStudent(db, deps, c, str(req["studentUid"]), "Volta liberada",
      `${str(req["className"])} · ${req["resumedNow"] ? "suas aulas voltam a partir de hoje." : "a alta foi aprovada, sua volta segue na data marcada."}`,
      {enrollmentId: str(req["enrollmentId"]), requestId});
    return {status: req["resumedNow"] ? "done" : "active"};
  }

  if (decision === "undo") {
    const req = await undoRequest(db, c, reqRef, actor, "withdrawn", note, at);
    await pushStudent(db, deps, c, str(req["studentUid"]), `${TYPE_LABEL[str(req["type"]) as EnrollmentRequestType]} desfeito pelo centro`,
      `${str(req["className"])} segue normal${note ? ` · ${note}` : ""}.`, {enrollmentId: str(req["enrollmentId"]), requestId});
    return {status: "withdrawn"};
  }

  let result: EnrollmentRequestStatus = "rejected";
  const req = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(reqRef)).data();
    if (!cur) throw new HttpsError("not-found", "Pedido não encontrado.");
    const st = str(cur["status"]);
    if (!["pending", "needs_document"].includes(st)) throw new HttpsError("failed-precondition", "Este pedido já foi decidido.");
    if (decision === "needs_document" && st !== "pending") throw new HttpsError("failed-precondition", "O aluno ainda não reenviou o documento.");
    const enrRef = c.ref.collection("enrollments").doc(str(cur["enrollmentId"]));
    const enr = (await tx.get(enrRef)).data();
    if (decision === "approve") {
      if (!enr || enr["status"] !== "active") throw new HttpsError("failed-precondition", "A matrícula não está mais ativa.");
      // Aprovada depois do dia pedido: começa hoje e mantém a duração.
      const startsOn = str(cur["startsOn"]) < c.today ? c.today : str(cur["startsOn"]);
      const days = num(cur["days"], 1);
      const shifted = startsOn !== str(cur["startsOn"]);
      const endsOn = shifted ? addDays(startsOn, days - 1) : str(cur["endsOn"]);
      const pausedUntil = shifted ? addDays(endsOn, 1) : str(cur["pausedUntil"]);
      const startsNow = startsOn <= c.today;
      result = startsNow ? "active" : "scheduled";
      const patch = {status: result, startsOn, endsOn, pausedUntil, decidedAt: at, decidedByName: actor.name, decisionNote: note, appliedAt: startsNow ? at : null, updatedAt: at};
      tx.update(reqRef, patch);
      if (startsNow) applyPauseInTx(tx, c, enrRef, enr, {...cur, ...patch, id: requestId}, at, actor);
    } else {
      result = decision === "reject" ? "rejected" : "needs_document";
      tx.update(reqRef, {status: result, decidedAt: at, decidedByName: actor.name, decisionNote: note, updatedAt: at});
    }
    tx.set(c.ref.collection("auditLogs").doc(), audit(at, actor, `enrollment_request.${decision}`, str(cur["enrollmentId"]),
      `${str(cur["studentName"])} · ${TYPE_LABEL[str(cur["type"]) as EnrollmentRequestType]} · ${
        decision === "approve" ? "aprovada" : decision === "reject" ? "recusada" : "pediu outro documento"}${note ? ` · ${note}` : ""}`));
    return cur;
  });

  const label = TYPE_LABEL[str(req["type"]) as EnrollmentRequestType];
  const title = result === "rejected" ? `${label} não aprovada` : result === "needs_document" ? "O centro pediu outro documento" : `${label} aprovada`;
  const body = result === "rejected" || result === "needs_document" ? note :
    `${str(req["className"])} pausada a partir de ${shortDayBr(str(req["startsOn"]) < c.today ? c.today : str(req["startsOn"]))}. Sua vaga fica reservada.`;
  await pushStudent(db, deps, c, str(req["studentUid"]), title, body, {enrollmentId: str(req["enrollmentId"]), requestId});
  return {status: result};
}

// ---------------------------------------------------------------------------
// Alta médica (pausa por lesão com alta exigida)
// ---------------------------------------------------------------------------

/**
 * Gestão aprova a alta (ou libera sem ela). Se a pausa já passou do fim e estava segurada
 * esperando a alta, a matrícula volta hoje.
 */
async function clearReturn(db: Firestore, c: CenterCtx, reqRef: DocumentReference, actor: Actor, note: string, at: Timestamp): Promise<Data> {
  return db.runTransaction(async (tx) => {
    const req = (await tx.get(reqRef)).data();
    if (!req) throw new HttpsError("not-found", "Pedido não encontrado.");
    if (str(req["type"]) !== "injury" || str(req["status"]) !== "active") {
      throw new HttpsError("failed-precondition", "Só a pausa por lesão em curso tem alta.");
    }
    const enrRef = c.ref.collection("enrollments").doc(str(req["enrollmentId"]));
    const enr = (await tx.get(enrRef)).data();
    const held = req["awaitingClearance"] === true;
    const resumedNow = held && enr?.["status"] === "paused";
    tx.update(reqRef, {
      clearanceStatus: "approved", clearanceDecidedAt: at, clearanceDecidedByName: actor.name, clearanceNote: note,
      ...(held ? {status: "done", awaitingClearance: false} : {}),
      updatedAt: at,
    });
    if (resumedNow) tx.update(enrRef, {status: "active", pausedUntil: null, pauseReason: ""});
    tx.set(c.ref.collection("auditLogs").doc(), audit(at, actor, "enrollment_request.clearance_approved", str(req["enrollmentId"]),
      `${str(req["studentName"])} · alta ${str(req["clearanceStatus"]) === "submitted" ? "aprovada" : "dispensada"}${resumedNow ? " · aulas voltam hoje" : ""}${note ? ` · ${note}` : ""}`));
    return {...req, resumedNow};
  });
}

export async function submitMedicalClearanceCore(
  db: Firestore, auth: CallableRequest["auth"], raw: unknown, deps: NotifyDeps = defaultNotifyDeps,
): Promise<{clearanceStatus: string}> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = safeId(d["centerId"], "Centro");
  const requestId = safeId(d["requestId"], "Pedido");
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const now = deps.now();
  const c = await loadCenterCtx(db, centerId, now);
  const reqRef = c.ref.collection(ENROLLMENT_REQUESTS).doc(requestId);
  const req = (await reqRef.get()).data();
  if (!req || str(req["studentUid"]) !== auth.uid) throw new HttpsError("permission-denied", "Este pedido não é seu.");
  if (str(req["type"]) !== "injury" || str(req["status"]) !== "active") {
    throw new HttpsError("failed-precondition", "A alta vale para a pausa por lesão em curso.");
  }
  if (str(req["clearanceStatus"]) === "approved") throw new HttpsError("failed-precondition", "A alta já foi aprovada.");
  const doc = rule(() => readCertificate(d["clearance"], certificateFolder(centerId, auth.uid), c.today));
  if (!doc) throw new HttpsError("failed-precondition", "Envie a alta médica.");
  const at = Timestamp.fromDate(now);
  await db.runTransaction(async (tx) => {
    tx.update(reqRef, {clearance: {...doc, submittedAt: at}, clearanceStatus: "submitted", updatedAt: at});
    tx.set(c.ref.collection("auditLogs").doc(), audit(at, {uid: auth.uid, name: str(req["studentName"]) || "Aluno"},
      "enrollment_request.clearance_submitted", str(req["enrollmentId"]), `${str(req["studentName"])} · enviou a alta médica`));
  });
  await pushStaff(db, deps, c, `${str(req["studentName"])} enviou a alta médica`,
    `${str(req["className"])} · revise para liberar a volta.`, requestId);
  return {clearanceStatus: "submitted"};
}

// ---------------------------------------------------------------------------
// Rodada diária
// ---------------------------------------------------------------------------

export interface RequestsRunSummary {
  started: number;
  finished: number;
  ended: number;
  /** Pausas por lesão seguradas esperando a alta. */
  held: number;
  errors: number;
}

export async function runCenterEnrollmentRequests(
  db: Firestore, centerId: string, now: Date, deps: NotifyDeps = {...defaultNotifyDeps, now: () => now},
): Promise<RequestsRunSummary> {
  const ref = centerRef(db, centerId);
  const data = (await ref.get()).data() ?? {};
  const c: CenterCtx = {ref, data, today: dayKeyIn(now, str(data["timezone"])), policies: readExitPolicies(data["policies"])};
  const at = Timestamp.fromDate(now);
  const summary: RequestsRunSummary = {started: 0, finished: 0, ended: 0, held: 0, errors: 0};
  const snap = await ref.collection(ENROLLMENT_REQUESTS).where("status", "in", ["scheduled", "active"]).get();
  for (const doc of snap.docs) {
    const r = doc.data() as Data;
    const action = dueAction(r, c.today);
    if (!action) continue;
    const enrRef = ref.collection("enrollments").doc(str(r["enrollmentId"]));
    try {
      if (action === "start_pause") {
        await db.runTransaction(async (tx) => {
          const cur = (await tx.get(doc.ref)).data();
          const enr = (await tx.get(enrRef)).data();
          if (!cur || cur["status"] !== "scheduled") return;
          if (!enr || enr["status"] !== "active") {
            tx.update(doc.ref, {status: "done", decisionNote: "A matrícula não estava ativa no dia da pausa.", updatedAt: at});
            return;
          }
          tx.update(doc.ref, {status: "active", appliedAt: at, updatedAt: at});
          applyPauseInTx(tx, c, enrRef, enr, {...cur, id: doc.id}, at, SYSTEM);
        });
        summary.started += 1;
      } else if (action === "ask_clearance") {
        await doc.ref.update({clearanceStatus: "requested", clearanceRequestedAt: at, updatedAt: at});
        await pushStudent(db, deps, c, str(r["studentUid"]), "Envie sua alta médica",
          `${str(r["className"])} · sua pausa termina em ${shortDayBr(str(r["endsOn"]))}. Envie a alta pelo app para voltar às aulas.`,
          {enrollmentId: str(r["enrollmentId"]), requestId: doc.id});
      } else if (action === "hold_for_clearance") {
        // Sem alta aprovada: a pausa segue mais um dia (a cobrança das 06:00 não reativa).
        const tomorrow = addDays(c.today, 1);
        const held = await db.runTransaction(async (tx) => {
          const cur = (await tx.get(doc.ref)).data();
          const enr = (await tx.get(enrRef)).data();
          if (!cur || cur["status"] !== "active") return false;
          if (!enr || enr["status"] !== "paused") {
            tx.update(doc.ref, {status: "done", updatedAt: at});
            return false;
          }
          tx.update(enrRef, {pausedUntil: tomorrow});
          tx.update(doc.ref, {
            awaitingClearance: true, pausedUntil: tomorrow, updatedAt: at,
            ...(str(cur["clearanceStatus"]) ? {} : {clearanceStatus: "requested", clearanceRequestedAt: at}),
          });
          if (cur["awaitingClearance"] !== true) {
            tx.set(ref.collection("auditLogs").doc(), audit(at, SYSTEM, "enrollment_request.held_for_clearance", enrRef.id,
              `${str(cur["studentName"])} · pausa por lesão terminou sem alta aprovada · segue pausada`));
          }
          return cur["awaitingClearance"] !== true;
        });
        summary.held += 1;
        if (held) {
          await pushStudent(db, deps, c, str(r["studentUid"]), "Sua volta espera a alta médica",
            `${str(r["className"])} · envie a alta pelo app; as aulas voltam quando o centro aprovar.`,
            {enrollmentId: str(r["enrollmentId"]), requestId: doc.id});
        }
      } else if (action === "finish_pause") {
        // A matrícula volta sozinha na rodada da cobrança (`pausedUntil`); aqui só fecha o pedido.
        await doc.ref.update({status: "done", updatedAt: at});
        summary.finished += 1;
      } else {
        await endEnrollment(db, ref, enrRef.id, "cancelled", "student_request",
          `último dia ${shortDayBr(str(r["lastDay"]))} · cancelada a pedido · vaga liberada`, at);
        await doc.ref.update({status: "done", appliedAt: at, updatedAt: at});
        summary.ended += 1;
      }
    } catch (e) {
      summary.errors += 1;
      logger.warn(`runCenterEnrollmentRequests ${centerId}/${doc.id} falhou`, e);
    }
  }
  return summary;
}

export async function runTrainingCenterEnrollmentRequestsCore(db: Firestore, now: Date = new Date()): Promise<number> {
  const centers = await db.collection(TRAINING_CENTERS).where("status", "==", "active").get();
  let ran = 0;
  for (const doc of centers.docs) {
    try {
      const s = await runCenterEnrollmentRequests(db, doc.id, now);
      ran += 1;
      if (s.started || s.ended || s.errors) logger.info(`runTrainingCenterEnrollmentRequests ${doc.id}`, s);
    } catch (e) {
      logger.error(`runTrainingCenterEnrollmentRequests ${doc.id} falhou`, e);
    }
  }
  return ran;
}

export const runTrainingCenterEnrollmentRequests = onSchedule({
  schedule: "50 5 * * *",
  timeZone: "America/Sao_Paulo",
  timeoutSeconds: 300,
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  await runTrainingCenterEnrollmentRequestsCore(getFirestore());
});

const CALL_OPTS = {
  region: CLIENT_FACING_REGIONS,
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
};

export const requestTrainingCenterEnrollmentChange = onCall(CALL_OPTS, async (request: CallableRequest) =>
  requestEnrollmentChangeCore(getFirestore(), request.auth, request.data));

export const withdrawTrainingCenterEnrollmentRequest = onCall(CALL_OPTS, async (request: CallableRequest) =>
  withdrawEnrollmentRequestCore(getFirestore(), request.auth, request.data));

export const submitTrainingCenterMedicalClearance = onCall(CALL_OPTS, async (request: CallableRequest) =>
  submitMedicalClearanceCore(getFirestore(), request.auth, request.data));

export const decideTrainingCenterEnrollmentRequest = onCall(CALL_OPTS, async (request: CallableRequest) =>
  decideEnrollmentRequestCore(getFirestore(), request.auth?.uid, request.data));
