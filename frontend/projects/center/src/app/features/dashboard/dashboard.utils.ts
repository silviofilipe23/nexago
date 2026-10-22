import { timeToMinutes } from '../../domain/dates';
import { awaitingTooLong, holdExpired, invoiceDisplayStatus } from '../../domain/enrollment';
import type { CenterInvite, ClassSession, Enrollment, Invoice, TrainingClass } from '../../domain/models';
import { ROLE_LABELS } from '../../domain/roles';
import { formatBRL } from '../../domain/money';

export type TodayState = 'done' | 'live' | 'next' | 'missed' | 'cancelled';

export const TODAY_STATE_LABEL: Record<TodayState, [string, string]> = {
  done: ['Realizada', 'dim'],
  live: ['Em andamento', 'red'],
  next: ['Prevista', 'orange'],
  missed: ['Sem chamada', 'yellow'],
  cancelled: ['Cancelada', 'red'],
};

/**
 * Situação de uma aula de hoje pela hora de parede do centro. Aula que já terminou e continua
 * `scheduled` não é "realizada": ninguém registrou a chamada, e o painel diz isso.
 */
export function todayState(s: Pick<ClassSession, 'status' | 'startTime' | 'durationMin'>, nowTime: string): TodayState {
  if (s.status === 'cancelled') {
    return 'cancelled';
  }
  if (s.status === 'done') {
    return 'done';
  }
  const now = timeToMinutes(nowTime);
  const start = timeToMinutes(s.startTime);
  if (now < start) {
    return 'next';
  }
  return now < start + s.durationMin ? 'live' : 'missed';
}

/** Texto da coluna "Alunos": presença quando houve chamada; senão vagas ocupadas. */
export function todayHeadcount(s: Pick<ClassSession, 'status' | 'attendance' | 'makeupStudentIds'>, cls: Pick<TrainingClass, 'capacity' | 'seatsTaken'> | undefined): string {
  const marks = Object.values(s.attendance);
  if (s.status === 'done' && marks.length > 0) {
    return `${marks.filter((m) => m === 'present').length}/${marks.length}`;
  }
  const base = cls ? `${cls.seatsTaken}/${cls.capacity}` : '—';
  return s.makeupStudentIds.length ? `${base} + ${s.makeupStudentIds.length} rep.` : base;
}

export interface Pendency {
  title: string;
  sub: string;
  tone: 'red' | 'yellow' | 'orange';
  /** Segmento depois de `/centro/:id/`. */
  path: string;
}

export interface PendencyInput {
  today: string;
  now: Date;
  /** Datas no fuso do centro, já formatadas pra exibição. */
  formatDay: (at: Date | null) => string;
  enrollments: Enrollment[] | null;
  invoices: Invoice[] | null;
  invites: CenterInvite[] | null;
  /** Aulas passadas ainda `scheduled` (sem chamada). null = papel não registra chamada. */
  sessions: ClassSession[] | null;
  classById: (id: string) => TrainingClass | undefined;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Itens do card "Pendências". Cada fonte vem null quando o papel não a enxerga. */
export function buildPendencies(i: PendencyInput): Pendency[] {
  const out: Pendency[] = [];

  if (i.enrollments) {
    const waiting = i.enrollments.filter((e) => e.status === 'waitlisted');
    if (waiting.length) {
      const byClass = new Map<string, number>();
      waiting.forEach((e) => byClass.set(e.classId, (byClass.get(e.classId) ?? 0) + 1));
      const [topId] = [...byClass.entries()].sort((a, b) => b[1] - a[1])[0]!;
      const cls = i.classById(topId);
      const name = cls?.name ?? waiting.find((e) => e.classId === topId)?.className ?? 'Turma';
      const sub = cls ? `${name} · ${cls.seatsTaken}/${cls.capacity}` : name;
      out.push({ title: `${plural(waiting.length, 'aluno', 'alunos')} na lista de espera`, sub: byClass.size > 1 ? `${sub} e mais ${byClass.size - 1}` : sub, tone: 'yellow', path: 'matriculas' });
    }
    const expired = i.enrollments.filter((e) => holdExpired(e, i.now));
    if (expired.length) {
      out.push({ title: `${plural(expired.length, 'reserva de vaga vencida', 'reservas de vaga vencidas')}`, sub: 'Matrículas pendentes sem confirmação dentro do prazo', tone: 'orange', path: 'matriculas' });
    }
  }

  if (i.invoices) {
    const awaiting = i.invoices.filter((inv) => awaitingTooLong(inv, i.now) && inv.dueDate >= i.today);
    if (awaiting.length) {
      out.push({ title: `${plural(awaiting.length, 'pagamento aguardando', 'pagamentos aguardando')} provedor`, sub: 'Sem confirmação há mais de 2h', tone: 'yellow', path: 'financeiro' });
    }
    const late = i.invoices.filter((inv) => invoiceDisplayStatus(inv, i.today) === 'late');
    if (late.length) {
      const cents = late.reduce((s, inv) => s + inv.amountCents, 0);
      out.push({ title: `${plural(late.length, 'cobrança vencida', 'cobranças vencidas')}`, sub: `${formatBRL(cents)} em aberto`, tone: 'red', path: 'financeiro' });
    }
  }

  if (i.invites) {
    const pending = i.invites.filter((inv) => inv.status === 'pending');
    if (pending.length === 1) {
      const p = pending[0]!;
      out.push({ title: 'Convite não aceito', sub: `${p.displayName || p.email} · ${ROLE_LABELS[p.role]} · enviado ${i.formatDay(p.createdAt)}`, tone: 'orange', path: 'equipe' });
    } else if (pending.length > 1) {
      out.push({ title: `${pending.length} convites não aceitos`, sub: pending.map((p) => p.displayName || p.email).slice(0, 3).join(', '), tone: 'orange', path: 'equipe' });
    }
  }

  if (i.sessions) {
    const missing = i.sessions.filter((s) => s.status === 'scheduled' && s.date < i.today);
    if (missing.length) {
      out.push({ title: `${plural(missing.length, 'aula sem chamada', 'aulas sem chamada')}`, sub: 'Aulas passadas sem presença registrada', tone: 'yellow', path: 'agenda' });
    }
  }

  return out;
}
