import { formatDayKey } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { PAY_RULE_LABEL, describeRule, type Payout, type PayoutCalc, type PayoutLine, type PayoutStatus, type PayRule } from '../../domain/payouts';
import type { CsvCell } from '../../ui/csv';

export interface PayoutRow {
  coachUid: string;
  coachName: string;
  rule: PayRule;
  ruleLabel: string;
  status: PayoutStatus;
  /** O que vale para a linha: o fechamento gravado (fechado/pago) ou o cálculo ao vivo (aberto). */
  classesGiven: number;
  baseCents: number;
  totalCents: number;
  lines: PayoutLine[];
  pendingAttendance: number;
  /** Fechado, mas o cálculo de agora deu outro valor (chamada finalizada depois, estorno…). */
  outdated: boolean;
  liveTotalCents: number;
  payout: Payout | null;
}

export function payoutRows(
  coaches: readonly { uid: string; displayName: string }[],
  calcs: ReadonlyMap<string, PayoutCalc>,
  payouts: readonly Payout[],
): PayoutRow[] {
  const byCoach = new Map(payouts.map((p) => [p.coachUid, p]));
  // Quem saiu da equipe mas tem repasse fechado no mês continua aparecendo.
  const people = [...coaches.map((c) => ({ uid: c.uid, name: c.displayName }))];
  for (const p of payouts) {
    if (!people.some((x) => x.uid === p.coachUid)) people.push({ uid: p.coachUid, name: p.coachName });
  }
  return people
    .map(({ uid, name }) => {
      const calc = calcs.get(uid);
      const p = byCoach.get(uid) ?? null;
      const rule = p ? p.rule : (calc?.rule ?? { kind: 'none' as const, amountCents: 0, percent: 0 });
      const live = calc?.totalCents ?? 0;
      return {
        coachUid: uid,
        coachName: p?.coachName || name,
        rule,
        ruleLabel: describeRule(rule, formatBRL),
        status: p ? p.status : ('open' as const),
        classesGiven: p ? p.classesGiven : (calc?.classesGiven ?? 0),
        baseCents: p ? p.baseCents : (calc?.baseCents ?? 0),
        totalCents: p ? p.totalCents : live,
        lines: p ? p.lines : (calc?.lines ?? []),
        pendingAttendance: calc?.pendingAttendance ?? 0,
        outdated: p?.status === 'closed' && calc != null && calc.totalCents !== p.totalCents,
        liveTotalCents: live,
        payout: p,
      };
    })
    .filter((r) => r.payout || r.rule.kind !== 'none' || r.classesGiven > 0)
    .sort((a, b) => a.coachName.localeCompare(b.coachName, 'pt-BR'));
}

export interface PayoutTotals {
  totalCents: number;
  openCents: number;
  closedCents: number;
  paidCents: number;
  pendingAttendance: number;
  withoutRule: number;
}

export function payoutTotals(rows: readonly PayoutRow[]): PayoutTotals {
  const sum = (s: PayoutStatus) => rows.filter((r) => r.status === s).reduce((t, r) => t + r.totalCents, 0);
  return {
    totalCents: rows.reduce((t, r) => t + r.totalCents, 0),
    openCents: sum('open'),
    closedCents: sum('closed'),
    paidCents: sum('paid'),
    pendingAttendance: rows.reduce((t, r) => t + r.pendingAttendance, 0),
    withoutRule: rows.filter((r) => r.rule.kind === 'none').length,
  };
}

/** Pode fechar: tem regra, valor, e ainda não foi pago. */
export function canClose(r: PayoutRow): boolean {
  return r.status !== 'paid' && r.rule.kind !== 'none' && (r.status === 'open' ? r.liveTotalCents > 0 : r.outdated);
}

export function payoutsCsv(month: string, rows: readonly PayoutRow[]): CsvCell[][] {
  const out: CsvCell[][] = [['Mês', 'Professor', 'Regra', 'Aulas dadas', 'Base (R$)', 'Repasse (R$)', 'Situação', 'Pago em', 'Forma', 'Obs.']];
  for (const r of rows) {
    out.push([
      month,
      r.coachName,
      PAY_RULE_LABEL[r.rule.kind] + (r.rule.kind === 'none' ? '' : ` · ${r.ruleLabel}`),
      r.classesGiven,
      (r.baseCents / 100).toFixed(2),
      (r.totalCents / 100).toFixed(2),
      r.status === 'paid' ? 'Pago' : r.status === 'closed' ? 'Fechado' : 'Em aberto',
      r.payout?.paidOn ? formatDayKey(r.payout.paidOn, true) : '',
      r.payout?.paidMethod ?? '',
      r.payout?.note ?? '',
    ]);
  }
  return out;
}
