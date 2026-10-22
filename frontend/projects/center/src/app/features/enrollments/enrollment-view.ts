import { formatDayKey, formatInstant, parseDayKey } from '../../domain/dates';
import { freeSeats, holdExpired, waitlistOf } from '../../domain/enrollment';
import type { Enrollment, EnrollmentStatus, Invoice, Plan, Student, TrainingClass } from '../../domain/models';

/** Soma meses a um dayKey segurando o dia no fim do mês (31 jan + 1 = 28/29 fev). */
export function addMonthsToDay(day: string, months: number): string {
  const { y, m, d } = parseDayKey(day);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/**
 * "Pago até": mensal coberto até 1 mês depois do vencimento da última cobrança APROVADA da
 * matrícula. Sem cobrança aprovada visível = null (a tela não inventa pagamento).
 */
export function paidUntil(e: Pick<Enrollment, 'id'>, invoices: Invoice[]): string | null {
  let last: string | null = null;
  for (const inv of invoices) {
    if (inv.enrollmentId === e.id && inv.status === 'approved' && (!last || inv.dueDate > last)) {
      last = inv.dueDate;
    }
  }
  return last ? addMonthsToDay(last, 1) : null;
}

export function ordinal(n: number): string {
  return `${n}º`;
}

export interface EnrollmentDetail {
  text: string;
  tone: '' | 'pending' | 'red';
}

/** Texto da coluna "Detalhe" (W17). */
export function enrollmentDetail(
  e: Enrollment,
  opts: { invoices: Invoice[]; queuePosition: number | null; tz?: string; now?: Date },
): EnrollmentDetail {
  const pack = e.contract?.planType === 'class_pack';
  switch (e.status) {
    case 'waitlisted':
      return { text: opts.queuePosition ? `${ordinal(opts.queuePosition)} da fila` : 'Na fila', tone: '' };
    case 'pending':
      if (holdExpired(e, opts.now)) {
        return { text: 'Reserva vencida', tone: 'red' };
      }
      return {
        text: e.holdUntil ? `Aguardando pagamento · reserva até ${formatInstant(e.holdUntil, opts.tz)}` : 'Aguardando pagamento',
        tone: 'pending',
      };
    case 'paused':
      return { text: [e.pausedUntil ? `Pausa até ${formatDayKey(e.pausedUntil)}` : 'Pausada', e.pauseReason].filter(Boolean).join(' · '), tone: '' };
    case 'active': {
      if (pack) {
        return { text: `${e.creditsLeft ?? 0} crédito${e.creditsLeft === 1 ? '' : 's'}`, tone: '' };
      }
      const until = paidUntil(e, opts.invoices);
      return { text: until ? `Pago até ${formatDayKey(until)}` : 'Sem pagamento aprovado', tone: '' };
    }
    case 'cancelled':
      return { text: e.endedAt ? `Encerrada ${formatInstant(e.endedAt, opts.tz).slice(0, 6)}` : 'Encerrada', tone: '' };
    case 'completed':
      return { text: pack && !e.creditsLeft ? 'Créditos usados' : 'Concluída', tone: '' };
  }
}

/** Posição na fila (1-based) de cada matrícula em espera, por turma. */
export function queuePositions(enrollments: Enrollment[]): Map<string, number> {
  const out = new Map<string, number>();
  const classIds = new Set(enrollments.filter((e) => e.status === 'waitlisted').map((e) => e.classId));
  for (const id of classIds) {
    waitlistOf(enrollments, id).forEach((e, i) => out.set(e.id, i + 1));
  }
  return out;
}

export function statusCounts(enrollments: Enrollment[]): Record<EnrollmentStatus, number> {
  const c: Record<EnrollmentStatus, number> = { active: 0, pending: 0, paused: 0, cancelled: 0, completed: 0, waitlisted: 0 };
  for (const e of enrollments) {
    c[e.status]++;
  }
  return c;
}

/** Quem paga: responsável legal se o aluno é menor, senão o próprio aluno. */
export function payerNameFor(s: Pick<Student, 'name' | 'isMinor' | 'guardian'>): string {
  return s.isMinor && s.guardian?.name.trim() ? s.guardian.name.trim() : s.name;
}

/** Outras turmas ativas da MESMA modalidade e nível com vaga (alternativa à lotada). */
export function alternativeClasses(classes: TrainingClass[], cls: Pick<TrainingClass, 'id' | 'programId' | 'level'>): TrainingClass[] {
  return classes.filter(
    (c) => c.id !== cls.id && c.status === 'active' && c.programId === cls.programId && c.level === cls.level && freeSeats(c) > 0,
  );
}

/** Planos ativos que valem para a modalidade (plano sem modalidades = vale para todas). */
export function plansForProgram(plans: Plan[], programId: string): Plan[] {
  return plans.filter((p) => p.status === 'active' && (p.programIds.length === 0 || p.programIds.includes(programId)));
}

export interface WaitlistGroup {
  cls: TrainingClass;
  queue: Enrollment[];
  free: number;
}

/** Painel "Lista de espera": turmas com fila, mais cheias primeiro. */
export function waitlistGroups(classes: TrainingClass[], enrollments: Enrollment[]): WaitlistGroup[] {
  return classes
    .map((cls) => ({ cls, queue: waitlistOf(enrollments, cls.id), free: freeSeats(cls) }))
    .filter((g) => g.queue.length > 0)
    .sort((a, b) => b.queue.length - a.queue.length || a.cls.name.localeCompare(b.cls.name, 'pt-BR'));
}
