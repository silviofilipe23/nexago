/**
 * Repasse ao professor (fase 1: calculado aqui, pago por fora). Lógica pura.
 *
 * - Aula conta para quem DEU a aula (`session.coachUid` da data — substituto incluso) e só com a
 *   chamada finalizada (`status: done`). Cancelada ou sem chamada não conta.
 * - `per_class`: valor × aulas dadas. `monthly`: valor fixo no mês. `percent`: % do que foi pago no
 *   mês (aprovado, menos estorno) pelas matrículas das turmas em que ele é o titular.
 */
import type { ClassSession, Invoice, Enrollment, TrainingClass } from './models';

export type PayRuleKind = 'per_class' | 'percent' | 'monthly' | 'none';

export interface PayRule {
  kind: PayRuleKind;
  /** `per_class` e `monthly`. */
  amountCents: number;
  /** `percent` (0–100). */
  percent: number;
}

export const NO_RULE: PayRule = { kind: 'none', amountCents: 0, percent: 0 };

export const PAY_RULE_LABEL: Record<PayRuleKind, string> = {
  per_class: 'Por aula dada',
  percent: '% das mensalidades',
  monthly: 'Fixo mensal',
  none: 'Sem regra',
};

export type PayoutStatus = 'open' | 'closed' | 'paid';

export const PAYOUT_STATUS: Record<PayoutStatus, [string, string]> = {
  open: ['Em aberto', 'yellow'],
  closed: ['Fechado', 'blue'],
  paid: ['Pago', 'green'],
};

export interface PayoutLine {
  /** `class` = aula dada; `revenue` = pagamento que entra na base do percentual; `fixed` = mensal. */
  kind: 'class' | 'revenue' | 'fixed';
  ref: string;
  date: string;
  label: string;
  /** Valor que esta linha gera para o professor. */
  amountCents: number;
  /** Na linha de receita: quanto o aluno pagou (base do percentual). */
  baseCents: number;
}

export interface PayoutCalc {
  coachUid: string;
  rule: PayRule;
  classesGiven: number;
  /** Aulas dele já passadas, ainda sem chamada finalizada (não entram até finalizar). */
  pendingAttendance: number;
  baseCents: number;
  totalCents: number;
  lines: PayoutLine[];
}

export function monthRangeOf(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function readPayRule(raw: Record<string, unknown> | null | undefined): PayRule {
  const d = raw ?? {};
  const kind = (['per_class', 'percent', 'monthly'] as string[]).includes(String(d['kind'])) ? (d['kind'] as PayRuleKind) : 'none';
  const amount = Number(d['amountCents']);
  const percent = Number(d['percent']);
  return {
    kind,
    amountCents: Number.isInteger(amount) && amount > 0 ? amount : 0,
    percent: Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent : 0,
  };
}

export function payRuleError(r: PayRule): string | null {
  if ((r.kind === 'per_class' || r.kind === 'monthly') && r.amountCents <= 0) {
    return 'Informe o valor.';
  }
  if (r.kind === 'percent' && !(r.percent > 0 && r.percent <= 100)) {
    return 'O percentual vai de 0,1% a 100%.';
  }
  return null;
}

export function describeRule(r: PayRule, brl: (cents: number) => string): string {
  switch (r.kind) {
    case 'per_class':
      return `${brl(r.amountCents)} por aula`;
    case 'monthly':
      return `${brl(r.amountCents)} por mês`;
    case 'percent':
      return `${String(r.percent).replace('.', ',')}% das mensalidades`;
    default:
      return 'Sem regra definida';
  }
}

/** Dia de parede de um instante (aprovação da cobrança) no fuso do centro. */
export type DayOf = (at: Date) => string;

export function computePayout(input: {
  coachUid: string;
  rule: PayRule;
  month: string;
  today: string;
  sessions: readonly ClassSession[];
  classes: readonly TrainingClass[];
  enrollments: readonly Pick<Enrollment, 'id' | 'classId' | 'studentName'>[];
  invoices: readonly Invoice[];
  dayOf: DayOf;
}): PayoutCalc {
  const { from, to } = monthRangeOf(input.month);
  const mine = input.sessions.filter((s) => s.coachUid === input.coachUid && s.date >= from && s.date <= to);
  const given = mine.filter((s) => s.status === 'done').sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const pendingAttendance = mine.filter((s) => s.status === 'scheduled' && s.date < input.today).length;
  const r = input.rule;
  const lines: PayoutLine[] = [];
  let baseCents = 0;

  if (r.kind === 'per_class') {
    for (const s of given) {
      lines.push({ kind: 'class', ref: s.id, date: s.date, label: `${s.className} · ${s.startTime}`, amountCents: r.amountCents, baseCents: 0 });
    }
  } else if (r.kind === 'monthly') {
    lines.push({ kind: 'fixed', ref: input.month, date: from, label: 'Valor fixo do mês', amountCents: r.amountCents, baseCents: 0 });
  } else if (r.kind === 'percent') {
    const titularOf = new Set(input.classes.filter((c) => c.coachUid === input.coachUid).map((c) => c.id));
    const byEnrollment = new Map(input.enrollments.map((e) => [e.id, e]));
    for (const inv of input.invoices) {
      if (inv.status !== 'approved' && inv.status !== 'refunded') continue;
      const e = inv.enrollmentId ? byEnrollment.get(inv.enrollmentId) : undefined;
      if (!e || !titularOf.has(e.classId) || !inv.approvedAt) continue;
      const day = input.dayOf(inv.approvedAt);
      if (day < from || day > to) continue;
      const paid = Math.max(0, inv.amountCents - inv.refundedCents);
      if (paid === 0) continue;
      baseCents += paid;
      lines.push({
        kind: 'revenue',
        ref: inv.id,
        date: day,
        label: `${inv.payerName || e.studentName} · ${inv.reference}`,
        amountCents: Math.round((paid * r.percent) / 100),
        baseCents: paid,
      });
    }
    lines.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Percentual: arredonda no total (não soma arredondamentos de linha).
  const totalCents = r.kind === 'percent' ? Math.round((baseCents * r.percent) / 100) : lines.reduce((t, l) => t + l.amountCents, 0);
  return { coachUid: input.coachUid, rule: r, classesGiven: given.length, pendingAttendance, baseCents, totalCents, lines };
}

/** Repasse gravado (`payouts/{YYYY-MM}_{uid}`): retrato do fechamento. */
export interface Payout {
  id: string;
  month: string;
  coachUid: string;
  coachName: string;
  rule: PayRule;
  classesGiven: number;
  baseCents: number;
  totalCents: number;
  lines: PayoutLine[];
  status: Exclude<PayoutStatus, 'open'>;
  closedAt: Date | null;
  closedByName: string;
  paidAt: Date | null;
  paidOn: string;
  paidByName: string;
  paidMethod: string;
  note: string;
  /** Pagamento pelo NexaGO (só o servidor grava). */
  transferStatus: TransferStatus;
  transferAuthorized: boolean;
  transferError: string;
  /** Pagamento automático (servidor): dia em que sai sozinho, segurado pelo owner, motivo de falha. */
  autoPayAt: string;
  autoPayHold: boolean;
  autoPayError: string;
  closedBy: 'auto' | 'manual';
}

/** `settings/payouts` — automação do repasse (só o owner muda). Espelho do servidor. */
export interface PayoutAutomation {
  autoClose: boolean;
  closeDay: number;
  autoPay: boolean;
  reviewDays: number;
  maxAutoPayCents: number;
}

export const DEFAULT_AUTOMATION: PayoutAutomation = { autoClose: false, closeDay: 1, autoPay: false, reviewDays: 3, maxAutoPayCents: 0 };

export function readAutomation(raw: Record<string, unknown> | null | undefined): PayoutAutomation {
  const d = raw ?? {};
  const int = (k: keyof PayoutAutomation, min: number, max: number): number => {
    const v = Number(d[k]);
    return Number.isInteger(v) && v >= min && v <= max ? v : (DEFAULT_AUTOMATION[k] as number);
  };
  const autoClose = d['autoClose'] === true;
  return {
    autoClose,
    closeDay: int('closeDay', 1, 28),
    autoPay: autoClose && d['autoPay'] === true,
    reviewDays: int('reviewDays', 0, 15),
    maxAutoPayCents: int('maxAutoPayCents', 0, 100_000_000),
  };
}

export function describeAutomation(a: PayoutAutomation, brl: (c: number) => string): string {
  if (!a.autoClose) return 'Fechamento e pagamento à mão';
  const close = `Fecha sozinho todo dia ${String(a.closeDay).padStart(2, '0')}`;
  if (!a.autoPay) return `${close} · pagamento à mão`;
  const review = a.reviewDays ? `${a.reviewDays} ${a.reviewDays === 1 ? 'dia' : 'dias'} de conferência` : 'sem conferência';
  return `${close} · paga pelo NexaGO depois de ${review}${a.maxAutoPayCents ? ` · até ${brl(a.maxAutoPayCents)} por professor` : ''}`;
}

export type TransferStatus = '' | 'requested' | 'pending' | 'done' | 'failed' | 'unknown';

/** Transferência em andamento ou sem confirmação: nada muda no repasse até resolver. */
export function transferLocked(p: Pick<Payout, 'transferStatus'> | null): boolean {
  return !!p && (p.transferStatus === 'requested' || p.transferStatus === 'pending' || p.transferStatus === 'unknown');
}

export function payoutId(month: string, coachUid: string): string {
  return `${month}_${coachUid}`;
}

export const PAYOUT_METHODS: { value: string; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'other', label: 'Outro' },
];

export function paidMethodLabel(m: string): string {
  return m === 'nexago' ? 'Pelo NexaGO (Asaas)' : (PAYOUT_METHODS.find((x) => x.value === m)?.label ?? m);
}
