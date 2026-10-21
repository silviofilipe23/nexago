import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';

/** Espelha `nexago_app/.../arena/data/arena_wallet_repository.dart` +
 *  `arena_financial_logic.dart` — schema real de `arenaWallets/{arenaId}` (+ subcoleção
 *  `ledger`) e `arenaWithdrawals`. `pendingReais` é dinheiro reservado durante um saque em
 *  andamento (movido de `availableReais` por `reserveWithdrawalAmount`), não é "a receber". */

export interface ArenaWalletSummary {
  availableReais: number;
  pendingReais: number;
  /** Cartão aprovado que o Asaas ainda não liquidou (reserva ou mensalidade): já vem sem as
   *  taxas e entra em `availableReais` no RECEIVED, cerca de 32 dias depois. Não é sacável. */
  awaitingSettlementReais: number;
}

/** De onde veio a linha do extrato (`ledger.source`; reserva não grava o campo). */
export type ArenaLedgerSource = 'booking' | 'class' | 'club';

export interface ArenaLedgerEntry {
  id: string;
  /** `credit`, `refund` (estorno debita o líquido: valores negativos) ou `class_payout`
   *  (repasse de aulas pago ao professor pelo nexaGO — também negativo, mas não é estorno). */
  type: string;
  source: ArenaLedgerSource;
  netReais: number;
  grossReais: number;
  bookingId: string | null;
  /** Só em `class_payout`: professor e mês (`YYYY-MM`) do repasse. */
  teacherName: string | null;
  month: string | null;
  createdAt: Date | null;
}

export interface ArenaWithdrawalItem {
  id: string;
  /** Bruto: o que sai do saldo da carteira. */
  amountReais: number;
  /** Tarifa de saque retida (Elite é isento). `null` em docs anteriores à tarifa. */
  feeReais: number | null;
  /** Líquido efetivamente transferido por PIX. `null` em docs antigos. */
  netReais: number | null;
  status: string;
  pixKey: string;
  createdAt: Date | null;
  payoutStatus: string | null;
  asaasTransferId: string | null;
}

export interface ArenaWithdrawalRequestResult {
  withdrawalId: string;
  status: string;
  payoutStatus: string | null;
  autoProcessed: boolean;
  processingMode: string | null;
  message: string | null;
  asaasTransferId: string | null;
}

function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

export function walletSummaryFromData(data: Record<string, unknown> | undefined): ArenaWalletSummary {
  const awaiting = data?.['awaitingSettlementReais'];
  return {
    availableReais: typeof data?.['availableReais'] === 'number' ? data['availableReais'] : 0,
    pendingReais: typeof data?.['pendingReais'] === 'number' ? data['pendingReais'] : 0,
    awaitingSettlementReais: typeof awaiting === 'number' && awaiting > 0 ? awaiting : 0,
  };
}

function ledgerSourceOf(raw: unknown): ArenaLedgerSource {
  return raw === 'class' || raw === 'club' ? raw : 'booking';
}

export function ledgerEntryFromDoc(doc: QueryDocumentSnapshot): ArenaLedgerEntry {
  const d = doc.data() as Record<string, unknown>;
  return ledgerEntryFromData(doc.id, d);
}

export function ledgerEntryFromData(id: string, d: Record<string, unknown>): ArenaLedgerEntry {
  return {
    id,
    type: typeof d['type'] === 'string' ? d['type'] : 'credit',
    source: ledgerSourceOf(d['source']),
    netReais: typeof d['netReais'] === 'number' ? d['netReais'] : 0,
    grossReais: typeof d['grossReais'] === 'number' ? d['grossReais'] : 0,
    bookingId: typeof d['bookingId'] === 'string' ? d['bookingId'] : null,
    teacherName: typeof d['teacherName'] === 'string' && d['teacherName'] ? d['teacherName'] : null,
    month: typeof d['month'] === 'string' && d['month'] ? d['month'] : null,
    createdAt: toDate(d['createdAt']),
  };
}

export function withdrawalFromDoc(doc: QueryDocumentSnapshot): ArenaWithdrawalItem {
  const d = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    amountReais: typeof d['amountReais'] === 'number' ? d['amountReais'] : 0,
    feeReais: typeof d['feeReais'] === 'number' ? d['feeReais'] : null,
    netReais: typeof d['netReais'] === 'number' ? d['netReais'] : null,
    status: typeof d['status'] === 'string' ? d['status'] : 'pending',
    pixKey: typeof d['pixKey'] === 'string' ? d['pixKey'] : '',
    createdAt: toDate(d['createdAt']),
    payoutStatus: typeof d['payoutStatus'] === 'string' ? d['payoutStatus'] : null,
    asaasTransferId: typeof d['asaasTransferId'] === 'string' ? d['asaasTransferId'] : null,
  };
}

// ── Pix key type (espelha payout_pix_key_type.dart) ──────────────────────────

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

export const PIX_KEY_TYPE_LABEL: Record<PixKeyType, string> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  PHONE: 'Celular (com DDD)',
  EVP: 'Chave aleatória',
};

export const PIX_KEY_TYPE_HINT: Record<PixKeyType, string> = {
  CPF: 'Somente números do CPF',
  CNPJ: 'Somente números do CNPJ',
  EMAIL: 'ex.: arena@email.com',
  PHONE: 'DDD + número, só dígitos (11)',
  EVP: 'UUID da chave aleatória',
};

function digitsOnly(v: string): string {
  return v.replace(/\D/g, '');
}

function isValidCpf(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const n = d.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += n[i]! * (10 - i);
  let r = sum % 11;
  const d1 = r < 2 ? 0 : 11 - r;
  if (n[9] !== d1) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += n[i]! * (11 - i);
  r = sum % 11;
  const d2 = r < 2 ? 0 : 11 - r;
  return n[10] === d2;
}

function charValue(c: string): number {
  return c.charCodeAt(0) - 48;
}

function isValidCnpj(s: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(s) || /^(\d)\1{13}$/.test(s)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += charValue(s[i]!) * w1[i]!;
  let r = sum % 11;
  const d1 = r < 2 ? 0 : 11 - r;
  if (Number(s[12]) !== d1) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += charValue(s[i]!) * w2[i]!;
  r = sum % 11;
  const d2 = r < 2 ? 0 : 11 - r;
  return Number(s[13]) === d2;
}

const EVP_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Espelha `PayoutPixKeyType.inferFromKey`. */
export function inferPixKeyType(pixKey: string): PixKeyType {
  const key = pixKey.trim();
  if (key.includes('@')) return 'EMAIL';
  const digits = digitsOnly(key);
  if (digits.length === 11) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  if (EVP_PATTERN.test(key)) return 'EVP';
  if (digits.length >= 10 && digits.length <= 13) return 'PHONE';
  return 'EMAIL';
}

/** Espelha `PayoutPixKeyType.validateKey` — `null` = válido (ou vazio, sem erro ainda). */
export function validatePixKey(type: PixKeyType, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  switch (type) {
    case 'CPF': {
      const d = digitsOnly(trimmed);
      if (d.length !== 11) return 'CPF deve ter 11 dígitos';
      return isValidCpf(d) ? null : 'CPF inválido';
    }
    case 'CNPJ': {
      const d = trimmed.toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (d.length !== 14) return 'CNPJ deve ter 14 caracteres';
      return isValidCnpj(d) ? null : 'CNPJ inválido';
    }
    case 'EMAIL':
      return trimmed.includes('@') && trimmed.length >= 5 ? null : 'E-mail inválido';
    case 'PHONE': {
      const d = digitsOnly(trimmed);
      return d.length >= 10 && d.length <= 11 ? null : 'Telefone com DDD: 10 ou 11 dígitos (ex.: 62999853983)';
    }
    case 'EVP':
      return EVP_PATTERN.test(trimmed) ? null : 'Chave aleatória inválida';
  }
}

export function maskPixKey(key: string): string {
  const trimmed = key.trim();
  return trimmed.length <= 12 ? trimmed : `${trimmed.slice(0, 8)}…`;
}

// ── Movimentações / estatísticas (espelha arena_financial_logic.dart) ───────

export type FinancialPeriod = 7 | 30 | 90;
export type FinancialHistoryFilter = 'all' | 'receipts' | 'withdrawals';

export interface FinancialMovement {
  id: string;
  kind: 'receipt' | 'withdrawal';
  title: string;
  at: Date | null;
  /** Valor exibido: no saque é o LÍQUIDO recebido quando o doc tem `netReais`. */
  amountReais: number;
  /** Detalhe do saque ("bruto − tarifa"); `null` em docs antigos, sem tarifa. */
  note: string | null;
  statusLabel: string;
  isPositive: boolean;
  isFailed: boolean;
}

/** Extrato do saque: mostra o líquido que caiu na conta e de onde saiu a diferença.
 *  Docs anteriores à tarifa (sem `feeReais`/`netReais`) seguem exibindo só o valor. */
export function withdrawalMovementAmounts(
  w: Pick<ArenaWithdrawalItem, 'amountReais' | 'feeReais' | 'netReais'>,
): { amountReais: number; note: string | null } {
  const fee = w.feeReais;
  const net = w.netReais;
  if (typeof net !== 'number' || typeof fee !== 'number' || fee <= 0) {
    return { amountReais: net ?? w.amountReais, note: null };
  }
  return {
    amountReais: net,
    note: `Bruto ${formatBRL(w.amountReais)} · tarifa ${formatBRL(fee)}`,
  };
}

export function withdrawalIsFailed(item: Pick<ArenaWithdrawalItem, 'status' | 'payoutStatus'>): boolean {
  const payout = item.payoutStatus?.trim().toLowerCase() ?? '';
  const status = item.status.trim().toLowerCase();
  return payout === 'failed' || status === 'rejected';
}

export function withdrawalStatusLabel(item: Pick<ArenaWithdrawalItem, 'status' | 'payoutStatus'>): string {
  const payout = item.payoutStatus?.trim().toLowerCase() ?? '';
  if (payout === 'failed') return 'FALHOU';
  // `paid` só chega com a conclusão da transferência no Asaas; `sent` é o PIX criado.
  if (payout === 'paid') return 'PAGO';
  if (payout === 'sent' || item.status.trim().toLowerCase() === 'approved') return 'ENVIADO';
  if (item.status.trim().toLowerCase() === 'rejected') return 'FALHOU';
  return 'PENDENTE';
}

const LEDGER_SOURCE_LABEL: Record<ArenaLedgerSource, string> = {
  booking: 'Reserva',
  class: 'Mensalidade de aula',
  club: 'Clubinho',
};

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** `2026-09` → "setembro/2026" (o mesmo jeito que a tela de repasse escreve o mês). */
function payoutMonthLabel(month: string | null): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  const name = m ? MONTH_NAMES[Number(m[2]) - 1] : undefined;
  return m && name ? `${name}/${m[1]}` : null;
}

export function isClassPayoutEntry(entry: Pick<ArenaLedgerEntry, 'type'>): boolean {
  return entry.type === 'class_payout';
}

/** Linha do extrato: origem no título e, quando houve taxa, o bruto e quanto ficou nela (o
 *  valor da linha é sempre o líquido que entrou no saldo). Estorno sai como débito; repasse de
 *  aulas pago pelo nexaGO sai como saída paga ("Repasse · professor · mês"), não como estorno. */
export function ledgerMovement(entry: ArenaLedgerEntry, arenaLabel: string): FinancialMovement {
  if (isClassPayoutEntry(entry)) {
    const title = ['Repasse', entry.teacherName ?? 'Professor', payoutMonthLabel(entry.month)].filter(Boolean).join(' · ');
    return {
      id: `ledger-${entry.id}`,
      kind: 'withdrawal',
      title,
      at: entry.createdAt,
      amountReais: Math.abs(entry.netReais),
      note: 'Pago pelo nexaGO',
      statusLabel: 'PAGO',
      isPositive: false,
      isFailed: false,
    };
  }
  const refund = entry.type === 'refund' || entry.netReais < 0;
  const base = entry.source === 'booking' ? `Reserva · ${arenaLabel}` : LEDGER_SOURCE_LABEL[entry.source];
  const fees = Math.round((entry.grossReais - entry.netReais) * 100) / 100;
  return {
    id: `ledger-${entry.id}`,
    kind: 'receipt',
    title: refund ? `Estorno · ${LEDGER_SOURCE_LABEL[entry.source]}` : base,
    at: entry.createdAt,
    amountReais: Math.abs(entry.netReais),
    note: !refund && fees > 0 ? `Bruto ${formatBRL(entry.grossReais)} · taxas ${formatBRL(fees)}` : null,
    statusLabel: refund ? 'ESTORNADO' : 'RECEBIDO',
    isPositive: !refund,
    isFailed: false,
  };
}

export function buildFinancialMovements(ledger: readonly ArenaLedgerEntry[], withdrawals: readonly ArenaWithdrawalItem[], arenaName: string): FinancialMovement[] {
  const arenaLabel = arenaName.trim() || 'Arena';
  const items: FinancialMovement[] = ledger.map((entry) => ledgerMovement(entry, arenaLabel));

  for (const w of withdrawals) {
    const { amountReais, note } = withdrawalMovementAmounts(w);
    items.push({
      id: `withdrawal-${w.id}`,
      kind: 'withdrawal',
      title: 'Saque PIX',
      at: w.createdAt,
      amountReais,
      note,
      statusLabel: withdrawalStatusLabel(w),
      isPositive: false,
      isFailed: withdrawalIsFailed(w),
    });
  }

  return items.sort((a, b) => (b.at?.getTime() ?? -Infinity) - (a.at?.getTime() ?? -Infinity));
}

export function filterFinancialMovements(items: readonly FinancialMovement[], filter: FinancialHistoryFilter): FinancialMovement[] {
  if (filter === 'all') return [...items];
  const kind = filter === 'receipts' ? 'receipt' : 'withdrawal';
  return items.filter((m) => m.kind === kind);
}

export interface FinancialPeriodStats {
  receivedReais: number;
  withdrawnReais: number;
}

function isWithinPeriod(at: Date | null, days: number): boolean {
  if (!at) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60_000;
  return at.getTime() >= cutoff;
}

export function computeFinancialPeriodStats(ledger: readonly ArenaLedgerEntry[], withdrawals: readonly ArenaWithdrawalItem[], period: FinancialPeriod): FinancialPeriodStats {
  let received = 0;
  let withdrawn = 0;
  for (const entry of ledger) {
    if (!isWithinPeriod(entry.createdAt, period)) continue;
    // Repasse ao professor é saída do caixa, não "recebimento" negativo.
    if (isClassPayoutEntry(entry)) withdrawn += Math.abs(entry.netReais);
    else received += entry.netReais;
  }
  for (const w of withdrawals) {
    if (!isWithinPeriod(w.createdAt, period) || withdrawalIsFailed(w)) continue;
    withdrawn += w.amountReais;
  }
  return { receivedReais: received, withdrawnReais: withdrawn };
}

const MOVEMENT_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const MOVEMENT_DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

export function formatFinancialMovementTimestamp(at: Date | null): string {
  if (!at) return 'Data indisponível';
  const now = new Date();
  const time = MOVEMENT_TIME_FORMAT.format(at);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(at, now)) return `Hoje, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(at, yesterday)) return `Ontem, ${time}`;
  return `${MOVEMENT_DATE_FORMAT.format(at)}, ${time}`;
}

/** Estimativa (não é data garantida): só aparece quando há saque em andamento (`pendingReais`). */
export function formatNextPayoutLabel(pendingReais: number): string {
  if (pendingReais <= 0.001) return '—';
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return MOVEMENT_DATE_FORMAT.format(d);
}

export function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
