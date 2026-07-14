/** Espelha `functions/src/platform-fees.ts` — taxa sobre reservas no plano gratuito (%). */
export const ARENA_BOOKING_FEE_PERCENT = 5;

export function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `arenaWallets/{arenaId}`. */
export interface ArenaWalletSummary {
  availableReais: number;
  pendingReais: number;
}

export const ARENA_WALLET_SUMMARY_EMPTY: ArenaWalletSummary = { availableReais: 0, pendingReais: 0 };

/** Dados da reserva (`arenaBookings/{bookingId}`) usados só pra enriquecer a exibição de um
 *  lançamento do ledger — não há campo de esporte na reserva, e o nome do atleta exigiria uma
 *  segunda consulta em `users/{athleteId}` só pra exibição, então fica de fora. */
export interface FinanceBookingRef {
  courtName: string;
  customerLabel: string;
}

/** `arenaWallets/{arenaId}/ledger/{entryId}` — só lançamentos `type: 'credit'` existem hoje
 *  (`functions/src/arena-wallet.ts`). */
export interface ArenaLedgerEntry {
  id: string;
  bookingId: string | null;
  grossReais: number;
  netReais: number;
  platformFeeReais: number;
  createdAt: Date | null;
  booking: FinanceBookingRef | null;
}

export type ArenaWithdrawalStatus = 'pending' | 'approved' | 'rejected';

/** `arenaWithdrawals/{withdrawalId}`. */
export interface ArenaWithdrawalItem {
  id: string;
  amountReais: number;
  status: ArenaWithdrawalStatus;
  pixKey: string;
  createdAt: Date | null;
}

export type FinanceMovementStatus = 'ok' | 'pend' | 'fail';
export type FinanceMovementType = 'credit' | 'debit';

/** Linha unificada da lista "Movimentações" — junta ledger (créditos) e saques (débitos). */
export interface FinanceMovement {
  id: string;
  type: FinanceMovementType;
  amountReais: number;
  platformFeeReais: number;
  label: string;
  sub: string;
  dateLabel: string;
  createdAt: Date | null;
  status: FinanceMovementStatus;
}

export interface CourtRevenueRow {
  courtId: string;
  courtName: string;
  totalReais: number;
}

export interface FinancePendingSummary {
  count: number;
  totalReais: number;
}

export interface CourtRevenueResult {
  courtRows: CourtRevenueRow[];
  last7Days: { label: string; value: number }[];
  pending: FinancePendingSummary;
}

/** Valor inicial do signal de agregação, antes do primeiro carregamento — 7 dias vazios pra
 *  não deixar o gráfico sem pontos. */
export const COURT_REVENUE_EMPTY: CourtRevenueResult = {
  courtRows: [],
  last7Days: Array.from({ length: 7 }, () => ({ label: '', value: 0 })),
  pending: { count: 0, totalReais: 0 },
};

export interface ArenaWithdrawalRequestResult {
  withdrawalId: string;
  status: string;
  autoProcessed: boolean;
  message: string | null;
}
