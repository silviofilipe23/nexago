/**
 * Aulas — fase 2: planos, regras, matrícula e mensalidades.
 *
 * Matrícula = aluno + plano + horários fixos (turma × dia da semana). Ela escreve o aluno em
 * `classStudents` de cada turma com os `weekdays` dele e gera as primeiras cobranças. As mensais
 * seguintes saem do agendador diário (id `{matrícula}_{AAAA-MM}`, idempotente).
 *
 * Cobrança `manual` (padrão): o gestor registra o pagamento recebido direto. Cobrança `asaas`
 * (regra `onlineBillingEnabled`): cada mensalidade entra num grupo `arenaClassAsaasPayments`
 * em estado `pending`, gravado NA MESMA transação; quem fala com o Asaas é o worker de
 * `asaas-class-billing.ts` (nunca dentro de transação nem no loop do agendador).
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue, type Firestore, type Transaction} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {dayKeyFromEventDate} from "./event-timezone";
import {addDaysToDateKey, isValidDateKey, isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {
  ARENA_CLASSES,
  ARENA_CLASS_ASAAS_PAYMENTS,
  ARENA_CLASS_BILLING_PROFILES,
  ARENA_CLASS_CHARGES,
  ARENA_CLASS_CREDITS,
  ARENA_CLASS_ENROLLMENTS,
  CLASS_PLANS,
  CLASS_STUDENTS,
  CLASS_WAITLIST,
  DEFAULT_CLASS_RULES,
  PAYMENT_METHODS,
  PLAN_KINDS,
  billingProfileId,
  parseBillingMode,
  type ClassBillingMode,
  type ClassPaymentMethod,
  type ClassPlanKind,
  type ClassRules,
} from "./arena-class-constants";
import {
  LIVE_ASAAS_STATES,
  chargeAsaasMirror,
  classAsaasGroupData,
  firstGroupId,
  maskCpfCnpj,
  resumeGroupId,
  type ClassAsaasState,
} from "./arena-class-asaas-model";
import {isValidCpfCnpj, normalizeCpfCnpj} from "./asaas-customer";
import {readArenaPaymentFlags, requireArenaPayoutPixKey} from "./mercadopago-arena-helpers";
import {classRulesRef, monthKeyOf, parseClassRules, studentAttendsWeekday} from "./arena-class-ledger";
import {
  parseArenaClass,
  requireClassEntitlement,
  requireClassManager,
  requireUid,
  resolveStudentInput,
  str,
  type UpsertClassStudentInput,
} from "./arena-class";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const MONTH_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthLabelPt(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_PT[(m ?? 1) - 1] ?? "?"}/${y}`;
}

export function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const year = (y ?? 2000) + ((m ?? 1) === 12 ? 1 : 0);
  const month = (m ?? 1) === 12 ? 1 : (m ?? 1) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function dueDateFor(monthKey: string, dueDay: number): string {
  return `${monthKey}-${String(dueDay).padStart(2, "0")}`;
}

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2000, m ?? 1, 0)).getUTCDate();
}

/** Aulas do mês nos dias da semana escolhidos, a partir de `fromDateKey` (inclusive). */
export function occurrencesInMonth(weekdays: readonly number[], monthKey: string, fromDateKey?: string): number {
  const days = new Set(weekdays);
  let count = 0;
  for (let d = 1; d <= daysInMonth(monthKey); d++) {
    const key = `${monthKey}-${String(d).padStart(2, "0")}`;
    if (fromDateKey && key < fromDateKey) continue;
    if (days.has(isoWeekdayOfDateKey(key))) count += 1;
  }
  return count;
}

/** Mensal proporcional do mês da matrícula: valor × aulas restantes ÷ aulas do mês. */
export function proratedAmount(priceReais: number, weekdays: readonly number[], startDate: string): {
  amountReais: number;
  remaining: number;
  total: number;
} {
  const month = monthKeyOf(startDate);
  const total = occurrencesInMonth(weekdays, month);
  const remaining = occurrencesInMonth(weekdays, month, startDate);
  const amountReais = total > 0 ? Math.round((priceReais * remaining / total) * 100) / 100 : 0;
  return {amountReais, remaining, total};
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

export interface ClassPlanData {
  name: string;
  kind: ClassPlanKind;
  priceReais: number;
  classesPerWeek: number | null;
  makeupsPerMonth: number | null;
  credits: number | null;
  validityDays: number | null;
  description: string | null;
}

function num(raw: unknown): number {
  return typeof raw === "number" ? raw : Number(raw);
}

/** Valida e normaliza um plano. Lança `HttpsError(invalid-argument)`. */
export function validatePlanInput(raw: Record<string, unknown>): ClassPlanData {
  const name = str(raw["name"]);
  if (!name || name.length > 60) throw new HttpsError("invalid-argument", "Informe o nome do plano (até 60).");
  const kind = str(raw["kind"]);
  if (!(PLAN_KINDS as readonly string[]).includes(kind)) {
    throw new HttpsError("invalid-argument", "Tipo de plano inválido.");
  }
  const priceReais = Math.round(num(raw["priceReais"]) * 100) / 100;
  if (!Number.isFinite(priceReais) || priceReais < 0 || priceReais > 100000) {
    throw new HttpsError("invalid-argument", "Valor inválido.");
  }
  if (kind !== "single" && priceReais <= 0) {
    throw new HttpsError("invalid-argument", "Mensalidade e pacote precisam de valor.");
  }
  const description = str(raw["description"]).slice(0, 120) || null;
  const intIn = (v: unknown, min: number, max: number, msg: string) => {
    const n = num(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpsError("invalid-argument", msg);
    return n;
  };
  if (kind === "monthly") {
    return {
      name, kind, priceReais, description,
      classesPerWeek: intIn(raw["classesPerWeek"], 1, 7, "Aulas por semana: de 1 a 7."),
      makeupsPerMonth: intIn(raw["makeupsPerMonth"] ?? 0, 0, 10, "Reposições por mês: de 0 a 10."),
      credits: null,
      validityDays: null,
    };
  }
  if (kind === "package") {
    return {
      name, kind, priceReais, description,
      classesPerWeek: null,
      makeupsPerMonth: null,
      credits: intIn(raw["credits"], 1, 100, "Créditos do pacote: de 1 a 100."),
      validityDays: intIn(raw["validityDays"], 1, 365, "Validade do pacote: de 1 a 365 dias."),
    };
  }
  return {name, kind: "single", priceReais, description, classesPerWeek: null, makeupsPerMonth: null, credits: null, validityDays: null};
}

export function parsePlan(data: Record<string, unknown>): ClassPlanData & {status: string} {
  const kind = (PLAN_KINDS as readonly string[]).includes(String(data["kind"])) ? data["kind"] as ClassPlanKind : "single";
  const n = (v: unknown) => typeof v === "number" ? v : null;
  return {
    name: String(data["name"] ?? "Plano"),
    kind,
    priceReais: Number(data["priceReais"] ?? 0),
    classesPerWeek: n(data["classesPerWeek"]),
    makeupsPerMonth: n(data["makeupsPerMonth"]),
    credits: n(data["credits"]),
    validityDays: n(data["validityDays"]),
    description: typeof data["description"] === "string" ? data["description"] : null,
    status: String(data["status"] ?? "active"),
  };
}

export const upsertArenaClassPlan = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const arenaId = str(input["arenaId"]);
  const planId = str(input["planId"]) || null;
  const status = str(input["status"]) || "active";
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  if (status !== "active" && status !== "archived") throw new HttpsError("invalid-argument", "Status inválido.");
  const plan = validatePlanInput(input);
  const db = getFirestore();
  const arenaData = await requireClassManager(db, arenaId, uid);
  const col = db.collection("arenas").doc(arenaId).collection(CLASS_PLANS);
  if (planId == null) {
    requireClassEntitlement(arenaData);
    const ref = col.doc();
    await ref.set({
      ...plan, arenaId, status: "active", createdByUid: uid,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return {planId: ref.id};
  }
  const ref = col.doc(planId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Plano não encontrado.");
  if (snap.data()?.["kind"] !== plan.kind) {
    throw new HttpsError("failed-precondition", "O tipo do plano não muda — crie outro plano.");
  }
  // Matrículas guardam o plano da época: mudar o valor vale para as novas.
  await ref.set({...plan, status, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {planId};
});

export const saveArenaClassRules = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const arenaId = str(input["arenaId"]);
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  const db = getFirestore();
  const arenaData = await requireClassManager(db, arenaId, uid);
  const stored = parseClassRules((await classRulesRef(db, arenaId).get()).data());
  const rules = mergeClassRulesInput(stored, input);
  // `parseClassRules` cai no padrão em valor fora da faixa — aqui isso é erro, não silêncio.
  const checks: Array<[keyof ClassRules, boolean]> = [
    ["makeupValidityDays", input["makeupValidityDays"] === undefined || rules.makeupValidityDays === input["makeupValidityDays"]],
    ["defaultDueDay", input["defaultDueDay"] === undefined || rules.defaultDueDay === input["defaultDueDay"]],
  ];
  if (checks.some(([, ok]) => !ok)) {
    throw new HttpsError("invalid-argument", "Validade do crédito (1–365 dias) ou vencimento (dia 1–28) inválido.");
  }
  if (rules.onlineBillingEnabled && !stored.onlineBillingEnabled) assertArenaCanBillOnline(arenaData);
  await classRulesRef(db, arenaId).set({...rules, updatedAt: FieldValue.serverTimestamp(), updatedByUid: uid});
  return rules;
});

/** App antigo não manda os campos novos: o que não veio fica como estava (senão desligaria a
 *  cobrança online ou o lembrete calado). */
export function mergeClassRulesInput(stored: ClassRules, input: Record<string, unknown>): ClassRules {
  const given = Object.fromEntries(
    Object.keys(DEFAULT_CLASS_RULES).filter((k) => input[k] !== undefined).map((k) => [k, input[k]]),
  );
  return parseClassRules({...stored, ...given});
}

/** Cobrança online cai no caixa da arena, como o aluguel online: precisa do pagamento online e do PIX de repasse. */
export function assertArenaCanBillOnline(arena: Record<string, unknown>): void {
  if (!readArenaPaymentFlags(arena).onlinePaymentEnabled) {
    throw new HttpsError("failed-precondition", "Ative o pagamento online da arena antes de cobrar as aulas online.");
  }
  try {
    requireArenaPayoutPixKey(arena);
  } catch {
    throw new HttpsError("failed-precondition", "Cadastre a chave PIX de repasse da arena para receber as aulas online.");
  }
}

// ---------------------------------------------------------------------------
// Matrícula
// ---------------------------------------------------------------------------

export interface EnrollmentSlot {
  classId: string;
  weekday: number;
}

export interface EnrollmentRequest {
  arenaId: string;
  planId: string;
  slots: EnrollmentSlot[];
  dueDay: number;
  paymentMethod: ClassPaymentMethod;
  waiveFee: boolean;
  waitlistClassId: string | null;
  waitlistEntryId: string | null;
  /** `asaas` = mensalidade cobrada online (precisa da regra ligada e de CPF). */
  billingMode: ClassBillingMode;
  /** CPF digitado pela arena (só dígitos) — vai para o perfil de cobrança, nunca para o atleta. */
  cpfCnpj: string | null;
}

export function parseEnrollmentRequest(input: Record<string, unknown>): EnrollmentRequest {
  const arenaId = str(input["arenaId"]);
  const planId = str(input["planId"]);
  if (!arenaId || !planId) throw new HttpsError("invalid-argument", "Arena e plano são obrigatórios.");
  const rawSlots = Array.isArray(input["slots"]) ? input["slots"] as Array<Record<string, unknown>> : [];
  const slots: EnrollmentSlot[] = [];
  const seen = new Set<string>();
  for (const raw of rawSlots) {
    const classId = str(raw?.["classId"]);
    const weekday = Number(raw?.["weekday"]);
    if (!classId || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new HttpsError("invalid-argument", "Horário inválido.");
    }
    const key = `${classId}:${weekday}`;
    if (seen.has(key)) throw new HttpsError("invalid-argument", "Horário repetido.");
    seen.add(key);
    slots.push({classId, weekday});
  }
  if (slots.length === 0 || slots.length > 7) throw new HttpsError("invalid-argument", "Escolha de 1 a 7 horários.");
  const dueDay = Number(input["dueDay"]);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    throw new HttpsError("invalid-argument", "Dia de vencimento: de 1 a 28.");
  }
  const paymentMethod = str(input["paymentMethod"]) || "pix";
  if (!(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    throw new HttpsError("invalid-argument", "Forma de pagamento inválida.");
  }
  return {
    arenaId, planId, slots, dueDay,
    paymentMethod: paymentMethod as ClassPaymentMethod,
    waiveFee: input["waiveFee"] === true,
    waitlistClassId: str(input["waitlistClassId"]) || null,
    waitlistEntryId: str(input["waitlistEntryId"]) || null,
    billingMode: parseBillingMode(input["billingMode"]),
    cpfCnpj: parseOptionalCpf(input["cpfCnpj"]),
  };
}

function parseOptionalCpf(raw: unknown): string | null {
  const digits = normalizeCpfCnpj(typeof raw === "string" ? raw : undefined);
  if (!digits) return null;
  if (!isValidCpfCnpj(digits)) throw new HttpsError("invalid-argument", "CPF/CNPJ inválido.");
  return digits;
}

export interface PlannedCharge {
  id: string;
  description: string;
  period: string | null;
  amountReais: number;
  dueDate: string;
}

/** Mensal proporcional do mês de `fromDateKey` (matrícula ou volta da pausa); null se não sobra aula. */
function proratedMonthCharge(
  enrollmentId: string,
  plan: Pick<ClassPlanData, "name" | "priceReais">,
  weekdays: readonly number[],
  fromDateKey: string,
): PlannedCharge | null {
  const month = monthKeyOf(fromDateKey);
  const pro = proratedAmount(plan.priceReais, weekdays, fromDateKey);
  if (pro.amountReais <= 0) return null;
  return {
    id: `${enrollmentId}_${month}`,
    description: `${plan.name} · ${monthLabelPt(month)} (${pro.remaining} de ${pro.total} aulas)`,
    period: month,
    amountReais: pro.amountReais,
    dueDate: fromDateKey,
  };
}

/** Doc de uma cobrança em aberto da matrícula (`groupId` = cobrança online no grupo Asaas). */
function openChargeData(
  enrollmentId: string,
  owner: {arenaId: unknown; studentId: unknown; athleteId: unknown; name: unknown; phone: unknown; paymentMethod: unknown},
  c: PlannedCharge,
  groupId: string | null = null,
): Record<string, unknown> {
  return {
    billingMode: groupId ? "asaas" : "manual",
    ...(groupId ? {asaas: chargeAsaasMirror(groupId, "pending")} : {}),
    arenaId: owner.arenaId,
    enrollmentId,
    studentId: owner.studentId,
    athleteId: owner.athleteId ?? null,
    name: owner.name,
    phone: owner.phone ?? null,
    description: c.description,
    period: c.period,
    amountReais: c.amountReais,
    dueDate: c.dueDate,
    status: "open",
    paidAt: null,
    paidOn: null,
    paymentMethod: owner.paymentMethod ?? "pix",
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** Primeiras cobranças da matrícula (sem gravar). */
export function firstCharges(
  enrollmentId: string,
  plan: ClassPlanData,
  weekdays: readonly number[],
  todayKey: string,
  rules: ClassRules,
  waiveFee: boolean,
): {charges: PlannedCharge[]; billedThrough: string | null} {
  const charges: PlannedCharge[] = [];
  let billedThrough: string | null = null;
  if (plan.kind === "monthly") {
    const charge = proratedMonthCharge(enrollmentId, plan, weekdays, todayKey);
    if (charge) charges.push(charge);
    billedThrough = monthKeyOf(todayKey);
  } else if (plan.kind === "package") {
    charges.push({
      id: `${enrollmentId}_package`,
      description: `${plan.name} · ${plan.credits} aulas`,
      period: null,
      amountReais: plan.priceReais,
      dueDate: todayKey,
    });
  }
  if (rules.enrollmentFeeReais > 0 && !waiveFee) {
    charges.push({
      id: `${enrollmentId}_fee`,
      description: "Taxa de matrícula",
      period: null,
      amountReais: rules.enrollmentFeeReais,
      dueDate: todayKey,
    });
  }
  return {charges, billedThrough};
}

interface EnrollmentPlan {
  plan: ClassPlanData;
  rules: ClassRules;
  classes: Map<string, {data: Record<string, unknown>; name: string; startTime: string; teacherId: string}>;
  slots: Array<EnrollmentSlot & {className: string; startTime: string; teacherId: string}>;
}

/**
 * Valida plano, turmas e vagas por dia da semana. Usado pela prévia (fora de transação) e pela
 * matrícula (dentro dela: `get` é o `tx.get`). Vaga: alunos ativos da turma que fazem aquele dia,
 * sem contar o próprio aluno, precisam caber na capacidade.
 */
async function planEnrollment(
  db: Firestore,
  get: <T>(ref: T) => Promise<unknown>,
  req: EnrollmentRequest,
  studentId: string | null,
): Promise<EnrollmentPlan> {
  const planSnap = await get(db.collection("arenas").doc(req.arenaId).collection(CLASS_PLANS).doc(req.planId)) as FirebaseFirestore.DocumentSnapshot;
  if (!planSnap.exists || planSnap.data()?.["status"] === "archived") {
    throw new HttpsError("not-found", "Plano não encontrado.");
  }
  const plan = parsePlan(planSnap.data() as Record<string, unknown>);
  if (plan.kind === "single") {
    throw new HttpsError("failed-precondition", "Plano avulso não é de matrícula — use “Agendar aula”.");
  }
  if (plan.kind === "monthly" && req.slots.length !== plan.classesPerWeek) {
    throw new HttpsError(
      "invalid-argument",
      `O plano ${plan.name} tem ${plan.classesPerWeek} aula(s) por semana — escolha ${plan.classesPerWeek} horário(s).`,
    );
  }
  const rules = parseClassRules((await get(classRulesRef(db, req.arenaId)) as FirebaseFirestore.DocumentSnapshot).data());
  if (req.billingMode === "asaas" && !rules.onlineBillingEnabled) {
    throw new HttpsError("failed-precondition", "A cobrança online está desligada nas Regras de aulas.");
  }

  const classes: EnrollmentPlan["classes"] = new Map();
  const students = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const classId of new Set(req.slots.map((s) => s.classId))) {
    const snap = await get(db.collection(ARENA_CLASSES).doc(classId)) as FirebaseFirestore.DocumentSnapshot;
    if (!snap.exists) throw new HttpsError("not-found", "Turma não encontrada.");
    const data = snap.data() as Record<string, unknown>;
    const cls = parseArenaClass(data);
    if (cls.arenaId !== req.arenaId) throw new HttpsError("permission-denied", "Turma de outra arena.");
    if (cls.status !== "active") throw new HttpsError("failed-precondition", `A turma ${cls.name} não está ativa.`);
    classes.set(classId, {data, name: cls.name, startTime: cls.startTime, teacherId: cls.teacherId});
    const roster = await get(db.collection(ARENA_CLASSES).doc(classId).collection(CLASS_STUDENTS)
      .where("status", "==", "active")) as FirebaseFirestore.QuerySnapshot;
    students.set(classId, roster.docs);
  }

  const slots: EnrollmentPlan["slots"] = [];
  for (const slot of req.slots) {
    const info = classes.get(slot.classId)!;
    const cls = parseArenaClass(info.data);
    if (!cls.weekdays.includes(slot.weekday)) {
      throw new HttpsError("invalid-argument", `A turma ${cls.name} não tem aula nesse dia.`);
    }
    const taken = (students.get(slot.classId) ?? []).filter((d) =>
      d.id !== studentId && studentAttendsWeekday(d.data() as Record<string, unknown>, slot.weekday)).length;
    if (taken >= cls.capacity) {
      throw new HttpsError("failed-precondition", `A turma ${cls.name} está lotada nesse dia.`);
    }
    slots.push({...slot, className: cls.name, startTime: cls.startTime, teacherId: cls.teacherId});
  }
  return {plan, rules, classes, slots};
}

export const previewArenaClassEnrollment = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const req = parseEnrollmentRequest(input);
  const db = getFirestore();
  await requireClassManager(db, req.arenaId, uid);
  const studentId = str(input["studentId"]) || str(input["athleteId"]) || null;
  const planned = await planEnrollment(db, (ref) => (ref as {get: () => Promise<unknown>}).get(), req, studentId);
  const todayKey = dayKeyFromEventDate(new Date());
  const {charges} = firstCharges("preview", planned.plan, req.slots.map((s) => s.weekday), todayKey, planned.rules, req.waiveFee);
  return {
    charges: charges.map(({description, amountReais, dueDate}) => ({description, amountReais, dueDate})),
    totalReais: Math.round(charges.reduce((sum, c) => sum + c.amountReais, 0) * 100) / 100,
    enrollmentFeeReais: planned.rules.enrollmentFeeReais,
  };
});

export interface CreateEnrollmentResult {
  enrollmentId: string;
  studentId: string;
  chargeIds: string[];
  /** Grupo Asaas do 1º pagamento (cobrança online), ou null. */
  asaasGroupId: string | null;
}

/** Grava a matrícula numa transação: aluno nas turmas, vagas conferidas, primeiras cobranças. */
export async function createEnrollmentCore(
  db: Firestore,
  req: EnrollmentRequest,
  student: {athleteId: string | null; name: string; phone: string | null; photoUrl: string | null; studentId?: string | null},
  actorUid: string,
  todayKey: string,
): Promise<CreateEnrollmentResult> {
  const enrollmentRef = db.collection(ARENA_CLASS_ENROLLMENTS).doc();
  const studentId = student.athleteId ?? student.studentId ?? db.collection(ARENA_CLASS_ENROLLMENTS).doc().id;

  return db.runTransaction(async (tx: Transaction) => {
    const planned = await planEnrollment(db, (ref) => tx.get(ref as never), req, studentId);
    const studentDocs = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const classId of planned.classes.keys()) {
      const ref = db.collection(ARENA_CLASSES).doc(classId).collection(CLASS_STUDENTS).doc(studentId);
      const snap = await tx.get(ref);
      const data = snap.data();
      if (snap.exists && typeof data?.["enrollmentId"] === "string" && data?.["status"] !== "removed") {
        throw new HttpsError("already-exists", `${student.name} já tem matrícula na turma ${planned.classes.get(classId)!.name}.`);
      }
      studentDocs.set(classId, snap);
    }
    const waitlistRef = req.waitlistClassId && req.waitlistEntryId ?
      db.collection(ARENA_CLASSES).doc(req.waitlistClassId).collection(CLASS_WAITLIST).doc(req.waitlistEntryId) :
      null;
    const waitlistSnap = waitlistRef ? await tx.get(waitlistRef) : null;
    const online = req.billingMode === "asaas" ?
      await resolveOnlineBilling(tx, db, req, studentId, student.athleteId) :
      null;

    const weekdays = planned.slots.map((s) => s.weekday);
    const {charges, billedThrough} = firstCharges(enrollmentRef.id, planned.plan, weekdays, todayKey, planned.rules, req.waiveFee);
    const plan = planned.plan;

    tx.set(enrollmentRef, {
      arenaId: req.arenaId,
      studentId,
      athleteId: student.athleteId,
      name: student.name,
      phone: student.phone,
      photoUrl: student.photoUrl,
      plan: {planId: req.planId, ...plan},
      slots: planned.slots,
      status: "active",
      dueDay: req.dueDay,
      paymentMethod: req.paymentMethod,
      billingMode: req.billingMode,
      cpfMasked: online?.cpfMasked ?? null,
      startDate: todayKey,
      billedThrough,
      creditsLeft: plan.kind === "package" ? plan.credits : null,
      expiresOn: plan.kind === "package" ? addDaysToDateKey(todayKey, plan.validityDays ?? 30) : null,
      createdByUid: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const [classId, info] of planned.classes) {
      const snap = studentDocs.get(classId)!;
      const wasActive = snap.exists && snap.data()?.["status"] === "active";
      const classWeekdays = planned.slots.filter((s) => s.classId === classId).map((s) => s.weekday).sort((a, b) => a - b);
      tx.set(snap.ref, {
        arenaId: req.arenaId,
        classId,
        athleteId: student.athleteId,
        name: student.name,
        phone: student.phone,
        photoUrl: student.photoUrl,
        status: "active",
        enrollmentId: enrollmentRef.id,
        weekdays: classWeekdays,
        planName: plan.name,
        removedAt: null,
        addedByUid: actorUid,
        ...(snap.exists ? {} : {enrolledAt: FieldValue.serverTimestamp()}),
      }, {merge: true});
      if (!wasActive) {
        const count = Number(info.data["studentCount"] ?? 0);
        tx.set(db.collection(ARENA_CLASSES).doc(classId), {
          studentCount: count + 1, updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      }
    }

    // Online: 1º mês + taxa saem juntos num pagamento só.
    const groupId = online && charges.length > 0 ? firstGroupId(enrollmentRef.id) : null;
    for (const c of charges) {
      tx.set(db.collection(ARENA_CLASS_CHARGES).doc(c.id), openChargeData(enrollmentRef.id, {
        arenaId: req.arenaId,
        studentId,
        athleteId: student.athleteId,
        name: student.name,
        phone: student.phone,
        paymentMethod: req.paymentMethod,
      }, c, groupId));
    }
    if (groupId) {
      tx.set(db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(groupId), classAsaasGroupData({
        arenaId: req.arenaId, enrollmentId: enrollmentRef.id, studentId, athleteId: student.athleteId, name: student.name,
      }, charges));
    }
    if (online?.profile) tx.set(online.profile.ref, online.profile.data, {merge: true});

    if (waitlistRef && waitlistSnap?.exists) {
      tx.set(waitlistRef, {status: "enrolled", enrollmentId: enrollmentRef.id, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
    return {enrollmentId: enrollmentRef.id, studentId, chargeIds: charges.map((c) => c.id), asaasGroupId: groupId};
  });
}

/**
 * CPF de quem vai pagar online, lido na transação: o digitado pela arena (vai para o perfil de
 * cobrança, só do servidor — não escreve no cadastro do atleta), o perfil já salvo ou o CPF do
 * próprio atleta. Sem nenhum, não há como cobrar online.
 */
async function resolveOnlineBilling(
  tx: Transaction,
  db: Firestore,
  req: EnrollmentRequest,
  studentId: string,
  athleteId: string | null,
): Promise<{cpfMasked: string; profile: {ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown>} | null}> {
  const profileRef = db.collection(ARENA_CLASS_BILLING_PROFILES).doc(billingProfileId(req.arenaId, studentId));
  const profileSnap = await tx.get(profileRef);
  const profileCpf = normalizeCpfCnpj(profileSnap.data()?.["cpfCnpj"] as string | undefined);
  let cpf = req.cpfCnpj ?? "";
  if (!cpf && isValidCpfCnpj(profileCpf)) cpf = profileCpf;
  if (!cpf && athleteId) cpf = await readStoredCpfInTx(tx, db, athleteId);
  if (!cpf) throw new HttpsError("failed-precondition", "Informe o CPF do aluno para cobrar online.");
  return {
    cpfMasked: maskCpfCnpj(cpf),
    profile: req.cpfCnpj ? {
      ref: profileRef,
      data: {
        arenaId: req.arenaId, studentId, athleteId, cpfCnpj: req.cpfCnpj,
        // Outro CPF = outro cliente no Asaas.
        ...(profileCpf && profileCpf !== req.cpfCnpj ? {asaasCustomerId: null, asaasEnv: null} : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
    } : null,
  };
}

async function readStoredCpfInTx(tx: Transaction, db: Firestore, uid: string): Promise<string> {
  for (const col of ["athletes", "users"]) {
    const data = (await tx.get(db.collection(col).doc(uid))).data() ?? {};
    const digits = normalizeCpfCnpj((data["cpfCnpj"] ?? data["cpf"] ?? data["document"]) as string | undefined);
    if (isValidCpfCnpj(digits)) return digits;
  }
  return "";
}

export const createArenaClassEnrollment = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const req = parseEnrollmentRequest(input);
  const db = getFirestore();
  const arenaData = await requireClassManager(db, req.arenaId, uid);
  requireClassEntitlement(arenaData);
  const resolved = await resolveStudentInput(db, input as UpsertClassStudentInput);
  const result = await createEnrollmentCore(db, req, {
    ...resolved,
    studentId: resolved.athleteId ? null : str(input["studentId"]) || null,
  }, uid, dayKeyFromEventDate(new Date()));
  logger.info("createArenaClassEnrollment", {arenaId: req.arenaId, ...result});
  // Telefone gravado (o do cadastro do atleta quando veio em branco): a confirmação monta o WhatsApp.
  return {...result, phone: resolved.phone};
});

/**
 * Pausar (sai da chamada, sem novas mensalidades), reativar (confere a vaga) ou cancelar.
 *
 * Reativar a mensal não cobra os meses parados: `billedThrough` pula para o mês da volta, que sai
 * proporcional às aulas restantes (como a 1ª cobrança), a menos que esse mês já tenha mensalidade.
 */
export async function setEnrollmentStatusCore(
  db: Firestore,
  enrollmentId: string,
  status: "active" | "paused" | "canceled",
  todayKey: string,
): Promise<{status: string; canceledCharges: number}> {
  const ref = db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Matrícula não encontrada.");
    const data = snap.data() as Record<string, unknown>;
    const current = String(data["status"] ?? "");
    if (current === status) return {status, canceledCharges: 0};
    if (current === "canceled" || current === "ended") {
      throw new HttpsError("failed-precondition", "Matrícula encerrada — faça uma nova.");
    }
    const studentId = String(data["studentId"] ?? "");
    const slots = Array.isArray(data["slots"]) ? data["slots"] as Array<Record<string, unknown>> : [];
    const classIds = [...new Set(slots.map((s) => String(s["classId"])))];

    const reads: Array<{classId: string; classSnap: FirebaseFirestore.DocumentSnapshot; studentSnap: FirebaseFirestore.DocumentSnapshot; roster: FirebaseFirestore.QuerySnapshot | null}> = [];
    for (const classId of classIds) {
      const classRef = db.collection(ARENA_CLASSES).doc(classId);
      const classSnap = await tx.get(classRef);
      const studentSnap = await tx.get(classRef.collection(CLASS_STUDENTS).doc(studentId));
      const roster = status === "active" ? await tx.get(classRef.collection(CLASS_STUDENTS).where("status", "==", "active")) : null;
      reads.push({classId, classSnap, studentSnap, roster});
    }
    const openCharges = status === "canceled" ?
      await tx.get(db.collection(ARENA_CLASS_CHARGES).where("enrollmentId", "==", enrollmentId)) :
      null;
    const plan = parsePlan((data["plan"] ?? {}) as Record<string, unknown>);
    const billedThrough = typeof data["billedThrough"] === "string" ? data["billedThrough"] : null;
    const resumeMonth = monthKeyOf(todayKey);
    const resumesBilling = status === "active" && plan.kind === "monthly" &&
      (billedThrough == null || billedThrough < resumeMonth);
    const resumeChargeSnap = resumesBilling ?
      await tx.get(db.collection(ARENA_CLASS_CHARGES).doc(`${enrollmentId}_${resumeMonth}`)) :
      null;

    if (status === "active") {
      for (const r of reads) {
        const cls = parseArenaClass(r.classSnap.data() as Record<string, unknown>);
        for (const s of slots.filter((x) => String(x["classId"]) === r.classId)) {
          const weekday = Number(s["weekday"]);
          const taken = (r.roster?.docs ?? []).filter((d) =>
            d.id !== studentId && studentAttendsWeekday(d.data() as Record<string, unknown>, weekday)).length;
          if (taken >= cls.capacity) {
            throw new HttpsError("failed-precondition", `A turma ${cls.name} lotou nesse dia — não dá para reativar.`);
          }
        }
      }
    }

    const studentStatus = status === "active" ? "active" : status === "paused" ? "paused" : "removed";
    for (const r of reads) {
      if (!r.studentSnap.exists || r.studentSnap.data()?.["enrollmentId"] !== enrollmentId) continue;
      const wasActive = r.studentSnap.data()?.["status"] === "active";
      tx.set(r.studentSnap.ref, {
        status: studentStatus,
        ...(studentStatus === "removed" ? {removedAt: FieldValue.serverTimestamp()} : {}),
      }, {merge: true});
      const delta = (studentStatus === "active" ? 1 : 0) - (wasActive ? 1 : 0);
      if (delta !== 0) {
        const count = Math.max(0, Number(r.classSnap.data()?.["studentCount"] ?? 0) + delta);
        tx.set(r.classSnap.ref, {studentCount: count, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      }
    }

    let canceledCharges = 0;
    const voidGroups = new Set<string>();
    for (const c of openCharges?.docs ?? []) {
      // Cancelar a matrícula não perdoa o que já venceu — só o que ainda ia vencer.
      if (c.data()["status"] === "open" && String(c.data()["dueDate"] ?? "") > todayKey) {
        tx.set(c.ref, {status: "canceled", canceledAt: FieldValue.serverTimestamp()}, {merge: true});
        canceledCharges += 1;
        const groupId = liveGroupIdOf(c.data());
        if (groupId) voidGroups.add(groupId);
      }
    }
    // O worker apaga o pagamento no Asaas e reagrupa o que ainda estiver em aberto no grupo.
    for (const groupId of voidGroups) requestGroupVoid(tx, db, groupId, "enrollment_canceled");

    // Mês da volta: proporcional a partir de hoje; cobrança que já existe (aberta, paga) fica.
    const resumeCharge = resumeChargeSnap && !resumeChargeSnap.exists ?
      proratedMonthCharge(enrollmentId, plan, slots.map((s) => Number(s["weekday"])), todayKey) :
      null;
    if (resumeCharge) {
      const groupId = parseBillingMode(data["billingMode"]) === "asaas" ? resumeGroupId(enrollmentId, resumeMonth) : null;
      tx.set(db.collection(ARENA_CLASS_CHARGES).doc(resumeCharge.id), openChargeData(enrollmentId, {
        arenaId: data["arenaId"],
        studentId: data["studentId"],
        athleteId: data["athleteId"],
        name: data["name"],
        phone: data["phone"],
        paymentMethod: data["paymentMethod"],
      }, resumeCharge, groupId));
      if (groupId) {
        tx.set(db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(groupId), classAsaasGroupData({
          arenaId: String(data["arenaId"] ?? ""), enrollmentId, studentId,
          athleteId: typeof data["athleteId"] === "string" ? data["athleteId"] : null, name: String(data["name"] ?? ""),
        }, [resumeCharge]));
      }
    }
    tx.set(ref, {
      status,
      ...(status === "canceled" ? {canceledAt: FieldValue.serverTimestamp()} : {}),
      ...(status === "paused" ? {pausedAt: FieldValue.serverTimestamp()} : {}),
      ...(resumesBilling ? {billedThrough: resumeMonth} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {status, canceledCharges};
  });
}

/** Grupo Asaas ainda vivo de uma mensalidade online (null = manual ou já resolvido). */
export function liveGroupIdOf(charge: Record<string, unknown>): string | null {
  if (parseBillingMode(charge["billingMode"]) !== "asaas") return null;
  const asaas = (charge["asaas"] ?? {}) as Record<string, unknown>;
  const groupId = typeof asaas["groupId"] === "string" ? asaas["groupId"] : "";
  const state = String(asaas["state"] ?? "") as ClassAsaasState;
  return groupId && LIVE_ASAAS_STATES.includes(state) ? groupId : null;
}

/** Pede ao worker que apague o pagamento do grupo no Asaas (fora da transação) e reagrupe o resto. */
export function requestGroupVoid(tx: Transaction, db: Firestore, groupId: string, reason: string): void {
  tx.set(db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(groupId), {
    state: "voiding" as const,
    voidReason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

export const setArenaClassEnrollmentStatus = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const enrollmentId = str(input["enrollmentId"]);
  const status = str(input["status"]);
  if (!enrollmentId) throw new HttpsError("invalid-argument", "Matrícula inválida.");
  if (status !== "active" && status !== "paused" && status !== "canceled") {
    throw new HttpsError("invalid-argument", "Status inválido.");
  }
  const db = getFirestore();
  const snap = await db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Matrícula não encontrada.");
  await requireClassManager(db, String(snap.data()?.["arenaId"] ?? ""), uid);
  return setEnrollmentStatusCore(db, enrollmentId, status, dayKeyFromEventDate(new Date()));
});

// ---------------------------------------------------------------------------
// Mensalidades: baixa manual
// ---------------------------------------------------------------------------

export const setArenaClassChargeStatus = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const chargeId = str(input["chargeId"]);
  const status = str(input["status"]);
  if (!chargeId) throw new HttpsError("invalid-argument", "Cobrança inválida.");
  if (status !== "paid" && status !== "open" && status !== "canceled") {
    throw new HttpsError("invalid-argument", "Status inválido.");
  }
  const db = getFirestore();
  const snap = await db.collection(ARENA_CLASS_CHARGES).doc(chargeId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Cobrança não encontrada.");
  await requireClassManager(db, String(snap.data()?.["arenaId"] ?? ""), uid);
  return setChargeStatusCore(db, chargeId, {
    status,
    paymentMethod: str(input["paymentMethod"]) || null,
    paidOn: str(input["paidOn"]) || null,
    actorUid: uid,
  }, dayKeyFromEventDate(new Date()));
});

/**
 * Baixa manual, desfazer ou cancelar uma mensalidade. Mensalidade online: a baixa manual (ou o
 * cancelamento) manda apagar o pagamento do Asaas — o worker reagrupa o que sobrar em aberto no
 * grupo; desfazer gera um link novo; pago online não se desfaz por aqui (é estorno).
 */
export async function setChargeStatusCore(
  db: Firestore,
  chargeId: string,
  input: {status: "paid" | "open" | "canceled"; paymentMethod: string | null; paidOn: string | null; actorUid: string},
  todayKey: string,
): Promise<{chargeId: string; status: string}> {
  const ref = db.collection(ARENA_CLASS_CHARGES).doc(chargeId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Cobrança não encontrada.");
    const data = snap.data() as Record<string, unknown>;
    if (data["paidVia"] === "asaas" && input.status !== "paid") {
      throw new HttpsError("failed-precondition", "Pago online pelo Asaas — para devolver, faça o estorno.");
    }
    const online = parseBillingMode(data["billingMode"]) === "asaas";
    const liveGroup = liveGroupIdOf(data);

    if (input.status === "paid") {
      const method = input.paymentMethod || String(data["paymentMethod"] ?? "pix");
      if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
        throw new HttpsError("invalid-argument", "Forma de pagamento inválida.");
      }
      const paidOn = input.paidOn || todayKey;
      if (!isValidDateKey(paidOn) || paidOn > todayKey) throw new HttpsError("invalid-argument", "Data do pagamento inválida.");
      if (data["status"] === "paid") return {chargeId, status: "paid"};
      if (liveGroup) requestGroupVoid(tx, db, liveGroup, "paid_manually");
      tx.set(ref, {
        status: "paid", paidOn, paidAt: FieldValue.serverTimestamp(), paymentMethod: method, paidVia: "manual",
        registeredByUid: input.actorUid,
        ...(liveGroup ? {asaas: {...(data["asaas"] as Record<string, unknown>), state: "void"}} : {}),
      }, {merge: true});
      return {chargeId, status: "paid"};
    }

    if (input.status === "canceled") {
      if (liveGroup) requestGroupVoid(tx, db, liveGroup, "charge_canceled");
      tx.set(ref, {
        status: "canceled", canceledAt: FieldValue.serverTimestamp(), registeredByUid: input.actorUid,
        ...(liveGroup ? {asaas: {...(data["asaas"] as Record<string, unknown>), state: "void"}} : {}),
      }, {merge: true});
      return {chargeId, status: "canceled"};
    }

    // Desfazer (volta a "em aberto"): online ganha um link novo, num grupo só dela.
    const reopenGroupId = online && !liveGroup ? `${chargeId}_r${Date.now().toString(36)}` : null;
    tx.set(ref, {
      status: "open", paidOn: null, paidAt: null, paidVia: null, registeredByUid: input.actorUid,
      ...(reopenGroupId ? {asaas: chargeAsaasMirror(reopenGroupId, "pending")} : {}),
    }, {merge: true});
    if (reopenGroupId) {
      tx.set(db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(reopenGroupId), classAsaasGroupData({
        arenaId: String(data["arenaId"] ?? ""), enrollmentId: String(data["enrollmentId"] ?? ""),
        studentId: String(data["studentId"] ?? ""),
        athleteId: typeof data["athleteId"] === "string" ? data["athleteId"] : null, name: String(data["name"] ?? ""),
      }, [{
        id: chargeId, description: String(data["description"] ?? "Mensalidade"),
        amountReais: Number(data["amountReais"] ?? 0), dueDate: String(data["dueDate"] ?? todayKey),
      }]));
    }
    return {chargeId, status: "open"};
  });
}

// ---------------------------------------------------------------------------
// Agendador: mensal do mês, créditos e pacotes vencidos
// ---------------------------------------------------------------------------

/** Mensalidades que já devem existir hoje (mês corrente e, a 10 dias do vencimento, o próximo). */
export function monthsToBill(billedThrough: string | null, startDate: string, dueDay: number, todayKey: string): string[] {
  const current = monthKeyOf(todayKey);
  const next = nextMonthKey(current);
  const target = addDaysToDateKey(todayKey, 10) >= dueDateFor(next, dueDay) ? next : current;
  const out: string[] = [];
  let m = billedThrough ? nextMonthKey(billedThrough) : monthKeyOf(startDate);
  while (m <= target && out.length < 24) {
    out.push(m);
    m = nextMonthKey(m);
  }
  return out;
}

export async function runMonthlyBilling(db: Firestore, todayKey: string): Promise<{charges: number; ended: number; expiredCredits: number}> {
  let charges = 0;
  let ended = 0;
  const enrollments = await db.collection(ARENA_CLASS_ENROLLMENTS).where("status", "==", "active").get();
  for (const doc of enrollments.docs) {
    const data = doc.data() as Record<string, unknown>;
    const plan = (data["plan"] ?? {}) as Record<string, unknown>;
    if (plan["kind"] === "monthly") {
      const dueDay = Number(data["dueDay"] ?? 5);
      const months = monthsToBill(
        typeof data["billedThrough"] === "string" ? data["billedThrough"] : null,
        String(data["startDate"] ?? todayKey), dueDay, todayKey,
      );
      for (const month of months) {
        const chargeId = `${doc.id}_${month}`;
        const ref = db.collection(ARENA_CLASS_CHARGES).doc(chargeId);
        if (!(await ref.get()).exists) {
          // Online: a mensalidade é o próprio grupo; o Asaas é chamado pelo worker, não aqui.
          const groupId = parseBillingMode(data["billingMode"]) === "asaas" ? chargeId : null;
          const charge: PlannedCharge = {
            id: chargeId,
            description: `${String(plan["name"] ?? "Mensalidade")} · ${monthLabelPt(month)}`,
            period: month,
            amountReais: Number(plan["priceReais"] ?? 0),
            dueDate: dueDateFor(month, dueDay),
          };
          const batch = db.batch();
          batch.set(ref, openChargeData(doc.id, {
            arenaId: data["arenaId"], studentId: data["studentId"], athleteId: data["athleteId"],
            name: data["name"], phone: data["phone"], paymentMethod: data["paymentMethod"],
          }, charge, groupId));
          if (groupId) {
            batch.set(db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(groupId), classAsaasGroupData({
              arenaId: String(data["arenaId"] ?? ""), enrollmentId: doc.id, studentId: String(data["studentId"] ?? ""),
              athleteId: typeof data["athleteId"] === "string" ? data["athleteId"] : null, name: String(data["name"] ?? ""),
            }, [charge]));
          }
          await batch.commit();
          charges += 1;
        }
        await doc.ref.set({billedThrough: month}, {merge: true});
      }
    } else if (plan["kind"] === "package") {
      const left = Number(data["creditsLeft"] ?? 0);
      const expiresOn = typeof data["expiresOn"] === "string" ? data["expiresOn"] : null;
      if (left <= 0 || (expiresOn != null && expiresOn < todayKey)) {
        // Pacote acabou: sai das turmas e libera a vaga.
        await setEnrollmentStatusCore(db, doc.id, "canceled", todayKey);
        await doc.ref.set({status: "ended", endedReason: left <= 0 ? "credits_used" : "expired"}, {merge: true});
        ended += 1;
      }
    }
  }
  const credits = await db.collection(ARENA_CLASS_CREDITS)
    .where("status", "==", "available")
    .where("expiresOn", "<", todayKey)
    .get();
  for (const doc of credits.docs) {
    await doc.ref.set({status: "expired", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  }
  return {charges, ended, expiredCredits: credits.size};
}

export const generateArenaClassMonthlyCharges = onSchedule({
  schedule: "every day 04:00",
  timeZone: "America/Sao_Paulo",
}, async () => {
  const result = await runMonthlyBilling(getFirestore(), dayKeyFromEventDate(new Date()));
  logger.info("generateArenaClassMonthlyCharges", result);
});
