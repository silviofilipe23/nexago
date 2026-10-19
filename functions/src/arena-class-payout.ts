/**
 * Aulas — fase 2b: repasse do professor. Pagamento manual, direto da arena ao professor: nenhum
 * dinheiro passa pela plataforma.
 *
 * A conta do mês vive só aqui (a prévia da tela e o fechamento usam a mesma função):
 * - aulas dadas = `arenaClassSessions` `completed` do professor no mês (chamada fechada);
 * - presenças = marcas `present` dessas aulas (encaixe incluso — o professor deu a aula);
 * - receita = mensalidades e pacotes pagos no mês (`paidOn`), sem a taxa de matrícula (fica com a
 *   arena), rateados pelos horários da matrícula: cada horário vale a mesma fração e vai para o
 *   professor atual da turma daquele horário.
 * O fechamento grava um retrato em `arenaClassPayouts/{arena}_{professor}_{mês}`; o gestor
 * registra o pagamento feito por fora (forma e data) e pode desfazer. Recalcular só antes de pagar.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, type Firestore, type Transaction} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {dayKeyFromEventDate} from "./event-timezone";
import {isValidDateKey} from "./arena-recurring-booking";
import {
  ARENA_CLASSES,
  ARENA_CLASS_CHARGES,
  ARENA_CLASS_ENROLLMENTS,
  ARENA_CLASS_PAYOUTS,
  ARENA_CLASS_SESSIONS,
  CLASS_TEACHERS,
  classPayoutId,
  type ArenaClassType,
} from "./arena-class-constants";
import {monthKeyOf} from "./arena-class-ledger";
import {
  TYPE_LABEL_PT,
  WEEKDAY_SHORT_PT,
  parseArenaClass,
  parseClassSession,
  requireUid,
  str,
} from "./arena-class";
import {
  PAYOUT_METHODS,
  parseTeacherPayoutModel,
  requireClassPayoutManager,
  requireClassPayoutReader,
  type PayoutMethod,
  type TeacherPayoutModel,
} from "./arena-class-payout-model";
import {CLIENT_FACING_REGIONS} from "./function-regions";

// ---------------------------------------------------------------------------
// Entradas e saída do cálculo
// ---------------------------------------------------------------------------

export interface PayoutTeacherInfo {
  id: string;
  name: string;
  color: string;
  userId: string | null;
  status: string;
  payout: TeacherPayoutModel | null;
}

export interface PayoutClassInfo {
  name: string;
  type: ArenaClassType;
  weekdays: number[];
  teacherId: string;
  teacherName: string;
  teacherColor: string;
}

export interface PayoutSessionInfo {
  classId: string;
  type: ArenaClassType;
  teacherId: string;
  teacherName: string;
  teacherColor: string;
  date: string;
  status: string;
  presentIds: string[];
}

export interface PayoutChargeInfo {
  id: string;
  enrollmentId: string;
  studentId: string;
  amountReais: number;
}

export interface PayoutInputs {
  month: string;
  todayKey: string;
  teachers: PayoutTeacherInfo[];
  classes: Map<string, PayoutClassInfo>;
  sessions: PayoutSessionInfo[];
  /** Pagas no mês (`paidOn`). */
  charges: PayoutChargeInfo[];
  /** Matrículas das cobranças — só os horários interessam. */
  enrollments: Map<string, {slots: Array<{classId: string; teacherId: string}>}>;
}

/** Uma linha da composição: turma recorrente, ou as avulsas do mesmo tipo juntas. */
export interface PayoutLine {
  key: string;
  label: string;
  detail: string;
  classes: number;
  presences: number;
  payingStudents: number;
  revenueReais: number;
  amountReais: number;
}

export interface TeacherPayout {
  teacherId: string;
  teacherName: string;
  teacherColor: string;
  teacherUserId: string | null;
  teacherStatus: string;
  model: TeacherPayoutModel | null;
  classesGiven: number;
  presences: number;
  /** Alunos distintos presentes nas aulas do professor no mês. */
  students: number;
  /** Aulas do mês até hoje com a chamada aberta — não entram no repasse. */
  pendingSessions: number;
  canceledSessions: number;
  revenueReais: number;
  amountReais: number;
  lines: PayoutLine[];
}

export interface ArenaPayoutSummary {
  month: string;
  /** Receita de aulas paga no mês, sem taxa de matrícula. */
  revenueReais: number;
  feesReais: number;
  /** Receita de matrícula sem horário (não entra em repasse). */
  unassignedReais: number;
  teachers: TeacherPayout[];
}

// ---------------------------------------------------------------------------
// Cálculo (puro)
// ---------------------------------------------------------------------------

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonthKey(month: string): boolean {
  return MONTH_KEY.test(month);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const AVULSA_LABEL_PT: Record<ArenaClassType, string> = {
  turma: "Turmas avulsas",
  particular: "Particulares",
  dupla: "Duplas",
  experimental: "Experimentais",
};

/** A matrícula da cobrança é taxa de matrícula? (id `{matrícula}_fee`, ver `firstCharges`). */
export function isEnrollmentFeeCharge(charge: Pick<PayoutChargeInfo, "id" | "enrollmentId">): boolean {
  return charge.id === `${charge.enrollmentId}_fee`;
}

export function payoutLineAmount(
  model: TeacherPayoutModel,
  line: Pick<PayoutLine, "revenueReais" | "classes" | "presences">,
): number {
  if (model.model === "revenue_share") return round2(line.revenueReais * (model.percent ?? 0) / 100);
  if (model.model === "per_class") return round2(line.classes * (model.amountReais ?? 0));
  return round2(line.presences * (model.amountReais ?? 0));
}

interface LineAcc {
  key: string;
  label: string;
  detail: string;
  recurring: boolean;
  classes: number;
  presences: number;
  payingStudents: Set<string>;
  revenueCents: number;
}

interface TeacherAcc {
  info: PayoutTeacherInfo;
  lines: Map<string, LineAcc>;
  students: Set<string>;
  pendingSessions: number;
  canceledSessions: number;
}

export function computeTeacherPayouts(inputs: PayoutInputs): ArenaPayoutSummary {
  const teachers = new Map<string, TeacherAcc>();
  for (const t of inputs.teachers) {
    teachers.set(t.id, {info: t, lines: new Map(), students: new Set(), pendingSessions: 0, canceledSessions: 0});
  }
  // Professor sem doc (nunca deveria acontecer — professor só arquiva): aparece sem modelo.
  const teacherAcc = (id: string, name: string, color: string): TeacherAcc => {
    let acc = teachers.get(id);
    if (!acc) {
      acc = {
        info: {id, name, color, userId: null, status: "archived", payout: null},
        lines: new Map(), students: new Set(), pendingSessions: 0, canceledSessions: 0,
      };
      teachers.set(id, acc);
    }
    return acc;
  };
  const lineAcc = (acc: TeacherAcc, classId: string, type: ArenaClassType): LineAcc => {
    const cls = inputs.classes.get(classId);
    const recurring = cls != null && cls.weekdays.length > 0;
    const lineType = cls?.type ?? type;
    const key = recurring ? classId : `avulsa:${lineType}`;
    let line = acc.lines.get(key);
    if (!line) {
      line = {
        key,
        label: recurring ? cls.name : AVULSA_LABEL_PT[lineType],
        detail: recurring ?
          `${TYPE_LABEL_PT[lineType]} · ${cls.weekdays.map((d) => WEEKDAY_SHORT_PT[d] ?? "?").join("/")}` :
          "Aulas avulsas",
        recurring,
        classes: 0,
        presences: 0,
        payingStudents: new Set(),
        revenueCents: 0,
      };
      acc.lines.set(key, line);
    }
    return line;
  };

  for (const s of inputs.sessions) {
    if (!s.teacherId || !s.date.startsWith(inputs.month)) continue;
    const acc = teacherAcc(s.teacherId, s.teacherName, s.teacherColor);
    if (s.status === "canceled") {
      acc.canceledSessions += 1;
      continue;
    }
    if (s.status !== "completed") {
      if (s.date <= inputs.todayKey) acc.pendingSessions += 1;
      continue;
    }
    const line = lineAcc(acc, s.classId, s.type);
    line.classes += 1;
    line.presences += s.presentIds.length;
    for (const id of s.presentIds) acc.students.add(id);
  }

  let revenueCents = 0;
  let feesCents = 0;
  let unassignedCents = 0;
  for (const c of inputs.charges) {
    const cents = Math.round(c.amountReais * 100);
    if (isEnrollmentFeeCharge(c)) {
      feesCents += cents;
      continue;
    }
    revenueCents += cents;
    const slots = inputs.enrollments.get(c.enrollmentId)?.slots ?? [];
    if (slots.length === 0) {
      unassignedCents += cents;
      continue;
    }
    // Centavos inteiros por horário; a sobra vai para os primeiros (não perde nem cria dinheiro).
    const base = Math.floor(cents / slots.length);
    const extra = cents - base * slots.length;
    for (const [i, slot] of slots.entries()) {
      const share = base + (i < extra ? 1 : 0);
      const cls = inputs.classes.get(slot.classId);
      const teacherId = cls?.teacherId || slot.teacherId;
      if (!teacherId) {
        unassignedCents += share;
        continue;
      }
      const acc = teacherAcc(teacherId, cls?.teacherName ?? "Professor", cls?.teacherColor ?? "#FF6A1A");
      const line = lineAcc(acc, slot.classId, cls?.type ?? "turma");
      line.revenueCents += share;
      line.payingStudents.add(c.studentId);
    }
  }

  const out: TeacherPayout[] = [];
  for (const acc of teachers.values()) {
    const active = acc.info.status === "active";
    if (!active && acc.lines.size === 0 && acc.pendingSessions === 0) continue;
    const model = acc.info.payout;
    const lines: PayoutLine[] = [...acc.lines.values()]
      .sort((a, b) => (a.recurring === b.recurring ? a.label.localeCompare(b.label, "pt-BR") : a.recurring ? -1 : 1))
      .map((l) => {
        const revenueReais = l.revenueCents / 100;
        const base = {revenueReais, classes: l.classes, presences: l.presences};
        return {
          key: l.key,
          label: l.label,
          detail: l.detail,
          classes: l.classes,
          presences: l.presences,
          payingStudents: l.payingStudents.size,
          revenueReais,
          amountReais: model ? payoutLineAmount(model, base) : 0,
        };
      });
    out.push({
      teacherId: acc.info.id,
      teacherName: acc.info.name,
      teacherColor: acc.info.color,
      teacherUserId: acc.info.userId,
      teacherStatus: acc.info.status,
      model,
      classesGiven: lines.reduce((s, l) => s + l.classes, 0),
      presences: lines.reduce((s, l) => s + l.presences, 0),
      students: acc.students.size,
      pendingSessions: acc.pendingSessions,
      canceledSessions: acc.canceledSessions,
      // Soma das linhas arredondadas: a composição da tela fecha com o total.
      revenueReais: round2(lines.reduce((s, l) => s + l.revenueReais, 0)),
      amountReais: round2(lines.reduce((s, l) => s + l.amountReais, 0)),
      lines,
    });
  }
  out.sort((a, b) => a.teacherName.localeCompare(b.teacherName, "pt-BR"));

  return {
    month: inputs.month,
    revenueReais: revenueCents / 100,
    feesReais: feesCents / 100,
    unassignedReais: unassignedCents / 100,
    teachers: out,
  };
}

// ---------------------------------------------------------------------------
// Leitura do mês
// ---------------------------------------------------------------------------

const GET_ALL_CHUNK = 100;

export async function loadPayoutInputs(
  db: Firestore,
  arenaId: string,
  month: string,
  todayKey: string,
): Promise<PayoutInputs> {
  const from = `${month}-01`;
  const to = `${month}-31`;
  const [teachersSnap, classesSnap, sessionsSnap, chargesSnap] = await Promise.all([
    db.collection("arenas").doc(arenaId).collection(CLASS_TEACHERS).get(),
    db.collection(ARENA_CLASSES).where("arenaId", "==", arenaId).get(),
    db.collection(ARENA_CLASS_SESSIONS)
      .where("arenaId", "==", arenaId)
      .where("date", ">=", from)
      .where("date", "<=", to)
      .get(),
    db.collection(ARENA_CLASS_CHARGES)
      .where("arenaId", "==", arenaId)
      .where("status", "==", "paid")
      .where("paidOn", ">=", from)
      .where("paidOn", "<=", to)
      .get(),
  ]);

  const teachers: PayoutTeacherInfo[] = teachersSnap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      name: typeof d["name"] === "string" ? d["name"] : "Professor",
      color: typeof d["color"] === "string" ? d["color"] : "#FF6A1A",
      userId: typeof d["userId"] === "string" && d["userId"] ? d["userId"] : null,
      status: d["status"] === "archived" ? "archived" : "active",
      payout: parseTeacherPayoutModel(d["payout"]),
    };
  });

  const classes = new Map<string, PayoutClassInfo>();
  for (const doc of classesSnap.docs) {
    const cls = parseArenaClass(doc.data() as Record<string, unknown>);
    classes.set(doc.id, {
      name: cls.name, type: cls.type, weekdays: cls.weekdays,
      teacherId: cls.teacherId, teacherName: cls.teacherName, teacherColor: cls.teacherColor,
    });
  }

  const sessions: PayoutSessionInfo[] = sessionsSnap.docs.map((doc) => {
    const raw = doc.data() as Record<string, unknown>;
    const s = parseClassSession(raw);
    const type = String(raw["type"] ?? "turma");
    return {
      classId: s.classId,
      type: (type in TYPE_LABEL_PT ? type : "turma") as ArenaClassType,
      teacherId: typeof raw["teacherId"] === "string" ? raw["teacherId"] : "",
      teacherName: typeof raw["teacherName"] === "string" ? raw["teacherName"] : "Professor",
      teacherColor: typeof raw["teacherColor"] === "string" ? raw["teacherColor"] : "#FF6A1A",
      date: s.date,
      status: s.status,
      presentIds: Object.entries(s.attendance).filter(([, a]) => a.mark === "present").map(([id]) => id),
    };
  });

  const charges: PayoutChargeInfo[] = chargesSnap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      enrollmentId: typeof d["enrollmentId"] === "string" ? d["enrollmentId"] : "",
      studentId: typeof d["studentId"] === "string" ? d["studentId"] : "",
      amountReais: typeof d["amountReais"] === "number" ? d["amountReais"] : 0,
    };
  });

  // Só as matrículas das cobranças pagas no mês (a coleção cresce com as canceladas).
  const enrollments: PayoutInputs["enrollments"] = new Map();
  const ids = [...new Set(charges.map((c) => c.enrollmentId).filter(Boolean))];
  for (let i = 0; i < ids.length; i += GET_ALL_CHUNK) {
    const refs = ids.slice(i, i + GET_ALL_CHUNK).map((id) => db.collection(ARENA_CLASS_ENROLLMENTS).doc(id));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists || snap.data()?.["arenaId"] !== arenaId) continue;
      const slots = Array.isArray(snap.data()?.["slots"]) ? snap.data()?.["slots"] as Array<Record<string, unknown>> : [];
      enrollments.set(snap.id, {
        slots: slots.map((s) => ({classId: String(s["classId"] ?? ""), teacherId: String(s["teacherId"] ?? "")})),
      });
    }
  }

  return {month, todayKey, teachers, classes, sessions, charges, enrollments};
}

// ---------------------------------------------------------------------------
// Fechamento e pagamento
// ---------------------------------------------------------------------------

export interface ClosePayoutInput {
  arenaId: string;
  teacherId: string;
  month: string;
  /** Ajuste manual (negativo desconta) — exige o motivo. */
  adjustmentReais: number;
  adjustmentNote: string | null;
}

export async function closeTeacherPayoutCore(
  db: Firestore,
  input: ClosePayoutInput,
  actorUid: string,
  todayKey: string,
): Promise<{payoutId: string; amountReais: number}> {
  if (!isValidMonthKey(input.month)) throw new HttpsError("invalid-argument", "Mês inválido.");
  if (input.month >= monthKeyOf(todayKey)) {
    throw new HttpsError(
      "failed-precondition",
      "O mês ainda não terminou — o fechamento abre no dia 1º do mês seguinte.",
    );
  }
  const teacherSnap = await db.collection("arenas").doc(input.arenaId).collection(CLASS_TEACHERS).doc(input.teacherId).get();
  if (!teacherSnap.exists) throw new HttpsError("not-found", "Professor não encontrado.");

  const summary = computeTeacherPayouts(await loadPayoutInputs(db, input.arenaId, input.month, todayKey));
  const t = summary.teachers.find((x) => x.teacherId === input.teacherId);
  if (!t) throw new HttpsError("failed-precondition", "Este professor não teve aula nem receita no mês.");
  if (!t.model) {
    throw new HttpsError(
      "failed-precondition",
      "Defina o modelo de repasse do professor em Aulas › Professores antes de fechar.",
    );
  }
  const adjustmentReais = round2(input.adjustmentReais);
  if (!Number.isFinite(adjustmentReais)) throw new HttpsError("invalid-argument", "Ajuste inválido.");
  const note = input.adjustmentNote?.trim().slice(0, 200) || null;
  if (adjustmentReais !== 0 && !note) {
    throw new HttpsError("invalid-argument", "Explique o ajuste (ex.: aula cancelada pelo professor).");
  }
  const amountReais = round2(t.amountReais + adjustmentReais);
  if (amountReais < 0) throw new HttpsError("invalid-argument", "O ajuste não pode deixar o repasse negativo.");

  const payoutId = classPayoutId(input.arenaId, input.teacherId, input.month);
  const ref = db.collection(ARENA_CLASS_PAYOUTS).doc(payoutId);
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.["status"] === "paid") {
      throw new HttpsError("failed-precondition", "Este repasse já foi pago — desfaça o pagamento para recalcular.");
    }
    tx.set(ref, {
      arenaId: input.arenaId,
      teacherId: t.teacherId,
      teacherUserId: t.teacherUserId,
      teacherName: t.teacherName,
      teacherColor: t.teacherColor,
      month: input.month,
      model: t.model,
      classesGiven: t.classesGiven,
      presences: t.presences,
      students: t.students,
      pendingSessions: t.pendingSessions,
      revenueReais: t.revenueReais,
      computedReais: t.amountReais,
      adjustmentReais,
      adjustmentNote: adjustmentReais !== 0 ? note : null,
      amountReais,
      lines: t.lines,
      status: "closed",
      closedAt: FieldValue.serverTimestamp(),
      closedByUid: actorUid,
      paidOn: null,
      paidAt: null,
      paymentMethod: null,
      paidByUid: null,
      createdAt: snap.exists ? snap.data()?.["createdAt"] ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return {payoutId, amountReais};
}

export interface SetPayoutStatusInput {
  status: "paid" | "closed";
  paymentMethod: string | null;
  paidOn: string | null;
}

/** Registra o pagamento feito por fora (forma e data) ou desfaz (volta a "fechado"). */
export async function setTeacherPayoutStatusCore(
  db: Firestore,
  payoutId: string,
  input: SetPayoutStatusInput,
  actorUid: string,
  todayKey: string,
): Promise<{payoutId: string; status: string}> {
  const ref = db.collection(ARENA_CLASS_PAYOUTS).doc(payoutId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Repasse não encontrado.");
    const current = String(snap.data()?.["status"] ?? "");
    if (input.status === "paid") {
      if (current === "paid") return {payoutId, status: current};
      const method = input.paymentMethod ?? "pix";
      if (!(PAYOUT_METHODS as readonly string[]).includes(method)) {
        throw new HttpsError("invalid-argument", "Forma de pagamento inválida.");
      }
      const paidOn = input.paidOn || todayKey;
      if (!isValidDateKey(paidOn) || paidOn > todayKey) {
        throw new HttpsError("invalid-argument", "Data do pagamento inválida.");
      }
      tx.set(ref, {
        status: "paid",
        paidOn,
        paidAt: FieldValue.serverTimestamp(),
        paymentMethod: method as PayoutMethod,
        paidByUid: actorUid,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {payoutId, status: "paid"};
    }
    if (current !== "paid") return {payoutId, status: current};
    tx.set(ref, {
      status: "closed",
      paidOn: null,
      paidAt: null,
      paymentMethod: null,
      paidByUid: null,
      undoneAt: FieldValue.serverTimestamp(),
      undoneByUid: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {payoutId, status: "closed"};
  });
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

function parseArenaMonth(input: Record<string, unknown>): {arenaId: string; month: string} {
  const arenaId = str(input["arenaId"]);
  const month = str(input["month"]);
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  if (!isValidMonthKey(month)) throw new HttpsError("invalid-argument", "Mês inválido.");
  return {arenaId, month};
}

/** Prévia do mês para todos os professores (o fechado de cada um vem do doc em `arenaClassPayouts`). */
export const previewArenaClassPayouts = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (request) => {
  const uid = requireUid(request.auth);
  const {arenaId, month} = parseArenaMonth((request.data ?? {}) as Record<string, unknown>);
  const db = getFirestore();
  await requireClassPayoutReader(db, arenaId, uid);
  return computeTeacherPayouts(await loadPayoutInputs(db, arenaId, month, dayKeyFromEventDate(new Date())));
});

export const closeArenaClassPayout = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const {arenaId, month} = parseArenaMonth(input);
  const teacherId = str(input["teacherId"]);
  if (!teacherId) throw new HttpsError("invalid-argument", "Professor é obrigatório.");
  const adjustment = input["adjustmentReais"] == null ? 0 : Number(input["adjustmentReais"]);
  const db = getFirestore();
  await requireClassPayoutManager(db, arenaId, uid);
  const result = await closeTeacherPayoutCore(db, {
    arenaId,
    teacherId,
    month,
    adjustmentReais: adjustment,
    adjustmentNote: str(input["adjustmentNote"]) || null,
  }, uid, dayKeyFromEventDate(new Date()));
  logger.info("closeArenaClassPayout", {arenaId, teacherId, month, ...result});
  return result;
});

export const setArenaClassPayoutStatus = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const payoutId = str(input["payoutId"]);
  const status = str(input["status"]);
  if (!payoutId) throw new HttpsError("invalid-argument", "Repasse inválido.");
  if (status !== "paid" && status !== "closed") throw new HttpsError("invalid-argument", "Status inválido.");
  const db = getFirestore();
  const snap = await db.collection(ARENA_CLASS_PAYOUTS).doc(payoutId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Repasse não encontrado.");
  await requireClassPayoutManager(db, String(snap.data()?.["arenaId"] ?? ""), uid);
  return setTeacherPayoutStatusCore(db, payoutId, {
    status,
    paymentMethod: str(input["paymentMethod"]) || null,
    paidOn: str(input["paidOn"]) || null,
  }, uid, dayKeyFromEventDate(new Date()));
});
