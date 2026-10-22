import {
  GENERATE_DAYS_BEFORE,
  cycleTitle,
  invoicesOf,
  monthlyRecurring,
  nextLabel,
  planChangeProration,
  type LadderStep,
} from '../../domain/billing';
import { addDays, daysBetween, formatDayKey, todayKey } from '../../domain/dates';
import { invoiceDisplayStatus } from '../../domain/enrollment';
import { centsToInput, formatBRL } from '../../domain/money';
import {
  INVOICE_STATUS,
  PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_METHOD,
  SUBSCRIPTION_STATUS,
  type BillingRun,
  type BillingRunItemKind,
  type Invoice,
  type Subscription,
  type SubscriptionStatus,
} from '../../domain/models';
import type { CsvCell } from '../../ui/csv';

/* ── R2 · lista ───────────────────────────────────────────── */

export type SubFilter = 'all' | 'active' | 'past_due' | 'paused' | 'canceling' | 'ended';

export const SUB_FILTERS: { value: Exclude<SubFilter, 'all'>; label: string }[] = [
  { value: 'active', label: 'Em dia' },
  { value: 'past_due', label: 'Em atraso' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'canceling', label: 'Cancelando' },
  { value: 'ended', label: 'Encerradas' },
];

function filterOf(status: SubscriptionStatus): Exclude<SubFilter, 'all'> {
  return status === 'cancelled' || status === 'suspended' ? 'ended' : status;
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function countByFilter(subs: readonly Subscription[]): Record<SubFilter, number> {
  const c: Record<SubFilter, number> = { all: subs.length, active: 0, past_due: 0, paused: 0, canceling: 0, ended: 0 };
  for (const s of subs) {
    c[filterOf(s.status)]++;
  }
  return c;
}

/** Filtro por situação + busca por pagador/aluno, ordenado por nome. */
export function filterSubscriptions(subs: readonly Subscription[], filter: SubFilter, search: string): Subscription[] {
  const q = norm(search);
  return subs
    .filter((s) => filter === 'all' || filterOf(s.status) === filter)
    .filter((s) => !q || norm(`${s.payerName} ${s.studentName}`).includes(q))
    .sort((a, b) => a.payerName.localeCompare(b.payerName, 'pt-BR'));
}

export interface SubRow {
  sub: Subscription;
  status: [string, string];
  method: string;
  next: { text: string; tone: '' | 'red' | 'yellow' };
  /** "Plano · turma" (com o aluno quando o pagador é outro). */
  planLine: string;
}

export function subscriptionRow(s: Subscription, today: string): SubRow {
  const who = s.studentName && s.studentName !== s.payerName ? `${s.studentName} · ` : '';
  return {
    sub: s,
    status: SUBSCRIPTION_STATUS[s.status],
    method: SUBSCRIPTION_METHOD[s.method],
    next: nextLabel(s, today),
    planLine: `${who}${s.className}`,
  };
}

/** Pendente vencida de assinatura (o "em atraso" do dinheiro). */
export function isLateSubInvoice(i: Invoice, today: string): boolean {
  return i.subscriptionId != null && i.status === 'pending' && i.dueDate < today;
}

export interface SubStats {
  mrrCents: number;
  mrrCount: number;
  nextRun: { date: string; cents: number; count: number } | null;
  overdueCents: number;
  overdueCount: number;
  cancellations: number;
  atCycleEnd: number;
}

export function subscriptionStats(subs: readonly Subscription[], invoices: readonly Invoice[], today: string, tz?: string): SubStats {
  const charging = subs.filter((s) => ['active', 'past_due', 'canceling'].includes(s.status));
  // Próxima rodada: quem segue cobrando no próximo vencimento (cancelando não gera o ciclo).
  const upcoming = subs.filter((s) => (s.status === 'active' || s.status === 'past_due') && s.nextChargeDate && s.nextChargeDate >= today);
  const date = upcoming.reduce<string | null>((m, s) => (m == null || s.nextChargeDate < m ? s.nextChargeDate : m), null);
  const onDate = date ? upcoming.filter((s) => s.nextChargeDate === date) : [];
  const late = invoices.filter((i) => isLateSubInvoice(i, today));
  const month = today.slice(0, 7);
  const ended = subs.filter((s) => s.status === 'cancelled' && s.endedAt && todayKey(tz, s.endedAt).slice(0, 7) === month).length;
  const canceling = subs.filter((s) => s.status === 'canceling' && (s.cancelAt ?? '').slice(0, 7) === month).length;
  return {
    mrrCents: monthlyRecurring(subs),
    mrrCount: charging.length,
    nextRun: date ? { date, cents: onDate.reduce((t, s) => t + (s.pendingPlanChange?.priceCents ?? s.priceCents), 0), count: onDate.length } : null,
    overdueCents: late.reduce((t, i) => t + i.amountCents, 0),
    overdueCount: new Set(late.map((i) => i.subscriptionId)).size,
    cancellations: ended + canceling,
    atCycleEnd: canceling,
  };
}

export function subscriptionsCsv(subs: readonly Subscription[], today: string): CsvCell[][] {
  return [
    ['Pagador', 'Aluno', 'Plano', 'Turma', 'Valor (R$)', 'Vencimento', 'Método', 'Próxima', 'Situação', 'Início'],
    ...subs.map((s) => [
      s.payerName,
      s.studentName,
      s.planName,
      s.className,
      centsToInput(s.priceCents),
      `Dia ${String(s.billingDay).padStart(2, '0')}`,
      SUBSCRIPTION_METHOD[s.method],
      nextLabel(s, today).text,
      SUBSCRIPTION_STATUS[s.status][0],
      s.startDate ? formatDayKey(s.startDate, true) : '',
    ]),
  ];
}

/* ── R3 · detalhe ─────────────────────────────────────────── */

export interface CycleLine {
  key: string;
  title: string;
  detail: string;
  cents: number | null;
  pill: [string, string];
  invoice: Invoice | null;
  warn: boolean;
}

/** Cobranças da assinatura (+ ciclos pulados pela pausa), mais novas primeiro. */
export function cycleLines(sub: Subscription, invoices: readonly Invoice[], today: string): CycleLine[] {
  const own = invoicesOf(invoices, sub.id);
  const prefix = `sub_${sub.id}_`;
  const lines: (CycleLine & { sortKey: string })[] = own.map((inv) => {
    const st = invoiceDisplayStatus(inv, today);
    const isCycle = inv.id.startsWith(prefix) && !!inv.cycle;
    let detail: string;
    if (st === 'approved') {
      detail = ['Pago', inv.method ? PAYMENT_METHOD_LABELS[inv.method] : '', inv.providerApproved ? 'confirmado pelo provedor' : 'baixa manual']
        .filter(Boolean)
        .join(' · ');
    } else if (st === 'late') {
      const d = daysBetween(inv.dueDate, today);
      detail = `Venceu ${formatDayKey(inv.dueDate)} · ${d} dia${d === 1 ? '' : 's'} em atraso`;
    } else if (st === 'pending') {
      detail = `Vence ${formatDayKey(inv.dueDate)} · ${inv.providerUrl ? 'link enviado ao aluno' : 'sem link online'}`;
    } else {
      detail = `${INVOICE_STATUS[st][0]} · vencimento ${formatDayKey(inv.dueDate)}`;
    }
    return {
      key: inv.id,
      title: isCycle ? cycleTitle(inv.cycle) : inv.reference,
      detail,
      cents: inv.amountCents,
      pill: INVOICE_STATUS[st],
      invoice: inv,
      warn: st === 'late',
      sortKey: inv.dueDate,
    };
  });
  for (const c of sub.skippedCycles) {
    lines.push({
      key: `skip_${c}`,
      title: cycleTitle(c),
      detail: 'Pulado · matrícula pausada',
      cents: null,
      pill: ['Pulado', 'dim'],
      invoice: null,
      warn: false,
      sortKey: `${c}-${String(sub.billingDay).padStart(2, '0')}`,
    });
  }
  return lines.sort((a, b) => b.sortKey.localeCompare(a.sortKey)).map(({ sortKey: _s, ...l }) => l);
}

/** Linha tracejada do próximo ciclo ainda não gerado (null quando não há). */
export function nextCycleLine(sub: Subscription): { title: string; detail: string; cents: number | null } | null {
  const d = sub.nextChargeDate;
  if (!d || sub.status === 'cancelled' || sub.status === 'suspended') {
    return null;
  }
  const title = cycleTitle(d.slice(0, 7));
  if (sub.status === 'canceling') {
    return { title, detail: `Não será cobrado — encerra em ${formatDayKey(sub.cancelAt || d)}`, cents: null };
  }
  if (sub.status === 'paused') {
    return { title, detail: sub.pausedUntil ? `Pausada até ${formatDayKey(sub.pausedUntil)} · ciclos da pausa são pulados` : 'Pausada · ciclo não é gerado', cents: null };
  }
  return {
    title,
    detail: `Agendada para ${formatDayKey(d)} · gerada ${GENERATE_DAYS_BEFORE} dias antes`,
    cents: sub.pendingPlanChange?.priceCents ?? sub.priceCents,
  };
}

/** 'D−3' → −3, 'D0' → 0, 'D+20' → 20. */
export function ladderOffset(day: string): number {
  const m = /^D([+−-])?(\d+)/.exec(day);
  if (!m) {
    return 0;
  }
  const n = Number(m[2]);
  return m[1] === '−' || m[1] === '-' ? -n : n;
}

export interface LadderView extends LadderStep {
  reached: boolean;
  current: boolean;
}

/** Régua com o ponto em que a assinatura está (pelo atraso da cobrança mais antiga). */
export function ladderView(steps: LadderStep[], sub: Subscription, today: string): LadderView[] {
  const late = sub.status === 'past_due' || sub.status === 'suspended' ? (sub.overdueSince ? daysBetween(sub.overdueSince, today) : null) : null;
  const reached = steps.map((s) => late != null && ladderOffset(s.day) <= late);
  const last = reached.lastIndexOf(true);
  return steps.map((s, i) => ({ ...s, reached: reached[i]!, current: i === last }));
}

/** A cobrança mais antiga em aberto e vencida da assinatura. */
export function oldestLate(sub: Subscription, invoices: readonly Invoice[], today: string): Invoice | null {
  const late = invoicesOf(invoices, sub.id).filter((i) => i.status === 'pending' && i.dueDate < today);
  return late.length ? late[late.length - 1]! : null;
}

export function invoiceTitle(inv: Invoice): string {
  return inv.cycle && inv.id.startsWith(`sub_${inv.subscriptionId}_`) ? cycleTitle(inv.cycle) : inv.reference;
}

/* ── R4 · mudar plano ─────────────────────────────────────── */

export interface PlanChangePreview {
  periodEnd: string;
  days: number;
  cycleDays: number;
  cents: number;
  diffCents: number;
  /** Cobrança vencida em aberto: o servidor recusa "agora". */
  blockedByLate: Invoice | null;
  /** Cobrança do ciclo já enviada ao aluno (com link): o servidor recusa "agora". */
  blockedBySent: Invoice | null;
  /** Data em que o preço novo passa a valer em cada opção. */
  nowFrom: string;
  nextFrom: string;
}

export function planChangePreview(sub: Subscription, newCents: number, invoices: readonly Invoice[], today: string): PlanChangePreview {
  const open = invoicesOf(invoices, sub.id).filter((i) => i.status === 'pending');
  const late = open.filter((i) => i.dueDate < today);
  const upcoming = open.filter((i) => i.dueDate >= today && i.id.startsWith(`sub_${sub.id}_`)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  const periodEnd = upcoming ? upcoming.dueDate : sub.nextChargeDate;
  const pr = planChangeProration(sub.priceCents, newCents, today, periodEnd, sub.billingDay);
  return {
    periodEnd,
    ...pr,
    diffCents: newCents - sub.priceCents,
    blockedByLate: late.length ? late[late.length - 1]! : null,
    blockedBySent: upcoming?.providerUrl ? upcoming : null,
    nowFrom: periodEnd,
    nextFrom: sub.nextChargeDate,
  };
}

/** "(R$ 420 − R$ 320) × 15/31". */
export function prorationFormula(oldCents: number, newCents: number, days: number, cycleDays: number): string {
  return `(${formatBRL(newCents)} − ${formatBRL(oldCents)}) × ${days}/${cycleDays}`;
}

/* ── R5 · rodada ──────────────────────────────────────────── */

export type RunTone = 'green' | 'yellow' | 'red' | 'blue' | 'orange' | 'dim';

export interface RunLine {
  key: string;
  label: string;
  count: number;
  cents: number | null;
  tone: RunTone;
}

export function runLines(run: BillingRun): RunLine[] {
  const s = run.summary;
  return [
    { key: 'generated', label: 'Cobranças geradas', count: s.generated, cents: s.generatedCents, tone: 'orange' },
    { key: 'issued', label: 'Faturas no provedor', count: s.issued, cents: null, tone: 'green' },
    { key: 'issueFailed', label: 'Sem fatura online', count: s.issueFailed, cents: null, tone: 'yellow' },
    { key: 'skippedPaused', label: 'Puladas · pausadas', count: s.skippedPaused, cents: null, tone: 'dim' },
    { key: 'reminders', label: 'Lembretes D−3', count: s.reminders, cents: null, tone: 'blue' },
    { key: 'notices', label: 'Avisos da régua', count: s.notices, cents: null, tone: 'yellow' },
    { key: 'blocked', label: 'Check-in bloqueado', count: s.blocked, cents: null, tone: 'red' },
    { key: 'suspended', label: 'Suspensas', count: s.suspended, cents: null, tone: 'red' },
    { key: 'resumed', label: 'Pausas encerradas', count: s.resumed, cents: null, tone: 'green' },
    { key: 'packsCompleted', label: 'Pacotes concluídos', count: s.packsCompleted, cents: null, tone: 'dim' },
    { key: 'cancelledAtCycleEnd', label: 'Cancelamentos no fim do ciclo', count: s.cancelledAtCycleEnd, cents: null, tone: 'dim' },
    { key: 'errors', label: 'Erros', count: s.errors, cents: null, tone: 'red' },
  ];
}

/** Barra proporcional: o destino de cada ciclo que venceria na rodada. */
export function runBar(run: BillingRun): { label: string; count: number; tone: RunTone }[] {
  const s = run.summary;
  const offline = Math.max(0, s.generated - s.issued - s.issueFailed);
  return [
    { label: 'Fatura no provedor', count: s.issued, tone: 'green' as RunTone },
    { label: 'Sem fatura online', count: s.issueFailed, tone: 'yellow' as RunTone },
    { label: 'Sem link · baixa manual', count: offline, tone: 'orange' as RunTone },
    { label: 'Puladas · pausadas', count: s.skippedPaused, tone: 'dim' as RunTone },
    { label: 'Canceladas no fim do ciclo', count: s.cancelledAtCycleEnd, tone: 'blue' as RunTone },
  ].filter((b) => b.count > 0);
}

/** Motivos de "sem fatura online", agrupados. */
export function issueFailReasons(run: BillingRun): { reason: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of run.items) {
    if (it.kind === 'issue_failed') {
      const r = it.detail.trim() || 'Sem motivo informado';
      m.set(r, (m.get(r) ?? 0) + 1);
    }
  }
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export const RUN_KIND_LABEL: Record<BillingRunItemKind, [string, RunTone]> = {
  generated: ['Gerada', 'orange'],
  skipped: ['Pulada', 'dim'],
  issued: ['No provedor', 'green'],
  issue_failed: ['Sem fatura', 'yellow'],
  reminder: ['Lembrete', 'blue'],
  notice: ['Aviso', 'yellow'],
  blocked: ['Bloqueio', 'red'],
  suspended: ['Suspensa', 'red'],
  resumed: ['Retomada', 'green'],
  pack_completed: ['Pacote', 'dim'],
  cancelled: ['Encerrada', 'dim'],
};

/** Vencimento dos ciclos gerados pela rodada do dia. */
export function runDueDate(runDate: string): string {
  return addDays(runDate, GENERATE_DAYS_BEFORE);
}

/** Acompanhamento ao vivo das cobranças de ciclo que vencem `dueDate`. */
export function cycleProgress(invoices: readonly Invoice[], dueDate: string): { approved: number; pending: number; other: number; approvedCents: number; totalCents: number } {
  const r = { approved: 0, pending: 0, other: 0, approvedCents: 0, totalCents: 0 };
  for (const i of invoices) {
    if (!i.subscriptionId || i.dueDate !== dueDate || !i.id.startsWith(`sub_${i.subscriptionId}_`)) {
      continue;
    }
    r.totalCents += i.amountCents;
    if (i.status === 'approved') {
      r.approved++;
      r.approvedCents += i.amountCents;
    } else if (i.status === 'pending') {
      r.pending++;
    } else {
      r.other++;
    }
  }
  return r;
}
