/**
 * Aulas da arena — turmas recorrentes e aulas avulsas (particular, dupla,
 * experimental) com professor, quadra e chamada. Constantes compartilhadas
 * entre callables, materializador e testes.
 */

export const ARENA_CLASSES = "arenaClasses";
export const ARENA_CLASS_SESSIONS = "arenaClassSessions";
/** Subcoleção de `arenaClasses/{classId}` — docId = uid do atleta ou id gerado (aluno sem conta). */
export const CLASS_STUDENTS = "classStudents";
/** Subcoleção de `arenas/{arenaId}` — professores cadastrados pela arena. */
export const CLASS_TEACHERS = "classTeachers";

/** Horizonte rolante de materialização (dias) — igual ao mensalista e ao clubinho. */
export const CLASS_HORIZON_DAYS = 35;

export const CLASS_TYPES = ["turma", "particular", "dupla", "experimental"] as const;
export type ArenaClassType = typeof CLASS_TYPES[number];

export const CLASS_LEVELS = ["iniciante", "intermediario", "avancado", "kids", "livre"] as const;
export type ArenaClassLevel = typeof CLASS_LEVELS[number];

export const ATTENDANCE_MARKS = ["present", "absent", "excused"] as const;
export type AttendanceMark = typeof ATTENDANCE_MARKS[number];

export const MAX_CLASS_CAPACITY = 40;
export const MAX_CLASS_DURATION_MINUTES = 4 * 60;

/** Uma aula por turma por dia — id determinístico garante idempotência. */
export function classSessionId(classId: string, dateKey: string): string {
  return `class_${classId.replace(/\//g, "_")}_${dateKey}`;
}

// ---------------------------------------------------------------------------
// Fase 2 — matrícula, mensalidades, reposição
// ---------------------------------------------------------------------------

export const ARENA_CLASS_ENROLLMENTS = "arenaClassEnrollments";
export const ARENA_CLASS_CHARGES = "arenaClassCharges";
export const ARENA_CLASS_CREDITS = "arenaClassCredits";
/** Subcoleções de `arenas/{arenaId}`. */
export const CLASS_PLANS = "classPlans";
export const CLASS_SETTINGS = "classSettings";
export const CLASS_RULES_DOC = "rules";
/** Subcoleção de `arenaClasses/{classId}`. */
export const CLASS_WAITLIST = "classWaitlist";

export const PLAN_KINDS = ["monthly", "package", "single"] as const;
export type ClassPlanKind = typeof PLAN_KINDS[number];

export const PAYMENT_METHODS = ["pix", "cash", "card_machine", "transfer"] as const;
export type ClassPaymentMethod = typeof PAYMENT_METHODS[number];

export interface ClassRules {
  /** Validade do crédito de reposição (dias a partir da aula perdida). */
  makeupValidityDays: number;
  /** Falta justificada na chamada fechada gera crédito. */
  excusedGeneratesCredit: boolean;
  /** Aula cancelada pela arena gera crédito para os alunos (padrão do sheet de cancelar). */
  arenaCancelGeneratesCredit: boolean;
  /** Dia de vencimento sugerido na matrícula (1–28). */
  defaultDueDay: number;
  /** Taxa de matrícula cobrada na primeira cobrança (0 = sem taxa). */
  enrollmentFeeReais: number;
  /** Push 2h antes da aula para alunos com conta e o professor. */
  classReminderEnabled: boolean;
}

export const DEFAULT_CLASS_RULES: ClassRules = {
  makeupValidityDays: 30,
  excusedGeneratesCredit: true,
  arenaCancelGeneratesCredit: true,
  defaultDueDay: 5,
  enrollmentFeeReais: 0,
  classReminderEnabled: true,
};

/** Crédito de reposição: um por aula perdida por aluno (idempotente). */
export function makeupCreditId(sessionId: string, studentId: string): string {
  return `${sessionId}_${studentId}`;
}

// ---------------------------------------------------------------------------
// Fase 2b — repasse do professor (pagamento manual, fora da plataforma)
// ---------------------------------------------------------------------------

/** Fechamento mensal por professor — id `{arenaId}_{teacherId}_{AAAA-MM}` (idempotente). */
export const ARENA_CLASS_PAYOUTS = "arenaClassPayouts";

export function classPayoutId(arenaId: string, teacherId: string, month: string): string {
  return `${arenaId}_${teacherId}_${month}`;
}
