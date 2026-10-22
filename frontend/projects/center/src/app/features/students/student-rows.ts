import { addDays, formatDayKey } from '../../domain/dates';
import { holdsSeat, invoiceDisplayStatus } from '../../domain/enrollment';
import { attendanceRate, tallyAttendance } from '../../domain/metrics';
import type { AttendanceMark, ClassSession, Enrollment, Invoice, Student } from '../../domain/models';

/** Situação financeira resumida do aluno (protótipo CT_FIN: em dia / aguardando / atrasado). */
export type FinanceState = 'ok' | 'pending' | 'late';

export const FINANCE_LABEL: Record<FinanceState, [string, string]> = {
  ok: ['Em dia', 'green'],
  pending: ['Aguardando', 'yellow'],
  late: ['Atrasado', 'red'],
};

export interface FinanceSummary {
  state: FinanceState;
  note: string;
}

export interface StudentRow {
  student: Student;
  className: string;
  planName: string;
  freq: number | null;
  finance: FinanceSummary | null;
}

export type StudentFilter = 'all' | 'active' | 'invited' | 'pending' | 'minors' | 'credits';

/** Sem acento e minúsculo — busca "jose" acha "José". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Matrículas que ocupam vaga primeiro (são as que dizem a turma/plano "de agora"). */
function currentEnrollments(list: Enrollment[]): Enrollment[] {
  const seat = list.filter((e) => holdsSeat(e.status));
  return seat.length ? seat : list.filter((e) => e.status === 'waitlisted');
}

function joinNames(names: string[]): string {
  const uniq = [...new Set(names.filter(Boolean))];
  if (uniq.length === 0) {
    return '—';
  }
  return uniq.length === 1 ? uniq[0]! : `${uniq[0]} +${uniq.length - 1}`;
}

/**
 * Pior situação das cobranças do aluno: vencida/recusada/contestada = atrasado; pendente no prazo
 * = aguardando; só aprovadas = em dia. Canceladas e estornadas não contam.
 */
export function financeOf(invoices: Invoice[], today: string): FinanceSummary | null {
  const live = invoices.filter((i) => i.status !== 'cancelled' && i.status !== 'refunded');
  if (live.length === 0) {
    return null;
  }
  const byDue = [...live].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const late = byDue.find((i) => {
    const st = invoiceDisplayStatus(i, today);
    return st === 'late' || st === 'failed' || st === 'disputed';
  });
  if (late) {
    return { state: 'late', note: `Venceu ${formatDayKey(late.dueDate)}` };
  }
  const pending = byDue.find((i) => i.status === 'pending');
  if (pending) {
    return { state: 'pending', note: `Vence ${formatDayKey(pending.dueDate)}` };
  }
  return { state: 'ok', note: '' };
}

export function buildStudentRows(
  students: Student[],
  enrollments: Enrollment[],
  sessions: ClassSession[],
  invoices: Invoice[] | null,
  today: string,
): StudentRow[] {
  const enrBy = new Map<string, Enrollment[]>();
  for (const e of enrollments) {
    enrBy.set(e.studentId, [...(enrBy.get(e.studentId) ?? []), e]);
  }
  const invBy = new Map<string, Invoice[]>();
  for (const i of invoices ?? []) {
    if (i.studentId) {
      invBy.set(i.studentId, [...(invBy.get(i.studentId) ?? []), i]);
    }
  }
  return students.map((s) => {
    const cur = currentEnrollments(enrBy.get(s.id) ?? []);
    return {
      student: s,
      className: joinNames(cur.map((e) => e.className)),
      planName: joinNames(cur.map((e) => e.contract?.planName ?? '')),
      freq: attendanceRate(tallyAttendance(sessions, s.id)),
      finance: invoices ? financeOf(invBy.get(s.id) ?? [], today) : null,
    };
  });
}

export function matchesFilter(r: StudentRow, f: StudentFilter): boolean {
  switch (f) {
    case 'active':
      return r.student.status === 'active';
    case 'invited':
      return r.student.status === 'invited';
    case 'pending':
      return r.finance?.state === 'late';
    case 'minors':
      return r.student.isMinor;
    case 'credits':
      return r.student.makeupCredits > 0;
    default:
      return true;
  }
}

export function matchesSearch(s: Student, term: string): boolean {
  const t = normalize(term);
  return !t || normalize(s.name).includes(t) || s.email.toLowerCase().includes(t);
}

export interface AttendanceCell {
  date: string;
  className: string;
  mark: AttendanceMark;
}

/** Marcações do aluno nos últimos `days` dias (até hoje), da mais antiga para a mais recente. */
export function recentAttendance(sessions: ClassSession[], studentId: string, today: string, days = 30): AttendanceCell[] {
  const from = addDays(today, -days);
  return sessions
    .filter((s) => s.status !== 'cancelled' && s.date >= from && s.date <= today && s.attendance[studentId])
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map((s) => ({ date: s.date, className: s.className, mark: s.attendance[studentId]! }));
}

/** Idade completa em `today` (dayKeys). */
export function ageOn(birthDate: string | null, today: string): number | null {
  if (!birthDate) {
    return null;
  }
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  if (!by || !ty) {
    return null;
  }
  return ty - by - (tm! < bm! || (tm === bm && td! < bd!) ? 1 : 0);
}
