/**
 * Contratos dos alunos do Centro de Treinamento (canvas K1–K9).
 *
 * Equipe (quem matricula: owner, admin, recepção ou `enroll_students`):
 * - `sendTrainingCenterContracts`: preenche os modelos publicados com os dados do aluno e da
 *   matrícula, congela o texto (`body` + `sha256`) e avisa o aluno por push;
 * - `remindTrainingCenterContract`: lembrete do contrato aberto (1 por hora);
 * - `terminateTrainingCenterContract` (owner/admin): encerra o assinado ou cancela o aberto.
 *
 * Aluno (conta vinculada em `students.uid`; no menor, quem assina é o responsável por essa conta):
 * - `openMyTrainingCenterContract`: marca aberto (contagem de aberturas);
 * - `signMyTrainingCenterContract`: assina (ou recusa o termo opcional) e guarda as evidências —
 *   conta autenticada, IP, dispositivo, tempo de leitura e o hash do texto lido. Assinatura
 *   eletrônica simples; o centro assina junto, automaticamente.
 *
 * Os contratos só o servidor grava (rules); a equipe lê pelo Firestore, o aluno pelo
 * `getMyTrainingCenters`.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {Timestamp, getFirestore, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {TRAINING_CENTERS, canManageCenterBilling} from "./training-center-billing-model";
import {defaultNotifyDeps, type NotifyDeps} from "./training-center-notify";
import {dayKeyIn} from "./training-center-waitlist-model";
import {findMyStudent} from "./training-center-athlete-actions";
import {
  CONTRACTS,
  CONTRACT_TEMPLATES,
  clientIp,
  MAX_BODY_CHARS,
  OPEN_CONTRACT_STATUSES,
  REMIND_COOLDOWN_MS,
  contractNumber,
  contractSha256,
  contractTerm,
  contractEssentials,
  contractValues,
  fillContractBody,
  sameDocument,
  type ContractKind,
} from "./training-center-contracts-model";

type Data = Record<string, unknown>;

export const CENTER_CONTRACT_TYPE = "training_center_contract";
const MAX_TEMPLATES_PER_SEND = 5;
const MAX_EVENTS = 40;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function rec(v: unknown): Data {
  return v != null && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
}

function safeId(v: unknown, label: string): string {
  const s = str(v);
  if (!s || s.includes("/")) throw new HttpsError("invalid-argument", `${label} inválido.`);
  return s;
}

const centerRefOf = (db: Firestore, centerId: string) => db.collection(TRAINING_CENTERS).doc(centerId);

/** Espelho de `ctHasPerm('enroll_students')` (rules) / `canEnroll` (portal). */
export function canSendContracts(member: Data | undefined): boolean {
  if (!member || member["status"] !== "active") return false;
  const role = str(member["role"]);
  if (role === "center_owner" || role === "center_admin" || role === "receptionist") return true;
  const extra = Array.isArray(member["extraPerms"]) ? member["extraPerms"] as unknown[] : [];
  return extra.includes("enroll_students");
}

async function requireStaff(
  db: Firestore, uid: string, centerId: string, manager = false,
): Promise<{centerRef: DocumentReference; center: Data; member: Data; actorName: string}> {
  const centerRef = centerRefOf(db, centerId);
  const [memberSnap, centerSnap] = await Promise.all([
    centerRef.collection("centerMembers").doc(uid).get(),
    centerRef.get(),
  ]);
  const member = memberSnap.data() as Data | undefined;
  const ok = manager ? canManageCenterBilling(member) : canSendContracts(member);
  if (!ok) {
    throw new HttpsError("permission-denied", manager ?
      "Só owner e admin encerram contratos." :
      "Sem permissão para enviar contratos neste centro.");
  }
  const center = centerSnap.data() as Data | undefined;
  if (!center) throw new HttpsError("not-found", "Centro não encontrado.");
  if (center["status"] === "suspended") {
    throw new HttpsError("failed-precondition", "Centro suspenso: somente leitura até regularizar a assinatura.");
  }
  return {centerRef, center, member: member!, actorName: str(member!["displayName"]) || "Equipe do centro"};
}

function event(at: Timestamp, type: string, title: string, byName: string, detail = ""): Data {
  return {at, type, title, byName, detail};
}

function withEvent(c: Data, e: Data): Data[] {
  const events = Array.isArray(c["events"]) ? c["events"] as Data[] : [];
  return [...events, e].slice(-MAX_EVENTS);
}

function audit(centerRef: DocumentReference, at: Timestamp, actorUid: string, actorName: string,
  action: string, entityId: string, detail: string, reason = ""): {ref: DocumentReference; data: Data} {
  return {
    ref: centerRef.collection("auditLogs").doc(),
    data: {at, actorUid, actorName, action, entity: "contract", entityId, detail, reason},
  };
}

/** Quem assina: o aluno; no menor, o responsável legal (pela conta vinculada ao cadastro). */
export function signerOf(student: Data): {role: "student" | "guardian"; name: string; relation: string} {
  const guardian = rec(student["guardian"]);
  if (student["isMinor"] === true) {
    return {role: "guardian", name: str(guardian["name"]), relation: str(guardian["relation"])};
  }
  return {role: "student", name: str(student["name"]), relation: ""};
}

/** Dia do vencimento: o da assinatura; senão a regra do centro (fixo ou dia da entrada). */
export function billingDayFor(center: Data, enrollment: Data | null, subscription: Data | null): number | null {
  const fromSub = num(subscription?.["billingDay"]);
  if (fromSub) return fromSub;
  if (!enrollment || str(rec(enrollment["contract"])["planType"]) === "class_pack") return null;
  const billing = rec(center["billing"]);
  if (str(billing["billingDayMode"]) === "enrollment") {
    const day = Number(str(enrollment["startDate"]).slice(8, 10));
    return Number.isFinite(day) && day > 0 ? Math.min(day, 28) : null;
  }
  return num(billing["billingDay"]) ?? 5;
}

async function pushContract(deps: NotifyDeps, input: {
  uid: string; centerId: string; contractId: string; centerName: string; title: string; reminder: boolean;
}): Promise<boolean> {
  if (!input.uid) return false;
  try {
    await deps.notify({
      userId: input.uid,
      title: input.reminder ? `Lembrete: contrato para assinar` : `Contrato para assinar · ${input.centerName}`,
      body: input.reminder ?
        `${input.title} de ${input.centerName} ainda espera sua assinatura. Leva cerca de 2 minutos.` :
        `${input.title}. Toque para ler e assinar pelo app.`,
      type: CENTER_CONTRACT_TYPE,
      data: {centerId: input.centerId, contractId: input.contractId},
    });
    return true;
  } catch (e) {
    logger.warn(`contrato ${input.centerId}/${input.contractId}: push falhou`, e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Equipe: enviar, lembrar, encerrar
// ---------------------------------------------------------------------------

export interface SendContractsResult {
  contracts: Array<{contractId: string; number: string; title: string}>;
  /** O aluno recebeu push (tem conta vinculada). */
  notified: boolean;
}

export async function sendContractsCore(
  db: Firestore, deps: NotifyDeps, uid: string, raw: unknown,
): Promise<SendContractsResult> {
  const d = rec(raw);
  const centerId = safeId(d["centerId"], "Centro");
  const studentId = safeId(d["studentId"], "Aluno");
  const enrollmentId = str(d["enrollmentId"]) ? safeId(d["enrollmentId"], "Matrícula") : null;
  const templateIds = [...new Set((Array.isArray(d["templateIds"]) ? d["templateIds"] as unknown[] : [])
    .map((t) => safeId(t, "Modelo")))];
  if (templateIds.length === 0) throw new HttpsError("invalid-argument", "Escolha pelo menos um modelo.");
  if (templateIds.length > MAX_TEMPLATES_PER_SEND) throw new HttpsError("invalid-argument", "Envie no máximo 5 documentos por vez.");
  const requireBeforePayment = d["requireBeforePayment"] === true;

  const {centerRef, center, actorName} = await requireStaff(db, uid, centerId);
  const now = deps.now();
  const tz = str(center["timezone"]) || "America/Sao_Paulo";
  const today = dayKeyIn(now, tz);

  const studentSnap = await centerRef.collection("students").doc(studentId).get();
  const student = studentSnap.data() as Data | undefined;
  if (!student) throw new HttpsError("not-found", "Aluno não encontrado.");
  if (student["status"] === "blocked") throw new HttpsError("failed-precondition", "Aluno bloqueado pelo centro.");
  const signer = signerOf(student);
  if (signer.role === "guardian" && !signer.name) {
    throw new HttpsError("failed-precondition", "Aluno menor: cadastre o responsável legal antes de enviar o contrato.");
  }

  let enrollment: Data | null = null;
  let cls: Data | null = null;
  let program: Data | null = null;
  let subscription: Data | null = null;
  if (enrollmentId) {
    const eSnap = await centerRef.collection("enrollments").doc(enrollmentId).get();
    enrollment = (eSnap.data() as Data | undefined) ?? null;
    if (!enrollment || str(enrollment["studentId"]) !== studentId) throw new HttpsError("not-found", "Matrícula não encontrada.");
    if (["cancelled", "completed"].includes(str(enrollment["status"]))) {
      throw new HttpsError("failed-precondition", "Esta matrícula já foi encerrada.");
    }
    if (!Object.keys(rec(enrollment["contract"])).length) {
      throw new HttpsError("failed-precondition", "A matrícula ainda está na lista de espera: envie o contrato quando a vaga sair.");
    }
    const classId = str(enrollment["classId"]);
    const [cSnap, subSnap] = await Promise.all([
      classId ? centerRef.collection("classes").doc(classId).get() : Promise.resolve(null),
      centerRef.collection("subscriptions").doc(enrollmentId).get(),
    ]);
    cls = (cSnap?.data() as Data | undefined) ?? null;
    subscription = (subSnap.data() as Data | undefined) ?? null;
    const programId = str(cls?.["programId"]);
    if (programId) program = ((await centerRef.collection("programs").doc(programId).get()).data() as Data | undefined) ?? null;
  }

  const templateSnaps = await db.getAll(...templateIds.map((id) => centerRef.collection(CONTRACT_TEMPLATES).doc(id)));
  const templates = templateSnaps.map((s) => {
    const t = s.data() as Data | undefined;
    if (!t || t["status"] !== "published" || !(num(t["version"]) ?? 0) || !str(t["body"])) {
      throw new HttpsError("failed-precondition", `O modelo "${str(t?.["name"]) || s.id}" não está publicado.`);
    }
    const kind: ContractKind = t["kind"] === "enrollment" ? "enrollment" : "term";
    if (kind === "enrollment" && !enrollment) {
      throw new HttpsError("failed-precondition", `"${str(t["name"])}" é um contrato de matrícula: escolha a matrícula do aluno.`);
    }
    return {id: s.id, data: t, kind};
  });

  // Mesmo documento já esperando assinatura: lembrete, não um segundo envio.
  const existing = await centerRef.collection(CONTRACTS).where("studentId", "==", studentId).get();
  for (const t of templates) {
    const dup = existing.docs.find((x) => {
      const c = x.data() as Data;
      return OPEN_CONTRACT_STATUSES.has(str(c["status"])) && str(c["templateId"]) === t.id &&
        (t.kind === "term" || str(c["enrollmentId"]) === enrollmentId);
    });
    if (dup) {
      throw new HttpsError("failed-precondition", `"${str(t.data["name"])}" já está aguardando a assinatura deste aluno — use "Reenviar lembrete".`);
    }
  }

  const ctx = {center, student, enrollment, cls, program, billingDay: billingDayFor(center, enrollment, subscription), today};
  const values = contractValues(ctx);
  const at = Timestamp.fromDate(now);
  const year = Number(today.slice(0, 4));
  const counterRef = centerRef.collection("contractCounters").doc(String(year));
  const studentUid = str(student["uid"]);
  const contract = rec(enrollment?.["contract"]);

  const created = await db.runTransaction(async (tx) => {
    const counter = (await tx.get(counterRef)).data() as Data | undefined;
    let seq = num(counter?.["next"]) ?? 1;
    const out: Array<{contractId: string; number: string; title: string}> = [];
    const writes: Array<{ref: DocumentReference; data: Data}> = [];
    for (const t of templates) {
      const body = fillContractBody(str(t.data["body"]), values).slice(0, MAX_BODY_CHARS);
      const ref = centerRef.collection(CONTRACTS).doc();
      const number = contractNumber(year, seq++);
      const title = str(t.data["name"]) || "Contrato";
      const term = contractTerm(t.kind, enrollment);
      writes.push({ref, data: {
        number,
        centerName: str(center["name"]),
        studentId,
        studentName: str(student["name"]),
        studentUid: studentUid || null,
        isMinor: student["isMinor"] === true,
        signer,
        templateId: t.id,
        templateName: title,
        templateVersion: num(t.data["version"]) ?? 1,
        kind: t.kind,
        optional: t.data["optional"] === true,
        title,
        body,
        sha256: contractSha256(body),
        essentials: t.kind === "enrollment" ? contractEssentials(ctx) : [],
        enrollmentId: t.kind === "enrollment" ? enrollmentId : null,
        classId: t.kind === "enrollment" ? str(enrollment?.["classId"]) || null : null,
        className: t.kind === "enrollment" ? str(enrollment?.["className"]) : "",
        planName: t.kind === "enrollment" ? str(contract["planName"]) : "",
        priceCents: t.kind === "enrollment" ? num(contract["priceCents"]) : null,
        startDate: term.startDate,
        endDate: term.endDate,
        // Só o contrato de matrícula segura o pagamento; termo avulso nunca.
        requireBeforePayment: t.kind === "enrollment" && requireBeforePayment,
        status: "sent",
        decision: null,
        sentAt: at,
        sentByUid: uid,
        sentByName: actorName,
        viewCount: 0,
        viewedAt: null,
        lastViewedAt: null,
        signedAt: null,
        evidence: null,
        reminderCount: 0,
        remindedAt: null,
        terminatedAt: null,
        terminatedByName: "",
        terminateReason: "",
        events: [event(at, "sent", "Enviado para assinatura", actorName, studentUid ? "App NexaGO" : "Aguardando o aluno vincular a conta")],
        createdAt: at,
      }});
      writes.push(audit(centerRef, at, uid, actorName, "contract.sent", ref.id,
        `${str(student["name"])} · ${title} v${num(t.data["version"]) ?? 1} · ${number}`));
      out.push({contractId: ref.id, number, title});
    }
    tx.set(counterRef, {next: seq, updatedAt: at}, {merge: true});
    for (const w of writes) tx.set(w.ref, w.data);
    return out;
  });

  let notified = false;
  if (studentUid) {
    const first = created[0]!;
    notified = await pushContract(deps, {
      uid: studentUid, centerId, contractId: first.contractId, centerName: str(center["name"]) || "seu centro",
      title: created.length > 1 ? `${created.length} documentos` : first.title, reminder: false,
    });
  }
  return {contracts: created, notified};
}

export async function remindContractCore(
  db: Firestore, deps: NotifyDeps, uid: string, raw: unknown,
): Promise<{notified: boolean; reminderCount: number}> {
  const d = rec(raw);
  const centerId = safeId(d["centerId"], "Centro");
  const contractId = safeId(d["contractId"], "Contrato");
  const {centerRef, center, actorName} = await requireStaff(db, uid, centerId);
  const ref = centerRef.collection(CONTRACTS).doc(contractId);
  const c = (await ref.get()).data() as Data | undefined;
  if (!c) throw new HttpsError("not-found", "Contrato não encontrado.");
  if (!OPEN_CONTRACT_STATUSES.has(str(c["status"]))) throw new HttpsError("failed-precondition", "Este contrato não espera mais assinatura.");
  // O cadastro pode ter ganhado a conta depois do envio.
  const student = (await centerRef.collection("students").doc(str(c["studentId"])).get()).data() as Data | undefined;
  const studentUid = str(student?.["uid"]) || str(c["studentUid"]);
  if (!studentUid) throw new HttpsError("failed-precondition", "O aluno ainda não tem conta NexaGO vinculada: o lembrete não tem para onde ir.");
  const now = deps.now();
  const last = c["remindedAt"] instanceof Timestamp ? (c["remindedAt"] as Timestamp).toMillis() : 0;
  if (last && now.getTime() - last < REMIND_COOLDOWN_MS) {
    throw new HttpsError("failed-precondition", "Um lembrete já saiu na última hora. Tente mais tarde.");
  }
  const at = Timestamp.fromDate(now);
  const reminderCount = (num(c["reminderCount"]) ?? 0) + 1;
  const batch = db.batch();
  batch.update(ref, {
    remindedAt: at, reminderCount, studentUid,
    events: withEvent(c, event(at, "reminded", "Lembrete enviado", actorName)),
  });
  const a = audit(centerRef, at, uid, actorName, "contract.reminded", contractId, `${str(c["studentName"])} · ${str(c["title"])} · lembrete ${reminderCount}`);
  batch.set(a.ref, a.data);
  await batch.commit();
  const notified = await pushContract(deps, {
    uid: studentUid, centerId, contractId, centerName: str(center["name"]) || "seu centro", title: str(c["title"]), reminder: true,
  });
  return {notified, reminderCount};
}

export async function terminateContractCore(
  db: Firestore, deps: NotifyDeps, uid: string, raw: unknown,
): Promise<{status: string}> {
  const d = rec(raw);
  const centerId = safeId(d["centerId"], "Centro");
  const contractId = safeId(d["contractId"], "Contrato");
  const reason = str(d["reason"]).slice(0, 300);
  if (reason.length < 3) throw new HttpsError("invalid-argument", "Conte o motivo (fica na trilha do contrato).");
  const {centerRef, actorName} = await requireStaff(db, uid, centerId, true);
  const ref = centerRef.collection(CONTRACTS).doc(contractId);
  const at = Timestamp.fromDate(deps.now());
  return db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() as Data | undefined;
    if (!c) throw new HttpsError("not-found", "Contrato não encontrado.");
    const status = str(c["status"]);
    let next: "terminated" | "cancelled";
    if (status === "signed") next = "terminated";
    else if (OPEN_CONTRACT_STATUSES.has(status)) next = "cancelled";
    else throw new HttpsError("failed-precondition", "Este contrato já foi encerrado.");
    tx.update(ref, {
      status: next, terminatedAt: at, terminatedByName: actorName, terminateReason: reason,
      events: withEvent(c, event(at, next, next === "terminated" ? "Contrato encerrado" : "Envio cancelado", actorName, reason)),
    });
    const a = audit(centerRef, at, uid, actorName, next === "terminated" ? "contract.terminated" : "contract.cancelled", contractId,
      `${str(c["studentName"])} · ${str(c["title"])} · ${str(c["number"])}`, reason);
    tx.set(a.ref, a.data);
    return {status: next};
  });
}

// ---------------------------------------------------------------------------
// Aluno: abrir e assinar
// ---------------------------------------------------------------------------

async function myContract(db: Firestore, uid: string, raw: unknown) {
  const d = rec(raw);
  const centerId = safeId(d["centerId"], "Centro");
  const contractId = safeId(d["contractId"], "Contrato");
  const student = await findMyStudent(db, centerId, uid);
  const centerRef = centerRefOf(db, centerId);
  const ref = centerRef.collection(CONTRACTS).doc(contractId);
  const c = (await ref.get()).data() as Data | undefined;
  if (!c || str(c["studentId"]) !== student.id) throw new HttpsError("not-found", "Contrato não encontrado.");
  return {d, centerId, centerRef, ref, c, student};
}

export async function openMyContractCore(db: Firestore, uid: string, raw: unknown, now: Date): Promise<{status: string}> {
  const {ref, c} = await myContract(db, uid, raw);
  const status = str(c["status"]);
  if (!OPEN_CONTRACT_STATUSES.has(status)) return {status};
  const at = Timestamp.fromDate(now);
  const viewCount = (num(c["viewCount"]) ?? 0) + 1;
  const first = !(c["viewedAt"] instanceof Timestamp);
  await ref.update({
    status: "viewed", viewCount, lastViewedAt: at, ...(first ? {viewedAt: at} : {}),
    // Só a primeira abertura entra na linha do tempo (a contagem diz o resto).
    ...(first ? {events: withEvent(c, event(at, "viewed", "Abriu o contrato no app", signerName(c)))} : {}),
  });
  return {status: "viewed"};
}

function signerName(c: Data): string {
  return str(rec(c["signer"])["name"]) || str(c["studentName"]) || "Aluno";
}

export interface SignEvidence {
  ip: string;
  userAgent: string;
  platform: string;
  appVersion: string;
}

export interface SignResult {
  status: "signed" | "declined";
  number: string;
  signedAt: string;
}

export async function signMyContractCore(
  db: Firestore, auth: {uid: string; email: string}, raw: unknown, evidence: SignEvidence, now: Date,
): Promise<SignResult> {
  const {d, centerRef, ref, student} = await myContract(db, auth.uid, raw);
  const decision = d["decision"] === "decline" ? "decline" : "accept";
  if (d["agreed"] !== true && decision === "accept") {
    throw new HttpsError("invalid-argument", "Marque que leu e concorda com o contrato.");
  }
  const readSeconds = Math.max(0, Math.min(Math.round(num(d["readSeconds"]) ?? 0), 24 * 3600));
  const at = Timestamp.fromDate(now);
  return db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() as Data | undefined;
    if (!c) throw new HttpsError("not-found", "Contrato não encontrado.");
    if (!OPEN_CONTRACT_STATUSES.has(str(c["status"]))) {
      throw new HttpsError("failed-precondition", "Este contrato não espera mais assinatura.");
    }
    if (decision === "decline" && c["optional"] !== true) {
      throw new HttpsError("failed-precondition", "Este documento é obrigatório para a matrícula.");
    }
    if (!sameDocument(str(c["sha256"]), d["sha256"])) {
      throw new HttpsError("failed-precondition", "O texto mudou desde que você abriu. Abra o contrato de novo.");
    }
    const status = decision === "decline" ? "declined" : "signed";
    const who = signerName(c);
    const asGuardian = str(rec(c["signer"])["role"]) === "guardian";
    tx.update(ref, {
      status,
      decision: decision === "decline" ? "declined" : "accepted",
      signedAt: at,
      studentUid: auth.uid,
      evidence: {
        method: "app_session",
        uid: auth.uid,
        email: auth.email,
        ip: evidence.ip,
        userAgent: evidence.userAgent.slice(0, 300),
        platform: evidence.platform.slice(0, 40),
        appVersion: evidence.appVersion.slice(0, 40),
        readSeconds,
        sha256: str(c["sha256"]),
      },
      centerSignature: decision === "decline" ? null : {name: str(c["centerName"]) || "Centro de treinamento", at},
      events: withEvent(c, event(at, status,
        decision === "decline" ? "Não autorizou" : asGuardian ? "Assinou como responsável legal" : "Assinou pelo app",
        who, `${evidence.platform || "app"} · leitura ${Math.max(1, Math.round(readSeconds / 60))} min`)),
    });
    const a = audit(centerRef, at, auth.uid, who, decision === "decline" ? "contract.declined" : "contract.signed", ref.id,
      `${str(student.data["name"])} · ${str(c["title"])} · ${str(c["number"])}`);
    tx.set(a.ref, a.data);
    return {status, number: str(c["number"]), signedAt: now.toISOString()};
  });
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

const PUSH_OPTS = {region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]};

function requireAuth(request: CallableRequest): {uid: string; email: string} {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return {uid: request.auth.uid, email: str(rec(request.auth.token)["email"]).toLowerCase()};
}

export const sendTrainingCenterContracts = onCall(PUSH_OPTS, async (request) =>
  sendContractsCore(getFirestore(), defaultNotifyDeps, requireAuth(request).uid, request.data));

export const remindTrainingCenterContract = onCall(PUSH_OPTS, async (request) =>
  remindContractCore(getFirestore(), defaultNotifyDeps, requireAuth(request).uid, request.data));

export const terminateTrainingCenterContract = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  terminateContractCore(getFirestore(), defaultNotifyDeps, requireAuth(request).uid, request.data));

export const openMyTrainingCenterContract = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  openMyContractCore(getFirestore(), requireAuth(request).uid, request.data, new Date()));

export const signMyTrainingCenterContract = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const auth = requireAuth(request);
  const headers = request.rawRequest?.headers ?? {};
  const d = rec(request.data);
  return signMyContractCore(getFirestore(), auth, request.data, {
    ip: clientIp(headers["x-forwarded-for"], request.rawRequest?.ip),
    userAgent: str(headers["user-agent"]),
    platform: str(d["platform"]),
    appVersion: str(d["appVersion"]),
  }, new Date());
});
