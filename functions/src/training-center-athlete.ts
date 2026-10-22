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
import {CLIENT_FACING_REGIONS} from "./function-regions";

type Data = Record<string, unknown>;

const MAX_CENTERS = 10;
const MAX_ENROLLMENTS = 10;
const MAX_INVOICES = 12;
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

export interface MyCenterInvoice {
  invoiceId: string;
  reference: string;
  amountCents: number;
  dueDate: string;
  /** `pending`, `approved`, `failed`, `refunded`, `disputed`. Cancelada não vem. */
  status: string;
  /** Link de pagamento (Asaas) — só na fatura em aberto. */
  payUrl: string | null;
  paidOn: string | null;
  method: string;
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
  policies: {
    excusedNoticeHours: number;
    excusedAbsenceMakeup: boolean;
    makeupValidityDays: number;
    monthlyCancellation: string;
    allowPause: boolean;
  };
  enrollments: MyCenterEnrollment[];
  sessions: MyCenterSession[];
  locations: MyCenterLocation[];
  invoices: MyCenterInvoice[];
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

export function mapCenterEnrollment(id: string, e: Data, cls: Data, sub: Data | null): MyCenterEnrollment {
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
  };
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

export function mapCenterInvoice(id: string, inv: Data, tz: string): MyCenterInvoice | null {
  const status = str(inv["status"]);
  if (!status || status === "cancelled") return null;
  const url = str(inv["providerUrl"]);
  return {
    invoiceId: id,
    reference: str(inv["reference"]) || "Mensalidade",
    amountCents: num(inv["amountCents"]) ?? 0,
    dueDate: str(inv["dueDate"]),
    status,
    payUrl: status === "pending" && /^https?:\/\//.test(url) ? url : null,
    paidOn: status === "approved" ? dayKeyOf(inv["approvedAt"], tz) : null,
    method: str(inv["method"]),
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

  const [classSnaps, subSnaps, ownSessions, makeupSessions, invoiceSnap, locationSnap] = await Promise.all([
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
  ]);
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

  return {
    centerId: centerRef.id,
    name: str(center["name"]) || "Centro de treinamento",
    city: str(center["city"]),
    state: str(center["state"]),
    sports: Array.isArray(center["sports"]) ? (center["sports"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
    makeupCredits: num(student["makeupCredits"]) ?? 0,
    billingHold: student["billingHold"] === true,
    policies: {
      excusedNoticeHours: num(policies["excusedNoticeHours"]) ?? 4,
      excusedAbsenceMakeup: policies["excusedAbsenceMakeup"] !== false,
      makeupValidityDays: num(policies["makeupValidityDays"]) ?? 30,
      monthlyCancellation: str(policies["monthlyCancellation"]) || "end_of_cycle",
      allowPause: policies["allowPause"] !== false,
    },
    enrollments: enrollments
      .map((e) => mapCenterEnrollment(e.id, e.data, classes.get(str(e.data["classId"])) ?? {}, subs.get(e.id) ?? null))
      .sort((a, b) => a.className.localeCompare(b.className, "pt-BR")),
    sessions: [...sessionDocs.entries()]
      .map(([id, s]) => mapCenterSession(id, s, classes.get(str(s["classId"])) ?? {}, studentId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    locations: (locationSnap?.docs ?? [])
      .map((d) => d.data() as Data)
      .filter((l) => usedLocations.has(str(l["name"])))
      .map((l) => ({name: str(l["name"]), type: str(l["type"]) || "own", address: str(l["address"]), notes: str(l["notes"])})),
    invoices: invoiceSnap.docs
      .map((d) => mapCenterInvoice(d.id, d.data() as Data, tz))
      .filter((x): x is MyCenterInvoice => x != null)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
      .slice(0, MAX_INVOICES),
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
      .filter((c): c is MyTrainingCenter => c != null && (c.enrollments.length > 0 || c.invoices.length > 0))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}

export const getMyTrainingCenters = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const db = getFirestore();
  const token = (request.auth?.token ?? {}) as Data;
  const [mine, invites] = await Promise.all([
    loadMyTrainingCentersCore(db, uid, new Date()),
    loadMyCenterInvites(db, str(token["email"]).toLowerCase(), token["email_verified"] === true).catch((e) => {
      logger.warn(`getMyTrainingCenters ${uid}: convites falharam`, e);
      return {invites: [], unverifiedInvites: 0};
    }),
  ]);
  return {...mine, ...invites};
});
