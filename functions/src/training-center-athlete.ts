/**
 * Centro de treinamento visto pelo ALUNO (app do atleta, "Treinos" por origem — O1/O2/O6/O7/O8).
 *
 * As coleções do centro (`trainingCenters/{c}/…`) são só da equipe (rules: `ctIsMember`). O aluno
 * é `students/{id}` com `uid` = conta NexaGO; esta callable acha os vínculos por collection group e
 * monta a visão do próprio aluno: matrículas, aulas da janela (com o local DA DATA), regras e
 * faturas. Sem telefone, CPF, observações médicas, lista de colegas nem dados do provedor além do
 * link de pagamento da fatura em aberto.
 */
import * as logger from "firebase-functions/logger";
import {onCall} from "firebase-functions/v2/https";
import {getFirestore, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {addDays} from "./training-center-subscription-model";
import {dayKeyIn} from "./training-center-waitlist-model";
import {requireUid, str} from "./arena-class";
import {ensureCheckinCode} from "./training-center-checkin";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {CONTRACTS, OPEN_CONTRACT_STATUSES} from "./training-center-contracts-model";
import {
  CANCEL_REASONS,
  ENROLLMENT_REQUESTS,
  OPEN_REQUEST_STATUSES,
  discountUsedRecently,
  pauseDaysUsed,
  planCancel,
  readExitPolicies,
  type EnrollmentRequestStatus,
} from "./training-center-enrollment-requests-model";

type Data = Record<string, unknown>;

const MAX_CENTERS = 10;
const MAX_ENROLLMENTS = 10;
const MAX_INVOICES = 12;
const MAX_CONTRACTS = 20;
/** Janela das aulas: 45 dias para trás (frequência do mês) e 21 para a frente. */
export const CENTER_PAST_DAYS = 45;
export const CENTER_AHEAD_DAYS = 21;
/** Matrículas que o aluno vê (cancelada/encerrada some). */
const VISIBLE_ENROLLMENTS = new Set(["active", "paused", "pending", "waitlisted"]);
/** Matrículas que ocupam vaga e, portanto, têm aula na agenda. */
const SEATED_ENROLLMENTS = new Set(["active", "paused"]);

export interface MyCenterEnrollment {
  enrollmentId: string;
  classId: string;
  className: string;
  /** `active`, `paused`, `pending` ou `waitlisted`. */
  status: string;
  startDate: string;
  pausedUntil: string | null;
  planName: string;
  /** `monthly` ou `class_pack`. */
  planType: string;
  priceCents: number;
  classesPerWeek: number | null;
  credits: number | null;
  creditsLeft: number | null;
  level: string;
  coachName: string;
  /** ISO 1 = segunda … 7 = domingo. */
  weekdays: number[];
  startTime: string;
  durationMin: number;
  locationName: string;
  /** Assinatura mensal (só servidor cria). */
  billing: {status: string; billingDay: number | null; method: string; nextChargeDate: string | null} | null;
  /** Dias de trancamento já usados no ano (o limite está em `policies`). */
  pauseDaysUsed: number;
  /** Último dia de aula se cancelar hoje (prévia da tela de cancelamento). */
  cancelLastDay: string | null;
  /** Ofertas de retenção "trocar de plano": mensais ativos mais baratos da mesma modalidade. */
  retentionPlans: Array<{planId: string; name: string; priceCents: number; classesPerWeek: number | null}>;
  /** Oferta "desconto de 1 mês" disponível (centro oferece, mensal ativa, sem desconto no último ano). */
  discountAvailable: boolean;
}

/** Pedido de trancamento, pausa por lesão ou cancelamento (T5–T10). */
export interface MyCenterEnrollmentRequest {
  requestId: string;
  enrollmentId: string;
  /** `pause`, `injury` ou `cancel`. */
  type: string;
  status: string;
  className: string;
  startsOn: string | null;
  endsOn: string | null;
  days: number | null;
  lastDay: string | null;
  /** Motivo legível (cancelamento: rótulo da lista). */
  reason: string;
  decisionNote: string;
  createdOn: string | null;
  hasCertificate: boolean;
  /** Ficou com outro plano em vez de cancelar. */
  retainedPlanName: string | null;
  /** Ficou com o desconto de 1 mês (percentual) em vez de cancelar. */
  retainedDiscountPercent: number | null;
  effectiveFrom: string | null;
  /** Pausa por lesão: alta exigida? `""`, `requested`, `submitted` ou `approved`. */
  requireClearance: boolean;
  clearanceStatus: string;
  /** Pausa passou do fim e segue esperando a alta. */
  awaitingClearance: boolean;
  /** Trancamento que devolveu a vaga à turma. */
  releaseSeat: boolean;
  /** Trancamento terminou com a turma cheia: segue pausado, com prioridade na próxima vaga. */
  awaitingSeat: boolean;
}

export interface MyCenterSession {
  sessionId: string;
  classId: string;
  className: string;
  date: string;
  startTime: string;
  durationMin: number;
  coachName: string;
  locationName: string;
  locationAddress: string;
  courtName: string;
  /** `scheduled`, `cancelled` ou `done`. */
  status: string;
  /** Local diferente do padrão da turma só nesta data. */
  locationChanged: boolean;
  /** Local padrão da turma (para "Sede → Praia"). */
  defaultLocationName: string;
  changed: boolean;
  changeReason: string;
  /** `present`, `excused`, `absent` ou `null` sem chamada. */
  myMark: string | null;
  isMakeup: boolean;
  /** "Vou" / "Não vou" do aluno (`respondTrainingCenterSession`); `null` sem resposta. */
  myRsvp: string | null;
}

/** Experimental pedida pelo atleta no CT (`trialBookings`) — ele ainda não é aluno. */
export interface MyCenterTrial {
  bookingId: string;
  centerId: string;
  centerName: string;
  sessionId: string;
  classId: string;
  className: string;
  date: string;
  startTime: string;
  endTime: string;
  coachName: string;
  locationName: string;
  /** `pending`, `confirmed` ou `declined` (desmarcada pelo atleta não vem). */
  status: string;
  note: string | null;
}

export interface MyCenterInvoice {
  invoiceId: string;
  reference: string;
  amountCents: number;
  dueDate: string;
  /** `pending`, `approved`, `failed`, `refunded`, `disputed`. Cancelada não vem. */
  status: string;
  /** Link de pagamento (Asaas) — só na fatura em aberto e liberada. */
  payUrl: string | null;
  paidOn: string | null;
  method: string;
  enrollmentId: string | null;
  /** Contrato da matrícula exige assinatura antes do pagamento e ainda não foi assinado. */
  blockedByContract: boolean;
}

/** Contrato/termo do aluno (K6–K9). `body` é o texto congelado no envio. */
export interface MyCenterContract {
  contractId: string;
  number: string;
  title: string;
  /** `enrollment` (matrícula) ou `term` (termo avulso). */
  kind: string;
  /** Termo que o aluno pode recusar (ex.: uso de imagem). */
  optional: boolean;
  templateVersion: number;
  /** `sent`, `viewed`, `signed`, `declined`, `terminated` (`cancelled` não vem). */
  status: string;
  /** `student` ou `guardian` (menor: assina o responsável). */
  signerRole: string;
  signerName: string;
  studentName: string;
  enrollmentId: string | null;
  className: string;
  planName: string;
  priceCents: number | null;
  startDate: string | null;
  endDate: string | null;
  requireBeforePayment: boolean;
  sentOn: string | null;
  signedAt: string | null;
  body: string;
  sha256: string;
  essentials: Array<{label: string; value: string}>;
}

export interface MyCenterLocation {
  name: string;
  /** `own`, `partner` ou `adhoc`. */
  type: string;
  address: string;
  notes: string;
}

export interface MyTrainingCenter {
  centerId: string;
  name: string;
  city: string;
  state: string;
  sports: string[];
  makeupCredits: number;
  billingHold: boolean;
  /** Carteirinha do check-in: QR `nexago-ct:{centerId}:{checkinCode}`. */
  checkinCode: string;
  policies: {
    excusedNoticeHours: number;
    excusedAbsenceMakeup: boolean;
    makeupValidityDays: number;
    monthlyCancellation: string;
    allowPause: boolean;
    pauseMaxDaysPerYear: number;
    pauseMinDays: number;
    injuryPauseApproval: string;
    injuryMaxDays: number;
    injuryCountsInLimit: boolean;
    cancelRetention: string[];
    retentionDiscountPercent: number;
    allowCancelWithdraw: boolean;
    requireMedicalClearance: boolean;
    /** Vaga no trancamento: `reserve` ou `release`. */
    pauseSeat: string;
  };
  enrollments: MyCenterEnrollment[];
  requests: MyCenterEnrollmentRequest[];
  sessions: MyCenterSession[];
  locations: MyCenterLocation[];
  invoices: MyCenterInvoice[];
  contracts: MyCenterContract[];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function rec(v: unknown): Data {
  return v != null && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
}

const WEEKDAY_ISO: Record<string, number> = {mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7};

/** `weekdays` da turma ("mon"… ou 0–6 com domingo = 0) → ISO 1–7, sem repetir, em ordem. */
export function isoWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const w of raw) {
    if (typeof w === "string" && WEEKDAY_ISO[w.toLowerCase()]) out.add(WEEKDAY_ISO[w.toLowerCase()]!);
    else if (typeof w === "number" && w >= 0 && w <= 7) out.add(w === 0 ? 7 : w);
  }
  return [...out].sort((a, b) => a - b);
}

function dayKeyOf(v: unknown, tz: string): string | null {
  const date = v != null && typeof (v as {toDate?: unknown}).toDate === "function" ?
    (v as {toDate(): Date}).toDate() :
    null;
  return date ? dayKeyIn(date, tz) : null;
}

export interface EnrollmentExitInfo {
  pauseDaysUsed: number;
  cancelLastDay: string | null;
  retentionPlans: MyCenterEnrollment["retentionPlans"];
  discountAvailable: boolean;
}

const NO_EXIT_INFO: EnrollmentExitInfo = {pauseDaysUsed: 0, cancelLastDay: null, retentionPlans: [], discountAvailable: false};

export function mapCenterEnrollment(id: string, e: Data, cls: Data, sub: Data | null, exit: EnrollmentExitInfo = NO_EXIT_INFO): MyCenterEnrollment {
  const contract = rec(e["contract"]);
  const planType = str(contract["planType"]) || "monthly";
  return {
    enrollmentId: id,
    classId: str(e["classId"]),
    className: str(e["className"]) || str(cls["name"]) || "Turma",
    status: str(e["status"]),
    startDate: str(e["startDate"]),
    pausedUntil: str(e["pausedUntil"]) || null,
    planName: str(contract["planName"]) || "Plano",
    planType,
    priceCents: num(contract["priceCents"]) ?? 0,
    classesPerWeek: num(contract["classesPerWeek"]),
    credits: planType === "class_pack" ? num(contract["credits"]) : null,
    creditsLeft: planType === "class_pack" ? num(e["creditsLeft"]) : null,
    level: str(cls["level"]),
    coachName: str(cls["coachName"]),
    weekdays: isoWeekdays(cls["weekdays"]),
    startTime: str(cls["startTime"]),
    durationMin: num(cls["durationMin"]) ?? 60,
    locationName: str(cls["locationName"]),
    billing: sub ? {
      status: str(sub["status"]),
      billingDay: num(sub["billingDay"]),
      method: str(sub["method"]),
      nextChargeDate: str(sub["nextChargeDate"]) || null,
    } : null,
    pauseDaysUsed: exit.pauseDaysUsed,
    cancelLastDay: exit.cancelLastDay,
    retentionPlans: exit.retentionPlans,
    discountAvailable: exit.discountAvailable,
  };
}

export function mapEnrollmentRequest(id: string, r: Data, tz: string): MyCenterEnrollmentRequest {
  const type = str(r["type"]);
  const retention = rec(r["retention"]);
  const n = num(r["days"]);
  return {
    requestId: id,
    enrollmentId: str(r["enrollmentId"]),
    type,
    status: str(r["status"]),
    className: str(r["className"]),
    startsOn: str(r["startsOn"]) || null,
    endsOn: str(r["endsOn"]) || null,
    days: n,
    lastDay: str(r["lastDay"]) || null,
    reason: type === "cancel" ? CANCEL_REASONS[str(r["reason"])] ?? str(r["reason"]) : str(r["reason"]),
    decisionNote: str(r["decisionNote"]),
    createdOn: dayKeyOf(r["createdAt"], tz),
    hasCertificate: Boolean(rec(r["certificate"])["path"]),
    retainedPlanName: str(retention["planName"]) || null,
    retainedDiscountPercent: retention["accepted"] === "discount" ? num(retention["percent"]) : null,
    effectiveFrom: str(r["effectiveFrom"]) || null,
    requireClearance: r["requireClearance"] === true,
    clearanceStatus: str(r["clearanceStatus"]),
    awaitingClearance: r["awaitingClearance"] === true,
    releaseSeat: r["releaseSeat"] === true,
    awaitingSeat: r["awaitingSeat"] === true,
  };
}

/** Em andamento primeiro; depois os encerrados dos últimos 90 dias. */
export function visibleRequests(rows: MyCenterEnrollmentRequest[], today: string): MyCenterEnrollmentRequest[] {
  const since = addDays(today, -90);
  const open = (r: MyCenterEnrollmentRequest) => OPEN_REQUEST_STATUSES.includes(r.status as EnrollmentRequestStatus);
  return rows
    .filter((r) => open(r) || (r.createdOn ?? "") >= since)
    .sort((a, b) => Number(open(b)) - Number(open(a)) || (b.createdOn ?? "").localeCompare(a.createdOn ?? ""))
    .slice(0, 20);
}

export function mapCenterSession(id: string, s: Data, cls: Data, studentId: string): MyCenterSession {
  const defaultLocationId = str(cls["locationId"]);
  const locationId = str(s["locationId"]);
  const attendance = rec(s["attendance"]);
  const mark = str(attendance[studentId]);
  const makeups = Array.isArray(s["makeupStudentIds"]) ? s["makeupStudentIds"] as unknown[] : [];
  return {
    sessionId: id,
    classId: str(s["classId"]),
    className: str(s["className"]) || str(cls["name"]) || "Aula",
    date: str(s["date"]),
    startTime: str(s["startTime"]),
    durationMin: num(s["durationMin"]) ?? 60,
    coachName: str(s["coachName"]),
    locationName: str(s["locationName"]),
    locationAddress: str(s["locationAddress"]),
    courtName: str(s["courtName"]),
    status: str(s["status"]) || "scheduled",
    locationChanged: !!defaultLocationId && !!locationId && defaultLocationId !== locationId,
    defaultLocationName: str(cls["locationName"]),
    changed: s["changed"] === true,
    changeReason: str(s["changeReason"]),
    myMark: mark === "present" || mark === "excused" || mark === "absent" ? mark : null,
    isMakeup: makeups.includes(studentId),
    myRsvp: str(rec(rec(s["rsvps"])[studentId])["response"]) || null,
  };
}

export function mapCenterInvoice(
  id: string, inv: Data, tz: string, blocked: ReadonlySet<string> = new Set(),
): MyCenterInvoice | null {
  const status = str(inv["status"]);
  if (!status || status === "cancelled") return null;
  const enrollmentId = str(inv["enrollmentId"]) || null;
  const blockedByContract = status === "pending" && !!enrollmentId && blocked.has(enrollmentId);
  const url = blockedByContract ? "" : str(inv["providerUrl"]);
  return {
    invoiceId: id,
    reference: str(inv["reference"]) || "Mensalidade",
    amountCents: num(inv["amountCents"]) ?? 0,
    dueDate: str(inv["dueDate"]),
    status,
    payUrl: status === "pending" && /^https?:\/\//.test(url) ? url : null,
    paidOn: status === "approved" ? dayKeyOf(inv["approvedAt"], tz) : null,
    method: str(inv["method"]),
    enrollmentId,
    blockedByContract,
  };
}

function isoOf(v: unknown): string | null {
  return v != null && typeof (v as {toDate?: unknown}).toDate === "function" ?
    (v as {toDate(): Date}).toDate().toISOString() :
    null;
}

export function mapCenterContract(id: string, c: Data, tz: string): MyCenterContract | null {
  const status = str(c["status"]);
  if (!status || status === "cancelled") return null;
  const signer = rec(c["signer"]);
  const essentials = Array.isArray(c["essentials"]) ? (c["essentials"] as unknown[]).map(rec)
    .map((e) => ({label: str(e["label"]), value: str(e["value"])})).filter((e) => e.label) : [];
  return {
    contractId: id,
    number: str(c["number"]),
    title: str(c["title"]) || "Contrato",
    kind: str(c["kind"]) || "term",
    optional: c["optional"] === true,
    templateVersion: num(c["templateVersion"]) ?? 1,
    status,
    signerRole: str(signer["role"]) || "student",
    signerName: str(signer["name"]) || str(c["studentName"]),
    studentName: str(c["studentName"]),
    enrollmentId: str(c["enrollmentId"]) || null,
    className: str(c["className"]),
    planName: str(c["planName"]),
    priceCents: num(c["priceCents"]),
    startDate: str(c["startDate"]) || null,
    endDate: str(c["endDate"]) || null,
    requireBeforePayment: c["requireBeforePayment"] === true,
    sentOn: dayKeyOf(c["sentAt"], tz),
    signedAt: isoOf(c["signedAt"]),
    body: str(c["body"]),
    sha256: str(c["sha256"]),
    essentials,
  };
}

async function loadCenter(
  db: Firestore, centerRef: DocumentReference, studentId: string, student: Data, today: string,
): Promise<MyTrainingCenter | null> {
  const centerSnap = await centerRef.get();
  const center = centerSnap.data();
  if (!center || center["status"] === "suspended") return null;
  const tz = str(center["timezone"]) || "America/Sao_Paulo";

  const enrollSnap = await centerRef.collection("enrollments")
    .where("studentId", "==", studentId).limit(MAX_ENROLLMENTS * 3).get();
  const enrollments = enrollSnap.docs
    .map((d) => ({id: d.id, data: d.data() as Data}))
    .filter((e) => VISIBLE_ENROLLMENTS.has(str(e.data["status"])))
    .slice(0, MAX_ENROLLMENTS);
  const classIds = [...new Set(enrollments.map((e) => str(e.data["classId"])).filter(Boolean))];
  const seatedClassIds = [...new Set(enrollments
    .filter((e) => SEATED_ENROLLMENTS.has(str(e.data["status"])))
    .map((e) => str(e.data["classId"])).filter(Boolean))].slice(0, 10);
  const from = addDays(today, -CENTER_PAST_DAYS);
  const to = addDays(today, CENTER_AHEAD_DAYS);
  const sessions = centerRef.collection("sessions");

  const [classSnaps, subSnaps, ownSessions, makeupSessions, invoiceSnap, locationSnap, contractSnap, requestSnap, planSnap] = await Promise.all([
    classIds.length ? db.getAll(...classIds.map((id) => centerRef.collection("classes").doc(id))) : Promise.resolve([]),
    enrollments.length ?
      db.getAll(...enrollments.map((e) => centerRef.collection("subscriptions").doc(e.id))) :
      Promise.resolve([]),
    seatedClassIds.length ?
      sessions.where("classId", "in", seatedClassIds).where("date", ">=", from).where("date", "<=", to).get() :
      Promise.resolve(null),
    sessions.where("makeupStudentIds", "array-contains", studentId).where("date", ">=", from).get()
      .catch((e) => {
        logger.warn(`getMyTrainingCenters ${centerRef.id}: reposições falharam`, e);
        return null;
      }),
    centerRef.collection("invoices").where("studentId", "==", studentId).limit(MAX_INVOICES * 3).get(),
    centerRef.collection("locations").where("status", "==", "active").limit(12).get()
      .catch(() => null),
    centerRef.collection(CONTRACTS).where("studentId", "==", studentId).limit(MAX_CONTRACTS * 2).get()
      .catch((e) => {
        logger.warn(`getMyTrainingCenters ${centerRef.id}: contratos falharam`, e);
        return null;
      }),
    centerRef.collection(ENROLLMENT_REQUESTS).where("studentId", "==", studentId).limit(60).get()
      .catch((e) => {
        logger.warn(`getMyTrainingCenters ${centerRef.id}: pedidos falharam`, e);
        return null;
      }),
    centerRef.collection("plans").where("status", "==", "active").limit(40).get()
      .catch(() => null),
  ]);
  const contractDocs = (contractSnap?.docs ?? []).map((d) => ({id: d.id, data: d.data() as Data}));
  // Matrículas cujo pagamento espera o contrato ser assinado.
  const blocked = new Set(contractDocs
    .filter((c) => c.data["requireBeforePayment"] === true && OPEN_CONTRACT_STATUSES.has(str(c.data["status"])))
    .map((c) => str(c.data["enrollmentId"])).filter(Boolean));
  const classes = new Map(classSnaps.map((s) => [s.id, (s.data() ?? {}) as Data]));
  const subs = new Map(subSnaps.filter((s) => s.exists).map((s) => [s.id, s.data() as Data]));

  const sessionDocs = new Map<string, Data>();
  for (const d of [...(ownSessions?.docs ?? []), ...(makeupSessions?.docs ?? [])]) {
    const data = d.data() as Data;
    if (str(data["date"]) <= to) sessionDocs.set(d.id, data);
  }
  // Turma de reposição não está nas matrículas: busca a regra dela para o local padrão.
  const extraClassIds = [...new Set([...sessionDocs.values()].map((s) => str(s["classId"])))]
    .filter((id) => id && !classes.has(id));
  if (extraClassIds.length) {
    const extra = await db.getAll(...extraClassIds.map((id) => centerRef.collection("classes").doc(id)));
    for (const s of extra) classes.set(s.id, (s.data() ?? {}) as Data);
  }

  const usedLocations = new Set([
    ...[...classes.values()].map((c) => str(c["locationName"])),
    ...[...sessionDocs.values()].map((s) => str(s["locationName"])),
  ].filter(Boolean));
  const policies = rec(center["policies"]);
  const exitPolicies = readExitPolicies(policies);
  const requestDocs = (requestSnap?.docs ?? []).map((d) => ({id: d.id, data: d.data() as Data}));
  const monthlyPlans = (planSnap?.docs ?? [])
    .map((d) => ({id: d.id, data: d.data() as Data}))
    .filter((p) => p.data["type"] === "monthly");
  const exitInfo = (e: {id: string; data: Data}): EnrollmentExitInfo => {
    const contract = rec(e.data["contract"]);
    const planType = str(contract["planType"]) || "monthly";
    const sub = subs.get(e.id);
    const live = sub && ["active", "past_due"].includes(str(sub["status"])) ? sub : null;
    const programId = str(classes.get(str(e.data["classId"]))?.["programId"]);
    const price = num(contract["priceCents"]) ?? 0;
    return {
      pauseDaysUsed: pauseDaysUsed(requestDocs.filter((r) => str(r.data["enrollmentId"]) === e.id).map((r) => r.data),
        today.slice(0, 4), exitPolicies.injuryCountsInLimit),
      cancelLastDay: ["active", "paused"].includes(str(e.data["status"])) ?
        planCancel({planType, policies: exitPolicies, nextChargeDate: live ? str(live["nextChargeDate"]) || null : null, today}).lastDay :
        null,
      discountAvailable: planType === "monthly" && Boolean(live) && exitPolicies.cancelRetention.includes("discount") &&
        !discountUsedRecently(requestDocs.filter((r) => str(r.data["enrollmentId"]) === e.id).map((r) => r.data), today),
      retentionPlans: planType !== "monthly" || !live ? [] : monthlyPlans
        .filter((p) => p.id !== str(e.data["planId"]) && (num(p.data["priceCents"]) ?? 0) < price)
        .filter((p) => {
          const ids = Array.isArray(p.data["programIds"]) ? p.data["programIds"] as unknown[] : [];
          return !programId || ids.length === 0 || ids.includes(programId);
        })
        .sort((a, b) => (num(b.data["priceCents"]) ?? 0) - (num(a.data["priceCents"]) ?? 0))
        .slice(0, 2)
        .map((p) => ({
          planId: p.id,
          name: str(p.data["name"]),
          priceCents: num(p.data["priceCents"]) ?? 0,
          classesPerWeek: num(p.data["classesPerWeek"]),
        })),
    };
  };

  return {
    centerId: centerRef.id,
    name: str(center["name"]) || "Centro de treinamento",
    city: str(center["city"]),
    state: str(center["state"]),
    sports: Array.isArray(center["sports"]) ? (center["sports"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
    makeupCredits: num(student["makeupCredits"]) ?? 0,
    billingHold: student["billingHold"] === true,
    checkinCode: await ensureCheckinCode(centerRef.collection("students").doc(studentId), student),
    policies: {
      excusedNoticeHours: num(policies["excusedNoticeHours"]) ?? 4,
      excusedAbsenceMakeup: policies["excusedAbsenceMakeup"] !== false,
      makeupValidityDays: num(policies["makeupValidityDays"]) ?? 30,
      monthlyCancellation: str(policies["monthlyCancellation"]) || "end_of_cycle",
      allowPause: policies["allowPause"] !== false,
      pauseMaxDaysPerYear: exitPolicies.pauseMaxDaysPerYear,
      pauseMinDays: exitPolicies.pauseMinDays,
      injuryPauseApproval: exitPolicies.injuryPauseApproval,
      injuryMaxDays: exitPolicies.injuryMaxDays,
      injuryCountsInLimit: exitPolicies.injuryCountsInLimit,
      cancelRetention: exitPolicies.cancelRetention,
      retentionDiscountPercent: exitPolicies.retentionDiscountPercent,
      allowCancelWithdraw: exitPolicies.allowCancelWithdraw,
      requireMedicalClearance: exitPolicies.requireMedicalClearance,
      pauseSeat: exitPolicies.pauseSeat,
    },
    requests: visibleRequests(requestDocs.map((r) => mapEnrollmentRequest(r.id, r.data, tz)), today),
    enrollments: enrollments
      .map((e) => mapCenterEnrollment(e.id, e.data, classes.get(str(e.data["classId"])) ?? {}, subs.get(e.id) ?? null, exitInfo(e)))
      .sort((a, b) => a.className.localeCompare(b.className, "pt-BR")),
    sessions: [...sessionDocs.entries()]
      .map(([id, s]) => mapCenterSession(id, s, classes.get(str(s["classId"])) ?? {}, studentId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    locations: (locationSnap?.docs ?? [])
      .map((d) => d.data() as Data)
      .filter((l) => usedLocations.has(str(l["name"])))
      .map((l) => ({name: str(l["name"]), type: str(l["type"]) || "own", address: str(l["address"]), notes: str(l["notes"])})),
    invoices: invoiceSnap.docs
      .map((d) => mapCenterInvoice(d.id, d.data() as Data, tz, blocked))
      .filter((x): x is MyCenterInvoice => x != null)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
      .slice(0, MAX_INVOICES),
    contracts: contractDocs
      .map((c) => mapCenterContract(c.id, c.data, tz))
      .filter((x): x is MyCenterContract => x != null)
      // Abertos primeiro; depois o mais recente.
      .sort((a, b) => Number(OPEN_CONTRACT_STATUSES.has(b.status)) - Number(OPEN_CONTRACT_STATUSES.has(a.status)) ||
        (b.sentOn ?? "").localeCompare(a.sentOn ?? ""))
      .slice(0, MAX_CONTRACTS),
  };
}

/** Convite do centro (cadastro feito pelo e-mail, ainda sem conta vinculada). */
export interface MyCenterInvite {
  centerId: string;
  studentId: string;
  centerName: string;
  city: string;
  state: string;
  /** Turmas em que o centro já matriculou o convidado. */
  enrollments: Array<Pick<MyCenterEnrollment,
    "className" | "planName" | "planType" | "priceCents" | "weekdays" | "startTime" | "status">>;
  invitedAt: string | null;
}

/**
 * Convites pendentes para o e-mail da conta. Só com e-mail verificado (senão qualquer um criaria
 * conta com o e-mail de outra pessoa e veria o convite); sem verificação, só a contagem.
 */
export async function loadMyCenterInvites(
  db: Firestore, email: string, verified: boolean,
): Promise<{invites: MyCenterInvite[]; unverifiedInvites: number}> {
  if (!email) return {invites: [], unverifiedInvites: 0};
  const snap = await db.collectionGroup("students").where("email", "==", email).limit(MAX_CENTERS * 2).get();
  const pending = snap.docs.filter((d) => {
    const seg = d.ref.path.split("/");
    const data = d.data();
    return seg.length === 4 && seg[0] === TRAINING_CENTERS && data["status"] === "invited" && !str(data["uid"]);
  }).slice(0, MAX_CENTERS);
  if (!verified) return {invites: [], unverifiedInvites: pending.length};
  const invites = await Promise.all(pending.map(async (d) => {
    const center = d.ref.parent.parent!;
    const [cSnap, eSnap] = await Promise.all([
      center.get(),
      center.collection("enrollments").where("studentId", "==", d.id).limit(MAX_ENROLLMENTS).get(),
    ]);
    const c = cSnap.data();
    if (!c || c["status"] === "suspended") return null;
    const enrollments = eSnap.docs
      .map((e) => ({id: e.id, data: e.data() as Data}))
      .filter((e) => VISIBLE_ENROLLMENTS.has(str(e.data["status"])));
    const classIds = [...new Set(enrollments.map((e) => str(e.data["classId"])).filter(Boolean))];
    const classes = classIds.length ?
      new Map((await db.getAll(...classIds.map((id) => center.collection("classes").doc(id))))
        .map((x) => [x.id, (x.data() ?? {}) as Data])) :
      new Map<string, Data>();
    const created = d.data()["createdAt"];
    return {
      centerId: center.id,
      studentId: d.id,
      centerName: str(c["name"]) || "Centro de treinamento",
      city: str(c["city"]),
      state: str(c["state"]),
      enrollments: enrollments.map((e) => {
        const m = mapCenterEnrollment(e.id, e.data, classes.get(str(e.data["classId"])) ?? {}, null);
        return {
          className: m.className, planName: m.planName, planType: m.planType, priceCents: m.priceCents,
          weekdays: m.weekdays, startTime: m.startTime, status: m.status,
        };
      }),
      invitedAt: dayKeyOf(created, str(c["timezone"]) || "America/Sao_Paulo"),
    } satisfies MyCenterInvite;
  }));
  return {invites: invites.filter((x): x is MyCenterInvite => x != null), unverifiedInvites: 0};
}

/** Pedidos de experimental do atleta em qualquer CT, dos últimos 45 dias em diante. */
export async function loadMyCenterTrials(db: Firestore, uid: string, now: Date): Promise<MyCenterTrial[]> {
  const from = addDays(dayKeyIn(now, "America/Sao_Paulo"), -CENTER_PAST_DAYS);
  const snap = await db.collectionGroup("trialBookings").where("athleteId", "==", uid).limit(60).get();
  const docs = snap.docs.filter((d) => {
    const seg = d.ref.path.split("/");
    const b = d.data() as Data;
    return seg.length === 4 && seg[0] === TRAINING_CENTERS && str(b["date"]) >= from && str(b["status"]) !== "canceled";
  });
  // Pedido antigo sem `centerName`: lê o nome do centro.
  const missing = [...new Set(docs.filter((d) => !str(d.data()["centerName"])).map((d) => d.ref.parent.parent!.id))];
  const names = new Map<string, string>();
  if (missing.length) {
    const centers = await db.getAll(...missing.map((id) => db.doc(`${TRAINING_CENTERS}/${id}`)));
    for (const c of centers) names.set(c.id, str(c.data()?.["name"]));
  }
  return docs.map((d) => {
    const b = d.data() as Data;
    const centerId = d.ref.parent.parent!.id;
    return {
      bookingId: d.id,
      centerId,
      centerName: str(b["centerName"]) || names.get(centerId) || "Centro de treinamento",
      sessionId: str(b["sessionId"]),
      classId: str(b["classId"]),
      className: str(b["className"]) || "Aula experimental",
      date: str(b["date"]),
      startTime: str(b["startTime"]),
      endTime: str(b["endTime"]),
      coachName: str(b["coachName"]),
      locationName: str(b["locationName"]),
      status: str(b["status"]) || "pending",
      note: str(b["note"]) || null,
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export async function loadMyTrainingCentersCore(
  db: Firestore, uid: string, now: Date,
): Promise<{centers: MyTrainingCenter[]}> {
  const snap = await db.collectionGroup("students").where("uid", "==", uid).limit(MAX_CENTERS * 2).get();
  // `trainingCenters/{c}/students/{id}` — o `students` da carteira do professor não entra.
  const links = snap.docs.filter((d) => {
    const seg = d.ref.path.split("/");
    return seg.length === 4 && seg[0] === TRAINING_CENTERS && d.data()["status"] !== "blocked";
  }).slice(0, MAX_CENTERS);
  const today = dayKeyIn(now, "America/Sao_Paulo");
  const centers = await Promise.all(links.map((d) =>
    loadCenter(db, d.ref.parent.parent!, d.id, d.data() as Data, today).catch((e) => {
      // Um centro com problema não esconde os outros.
      logger.warn(`getMyTrainingCenters ${uid}: centro ${d.ref.parent.parent?.id} falhou`, e);
      return null;
    })));
  return {
    centers: centers
      .filter((c): c is MyTrainingCenter => c != null && (c.enrollments.length > 0 || c.invoices.length > 0 || c.contracts.length > 0))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}

export const getMyTrainingCenters = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const db = getFirestore();
  const token = (request.auth?.token ?? {}) as Data;
  const [mine, invites, trials] = await Promise.all([
    loadMyTrainingCentersCore(db, uid, new Date()),
    loadMyCenterInvites(db, str(token["email"]).toLowerCase(), token["email_verified"] === true).catch((e) => {
      logger.warn(`getMyTrainingCenters ${uid}: convites falharam`, e);
      return {invites: [], unverifiedInvites: 0};
    }),
    // Sem o índice de collection group (deploy pendente) a agenda segue sem as experimentais.
    loadMyCenterTrials(db, uid, new Date()).catch((e) => {
      logger.warn(`getMyTrainingCenters ${uid}: experimentais falharam`, e);
      return [] as MyCenterTrial[];
    }),
  ]);
  return {...mine, ...invites, trials};
});
