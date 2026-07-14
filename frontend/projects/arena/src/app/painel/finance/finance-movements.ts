import { formatMovementDate } from '../stock/product.model';
import type { ArenaLedgerEntry, ArenaWithdrawalItem, FinanceMovement, FinanceMovementStatus } from './finance.model';

function maskPixKey(pixKey: string): string {
  if (!pixKey) return 'Chave PIX';
  return pixKey.length <= 8 ? pixKey : `${pixKey.slice(0, 8)}…`;
}

const WITHDRAWAL_STATUS_TO_MOVEMENT: Record<ArenaWithdrawalItem['status'], FinanceMovementStatus> = {
  pending: 'pend',
  approved: 'ok',
  rejected: 'fail',
};

/** Rótulo de status para exibição — "Recebido"/"Enviado" dependem do tipo mesmo quando o
 *  status bruto ("ok") é o mesmo, "Pendente"/"Falhou" não. */
export function movementStatusLabel(movement: Pick<FinanceMovement, 'type' | 'status'>): string {
  if (movement.status === 'pend') return 'Pendente';
  if (movement.status === 'fail') return 'Falhou';
  return movement.type === 'credit' ? 'Recebido' : 'Enviado';
}

/** Junta créditos (ledger) e saques (withdrawals) numa lista única, ordenada por data desc.
 *  Pura — sem Firestore — pra poder testar merge/ordenação isoladamente. */
export function mergeFinanceMovements(ledger: readonly ArenaLedgerEntry[], withdrawals: readonly ArenaWithdrawalItem[]): FinanceMovement[] {
  const credits: FinanceMovement[] = ledger.map((entry) => ({
    id: `ledger_${entry.id}`,
    type: 'credit',
    amountReais: entry.netReais,
    platformFeeReais: entry.platformFeeReais,
    label: entry.booking ? `Reserva · ${entry.booking.courtName}` : 'Reserva',
    sub: entry.booking?.customerLabel ?? 'Detalhe indisponível',
    dateLabel: formatMovementDate(entry.createdAt ?? undefined),
    createdAt: entry.createdAt,
    status: 'ok',
  }));

  const debits: FinanceMovement[] = withdrawals.map((w) => ({
    id: `withdrawal_${w.id}`,
    type: 'debit',
    amountReais: w.amountReais,
    platformFeeReais: 0,
    label: 'Saque PIX',
    sub: maskPixKey(w.pixKey),
    dateLabel: formatMovementDate(w.createdAt ?? undefined),
    createdAt: w.createdAt,
    status: WITHDRAWAL_STATUS_TO_MOVEMENT[w.status],
  }));

  return [...credits, ...debits].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

export type FinancePeriodKey = '7d' | '30d' | 'month' | 'lastMonth';

/** Início/fim (inclusive) de cada período suportado nos Relatórios — puro, testável isoladamente. */
export function periodRange(period: FinancePeriodKey, now: Date = new Date()): { start: Date; end: Date } {
  const dateOnly = (y: number, m: number, d: number) => new Date(y, m, d);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  switch (period) {
    case '7d':
      return { start: dateOnly(now.getFullYear(), now.getMonth(), now.getDate() - 6), end: endOfToday };
    case '30d':
      return { start: dateOnly(now.getFullYear(), now.getMonth(), now.getDate() - 29), end: endOfToday };
    case 'month':
      return { start: dateOnly(now.getFullYear(), now.getMonth(), 1), end: endOfToday };
    case 'lastMonth':
      return {
        start: dateOnly(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
  }
}

export function filterMovementsByPeriod(
  movements: readonly FinanceMovement[],
  period: FinancePeriodKey,
  now: Date = new Date(),
): FinanceMovement[] {
  const { start, end } = periodRange(period, now);
  return movements.filter((m) => m.createdAt != null && m.createdAt >= start && m.createdAt <= end);
}

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export interface DailyTotal {
  label: string;
  revenue: number;
  reservations: number;
}

/** Agrupa movimentações de crédito por dia, últimos `days` dias (hoje incluído no último
 *  bucket) — usado no gráfico de faturamento, sempre "últimos N dias" independente do
 *  filtro de período escolhido (mesmo comportamento do protótipo original). */
export function buildDailyTotals(movements: readonly FinanceMovement[], days = 7, now: Date = new Date()): DailyTotal[] {
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const buckets = new Map<string, DailyTotal>();
  const order: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = keyOf(d);
    order.push(key);
    buckets.set(key, { label: WEEKDAY_LABELS[d.getDay()]!, revenue: 0, reservations: 0 });
  }
  for (const m of movements) {
    if (m.type !== 'credit' || m.createdAt == null) continue;
    const bucket = buckets.get(keyOf(m.createdAt));
    if (!bucket) continue;
    bucket.revenue += m.amountReais;
    bucket.reservations += 1;
  }
  return order.map((key) => buckets.get(key)!);
}
