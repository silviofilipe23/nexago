import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { WEEKDAY_LABELS } from './finance-movements';
import {
  ARENA_WALLET_SUMMARY_EMPTY,
  type ArenaLedgerEntry,
  type ArenaWalletSummary,
  type ArenaWithdrawalItem,
  type ArenaWithdrawalRequestResult,
  type ArenaWithdrawalStatus,
  type CourtRevenueResult,
  type FinanceBookingRef,
} from './finance.model';

/** Espelha `arena_wallet_repository.dart` (carteira/ledger/saques) e a agregação de
 *  `arena_dashboard_service.dart` (receita por quadra/dia) — leitura crua do Firestore,
 *  sem Cloud Function nova (só a callable de saque, que já existe:
 *  `functions/src/arena-booking-pix.ts:392`). */

function dateOf(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function numberOf(data: Record<string, unknown>, key: string): number {
  const v = data[key];
  return typeof v === 'number' ? v : 0;
}

function stringOf(data: Record<string, unknown>, key: string, fallback = ''): string {
  const v = data[key];
  return typeof v === 'string' && v.trim() ? v : fallback;
}

export async function fetchWallet(db: Firestore, arenaId: string): Promise<ArenaWalletSummary> {
  const snap = await getDoc(doc(db, 'arenaWallets', arenaId));
  if (!snap.exists()) return ARENA_WALLET_SUMMARY_EMPTY;
  const data = snap.data() as Record<string, unknown>;
  return { availableReais: numberOf(data, 'availableReais'), pendingReais: numberOf(data, 'pendingReais') };
}

async function fetchBookingRef(db: Firestore, bookingId: string): Promise<FinanceBookingRef | null> {
  const snap = await getDoc(doc(db, 'arenaBookings', bookingId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    courtName: stringOf(data, 'courtName', 'Quadra'),
    customerLabel: stringOf(data, 'customerName', 'Atleta do app'),
  };
}

export async function fetchLedgerEntries(db: Firestore, arenaId: string, take = 30): Promise<ArenaLedgerEntry[]> {
  const snap = await getDocs(query(collection(db, 'arenaWallets', arenaId, 'ledger'), orderBy('createdAt', 'desc'), limit(take)));
  const entries: ArenaLedgerEntry[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      bookingId: typeof data['bookingId'] === 'string' ? (data['bookingId'] as string) : null,
      grossReais: numberOf(data, 'grossReais'),
      netReais: numberOf(data, 'netReais'),
      platformFeeReais: numberOf(data, 'platformFeeReais'),
      createdAt: dateOf(data['createdAt']),
      booking: null,
    };
  });

  // Uma reserva pode gerar mais de um lançamento (ex.: sinal + quitação) — busca cada
  // reserva uma única vez em vez de repetir a leitura por lançamento.
  const uniqueBookingIds = [...new Set(entries.map((e) => e.bookingId).filter((id): id is string => id != null))];
  const bookingRefs = new Map<string, FinanceBookingRef | null>();
  await Promise.all(uniqueBookingIds.map(async (id) => bookingRefs.set(id, await fetchBookingRef(db, id))));
  for (const entry of entries) {
    if (entry.bookingId) entry.booking = bookingRefs.get(entry.bookingId) ?? null;
  }
  return entries;
}

const VALID_WITHDRAWAL_STATUS = new Set<ArenaWithdrawalStatus>(['pending', 'approved', 'rejected']);

export async function fetchWithdrawals(db: Firestore, arenaId: string, take = 20): Promise<ArenaWithdrawalItem[]> {
  const snap = await getDocs(
    query(collection(db, 'arenaWithdrawals'), where('arenaId', '==', arenaId), orderBy('createdAt', 'desc'), limit(take)),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const status = data['status'];
    return {
      id: d.id,
      amountReais: numberOf(data, 'amountReais'),
      status: VALID_WITHDRAWAL_STATUS.has(status as ArenaWithdrawalStatus) ? (status as ArenaWithdrawalStatus) : 'pending',
      pixKey: stringOf(data, 'pixKey'),
      createdAt: dateOf(data['createdAt']),
    };
  });
}

const COURT_REVENUE_BOOKING_LIMIT = 256; // paridade com arena_dashboard_service.dart:54 — evita índice composto novo.
const COURT_REVENUE_WINDOW_DAYS = 30;

// Constrói a chave a partir de ano/mês/dia LOCAIS (nunca `toISOString`, que converte pra UTC e
// pode virar o dia em fusos à frente de UTC) — espelha `calendarDateKey` (Flutter),
// `core/formatting/app_date_format.dart:10-14`.
function dateKeyDaysAgo(days: number, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isCanceledStatus(status: string): boolean {
  return status === 'canceled' || status === 'cancelled';
}

/** Espelha `ArenaDashboardService.fetchDashboardSnapshotsParallel` + `summarize`: uma única
 *  query `arenaId == X` com `limit`, sem `orderBy` (evita índice composto novo), agregada em
 *  memória por quadra e por dia dos últimos 30 dias. */
export async function fetchCourtRevenueAndPending(db: Firestore, arenaId: string, now: Date = new Date()): Promise<CourtRevenueResult> {
  const snap = await getDocs(query(collection(db, 'arenaBookings'), where('arenaId', '==', arenaId), limit(COURT_REVENUE_BOOKING_LIMIT)));

  const since = dateKeyDaysAgo(COURT_REVENUE_WINDOW_DAYS, now);
  const courtTotals = new Map<string, { name: string; total: number }>();
  const last7 = new Map<string, number>();
  for (let i = 6; i >= 0; i--) last7.set(dateKeyDaysAgo(i, now), 0);

  let pendingCount = 0;
  let pendingTotal = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const dateKey = typeof data['date'] === 'string' ? data['date'] : '';
    if (dateKey < since) continue;
    if (isCanceledStatus(stringOf(data, 'status'))) continue;

    const amount = numberOf(data, 'amountReais');
    const paymentStatus = stringOf(data, 'paymentStatus');

    if (paymentStatus === 'pending' || paymentStatus === 'partial') {
      pendingCount += 1;
      pendingTotal += amount;
      continue;
    }
    if (paymentStatus !== 'paid') continue;

    const courtId = stringOf(data, 'courtId', 'sem-quadra');
    const courtName = stringOf(data, 'courtName', 'Quadra');
    const current = courtTotals.get(courtId) ?? { name: courtName, total: 0 };
    current.total += amount;
    courtTotals.set(courtId, current);

    if (last7.has(dateKey)) last7.set(dateKey, (last7.get(dateKey) ?? 0) + amount);
  }

  const courtRows = [...courtTotals.entries()]
    .map(([courtId, v]) => ({ courtId, courtName: v.name, totalReais: v.total }))
    .sort((a, b) => b.totalReais - a.totalReais);

  const last7Days = [...last7.entries()].map(([dateKey, value]) => ({
    label: WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00`).getDay()]!,
    value,
  }));

  return { courtRows, last7Days, pending: { count: pendingCount, totalReais: pendingTotal } };
}

export async function requestWithdrawal(
  functions: Functions,
  arenaId: string,
  amountReais: number,
  pixKey: string,
): Promise<ArenaWithdrawalRequestResult> {
  // `pixKeyType` fica de fora: o backend infere o tipo a partir do formato da chave quando
  // não recebe um valor explícito (`resolveWithdrawalPixFields`, `functions/src/asaas-payout.ts:70-85`).
  const call = httpsCallable<Record<string, unknown>, ArenaWithdrawalRequestResult>(functions, 'requestArenaWithdrawal');
  const result = await call({ arenaId, amountReais, pixKey });
  return result.data;
}

export async function fetchArenaPayoutPixKey(db: Firestore, arenaId: string): Promise<string> {
  const snap = await getDoc(doc(db, 'arenas', arenaId));
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  return stringOf(data, 'payoutPixKey');
}

export async function setArenaPayoutPixKey(db: Firestore, arenaId: string, pixKey: string): Promise<void> {
  await updateDoc(doc(db, 'arenas', arenaId), { payoutPixKey: pixKey.trim() });
}
