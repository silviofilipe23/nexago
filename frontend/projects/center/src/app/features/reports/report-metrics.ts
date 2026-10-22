import { addDays, addMonths, monthKey, monthLabel } from '../../domain/dates';
import { attendanceRate, moneySplit, pct, tallyAttendance } from '../../domain/metrics';
import { centsToInput } from '../../domain/money';
import type { ClassSession, Enrollment, Invoice, TrainingClass } from '../../domain/models';
import type { CsvCell } from '../../ui/csv';

export type ReportPeriod = '30d' | 'quarter' | '6m';

export const PERIOD_DAYS: Record<ReportPeriod, number> = { '30d': 30, quarter: 91, '6m': 182 };

export interface PeriodRange {
  from: string;
  to: string;
  /** Meses tocados pelo período, do mais antigo ao atual. */
  months: string[];
}

export function periodRange(period: ReportPeriod, today: string): PeriodRange {
  const from = addDays(today, -(PERIOD_DAYS[period] - 1));
  const months: string[] = [];
  for (let m = monthKey(from); m <= monthKey(today); m = addMonths(m, 1)) {
    months.push(m);
  }
  return { from, to: today, months };
}

export interface MonthPoint {
  month: string;
  label: string;
  chargedCents: number;
  receivedCents: number;
}

/** Cobrado × recebido por mês de vencimento (recebido = só aprovado, líquido de estorno). */
export function monthlySeries(invoices: Invoice[], months: string[], today: string): MonthPoint[] {
  return months.map((month) => {
    const s = moneySplit(invoices, month, today);
    return { month, label: monthLabel(month), chargedCents: s.chargedCents, receivedCents: s.approvedCents };
  });
}

export interface SessionStats {
  planned: number;
  done: number;
  cancelled: number;
  /** Presença % e faltas justificadas/não justificadas % sobre as marcações. */
  presence: number | null;
  excusedPct: number | null;
  absentPct: number | null;
}

/** Aulas do período até hoje (agendadas no futuro não entram em "previstas"). */
export function sessionStats(sessions: ClassSession[], today: string): SessionStats {
  const past = sessions.filter((s) => s.date <= today);
  const t = tallyAttendance(past);
  const marks = t.present + t.excused + t.absent;
  return {
    planned: past.length,
    done: past.filter((s) => s.status === 'done').length,
    cancelled: past.filter((s) => s.status === 'cancelled').length,
    presence: attendanceRate(t),
    excusedPct: pct(t.excused, marks),
    absentPct: pct(t.absent, marks),
  };
}

/** Inadimplência do mês: vencido/recusado/contestado sobre o cobrado. */
export function delinquency(invoices: Invoice[], month: string, today: string): number | null {
  const s = moneySplit(invoices, month, today);
  return s.chargedCents > 0 ? Math.round((s.lateCents / s.chargedCents) * 1000) / 10 : null;
}

export interface ClassRow {
  cls: TrainingClass;
  occupancy: number | null;
  presence: number | null;
  revenueCents: number;
}

/** Tabela "Por turma": ocupação atual, presença no período e receita recebida no mês. */
export function classRows(
  classes: TrainingClass[],
  sessions: ClassSession[],
  enrollments: Enrollment[],
  invoices: Invoice[],
  month: string,
  today: string,
): ClassRow[] {
  const classOfEnrollment = new Map(enrollments.map((e) => [e.id, e.classId]));
  const revenue = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status !== 'approved' || !inv.enrollmentId || inv.dueDate.slice(0, 7) !== month) {
      continue;
    }
    const classId = classOfEnrollment.get(inv.enrollmentId);
    if (classId) {
      revenue.set(classId, (revenue.get(classId) ?? 0) + inv.amountCents - inv.refundedCents);
    }
  }
  return classes
    .filter((c) => c.status === 'active')
    .map((cls) => ({
      cls,
      occupancy: pct(Math.min(cls.seatsTaken, cls.capacity), cls.capacity),
      presence: attendanceRate(tallyAttendance(sessions.filter((s) => s.classId === cls.id && s.date <= today))),
      revenueCents: revenue.get(cls.id) ?? 0,
    }));
}

export function reportsCsv(series: MonthPoint[], rows: ClassRow[], monthTitle: string): CsvCell[][] {
  const pctCell = (n: number | null) => (n == null ? '' : `${n}%`);
  return [
    ['Mês', 'Cobrado (R$)', 'Recebido (R$)'],
    ...series.map((p) => [p.month, centsToInput(p.chargedCents), centsToInput(p.receivedCents)]),
    [],
    ['Turma', 'Ocupação', 'Presença', `Receita recebida ${monthTitle} (R$)`],
    ...rows.map((r) => [r.cls.name, pctCell(r.occupancy), pctCell(r.presence), centsToInput(r.revenueCents)]),
  ];
}

/** Rótulo curto das barras: "R$ 320" ou "3,9 mil". */
export function compactBRL(cents: number): string {
  const reais = cents / 100;
  if (reais < 1000) {
    return `R$ ${Math.round(reais)}`;
  }
  return `${(reais / 1000).toFixed(1).replace('.', ',')} mil`;
}
