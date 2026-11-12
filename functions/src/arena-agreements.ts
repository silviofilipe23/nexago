/**
 * Contratos de aulas da arena — callables (canvas "Contratos de aulas").
 *
 * Atleta (app): `getArenaClassSignupOptions` → `previewMyArenaClassEnrollment` → `enrollMeInArenaClassPlan`
 * (assinar o contrato = virar matrícula, na mesma transação). Pode ter vários planos ao mesmo tempo;
 * o que não pode é repetir a turma (a matrícula já recusa).
 *
 * Professor (app): `getMyArenaAgreements` / `getMyArenaAgreement` / `signMyArenaAgreement`.
 *
 * Arena (portal, área `agenda`): `getArenaAgreementTemplates`, `saveArenaAgreementTemplate`,
 * `listArenaAgreements`, `sendArenaProfessorAgreement`, `cancelArenaAgreement`.
 *
 * `arenaAgreements` e `agreementTemplates` são só do servidor (rules negam o cliente): toda leitura
 * passa por aqui, com o recorte de quem pede.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {FieldValue, Timestamp, getFirestore, type Firestore, type Transaction} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT, deliverNotificationToUser} from "./notification-delivery";
import {assertArenaAreaAccess} from "./arena-area-access";
import {dayKeyFromEventDate} from "./event-timezone";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {resolveAthleteDisplay} from "./arena-club-join";
import {isValidCpfCnpj, normalizeCpfCnpj} from "./asaas-customer";
import {clientIp} from "./training-center-contracts-model";
import {
  ARENA_CLASSES,
  ARENA_CLASS_ENROLLMENTS,
  CLASS_PLANS,
  CLASS_STUDENTS,
  CLASS_TEACHERS,
} from "./arena-class-constants";
import {classRulesRef, parseClassRules, studentAttendsWeekday} from "./arena-class-ledger";
import {athleteAccountPhone, parseArenaClass, requireClassEntitlement, requireClassManager, str} from "./arena-class";
import {
  createEnrollmentCore,
  firstCharges,
  parseCycle,
  parseCyclePrices,
  parsePlan,
  planCycleOptions,
  planEnrollment,
  studentAgreementId,
  type EnrollmentPlan,
  type EnrollmentRequest,
} from "./arena-class-billing";
import {
  AGREEMENT_TEMPLATES,
  AGREEMENT_TERM_MONTHS,
  AGREEMENT_VARIABLES,
  ARENA_AGREEMENTS,
  MAX_TEMPLATE_CHARS,
  MAX_TEMPLATE_TITLE,
  agreementNumber,
  arenaPartyOf,
  isSignupPlan,
  maskIp,
  parseAudience,
  parsePlanTeacherIds,
  professorEssentials,
  professorValues,
  renderAgreement,
  resolveTemplate,
  sameDocument,
  studentEssentials,
  studentTermEnd,
  studentValues,
  unknownAgreementVariables,
  type AgreementAudience,
  type AgreementTemplate,
  type ArenaParty,
  type StudentAgreementContext,
} from "./arena-agreements-model";
import {termEnd} from "./training-center-contracts-model";

type Data = Record<string, unknown>;

const PUSH_OPTS = {region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]};
const MAX_CLASSES = 200;
const MAX_LIST = 200;

function rec(v: unknown): Data {
  return v != null && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
}

function requireAuth(request: CallableRequest): {uid: string; email: string} {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return {uid: request.auth.uid, email: str(rec(request.auth.token)["email"]).toLowerCase()};
}

function iso(v: unknown): string | null {
  return v instanceof Timestamp ? v.toDate().toISOString() : null;
}


async function loadArenaParty(db: Firestore, arenaId: string): Promise<{arena: Data; party: ArenaParty}> {
  const arenaRef = db.collection("arenas").doc(arenaId);
  const [arenaSnap, regSnap] = await Promise.all([arenaRef.get(), arenaRef.collection("registration").doc("data").get()]);
  if (!arenaSnap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  const arena = arenaSnap.data() as Data;
  return {arena, party: arenaPartyOf(arena, regSnap.data())};
}

async function loadTemplate(db: Firestore, arenaId: string, audience: AgreementAudience): Promise<AgreementTemplate> {
  const snap = await db.collection("arenas").doc(arenaId).collection(AGREEMENT_TEMPLATES).doc(audience).get();
  return resolveTemplate(audience, snap.data());
}

async function storedCpf(db: Firestore, uid: string): Promise<string> {
  for (const col of ["athletes", "users"]) {
    const data = (await db.collection(col).doc(uid).get()).data() ?? {};
    const digits = normalizeCpfCnpj((data["cpfCnpj"] ?? data["cpf"] ?? data["document"]) as string | undefined);
    if (isValidCpfCnpj(digits)) return digits;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Atleta: opções de contratação
// ---------------------------------------------------------------------------

export interface SignupClassDay {
  weekday: number;
  vacancies: number;
}

export interface SignupClass {
  classId: string;
  name: string;
  teacherId: string;
  level: string;
  sport: string;
  startTime: string;
  endTime: string;
  capacity: number;
  days: SignupClassDay[];
  /** O atleta já está nesta turma (outra matrícula): não pode escolher de novo. */
  enrolled: boolean;
}

export async function signupOptionsCore(db: Firestore, uid: string, arenaId: string) {
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  const arenaRef = db.collection("arenas").doc(arenaId);
  const [arenaSnap, planSnap, teacherSnap, classSnap, rulesSnap, mineSnap] = await Promise.all([
    arenaRef.get(),
    arenaRef.collection(CLASS_PLANS).where("availableInApp", "==", true).get(),
    arenaRef.collection(CLASS_TEACHERS).get(),
    db.collection(ARENA_CLASSES).where("arenaId", "==", arenaId).where("status", "==", "active").limit(MAX_CLASSES).get(),
    classRulesRef(db, arenaId).get(),
    db.collection(ARENA_CLASS_ENROLLMENTS).where("athleteId", "==", uid).where("status", "==", "active").limit(50).get(),
  ]);
  if (!arenaSnap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  const arena = arenaSnap.data() as Data;
  const rules = parseClassRules(rulesSnap.data());

  const myEnrollments = mineSnap.docs.map((d) => d.data()).filter((e) => e["arenaId"] === arenaId);
  const myPlanIds = new Set(myEnrollments.map((e) => str(rec(e["plan"])["planId"])).filter(Boolean));
  const myClassIds = new Set(myEnrollments.flatMap((e) =>
    (Array.isArray(e["slots"]) ? e["slots"] : []).map((s) => str(rec(s)["classId"]))).filter(Boolean));

  const teachers = teacherSnap.docs
    .filter((d) => d.data()["status"] !== "archived")
    .map((d) => ({
      teacherId: d.id,
      name: str(d.data()["name"]) || "Professor",
      photoUrl: str(d.data()["photoUrl"]) || null,
      specialty: str(d.data()["specialty"]) || null,
    }));
  const teacherIds = new Set(teachers.map((t) => t.teacherId));

  const turmas = classSnap.docs
    .map((d) => ({id: d.id, cls: parseArenaClass(d.data() as Data)}))
    .filter((c) => c.cls.type === "turma" && teacherIds.has(c.cls.teacherId) && c.cls.weekdays.length > 0);

  const plansRaw = planSnap.docs.filter((d) => isSignupPlan(d.data() as Data));
  const wanted = new Set<string>();
  const plans = plansRaw.map((d) => {
    const data = d.data() as Data;
    const plan = parsePlan(data);
    const declared = parsePlanTeacherIds(data["teacherIds"]).filter((id) => teacherIds.has(id));
    // Sem professor marcado = qualquer professor com turma ativa.
    const candidates = declared.length > 0 ? declared : [...teacherIds];
    const withClasses = candidates.filter((id) => turmas.some((t) => t.cls.teacherId === id));
    for (const t of turmas) if (withClasses.includes(t.cls.teacherId)) wanted.add(t.id);
    return {
      planId: d.id,
      name: plan.name,
      kind: plan.kind,
      priceReais: plan.priceReais,
      classesPerWeek: plan.classesPerWeek,
      makeupsPerMonth: plan.makeupsPerMonth,
      credits: plan.credits,
      validityDays: plan.validityDays,
      description: plan.description,
      teacherIds: withClasses,
      anyTeacher: declared.length === 0,
      /** Ciclos de pagamento (só mensal): mensal sempre, os longos que a arena precificou. */
      cycles: planCycleOptions({...plan, cyclePrices: parseCyclePrices(data["cyclePrices"])}),
      mine: myPlanIds.has(d.id),
    };
  }).filter((p) => p.teacherIds.length > 0);

  const rosters = await Promise.all(turmas.filter((t) => wanted.has(t.id)).map(async (t) => {
    const roster = await db.collection(ARENA_CLASSES).doc(t.id).collection(CLASS_STUDENTS).where("status", "==", "active").get();
    return {t, roster: roster.docs.map((r) => ({id: r.id, data: r.data() as Data}))};
  }));
  const classes: SignupClass[] = rosters.map(({t, roster}) => ({
    classId: t.id,
    name: t.cls.name,
    teacherId: t.cls.teacherId,
    level: t.cls.level,
    sport: t.cls.sport,
    startTime: t.cls.startTime,
    endTime: t.cls.endTime,
    capacity: t.cls.capacity,
    days: [...t.cls.weekdays].sort((a, b) => a - b).map((weekday) => ({
      weekday,
      vacancies: Math.max(0, t.cls.capacity - roster.filter((r) => r.id !== uid && studentAttendsWeekday(r.data, weekday)).length),
    })),
    enrolled: myClassIds.has(t.id),
  })).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const usedTeachers = new Set(plans.flatMap((p) => p.teacherIds));
  return {
    arena: {
      arenaId,
      name: str(arena["name"]) || "Arena",
      logoUrl: str(arena["logoUrl"]) || str(arena["profileImageUrl"]) || null,
    },
    onlineBilling: rules.onlineBillingEnabled,
    enrollmentFeeReais: rules.enrollmentFeeReais,
    dueDay: rules.defaultDueDay,
    hasCpf: rules.onlineBillingEnabled ? Boolean(await storedCpf(db, uid)) : true,
    plans,
    teachers: teachers.filter((t) => usedTeachers.has(t.teacherId)),
    classes,
    activePlanCount: myEnrollments.length,
  };
}

export const getArenaClassSignupOptions = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const {uid} = requireAuth(request);
  return signupOptionsCore(getFirestore(), uid, str(rec(request.data)["arenaId"]));
});

// ---------------------------------------------------------------------------
// Atleta: prévia (contrato preenchido + cobranças) e contratar
// ---------------------------------------------------------------------------

interface SelfEnrollmentDraft {
  req: EnrollmentRequest;
  planned: EnrollmentPlan;
  ctx: StudentAgreementContext;
  template: AgreementTemplate;
  rendered: {title: string; body: string; sha256: string};
  charges: Array<{description: string; amountReais: number; dueDate: string}>;
  student: {name: string; phone: string | null; photoUrl: string | null};
  arena: Data;
}

/** Pedido do próprio atleta: valores da tabela, vencimento das Regras, online se a arena cobra online. */
export function selfEnrollmentRequest(input: Data, rules: {defaultDueDay: number; onlineBillingEnabled: boolean}): EnrollmentRequest {
  const arenaId = str(input["arenaId"]);
  const planId = str(input["planId"]);
  if (!arenaId || !planId) throw new HttpsError("invalid-argument", "Arena e plano são obrigatórios.");
  const raw = Array.isArray(input["slots"]) ? input["slots"] as unknown[] : [];
  const seen = new Set<string>();
  const slots = raw.map((s) => {
    const classId = str(rec(s)["classId"]);
    const weekday = Number(rec(s)["weekday"]);
    if (!classId || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new HttpsError("invalid-argument", "Horário inválido.");
    }
    const key = `${classId}:${weekday}`;
    if (seen.has(key)) throw new HttpsError("invalid-argument", "Horário repetido.");
    seen.add(key);
    return {classId, weekday};
  });
  if (slots.length === 0 || slots.length > 7) throw new HttpsError("invalid-argument", "Escolha de 1 a 7 horários.");
  const cpfDigits = normalizeCpfCnpj(typeof input["cpfCnpj"] === "string" ? input["cpfCnpj"] : undefined);
  if (cpfDigits && !isValidCpfCnpj(cpfDigits)) throw new HttpsError("invalid-argument", "CPF inválido.");
  return {
    arenaId, planId, slots,
    dueDay: rules.defaultDueDay,
    paymentMethod: "pix",
    waiveFee: false,
    waitlistClassId: null,
    waitlistEntryId: null,
    billingMode: rules.onlineBillingEnabled ? "asaas" : "manual",
    cpfCnpj: cpfDigits || null,
    cycle: parseCycle(input["cycle"]),
  };
}

async function buildSelfEnrollmentDraft(db: Firestore, auth: {uid: string; email: string}, input: Data, todayKey: string): Promise<SelfEnrollmentDraft> {
  const arenaId = str(input["arenaId"]);
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  const rules = parseClassRules((await classRulesRef(db, arenaId).get()).data());
  const req = selfEnrollmentRequest(input, rules);
  const planSnap = await db.collection("arenas").doc(arenaId).collection(CLASS_PLANS).doc(req.planId).get();
  const planData = (planSnap.data() ?? {}) as Data;
  if (!planSnap.exists || !isSignupPlan(planData)) {
    throw new HttpsError("failed-precondition", "Este plano não está disponível para contratar pelo app.");
  }
  const planned = await planEnrollment(db, (ref) => (ref as {get: () => Promise<unknown>}).get(), req, auth.uid);
  const declared = parsePlanTeacherIds(planData["teacherIds"]);
  if (declared.length > 0 && planned.slots.some((s) => !declared.includes(s.teacherId))) {
    throw new HttpsError("failed-precondition", "Escolha horários de um professor deste plano.");
  }
  const [{arena, party}, template, display, userSnap] = await Promise.all([
    loadArenaParty(db, arenaId),
    loadTemplate(db, arenaId, "student"),
    resolveAthleteDisplay(db, auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  const teacherNames = new Map<string, string>();
  for (const info of planned.classes.values()) {
    teacherNames.set(str(info.data["teacherId"]), str(info.data["teacherName"]) || "Professor");
  }
  const cpf = req.cpfCnpj ?? await storedCpf(db, auth.uid);
  const online = req.billingMode === "asaas";
  const expiresOn = planned.plan.kind === "package" ? addDaysToDateKey(todayKey, planned.plan.validityDays ?? 30) : null;
  const phone = athleteAccountPhone(userSnap.data());
  const ctx: StudentAgreementContext = {
    arena: party,
    student: {name: display.name, cpf, phone: phone ?? "", email: auth.email},
    plan: planned.plan,
    slots: planned.slots.map((s) => ({weekday: s.weekday, startTime: s.startTime, teacherName: teacherNames.get(s.teacherId) ?? "Professor"})),
    dueDay: req.dueDay,
    online,
    cycle: planned.cycle,
    rules: planned.rules,
    startKey: todayKey,
    endKey: studentTermEnd(planned.plan, todayKey, expiresOn),
  };
  const rendered = renderAgreement(template, studentValues(ctx));
  const {charges} = firstCharges("preview", planned.plan, planned.slots.map((s) => s.weekday), todayKey, planned.rules, false, planned.cycle);
  return {
    req, planned, ctx, template, rendered,
    charges: charges.map(({description, amountReais, dueDate}) => ({description, amountReais, dueDate})),
    student: {name: display.name, phone, photoUrl: display.photoUrl},
    arena,
  };
}

export async function previewSelfEnrollmentCore(db: Firestore, auth: {uid: string; email: string}, input: Data, todayKey: string) {
  const d = await buildSelfEnrollmentDraft(db, auth, input, todayKey);
  return {
    agreement: {
      title: d.rendered.title,
      body: d.rendered.body,
      sha256: d.rendered.sha256,
      templateVersion: d.template.version,
      essentials: studentEssentials(d.ctx),
    },
    charges: d.charges,
    totalReais: Math.round(d.charges.reduce((sum, c) => sum + c.amountReais, 0) * 100) / 100,
    cycle: d.planned.cycle,
    online: d.req.billingMode === "asaas",
    /** Online sem CPF salvo: o app pede o CPF antes de assinar. */
    needsCpf: d.req.billingMode === "asaas" && !d.ctx.student.cpf,
    dueDay: d.req.dueDay,
    startDate: todayKey,
    endDate: d.ctx.endKey,
  };
}

export const previewMyArenaClassEnrollment = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  previewSelfEnrollmentCore(getFirestore(), requireAuth(request), rec(request.data), dayKeyFromEventDate(new Date())));

export interface SignatureEvidence {
  ip: string;
  userAgent: string;
  platform: string;
  appVersion: string;
}

function evidenceData(auth: {uid: string; email: string}, ev: SignatureEvidence, readSeconds: number, sha256: string): Data {
  return {
    method: "app_session",
    uid: auth.uid,
    email: auth.email,
    ip: ev.ip,
    userAgent: ev.userAgent.slice(0, 300),
    platform: ev.platform.slice(0, 40),
    appVersion: ev.appVersion.slice(0, 40),
    readSeconds,
    sha256,
  };
}

function readSecondsOf(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(Math.round(n), 24 * 3600)) : 0;
}

export async function enrollMeCore(
  db: Firestore,
  auth: {uid: string; email: string},
  input: Data,
  evidence: SignatureEvidence,
  now: Date,
) {
  if (input["agreed"] !== true) throw new HttpsError("invalid-argument", "Marque que leu e concorda com o contrato.");
  const todayKey = dayKeyFromEventDate(now);
  const d = await buildSelfEnrollmentDraft(db, auth, input, todayKey);
  if (!sameDocument(d.rendered.sha256, input["sha256"])) {
    throw new HttpsError("failed-precondition", "O contrato mudou desde que você abriu. Revise e assine de novo.");
  }
  if (d.req.billingMode === "asaas" && !d.ctx.student.cpf) {
    throw new HttpsError("failed-precondition", "Informe seu CPF para pagar pelo app.");
  }
  requireClassEntitlement(d.arena);
  const readSeconds = readSecondsOf(input["readSeconds"]);
  const signedAt = Timestamp.fromDate(now);
  const essentials = studentEssentials(d.ctx);

  const result = await createEnrollmentCore(db, d.req, {
    athleteId: auth.uid,
    name: d.student.name,
    phone: d.student.phone,
    photoUrl: d.student.photoUrl,
  }, auth.uid, todayKey, "athlete", (tx: Transaction, enrollmentId: string, planned: EnrollmentPlan) => {
    // O que foi assinado tem que ser o que virou matrícula (preço e horários lidos na transação).
    if (planned.plan.priceReais !== d.planned.plan.priceReais || planned.cycle !== d.planned.cycle ||
      planned.slots.map((s) => `${s.classId}:${s.weekday}:${s.startTime}`).join("|") !==
      d.planned.slots.map((s) => `${s.classId}:${s.weekday}:${s.startTime}`).join("|")) {
      throw new HttpsError("failed-precondition", "O plano mudou agora há pouco. Revise e assine de novo.");
    }
    const ref = db.collection(ARENA_AGREEMENTS).doc(studentAgreementId(enrollmentId));
    tx.set(ref, {
      audience: "student",
      arenaId: d.req.arenaId,
      arenaName: d.ctx.arena.name,
      partyUid: auth.uid,
      partyName: d.student.name,
      partyPhotoUrl: d.student.photoUrl,
      status: "signed",
      number: agreementNumber(now.getUTCFullYear(), enrollmentId),
      title: d.rendered.title,
      body: d.rendered.body,
      sha256: d.rendered.sha256,
      templateVersion: d.template.version,
      essentials,
      enrollmentId,
      planId: d.req.planId,
      planName: d.planned.plan.name,
      cycle: d.planned.cycle,
      teacherIds: [...new Set(d.planned.slots.map((s) => s.teacherId))],
      slots: d.planned.slots.map((s) => ({classId: s.classId, weekday: s.weekday, startTime: s.startTime, className: s.className})),
      startDate: todayKey,
      endDate: d.ctx.endKey,
      signedAt,
      evidence: evidenceData(auth, evidence, readSeconds, d.rendered.sha256),
      createdByUid: auth.uid,
      createdAt: signedAt,
      updatedAt: signedAt,
    });
  });
  logger.info("enrollMeInArenaClassPlan", {arenaId: d.req.arenaId, uid: auth.uid, ...result});
  return {
    ...result,
    agreementId: studentAgreementId(result.enrollmentId),
    online: d.req.billingMode === "asaas",
    charges: d.charges,
    signedAt: now.toISOString(),
  };
}

function evidenceFrom(request: CallableRequest): SignatureEvidence {
  const headers = request.rawRequest?.headers ?? {};
  const d = rec(request.data);
  return {
    ip: clientIp(headers["x-forwarded-for"], request.rawRequest?.ip),
    userAgent: str(headers["user-agent"]),
    platform: str(d["platform"]),
    appVersion: str(d["appVersion"]),
  };
}

export const enrollMeInArenaClassPlan = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  enrollMeCore(getFirestore(), requireAuth(request), rec(request.data), evidenceFrom(request), new Date()));

// ---------------------------------------------------------------------------
// Meus contratos (aluno e professor)
// ---------------------------------------------------------------------------

export function agreementSummary(id: string, c: Data) {
  return {
    agreementId: id,
    audience: str(c["audience"]) || "student",
    arenaId: str(c["arenaId"]),
    arenaName: str(c["arenaName"]) || "Arena",
    status: str(c["status"]),
    number: str(c["number"]),
    title: str(c["title"]),
    planName: str(c["planName"]) || null,
    essentials: Array.isArray(c["essentials"]) ? c["essentials"] as unknown[] : [],
    startDate: str(c["startDate"]) || null,
    endDate: str(c["endDate"]) || null,
    sentAt: iso(c["sentAt"]),
    signedAt: iso(c["signedAt"]),
    partyName: str(c["partyName"]),
    partyPhotoUrl: str(c["partyPhotoUrl"]) || null,
  };
}

export async function myAgreementsCore(db: Firestore, uid: string) {
  const snap = await db.collection(ARENA_AGREEMENTS).where("partyUid", "==", uid).limit(MAX_LIST).get();
  const rows = snap.docs
    .filter((d) => d.data()["status"] !== "canceled")
    .map((d) => ({...agreementSummary(d.id, d.data()), sortKey: iso(d.data()["createdAt"]) ?? ""}));
  rows.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return {agreements: rows.map(({sortKey: _s, ...r}) => r)};
}

export const getMyArenaAgreements = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  myAgreementsCore(getFirestore(), requireAuth(request).uid));

function detailOf(id: string, c: Data) {
  const ev = rec(c["evidence"]);
  return {
    ...agreementSummary(id, c),
    body: str(c["body"]),
    sha256: str(c["sha256"]),
    templateVersion: Number(c["templateVersion"] ?? 0),
    evidence: c["status"] === "signed" || c["status"] === "ended" ? {
      platform: str(ev["platform"]),
      appVersion: str(ev["appVersion"]),
      ip: maskIp(str(ev["ip"])),
      readSeconds: Number(ev["readSeconds"] ?? 0),
    } : null,
  };
}

export async function myAgreementCore(db: Firestore, uid: string, agreementId: string) {
  if (!agreementId || agreementId.includes("/")) throw new HttpsError("invalid-argument", "Contrato inválido.");
  const snap = await db.collection(ARENA_AGREEMENTS).doc(agreementId).get();
  const c = snap.data();
  if (!c || c["partyUid"] !== uid) throw new HttpsError("not-found", "Contrato não encontrado.");
  return detailOf(snap.id, c);
}

export const getMyArenaAgreement = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  myAgreementCore(getFirestore(), requireAuth(request).uid, str(rec(request.data)["agreementId"])));

/** Professor assina o contrato que a arena enviou. O anterior assinado (se houver) é encerrado. */
export async function signMyAgreementCore(
  db: Firestore,
  auth: {uid: string; email: string},
  input: Data,
  evidence: SignatureEvidence,
  now: Date,
) {
  const agreementId = str(input["agreementId"]);
  if (!agreementId || agreementId.includes("/")) throw new HttpsError("invalid-argument", "Contrato inválido.");
  if (input["agreed"] !== true) throw new HttpsError("invalid-argument", "Marque que leu e concorda com o contrato.");
  const readSeconds = readSecondsOf(input["readSeconds"]);
  const at = Timestamp.fromDate(now);
  const ref = db.collection(ARENA_AGREEMENTS).doc(agreementId);
  const out = await db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data();
    if (!c || c["partyUid"] !== auth.uid) throw new HttpsError("not-found", "Contrato não encontrado.");
    if (c["status"] !== "pending") throw new HttpsError("failed-precondition", "Este contrato não espera mais assinatura.");
    if (!sameDocument(str(c["sha256"]), input["sha256"])) {
      throw new HttpsError("failed-precondition", "O texto mudou desde que você abriu. Abra o contrato de novo.");
    }
    const previous = str(c["replaces"]) ? await tx.get(db.collection(ARENA_AGREEMENTS).doc(str(c["replaces"]))) : null;
    tx.update(ref, {
      status: "signed",
      signedAt: at,
      evidence: evidenceData(auth, evidence, readSeconds, str(c["sha256"])),
      updatedAt: at,
    });
    if (previous?.exists && previous.data()?.["status"] === "signed") {
      tx.update(previous.ref, {status: "ended", endedAt: at, endReason: "replaced", updatedAt: at});
    }
    return {arenaId: str(c["arenaId"]), partyName: str(c["partyName"]), createdByUid: str(c["createdByUid"])};
  });
  if (out.createdByUid && out.createdByUid !== auth.uid) {
    try {
      await deliverNotificationToUser({
        userId: out.createdByUid,
        title: "Contrato assinado",
        body: `${out.partyName} assinou o contrato de professor.`,
        type: "arena_agreement_signed",
        data: {arenaId: out.arenaId, agreementId, webUrl: "/painel/contratos"},
        requireInteraction: false,
      });
    } catch (error) {
      logger.warn("signMyArenaAgreement: aviso à arena falhou", {agreementId, error});
    }
  }
  return {status: "signed", signedAt: now.toISOString()};
}

export const signMyArenaAgreement = onCall(PUSH_OPTS, async (request) =>
  signMyAgreementCore(getFirestore(), requireAuth(request), rec(request.data), evidenceFrom(request), new Date()));

// ---------------------------------------------------------------------------
// Arena: modelos
// ---------------------------------------------------------------------------

export async function arenaTemplatesCore(db: Firestore, uid: string, arenaId: string) {
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "read");
  const col = db.collection("arenas").doc(arenaId).collection(AGREEMENT_TEMPLATES);
  const [student, professor] = await Promise.all([col.doc("student").get(), col.doc("professor").get()]);
  const view = (audience: AgreementAudience, data: Data | undefined) => {
    const t = resolveTemplate(audience, data);
    return {...t, isDefault: t.version === 0, updatedAt: iso(data?.["updatedAt"]), variables: AGREEMENT_VARIABLES[audience]};
  };
  return {student: view("student", student.data()), professor: view("professor", professor.data())};
}

export const getArenaAgreementTemplates = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  arenaTemplatesCore(getFirestore(), requireAuth(request).uid, str(rec(request.data)["arenaId"])));

export async function saveTemplateCore(db: Firestore, uid: string, input: Data) {
  const arenaId = str(input["arenaId"]);
  const audience = parseAudience(input["audience"]);
  if (!arenaId || !audience) throw new HttpsError("invalid-argument", "Arena e tipo de contrato são obrigatórios.");
  const title = str(input["title"]);
  const body = typeof input["body"] === "string" ? input["body"].replace(/\r\n/g, "\n").trim() : "";
  if (!title || title.length > MAX_TEMPLATE_TITLE) throw new HttpsError("invalid-argument", `Título de 1 a ${MAX_TEMPLATE_TITLE} caracteres.`);
  if (body.length < 40 || body.length > MAX_TEMPLATE_CHARS) throw new HttpsError("invalid-argument", "Texto do contrato muito curto ou longo demais.");
  const unknown = unknownAgreementVariables(audience, body);
  if (unknown.length > 0) {
    throw new HttpsError("invalid-argument", `Variável desconhecida: ${unknown.map((k) => `{{${k}}}`).join(", ")}.`);
  }
  await requireClassManager(db, arenaId, uid);
  const ref = db.collection("arenas").doc(arenaId).collection(AGREEMENT_TEMPLATES).doc(audience);
  return db.runTransaction(async (tx) => {
    const prev = (await tx.get(ref)).data();
    const version = Math.max(0, Number(prev?.["version"] ?? 0) || 0) + 1;
    tx.set(ref, {audience, title, body, version, updatedByUid: uid, updatedAt: FieldValue.serverTimestamp()});
    return {audience, version};
  });
}

export const saveArenaAgreementTemplate = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  saveTemplateCore(getFirestore(), requireAuth(request).uid, rec(request.data)));

// ---------------------------------------------------------------------------
// Arena: contratos assinados e envio ao professor
// ---------------------------------------------------------------------------

export async function listArenaAgreementsCore(db: Firestore, uid: string, arenaId: string) {
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "read");
  const [snap, teacherSnap] = await Promise.all([
    db.collection(ARENA_AGREEMENTS).where("arenaId", "==", arenaId).limit(1000).get(),
    db.collection("arenas").doc(arenaId).collection(CLASS_TEACHERS).get(),
  ]);
  const rows = snap.docs.map((d) => ({...agreementSummary(d.id, d.data()), teacherId: str(d.data()["teacherId"]) || null, sortKey: iso(d.data()["createdAt"]) ?? ""}));
  rows.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  // Situação do contrato de cada professor: aguardando assinatura > assinado > encerrado.
  const rank = (s: string) => s === "pending" ? 0 : s === "signed" ? 1 : 2;
  const teachers = teacherSnap.docs
    .filter((d) => d.data()["status"] !== "archived")
    .map((d) => {
      const latest = rows
        .filter((r) => r.audience === "professor" && r.teacherId === d.id && r.status !== "canceled")
        .sort((a, b) => rank(a.status) - rank(b.status))[0];
      return {
        teacherId: d.id,
        name: str(d.data()["name"]) || "Professor",
        photoUrl: str(d.data()["photoUrl"]) || null,
        hasAccount: Boolean(str(d.data()["userId"])),
        agreementStatus: latest?.status ?? null,
        agreementId: latest?.agreementId ?? null,
      };
    });
  return {agreements: rows.slice(0, MAX_LIST).map(({sortKey: _s, ...r}) => r), teachers};
}

export const listArenaAgreements = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  listArenaAgreementsCore(getFirestore(), requireAuth(request).uid, str(rec(request.data)["arenaId"])));

/** Detalhe (com texto) para a arena. */
export async function arenaAgreementDetailCore(db: Firestore, uid: string, agreementId: string) {
  if (!agreementId || agreementId.includes("/")) throw new HttpsError("invalid-argument", "Contrato inválido.");
  const snap = await db.collection(ARENA_AGREEMENTS).doc(agreementId).get();
  const c = snap.data();
  if (!c) throw new HttpsError("not-found", "Contrato não encontrado.");
  await assertArenaAreaAccess(db, str(c["arenaId"]), uid, "agenda", "read");
  return detailOf(snap.id, c);
}

export const getArenaAgreement = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  arenaAgreementDetailCore(getFirestore(), requireAuth(request).uid, str(rec(request.data)["agreementId"])));

/** Prévia ou envio do contrato do professor (mesmo texto nos dois). */
async function professorDraft(db: Firestore, arenaId: string, teacherId: string, todayKey: string) {
  if (!arenaId || !teacherId || teacherId.includes("/")) throw new HttpsError("invalid-argument", "Arena e professor são obrigatórios.");
  const teacherSnap = await db.collection("arenas").doc(arenaId).collection(CLASS_TEACHERS).doc(teacherId).get();
  const teacher = teacherSnap.data();
  if (!teacher || teacher["status"] === "archived") throw new HttpsError("not-found", "Professor não encontrado.");
  const userId = str(teacher["userId"]);
  if (!userId) throw new HttpsError("failed-precondition", "Vincule a conta nexaGO do professor antes de enviar o contrato.");
  const [{party}, template, planSnap] = await Promise.all([
    loadArenaParty(db, arenaId),
    loadTemplate(db, arenaId, "professor"),
    db.collection("arenas").doc(arenaId).collection(CLASS_PLANS).where("teacherIds", "array-contains", teacherId).get(),
  ]);
  const planNames = planSnap.docs.filter((d) => d.data()["status"] !== "archived").map((d) => str(d.data()["name"])).filter(Boolean);
  const ctx = {
    arena: party,
    professor: {name: str(teacher["name"]) || "Professor", specialty: str(teacher["specialty"])},
    planNames,
    payout: rec(teacher["payout"]),
    startKey: todayKey,
    endKey: termEnd(todayKey, AGREEMENT_TERM_MONTHS),
  };
  return {teacher, userId, template, ctx, rendered: renderAgreement(template, professorValues(ctx)), essentials: professorEssentials(ctx)};
}

export async function previewProfessorAgreementCore(db: Firestore, uid: string, input: Data, todayKey: string) {
  const arenaId = str(input["arenaId"]);
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "read");
  const d = await professorDraft(db, arenaId, str(input["teacherId"]), todayKey);
  return {title: d.rendered.title, body: d.rendered.body, essentials: d.essentials, templateVersion: d.template.version};
}

export const previewArenaProfessorAgreement = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  previewProfessorAgreementCore(getFirestore(), requireAuth(request).uid, rec(request.data), dayKeyFromEventDate(new Date())));

export async function sendProfessorAgreementCore(db: Firestore, uid: string, input: Data, now: Date) {
  const arenaId = str(input["arenaId"]);
  const teacherId = str(input["teacherId"]);
  await requireClassManager(db, arenaId, uid);
  const todayKey = dayKeyFromEventDate(now);
  const d = await professorDraft(db, arenaId, teacherId, todayKey);
  const at = Timestamp.fromDate(now);
  const ref = db.collection(ARENA_AGREEMENTS).doc();
  const open = await db.collection(ARENA_AGREEMENTS)
    .where("arenaId", "==", arenaId).where("teacherId", "==", teacherId).get();
  await db.runTransaction(async (tx) => {
    const fresh = await Promise.all(open.docs.map((x) => tx.get(x.ref)));
    const signed = fresh.find((x) => x.data()?.["status"] === "signed");
    // Reenviar troca o pendente; o assinado vale até o novo ser assinado.
    for (const x of fresh) {
      if (x.data()?.["status"] === "pending") tx.update(x.ref, {status: "canceled", canceledAt: at, endReason: "resent", updatedAt: at});
    }
    tx.set(ref, {
      audience: "professor",
      arenaId,
      arenaName: d.ctx.arena.name,
      teacherId,
      partyUid: d.userId,
      partyName: d.ctx.professor.name,
      partyPhotoUrl: str(d.teacher["photoUrl"]) || null,
      status: "pending",
      number: agreementNumber(now.getUTCFullYear(), ref.id),
      title: d.rendered.title,
      body: d.rendered.body,
      sha256: d.rendered.sha256,
      templateVersion: d.template.version,
      essentials: d.essentials,
      planName: null,
      startDate: todayKey,
      endDate: d.ctx.endKey,
      replaces: signed?.id ?? null,
      sentAt: at,
      createdByUid: uid,
      createdAt: at,
      updatedAt: at,
    });
  });
  try {
    await deliverNotificationToUser({
      userId: d.userId,
      title: "Contrato para assinar",
      body: `${d.ctx.arena.name} enviou seu contrato de professor. Leia e assine pelo app.`,
      // Sem `url`/`arenaId` de propósito: o app antigo cairia na agenda do gestor (ramo genérico de arena).
      type: "professor_agreement_pending",
      data: {agreementId: ref.id, webUrl: "/professor/arenas"},
      requireInteraction: false,
    });
  } catch (error) {
    logger.warn("sendArenaProfessorAgreement: push falhou", {agreementId: ref.id, error});
  }
  return {agreementId: ref.id};
}

export const sendArenaProfessorAgreement = onCall(PUSH_OPTS, async (request) =>
  sendProfessorAgreementCore(getFirestore(), requireAuth(request).uid, rec(request.data), new Date()));

/** Pendente → cancelado; assinado de professor → encerrado. Contrato de aluno encerra pela matrícula. */
export async function cancelAgreementCore(db: Firestore, uid: string, agreementId: string, now: Date) {
  if (!agreementId || agreementId.includes("/")) throw new HttpsError("invalid-argument", "Contrato inválido.");
  const ref = db.collection(ARENA_AGREEMENTS).doc(agreementId);
  const snap = await ref.get();
  const c = snap.data();
  if (!c) throw new HttpsError("not-found", "Contrato não encontrado.");
  await requireClassManager(db, str(c["arenaId"]), uid);
  const at = Timestamp.fromDate(now);
  if (c["status"] === "pending") {
    await ref.update({status: "canceled", canceledAt: at, endReason: "arena", updatedAt: at});
    return {status: "canceled"};
  }
  if (c["status"] === "signed" && c["audience"] === "professor") {
    await ref.update({status: "ended", endedAt: at, endReason: "arena", updatedAt: at});
    return {status: "ended"};
  }
  throw new HttpsError("failed-precondition", c["audience"] === "student" ?
    "O contrato do aluno encerra quando a matrícula é cancelada." :
    "Este contrato já foi encerrado.");
}

export const cancelArenaAgreement = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  cancelAgreementCore(getFirestore(), requireAuth(request).uid, str(rec(request.data)["agreementId"]), new Date()));
