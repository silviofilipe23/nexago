import type { PillTone } from '../ui/pill.component';
import {
  CYCLE_LABEL,
  brl,
  type CancelReason,
  type CancelRequest,
  type Charge,
  type Enrollment,
  type PenaltyStatus,
} from './billing.model';
import { addDaysKey } from './class.model';

/** Tela Cancelamentos (canvas "Cancelar plano de aula · aviso prévio e multa", lado da arena):
 *  quem pediu para sair, até quando tem aula e a multa por quebra de fidelidade. Regras puras. */

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  routine: 'Mudança de rotina ou horário',
  price: 'Valor do plano',
  health: 'Lesão ou saúde',
  moved: 'Mudei de cidade',
  other: 'Outro motivo',
};

/** Rótulo curto para o número do topo ("Motivo nº 1"). */
export const CANCEL_REASON_SHORT: Record<CancelReason, string> = {
  routine: 'Rotina',
  price: 'Valor',
  health: 'Saúde',
  moved: 'Mudança',
  other: 'Outro',
};

/** Encerrados ficam na lista por este tempo depois da última aula. */
export const RECENT_CLOSED_DAYS = 60;

export interface CancellationRow {
  enrollment: Enrollment;
  request: CancelRequest;
  /** Cobrança `{matrícula}_penalty` (null = sem multa ou sem leitura). */
  penalty: Charge | null;
  penaltyState: PenaltyStatus;
  /** Valor da multa (o da cobrança quando existe). */
  penaltyReais: number;
  /** Última aula; cai no dia do pedido se a matrícula não tiver `endsOn`. */
  endsOn: string;
  /** Matrícula já encerrada (cancelada ou terminada). */
  closed: boolean;
}

/** Situação da multa: a cobrança manda (baixa manual não volta ao pedido); sem ela, vale o pedido. */
export function penaltyState(request: CancelRequest, charge: Pick<Charge, 'status'> | null): PenaltyStatus {
  if (charge?.status === 'paid') return 'paid';
  if (request.penaltyStatus === 'waived') return 'waived';
  if (charge?.status === 'open') return 'open';
  if (charge?.status === 'canceled') return 'waived';
  if (request.penaltyReais <= 0) return 'none';
  return request.penaltyStatus;
}

function isClosed(e: Pick<Enrollment, 'status'>): boolean {
  return e.status === 'canceled' || e.status === 'ended';
}

/** Linhas: quem tem pedido de cancelamento (encerrados só os recentes). Primeiro quem ainda tem
 *  aula, pela última aula mais próxima; depois os encerrados, do mais recente. */
export function buildCancellationRows(
  enrollments: readonly Enrollment[],
  penalties: ReadonlyMap<string, Charge>,
  todayKey: string,
): CancellationRow[] {
  const cutoff = addDaysKey(todayKey, -RECENT_CLOSED_DAYS);
  const rows: CancellationRow[] = [];
  for (const e of enrollments) {
    const request = e.cancelRequest;
    if (!request) continue;
    const endsOn = e.endsOn ?? request.requestedOn;
    const closed = isClosed(e);
    if (closed && endsOn < cutoff) continue;
    const penalty = penalties.get(e.id) ?? null;
    rows.push({
      enrollment: e,
      request,
      penalty,
      penaltyState: penaltyState(request, penalty),
      penaltyReais: penalty?.amountReais ?? request.penaltyReais,
      endsOn,
      closed,
    });
  }
  return rows.sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    return a.closed ? b.endsOn.localeCompare(a.endsOn) : a.endsOn.localeCompare(b.endsOn);
  });
}

export interface CancellationKpis {
  /** Última aula neste mês e matrícula ainda em curso. */
  leavingThisMonth: number;
  openPenaltiesReais: number;
  openPenaltiesStudents: number;
  paidPenaltiesReais: number;
  paidPenaltiesCount: number;
  topReason: { reason: CancelReason; label: string; count: number } | null;
}

export function cancellationKpis(rows: readonly CancellationRow[], todayKey: string): CancellationKpis {
  const month = todayKey.slice(0, 7);
  const open = rows.filter((r) => r.penaltyState === 'open');
  const paid = rows.filter((r) => r.penaltyState === 'paid' && (r.penalty?.paidOn ?? '').startsWith(month));
  const counts = new Map<CancelReason, number>();
  for (const r of rows) counts.set(r.request.reason, (counts.get(r.request.reason) ?? 0) + 1);
  let top: CancellationKpis['topReason'] = null;
  for (const [reason, count] of counts) {
    if (!top || count > top.count) top = { reason, label: CANCEL_REASON_LABEL[reason], count };
  }
  return {
    leavingThisMonth: rows.filter((r) => !r.closed && r.endsOn.startsWith(month)).length,
    openPenaltiesReais: round2(open.reduce((s, r) => s + r.penaltyReais, 0)),
    openPenaltiesStudents: new Set(open.map((r) => r.enrollment.studentId)).size,
    paidPenaltiesReais: round2(paid.reduce((s, r) => s + r.penaltyReais, 0)),
    paidPenaltiesCount: paid.length,
    topReason: top,
  };
}

export function penaltyPill(row: Pick<CancellationRow, 'penaltyState' | 'penaltyReais'>): { label: string; tone: PillTone } {
  switch (row.penaltyState) {
    case 'paid':
      return { label: `Paga ${brl(row.penaltyReais)}`, tone: 'green' };
    case 'open':
      return { label: `Em aberto ${brl(row.penaltyReais)}`, tone: 'yellow' };
    case 'waived':
      return { label: 'Isentada', tone: 'dim' };
    default:
      return { label: 'Sem multa', tone: 'dim' };
  }
}

/** "Vôlei 2x · Trimestral" (pacote não tem ciclo). */
export function planLine(e: Pick<Enrollment, 'plan' | 'cycle'>): string {
  if (e.plan.kind === 'package') return `${e.plan.name} · Pacote`;
  return `${e.plan.name} · ${CYCLE_LABEL[e.cycle]}`;
}

/** Conta da multa como o aluno viu ao cancelar. */
export function penaltyMath(row: Pick<CancellationRow, 'enrollment' | 'request' | 'penaltyReais'>): string {
  const { enrollment: e, request: r } = row;
  if (row.penaltyReais <= 0) {
    switch (r.kind) {
      case 'monthly': return 'Plano mensal: sem fidelidade, sem multa.';
      case 'prepaid': return 'Anual à vista: encerra no fim do período pago, sem multa e sem reembolso.';
      case 'package': return 'Pacote: sem multa.';
      default:
        return e.cancellationPolicy.penalty.kind === 'none'
          ? 'Contrato sem multa por quebra de fidelidade.'
          : 'Sai depois do fim da fidelidade: sem multa.';
    }
  }
  const p = e.cancellationPolicy.penalty;
  if (p.kind === 'fixed') return `Valor fixo do contrato = ${brl(row.penaltyReais)}`;
  const months = `${r.remainingMonths} mensalidade${r.remainingMonths === 1 ? '' : 's'}`;
  return `${months} × ${brl(e.plan.priceReais)} × ${p.percent ?? 0}% = ${brl(row.penaltyReais)}`;
}

export function canWaive(row: Pick<CancellationRow, 'penaltyState'>): boolean {
  return row.penaltyState === 'open';
}

/** Desfazer só com a matrícula em curso (o servidor recusa encerrada). */
export function canUndo(row: Pick<CancellationRow, 'enrollment' | 'closed'>): boolean {
  return !row.closed && row.enrollment.endsOn != null && (row.enrollment.status === 'active' || row.enrollment.status === 'paused');
}

export function canEndNow(row: Pick<CancellationRow, 'enrollment' | 'closed'>): boolean {
  return !row.closed && row.enrollment.status !== 'pending_payment';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
