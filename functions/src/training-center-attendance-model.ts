/**
 * Efeitos da chamada de uma aula do Centro de Treinamento — lógica pura (sem Firestore).
 *
 * A aula finalizada (`status: done`) vira, por aluno, um par de deltas:
 * - `credit`: crédito de PACOTE da matrícula (`enrollments.creditsLeft`) — presença ou falta não
 *   justificada (se o contrato diz que consome) gastam 1;
 * - `makeup`: crédito de REPOSIÇÃO do aluno (`students.makeupCredits`) — falta justificada de
 *   mensalista gera +1 (se o contrato diz que gera); aluno encaixado como reposição gasta 1.
 *
 * O servidor guarda o que já aplicou em `sessions.effectsApplied` e só aplica a DIFERENÇA entre o
 * desejado e o aplicado. Assim corrigir a chamada, reabrir ou finalizar de novo nunca cobra duas
 * vezes, e o gatilho que reescreve a aula não entra em laço.
 */

export type AttendanceMark = "present" | "excused" | "absent";

export interface EffectPolicies {
  unexcusedAbsenceConsumes: boolean;
  excusedAbsenceMakeup: boolean;
}

/** Matrícula que ocupa vaga na turma da aula (contrato congelado). */
export interface ClassEnrollment {
  id: string;
  studentId: string;
  planType: "monthly" | "class_pack";
  policies: EffectPolicies;
}

export interface StudentEffect {
  enrollmentId: string | null;
  credit: number;
  makeup: number;
}

export type EffectMap = Record<string, StudentEffect>;

export interface EffectInput {
  status: string;
  attendance: Record<string, AttendanceMark>;
  makeupStudentIds: string[];
  enrollments: ClassEnrollment[];
  /** Políticas do centro (vale para quem veio de reposição, sem contrato nesta turma). */
  centerPolicies: EffectPolicies;
}

function isMark(v: unknown): v is AttendanceMark {
  return v === "present" || v === "excused" || v === "absent";
}

export function desiredEffects(input: EffectInput): EffectMap {
  const out: EffectMap = {};
  if (input.status !== "done") {
    return out;
  }
  const byStudent = new Map(input.enrollments.map((e) => [e.studentId, e]));
  for (const [studentId, mark] of Object.entries(input.attendance)) {
    if (!isMark(mark)) continue;
    const enr = byStudent.get(studentId);
    let credit = 0;
    let makeup = 0;
    if (enr) {
      const consumes = mark === "present" || (mark === "absent" && enr.policies.unexcusedAbsenceConsumes);
      if (enr.planType === "class_pack" && consumes) credit = -1;
      if (enr.planType === "monthly" && mark === "excused" && enr.policies.excusedAbsenceMakeup) makeup = 1;
    } else if (input.makeupStudentIds.includes(studentId)) {
      const consumes = mark === "present" || (mark === "absent" && input.centerPolicies.unexcusedAbsenceConsumes);
      if (consumes) makeup = -1;
    }
    if (credit !== 0 || makeup !== 0) {
      out[studentId] = {enrollmentId: credit !== 0 ? enr!.id : null, credit, makeup};
    }
  }
  return out;
}

export interface EffectDelta {
  studentId: string;
  /** Matrícula cujo `creditsLeft` muda (null quando só reposição muda). */
  enrollmentId: string | null;
  credit: number;
  makeup: number;
}

/**
 * O que falta aplicar: desejado − aplicado, por aluno. Crédito de pacote é por matrícula, então se
 * a matrícula mudou (rara: aluno trocou de contrato) devolve na antiga e cobra na nova.
 */
export function effectDeltas(applied: EffectMap, desired: EffectMap): EffectDelta[] {
  const out: EffectDelta[] = [];
  const students = new Set([...Object.keys(applied), ...Object.keys(desired)]);
  for (const studentId of students) {
    const a = applied[studentId] ?? {enrollmentId: null, credit: 0, makeup: 0};
    const d = desired[studentId] ?? {enrollmentId: null, credit: 0, makeup: 0};
    const makeup = d.makeup - a.makeup;
    if (a.enrollmentId && d.enrollmentId && a.enrollmentId !== d.enrollmentId) {
      out.push({studentId, enrollmentId: a.enrollmentId, credit: -a.credit, makeup});
      out.push({studentId, enrollmentId: d.enrollmentId, credit: d.credit, makeup: 0});
      continue;
    }
    const credit = d.credit - a.credit;
    if (credit === 0 && makeup === 0) continue;
    out.push({studentId, enrollmentId: credit !== 0 ? (d.enrollmentId ?? a.enrollmentId) : null, credit, makeup});
  }
  return out.filter((x) => x.credit !== 0 || x.makeup !== 0);
}

/** Lê `effectsApplied` gravado (doc antigo ou malformado vira vazio). */
export function readEffectMap(raw: unknown): EffectMap {
  const out: EffectMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    out[k] = {
      enrollmentId: typeof e["enrollmentId"] === "string" ? e["enrollmentId"] : null,
      credit: typeof e["credit"] === "number" ? e["credit"] : 0,
      makeup: typeof e["makeup"] === "number" ? e["makeup"] : 0,
    };
  }
  return out;
}

export function readPolicies(raw: unknown): EffectPolicies {
  const p = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    unexcusedAbsenceConsumes: p["unexcusedAbsenceConsumes"] !== false,
    excusedAbsenceMakeup: p["excusedAbsenceMakeup"] !== false,
  };
}
