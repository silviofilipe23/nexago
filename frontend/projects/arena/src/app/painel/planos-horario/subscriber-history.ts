import { daysLate } from '../aulas/billing.model';
import type { PillTone } from '../ui/pill.component';
import { onlineBillingTypeLabel } from './schedule-plan.logic';
import {
  MANUAL_METHOD_LABEL,
  type PlanOccurrence,
  type ScheduleCharge,
  type ScheduleCredit,
  type ScheduleSubscription,
} from './schedule-plan.model';

/**
 * Histórico do assinante no plano (o que o gestor quer saber antes de renovar, cobrar ou conversar):
 * quanto pagou e se paga em dia, se aparece para jogar, quanto usou de reposição e pausa, e o mês a
 * mês. Tudo derivado de mensalidades, ocorrências e créditos que o detalhe já lê — sem log no servidor.
 */

/** Liberadas pelo sistema (troca de horário, pausa, atraso, saída): não são falta nem cancelamento
 *  da arena — somem do histórico, como no app (`isVisibleOccurrence` em `arena-schedule-athlete.ts`). */
const SYSTEM_RELEASE_REASONS = new Set([
  'schedule_slots_changed',
  'schedule_subscription_paused',
  'schedule_subscription_overdue',
  'schedule_subscription_ended',
  'schedule_subscription_ending',
  'schedule_payment_expired',
]);

export type OccurrenceOutcome = 'played' | 'noshow' | 'skip' | 'arena' | 'makeup' | 'next';

export interface MonthPayment {
  label: string;
  tone: PillTone;
}

export interface HistoryMonth {
  /** `YYYY-MM`. */
  period: string;
  outcomes: OccurrenceOutcome[];
  summary: string;
  payment: MonthPayment | null;
}

export interface SubscriberHistory {
  /** Meses no plano, contando o de início e o corrente. 0 = ainda não começou. */
  monthsInPlan: number;
  sourceLabel: string;
  paidTotal: number;
  paidCount: number;
  openTotal: number;
  openCount: number;
  /** Mensalidades pagas até o vencimento ÷ (pagas + vencidas em aberto). `null` = nada venceu ainda. */
  punctualityPercent: number | null;
  onTimeCount: number;
  paidLateCount: number;
  /** Em aberto com o vencimento já passado. */
  overdueOpenCount: number;
  /** Maior atraso (dias) entre as pagas com atraso e as vencidas em aberto. */
  maxLateDays: number;
  played: number;
  noShows: number;
  skips: number;
  arenaCanceled: number;
  holidays: number;
  makeupsPlayed: number;
  /** Jogou ÷ (jogou + faltou + avisou que não ia), só horários do plano. `null` = nenhum passado. */
  attendancePercent: number | null;
  lastPlayed: { dateKey: string; startTime: string } | null;
  credits: { total: number; used: number; available: number; expired: number };
  pauseDaysThisYear: number;
  months: HistoryMonth[];
}

const SOURCE_LABEL: Record<ScheduleSubscription['source'], string> = {
  athlete: 'Assinou pelo app',
  arena: 'Cadastrado pela arena',
  waitlist: 'Veio da lista de espera',
};

function isCanceled(status: string): boolean {
  return status.toLowerCase().startsWith('cancel');
}

/** O que aconteceu com a ocorrência; `null` = liberada pelo sistema (fica fora do histórico). */
export function occurrenceOutcome(o: PlanOccurrence, todayKey: string): OccurrenceOutcome | null {
  if (isCanceled(o.status)) {
    const reason = o.cancelReason ?? '';
    if (SYSTEM_RELEASE_REASONS.has(reason) || reason.startsWith('recurring_series_')) return null;
    if (reason === 'schedule_skip') return 'skip';
    return 'arena';
  }
  const attendance = (o.attendanceStatus ?? '').toLowerCase();
  if (attendance === 'no_show') return 'noshow';
  const happened = o.dateKey < todayKey || attendance === 'checked_in';
  if (!happened) return 'next';
  return o.makeup ? 'makeup' : 'played';
}

function monthDiff(fromPeriod: string, toPeriod: string): number {
  const [y1, m1] = fromPeriod.split('-').map(Number);
  const [y2, m2] = toPeriod.split('-').map(Number);
  return ((y2 ?? 0) - (y1 ?? 0)) * 12 + ((m2 ?? 1) - (m1 ?? 1));
}

function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const idx = (y ?? 0) * 12 + ((m ?? 1) - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

function ddmm(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function paymentMethodLabel(c: ScheduleCharge): string | null {
  if (c.paidVia === 'asaas') return onlineBillingTypeLabel(c.onlineBillingType);
  return c.paymentMethod ? MANUAL_METHOD_LABEL[c.paymentMethod] : null;
}

/** Selo da mensalidade do mês, somando os pagadores do rateio (vale o pior caso). */
export function monthPayment(period: string, charges: readonly ScheduleCharge[], todayKey: string): MonthPayment | null {
  const live = charges.filter((c) => c.status !== 'canceled');
  const own = live.filter((c) => c.period === period);
  if (own.length === 0) {
    const annual = live.find((c) => c.coversThrough && c.period < period && c.coversThrough >= period);
    if (annual) return annual.status === 'paid' ? { label: 'Coberto pelo anual', tone: 'green' } : { label: 'Anual em aberto', tone: 'dim' };
    return charges.some((c) => c.period === period) ? { label: 'Cancelada', tone: 'dim' } : null;
  }
  const open = own.filter((c) => c.status === 'open');
  if (open.length > 0) {
    const firstDue = open.map((c) => c.dueDate).sort()[0] ?? '';
    if (firstDue && firstDue < todayKey) return { label: `Atrasada ${daysLate(firstDue, todayKey)}d`, tone: 'red' };
    return { label: firstDue ? `Aberta · vence ${ddmm(firstDue)}` : 'Aberta', tone: 'dim' };
  }
  const late = Math.max(0, ...own.map((c) => (c.paidOn && c.dueDate ? daysLate(c.dueDate, c.paidOn) : 0)));
  const lastPaid = own.map((c) => c.paidOn ?? '').sort().pop() ?? '';
  const annual = own.some((c) => c.coversThrough && c.coversThrough > c.period);
  if (late > 0) return { label: `Paga com ${late}d de atraso`, tone: 'yellow' };
  const method = own.length === 1 ? paymentMethodLabel(own[0]!) : null;
  const parts = [annual ? 'Anual pago' : 'Paga', lastPaid ? ddmm(lastPaid) : null, method].filter(Boolean);
  return { label: parts.join(' · '), tone: 'green' };
}

function monthSummary(outcomes: readonly OccurrenceOutcome[]): string {
  const count = (k: OccurrenceOutcome) => outcomes.filter((o) => o === k).length;
  const played = count('played');
  const due = played + count('noshow') + count('skip');
  const parts: string[] = [];
  if (due > 0) parts.push(`jogou ${played} de ${due}`);
  if (count('skip')) parts.push(plural(count('skip'), 'avisou falta', 'avisou faltas'));
  if (count('noshow')) parts.push(plural(count('noshow'), 'falta', 'faltas'));
  if (count('makeup')) parts.push(plural(count('makeup'), 'reposição', 'reposições'));
  if (count('arena')) parts.push(plural(count('arena'), 'cancelado pela arena', 'cancelados pela arena'));
  if (count('next')) parts.push(`${count('next')} a jogar`);
  return parts.length ? parts.join(' · ') : 'Sem jogos';
}

export function buildSubscriberHistory(input: {
  sub: Pick<ScheduleSubscription, 'startDate' | 'source' | 'endsOn' | 'status' | 'pauseDaysUsed'>;
  charges: readonly ScheduleCharge[];
  occurrences: readonly PlanOccurrence[];
  credits: readonly ScheduleCredit[];
  todayKey: string;
}): SubscriberHistory {
  const { sub, charges, occurrences, credits, todayKey } = input;
  const thisMonth = todayKey.slice(0, 7);

  // ── Dinheiro ──
  const paid = charges.filter((c) => c.status === 'paid');
  const open = charges.filter((c) => c.status === 'open');
  const overdueOpen = open.filter((c) => c.dueDate && c.dueDate < todayKey);
  const paidLate = paid.filter((c) => c.paidOn && c.dueDate && c.paidOn > c.dueDate);
  const onTimeCount = paid.length - paidLate.length;
  const judged = paid.length + overdueOpen.length;
  const lateDays = [
    ...paidLate.map((c) => daysLate(c.dueDate, c.paidOn!)),
    ...overdueOpen.map((c) => daysLate(c.dueDate, todayKey)),
  ];

  // ── Jogos ──
  const outcomes = occurrences
    .map((o) => ({ o, outcome: occurrenceOutcome(o, todayKey) }))
    .filter((x): x is { o: PlanOccurrence; outcome: OccurrenceOutcome } => x.outcome !== null);
  const count = (k: OccurrenceOutcome) => outcomes.filter((x) => x.outcome === k).length;
  const played = count('played');
  const noShows = count('noshow');
  const skips = count('skip');
  const dueGames = played + noShows + skips;
  const last = outcomes
    .filter((x) => x.outcome === 'played' || x.outcome === 'makeup')
    .map((x) => x.o)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startTime.localeCompare(b.startTime))
    .pop();

  // ── Reposições ──
  const expired = credits.filter((c) => c.status === 'expired' || (c.status === 'available' && c.expiresOn < todayKey)).length;
  const used = credits.filter((c) => c.status === 'used').length;

  // ── Mês a mês: do início até hoje (ou até a saída, se já saiu) ──
  const startPeriod = (sub.startDate || occurrences[0]?.dateKey || todayKey).slice(0, 7);
  const ended = sub.status === 'canceled' && sub.endsOn && sub.endsOn < todayKey;
  const endPeriod = ended ? sub.endsOn!.slice(0, 7) : thisMonth;
  const span = monthDiff(startPeriod, endPeriod);
  const months: HistoryMonth[] = [];
  for (let i = span; i >= 0; i--) {
    const period = addMonths(startPeriod, i);
    const monthOutcomes = outcomes
      .filter((x) => x.o.dateKey.startsWith(period))
      .sort((a, b) => a.o.dateKey.localeCompare(b.o.dateKey) || a.o.startTime.localeCompare(b.o.startTime))
      .map((x) => x.outcome);
    months.push({ period, outcomes: monthOutcomes, summary: monthSummary(monthOutcomes), payment: monthPayment(period, charges, todayKey) });
  }

  return {
    monthsInPlan: sub.startDate && sub.startDate <= todayKey ? monthDiff(startPeriod, endPeriod) + 1 : 0,
    sourceLabel: SOURCE_LABEL[sub.source],
    paidTotal: paid.reduce((s, c) => s + c.amountReais, 0),
    paidCount: paid.length,
    openTotal: open.reduce((s, c) => s + c.amountReais, 0),
    openCount: open.length,
    punctualityPercent: judged > 0 ? Math.round((onTimeCount / judged) * 100) : null,
    onTimeCount,
    paidLateCount: paidLate.length,
    overdueOpenCount: overdueOpen.length,
    maxLateDays: Math.max(0, ...lateDays),
    played,
    noShows,
    skips,
    arenaCanceled: count('arena'),
    holidays: outcomes.filter((x) => x.outcome === 'arena' && x.o.cancelReason === 'schedule_holiday').length,
    makeupsPlayed: count('makeup'),
    attendancePercent: dueGames > 0 ? Math.round((played / dueGames) * 100) : null,
    lastPlayed: last ? { dateKey: last.dateKey, startTime: last.startTime } : null,
    credits: { total: credits.length, used, available: credits.length - used - expired, expired },
    pauseDaysThisYear: sub.pauseDaysUsed && sub.pauseDaysUsed.year === todayKey.slice(0, 4) ? sub.pauseDaysUsed.days : 0,
    months,
  };
}
