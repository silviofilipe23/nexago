/**
 * Efeitos da chamada e do cancelamento sobre o que o aluno tem a haver (fase 2):
 * crédito de reposição (falta justificada, aula cancelada pela arena) e débito de pacote.
 * Não importa `arena-class.ts` (que importa este módulo) — só constantes e helpers puros.
 */

import {FieldValue, type Firestore, type Transaction} from "firebase-admin/firestore";
import {addDaysToDateKey, isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {
  ARENA_CLASSES,
  ARENA_CLASS_CREDITS,
  ARENA_CLASS_ENROLLMENTS,
  CLASS_RULES_DOC,
  CLASS_SETTINGS,
  CLASS_STUDENTS,
  DEFAULT_CLASS_RULES,
  makeupCreditId,
  type AttendanceMark,
  type ClassRules,
} from "./arena-class-constants";

export function parseClassRules(data: Record<string, unknown> | undefined): ClassRules {
  const d = data ?? {};
  const int = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
  const bool = (v: unknown, fallback: boolean) => typeof v === "boolean" ? v : fallback;
  return {
    makeupValidityDays: int(d["makeupValidityDays"], DEFAULT_CLASS_RULES.makeupValidityDays, 1, 365),
    excusedGeneratesCredit: bool(d["excusedGeneratesCredit"], DEFAULT_CLASS_RULES.excusedGeneratesCredit),
    arenaCancelGeneratesCredit: bool(d["arenaCancelGeneratesCredit"], DEFAULT_CLASS_RULES.arenaCancelGeneratesCredit),
    defaultDueDay: int(d["defaultDueDay"], DEFAULT_CLASS_RULES.defaultDueDay, 1, 28),
    enrollmentFeeReais: typeof d["enrollmentFeeReais"] === "number" && d["enrollmentFeeReais"] >= 0 ?
      Math.round(d["enrollmentFeeReais"] * 100) / 100 :
      DEFAULT_CLASS_RULES.enrollmentFeeReais,
    classReminderEnabled: bool(d["classReminderEnabled"], DEFAULT_CLASS_RULES.classReminderEnabled),
    onlineBillingEnabled: bool(d["onlineBillingEnabled"], DEFAULT_CLASS_RULES.onlineBillingEnabled),
  };
}

export function classRulesRef(db: Firestore, arenaId: string) {
  return db.collection("arenas").doc(arenaId).collection(CLASS_SETTINGS).doc(CLASS_RULES_DOC);
}

export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Aluno da turma conta naquele dia da semana? (`weekdays` ausente = todos — fase 1). */
export function studentAttendsWeekday(data: Record<string, unknown>, weekday: number): boolean {
  const w = data["weekdays"];
  return !Array.isArray(w) || w.length === 0 || (w as unknown[]).map(Number).includes(weekday);
}

export interface CloseContext {
  arenaId: string;
  classId: string;
  sessionId: string;
  date: string;
  /** Chamada como fica depois desta gravação (studentId → marca). */
  attendance: Record<string, AttendanceMark>;
  /** Encaixes da aula — não são aluno da turma (sem débito de pacote nem crédito novo). */
  extraIds: ReadonlySet<string>;
  /** Quem já teve o pacote debitado nesta aula. */
  packageDebits: Record<string, string>;
}

export interface CloseEffects {
  debited: string[];
  credited: string[];
  apply: (tx: Transaction) => void;
}

/**
 * Lê (dentro da transação da chamada) o necessário para fechar a aula e devolve as escritas:
 * - pacote: presente ou falta sem aviso consome 1 crédito, uma vez por aula;
 * - falta justificada: gera crédito de reposição, respeitando as reposições/mês do plano mensal.
 * Todas as leituras acontecem aqui; `apply` só escreve (exigência do Firestore).
 */
export async function readCloseEffects(
  tx: Transaction,
  db: Firestore,
  ctx: CloseContext,
): Promise<CloseEffects> {
  const rules = parseClassRules((await tx.get(classRulesRef(db, ctx.arenaId))).data());
  const studentsCol = db.collection(ARENA_CLASSES).doc(ctx.classId).collection(CLASS_STUDENTS);
  const month = monthKeyOf(ctx.date);

  const writes: Array<(tx: Transaction) => void> = [];
  const debited: string[] = [];
  const credited: string[] = [];
  const enrollmentCache = new Map<string, Record<string, unknown> | null>();
  const creditsThisMonth = new Map<string, number>();

  for (const [studentId, mark] of Object.entries(ctx.attendance)) {
    if (ctx.extraIds.has(studentId)) continue;
    const studentSnap = await tx.get(studentsCol.doc(studentId));
    if (!studentSnap.exists) continue;
    const student = studentSnap.data() as Record<string, unknown>;
    const enrollmentId = typeof student["enrollmentId"] === "string" ? student["enrollmentId"] : null;

    let enrollment: Record<string, unknown> | null = null;
    if (enrollmentId) {
      if (!enrollmentCache.has(enrollmentId)) {
        const snap = await tx.get(db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId));
        enrollmentCache.set(enrollmentId, snap.exists ? snap.data() as Record<string, unknown> : null);
      }
      enrollment = enrollmentCache.get(enrollmentId) ?? null;
    }
    const plan = (enrollment?.["plan"] ?? {}) as Record<string, unknown>;

    // Débito de pacote.
    if (enrollmentId && enrollment && plan["kind"] === "package" &&
      (mark === "present" || mark === "absent") && !ctx.packageDebits[studentId]) {
      const left = Number(enrollment["creditsLeft"] ?? 0);
      if (left > 0) {
        enrollment["creditsLeft"] = left - 1;
        const ref = db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId);
        const nextLeft = left - 1;
        writes.push((t) => t.set(ref, {creditsLeft: nextLeft, updatedAt: FieldValue.serverTimestamp()}, {merge: true}));
        debited.push(studentId);
      }
    }

    // Crédito de reposição por falta justificada.
    if (mark === "excused" && rules.excusedGeneratesCredit) {
      const creditRef = db.collection(ARENA_CLASS_CREDITS).doc(makeupCreditId(ctx.sessionId, studentId));
      if ((await tx.get(creditRef)).exists) continue;
      const limit = plan["kind"] === "monthly" ? Number(plan["makeupsPerMonth"] ?? 0) : null;
      if (enrollmentId && limit != null) {
        if (!creditsThisMonth.has(enrollmentId)) {
          const used = await tx.get(db.collection(ARENA_CLASS_CREDITS)
            .where("enrollmentId", "==", enrollmentId)
            .where("month", "==", month));
          creditsThisMonth.set(enrollmentId, used.size);
        }
        const count = creditsThisMonth.get(enrollmentId) ?? 0;
        if (count >= limit) continue;
        creditsThisMonth.set(enrollmentId, count + 1);
      }
      const credit = {
        arenaId: ctx.arenaId,
        studentId,
        athleteId: typeof student["athleteId"] === "string" ? student["athleteId"] : null,
        name: String(student["name"] ?? "Aluno"),
        enrollmentId,
        classId: ctx.classId,
        reason: "excused",
        sourceSessionId: ctx.sessionId,
        sourceDate: ctx.date,
        month,
        status: "available",
        expiresOn: addDaysToDateKey(ctx.date, rules.makeupValidityDays),
        usedSessionId: null,
        createdAt: FieldValue.serverTimestamp(),
      };
      writes.push((t) => t.set(creditRef, credit));
      credited.push(studentId);
    }
  }

  return {debited, credited, apply: (t) => writes.forEach((w) => w(t))};
}

/**
 * Aula cancelada pela arena: crédito para quem faria aquela aula (alunos ativos do dia) e
 * devolve o crédito de quem estava encaixado como reposição. Idempotente.
 */
export async function grantCanceledSessionCredits(
  db: Firestore,
  session: {arenaId: string; classId: string; date: string},
  sessionId: string,
  extras: Record<string, {kind?: unknown; creditId?: unknown}>,
  generate: boolean,
): Promise<number> {
  const rules = parseClassRules((await classRulesRef(db, session.arenaId).get()).data());
  // Reposição marcada numa aula que não acontece volta a ficar disponível.
  for (const extra of Object.values(extras)) {
    if (extra.kind !== "makeup" || typeof extra.creditId !== "string") continue;
    await db.collection(ARENA_CLASS_CREDITS).doc(extra.creditId).set({
      status: "available", usedSessionId: null, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }
  if (!generate) return 0;

  const weekday = isoWeekdayOfDateKey(session.date);
  const students = await db.collection(ARENA_CLASSES).doc(session.classId)
    .collection(CLASS_STUDENTS).where("status", "==", "active").get();
  let granted = 0;
  for (const doc of students.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (!studentAttendsWeekday(data, weekday)) continue;
    const ref = db.collection(ARENA_CLASS_CREDITS).doc(makeupCreditId(sessionId, doc.id));
    if ((await ref.get()).exists) continue;
    await ref.set({
      arenaId: session.arenaId,
      studentId: doc.id,
      athleteId: typeof data["athleteId"] === "string" ? data["athleteId"] : null,
      name: String(data["name"] ?? "Aluno"),
      enrollmentId: typeof data["enrollmentId"] === "string" ? data["enrollmentId"] : null,
      classId: session.classId,
      reason: "arena_canceled",
      sourceSessionId: sessionId,
      sourceDate: session.date,
      month: monthKeyOf(session.date),
      status: "available",
      expiresOn: addDaysToDateKey(session.date, rules.makeupValidityDays),
      usedSessionId: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    granted += 1;
  }
  return granted;
}
