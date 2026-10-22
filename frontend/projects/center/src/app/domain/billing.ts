/**
 * Cobrança recorrente — as mesmas contas do servidor (`functions/src/training-center-subscription-model.ts`)
 * para o portal mostrar antes o que a rodada vai fazer: proporcional do 1º mês, diferença na troca
 * de plano e a régua de cobrança.
 */
import { addDays, daysBetween, formatDayKey, monthLabel, parseDayKey } from './dates';
import type { CenterBilling, Invoice, Subscription } from './models';

/** A cobrança do ciclo nasce 3 dias antes do vencimento. */
export const GENERATE_DAYS_BEFORE = 3;

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Mesmo dia de vencimento N meses depois (dia que não existe cai no último do mês). */
export function shiftMonths(day: string, n: number, billingDay: number): string {
  const { y, m } = parseDayKey(day);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const yy = t.getUTCFullYear();
  const mm = t.getUTCMonth() + 1;
  return fmt(yy, mm, Math.min(billingDay, daysInMonth(yy, mm)));
}

export function billingDayFor(b: CenterBilling, startDate: string): number {
  return b.billingDayMode === 'enrollment' ? Math.min(parseDayKey(startDate).d, 28) : b.billingDay;
}

/** Primeiro vencimento recorrente depois da contratação. */
export function firstChargeAfter(startDate: string, billingDay: number): string {
  const { y, m, d } = parseDayKey(startDate);
  return d < billingDay ? fmt(y, m, Math.min(billingDay, daysInMonth(y, m))) : shiftMonths(startDate, 1, billingDay);
}

export interface FirstInvoice {
  cents: number;
  prorated: boolean;
  days: number;
  cycleDays: number;
  /** Primeiro vencimento da assinatura (o 1º mês cobre até ele). */
  nextCharge: string;
}

/** Valor da cobrança da matrícula mensal: proporcional até o 1º vencimento fixo, ou mês cheio. */
export function firstInvoiceCents(priceCents: number, b: CenterBilling, startDate: string): FirstInvoice {
  const day = billingDayFor(b, startDate);
  const nextCharge = firstChargeAfter(startDate, day);
  const cycleDays = daysBetween(shiftMonths(nextCharge, -1, day), nextCharge);
  const days = daysBetween(startDate, nextCharge);
  if (b.firstMonth === 'full' || b.billingDayMode === 'enrollment' || days >= cycleDays) {
    return { cents: priceCents, prorated: false, days: cycleDays, cycleDays, nextCharge };
  }
  return { cents: Math.round((priceCents * days) / cycleDays), prorated: true, days, cycleDays, nextCharge };
}

/** Diferença da troca de plano pelos dias que faltam no ciclo (downgrade não devolve). */
export function planChangeProration(
  oldCents: number,
  newCents: number,
  today: string,
  periodEnd: string,
  billingDay: number,
): { cents: number; days: number; cycleDays: number } {
  const cycleDays = daysBetween(shiftMonths(periodEnd, -1, billingDay), periodEnd);
  const days = Math.max(0, Math.min(cycleDays, daysBetween(today, periodEnd)));
  return { cents: Math.max(0, Math.round(((newCents - oldCents) * days) / cycleDays)), days, cycleDays };
}

/** 'Nov 2026' para o ciclo '2026-11'. */
export function cycleTitle(cycle: string): string {
  const label = monthLabel(cycle);
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${cycle.slice(0, 4)}`;
}

export interface LadderStep {
  day: string;
  title: string;
  detail: string;
  tone: 'dim' | 'orange' | 'yellow' | 'red';
}

/** Régua da política do centro, na ordem em que acontece. */
export function dunningLadder(b: CenterBilling): LadderStep[] {
  const steps: LadderStep[] = [
    { day: 'D−3', title: 'Cobrança gerada e lembrete', detail: 'Push com valor e link de pagamento (Pix ou cartão)', tone: 'dim' },
    { day: 'D0', title: 'Vencimento', detail: b.lateFees ? 'Depois dele, multa de 2% + juros de 1% ao mês' : 'Sem multa nem juros', tone: 'orange' },
    { day: 'D+1', title: 'Não pago', detail: 'Push · link para pagar', tone: 'yellow' },
    { day: 'D+7', title: 'Lembrete', detail: 'Push · link para pagar', tone: 'yellow' },
  ];
  if (b.blockAfterDays > 0) {
    steps.push({
      day: `D+${Math.max(1, b.blockAfterDays - 5)}`,
      title: 'Aviso de bloqueio',
      detail: `Push · check-in bloqueia em ${Math.min(5, b.blockAfterDays - 1)} dias`,
      tone: 'red',
    });
    steps.push({ day: `D+${b.blockAfterDays}`, title: 'Check-in com pendência', detail: 'Chamada e app mostram pendência', tone: 'red' });
  }
  if (b.suspendAfterDays > 0) {
    steps.push({
      day: `D+${b.suspendAfterDays}`,
      title: b.suspendAction === 'suspend' ? 'Matrícula suspensa' : 'Aviso final',
      detail: b.suspendAction === 'suspend' ? 'Vaga liberada para a lista de espera · histórico mantido' : 'Só avisa · a matrícula continua',
      tone: 'red',
    });
  }
  return steps;
}

export const NOTICE_STAGE_LABEL = ['Lembrete D−3', 'Não pago', 'Lembrete', 'Aviso de bloqueio', 'Check-in bloqueado', 'Suspensão'];

/** Data em que o check-in bloqueia para quem está devendo desde `overdueSince`. */
export function blockDate(b: CenterBilling, overdueSince: string | null): string | null {
  return overdueSince && b.blockAfterDays > 0 ? addDays(overdueSince, b.blockAfterDays) : null;
}

/** "Próxima" da lista: o que acontece a seguir com a assinatura. */
export function nextLabel(s: Subscription, today: string): { text: string; tone: '' | 'red' | 'yellow' } {
  switch (s.status) {
    case 'past_due':
      return { text: `Venceu ${s.overdueSince ? formatDayKey(s.overdueSince) : ''}`.trim(), tone: 'red' };
    case 'paused':
      return { text: s.pausedUntil ? `Volta ${formatDayKey(s.pausedUntil)}` : 'Pausada', tone: '' };
    case 'canceling':
      return { text: s.cancelAt ? `Encerra ${formatDayKey(s.cancelAt)}` : 'Encerra no ciclo', tone: '' };
    case 'cancelled':
    case 'suspended':
      return { text: '—', tone: '' };
    default: {
      const d = s.nextChargeDate;
      if (!d) {
        return { text: '—', tone: '' };
      }
      const gen = addDays(d, -GENERATE_DAYS_BEFORE);
      return { text: formatDayKey(d), tone: gen <= today ? 'yellow' : '' };
    }
  }
}

/** Cobranças de uma assinatura, mais novas primeiro. */
export function invoicesOf(invoices: readonly Invoice[], subscriptionId: string): Invoice[] {
  return invoices
    .filter((i) => i.subscriptionId === subscriptionId)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/** Receita recorrente mensal: assinaturas que seguem cobrando. */
export function monthlyRecurring(subs: readonly Subscription[]): number {
  return subs.filter((s) => ['active', 'past_due', 'canceling'].includes(s.status)).reduce((t, s) => t + s.priceCents, 0);
}
