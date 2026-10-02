/**
 * Cashback do atleta no portal — tipos, leitura dos docs e formatação. Puro, sem I/O.
 *
 * Contrato do backend (fase 1): `appConfig/cashback` normalizado como em
 * `functions/src/cashback-config.ts`; `athleteWallets/{uid}` (doc ausente = carteira zerada),
 * `/ledger` (extrato; `amountCents` sempre positivo, o sinal vem do `type`) e
 * `/lots/{asaasPaymentId}`. Valores em centavos inteiros; reais só nas bordas.
 */

export interface CashbackConfig {
  enabled: boolean;
  ratePercent: number;
  maxShareOfFee: number;
  minCashCents: number;
  expiryMonths: number;
  expiryWarningDays: number;
}

/** Espelho de `DEFAULT_CASHBACK_CONFIG` do backend — desligado por padrão. */
export const DEFAULT_CASHBACK_CONFIG: CashbackConfig = {
  enabled: false,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
};

/** Mesmo arredondamento do `toCents` do backend: `Math.round`, nunca `floor`
 *  (`19.99 * 100` dá `1998.9999…`). */
export function reaisToCents(reais: number): number {
  return Number.isFinite(reais) ? Math.round(reais * 100) : 0;
}

function numberInRange(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= min && raw <= max ? raw : fallback;
}

/** Espelho de `parseCashbackConfig` do backend: mesmas faixas, mesmo padrão. */
export function parseCashbackConfig(raw: Record<string, unknown> | undefined): CashbackConfig {
  const d = DEFAULT_CASHBACK_CONFIG;
  if (!raw) return { ...d };
  return {
    enabled: raw['enabled'] === true,
    ratePercent: numberInRange(raw['ratePercent'], 0, 20, d.ratePercent),
    maxShareOfFee: numberInRange(raw['maxShareOfFee'], 0, 1, d.maxShareOfFee),
    minCashCents: reaisToCents(numberInRange(raw['minCashReais'], 0, 1000, d.minCashCents / 100)),
    expiryMonths: Math.round(numberInRange(raw['expiryMonths'], 1, 60, d.expiryMonths)),
    expiryWarningDays: Math.round(numberInRange(raw['expiryWarningDays'], 0, 90, d.expiryWarningDays)),
  };
}

export interface CashbackWallet {
  availableCents: number;
  pendingCents: number;
  heldCents: number;
  lifetimeEarnedCents: number;
  lifetimeRedeemedCents: number;
  nextExpiryAt: Date | null;
  nextExpiryCents: number;
}

export const EMPTY_CASHBACK_WALLET: CashbackWallet = {
  availableCents: 0,
  pendingCents: 0,
  heldCents: 0,
  lifetimeEarnedCents: 0,
  lifetimeRedeemedCents: 0,
  nextExpiryAt: null,
  nextExpiryCents: 0,
};

/** Centavos inteiros e nunca negativos; qualquer outra coisa conta como zero. */
function cents(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

function toDate(raw: unknown): Date | null {
  const t = raw as { toDate?: () => Date } | null | undefined;
  if (t && typeof t.toDate === 'function') {
    const d = t.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  return null;
}

/** Doc ausente = carteira zerada. */
export function cashbackWalletFromData(data: Record<string, unknown> | undefined): CashbackWallet {
  if (!data) return { ...EMPTY_CASHBACK_WALLET };
  return {
    availableCents: cents(data['availableCents']),
    pendingCents: cents(data['pendingCents']),
    heldCents: cents(data['heldCents']),
    lifetimeEarnedCents: cents(data['lifetimeEarnedCents']),
    lifetimeRedeemedCents: cents(data['lifetimeRedeemedCents']),
    nextExpiryAt: toDate(data['nextExpiryAt']),
    nextExpiryCents: cents(data['nextExpiryCents']),
  };
}

export type CashbackLedgerType = 'earn' | 'release' | 'cancel' | 'redeem' | 'expire' | 'reverse' | 'refund';

export interface CashbackLedgerEntry {
  id: string;
  type: CashbackLedgerType;
  amountCents: number;
  label: string;
  createdAt: Date;
}

const LEDGER_TYPES: ReadonlySet<string> = new Set([
  'earn',
  'release',
  'cancel',
  'redeem',
  'expire',
  'reverse',
  'refund',
]);

/** Linha que o portal não sabe mostrar (tipo novo do backend, valor zerado, sem data) fica de
 *  fora: some uma linha, não a página. */
export function cashbackLedgerEntryFromData(
  id: string,
  data: Record<string, unknown> | undefined,
): CashbackLedgerEntry | null {
  if (!data) return null;
  const type = data['type'];
  if (typeof type !== 'string' || !LEDGER_TYPES.has(type)) return null;
  const amountCents = cents(data['amountCents']);
  const createdAt = toDate(data['createdAt']);
  if (amountCents === 0 || !createdAt) return null;
  const label = typeof data['label'] === 'string' ? data['label'].trim() : '';
  return { id, type: type as CashbackLedgerType, amountCents, label, createdAt };
}

export type CashbackLotStatus = 'pending' | 'available' | 'consumed' | 'expired' | 'cancelled' | 'reversed';

export interface CashbackLot {
  id: string;
  status: CashbackLotStatus;
  earnedCents: number;
  remainingCents: number;
  label: string;
}

const LOT_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'available',
  'consumed',
  'expired',
  'cancelled',
  'reversed',
]);

export function cashbackLotFromData(id: string, data: Record<string, unknown> | undefined): CashbackLot | null {
  if (!data) return null;
  const status = data['status'];
  if (typeof status !== 'string' || !LOT_STATUSES.has(status)) return null;
  return {
    id,
    status: status as CashbackLotStatus,
    earnedCents: cents(data['earnedCents']),
    remainingCents: cents(data['remainingCents']),
    label: typeof data['label'] === 'string' ? data['label'].trim() : '',
  };
}

/** Entrada do cashback no painel: recurso ligado E algum saldo (disponível + pendente). */
export function cashbackEntryVisible(config: CashbackConfig, wallet: CashbackWallet): boolean {
  return config.enabled && wallet.availableCents + wallet.pendingCents > 0;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 2,40" com espaço comum — o `Intl` põe NBSP (U+00A0) entre o símbolo e o número; aqui
 *  normalizamos para o espaço comum que o design pede. */
export function formatCentsBRL(value: number): string {
  return BRL.format(Math.round(value) / 100).replace(/ /g, ' ');
}

/** 2 → "2"; 2.5 → "2,5". */
export function formatRatePercent(rate: number): string {
  return rate.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** "12/10" — dia e mês no fuso do navegador. */
export function formatShortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Sinal de menos tipográfico (U+2212) — o caractere literal colado aqui, uma vez só. Em
 *  qualquer outro arquivo, usar esta constante (ou `&minus;` no template) — nunca digitar o
 *  caractere à mão. */
export const MINUS_SIGN = '−';

export type CashbackLedgerTone = 'pending' | 'win' | 'brand' | 'muted';
export type CashbackLedgerIcon = 'clock' | 'check' | 'x' | 'tag' | 'undo';

interface LedgerTypeView {
  title: string;
  sign: string;
  tone: CashbackLedgerTone;
  icon: CashbackLedgerIcon;
  suffix: string | null;
  struck: boolean;
}

const LEDGER_VIEW: Record<CashbackLedgerType, LedgerTypeView> = {
  earn: { title: 'Cashback ganho', sign: '+', tone: 'pending', icon: 'clock', suffix: 'pendente', struck: false },
  release: { title: 'Cashback liberado', sign: '+', tone: 'win', icon: 'check', suffix: null, struck: false },
  cancel: { title: 'Cashback cancelado', sign: MINUS_SIGN, tone: 'muted', icon: 'x', suffix: null, struck: true },
  redeem: { title: 'Usado no pagamento', sign: MINUS_SIGN, tone: 'brand', icon: 'tag', suffix: null, struck: false },
  expire: { title: 'Venceu', sign: MINUS_SIGN, tone: 'muted', icon: 'clock', suffix: null, struck: false },
  reverse: { title: 'Estornado', sign: MINUS_SIGN, tone: 'muted', icon: 'undo', suffix: null, struck: false },
  refund: { title: 'Devolvido ao saldo', sign: '+', tone: 'win', icon: 'undo', suffix: null, struck: false },
};

export interface CashbackLedgerRow {
  id: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  amountLabel: string;
  tone: CashbackLedgerTone;
  icon: CashbackLedgerIcon;
  suffix: string | null;
  struck: boolean;
}

export function cashbackLedgerRow(entry: CashbackLedgerEntry): CashbackLedgerRow {
  const view = LEDGER_VIEW[entry.type];
  return {
    id: entry.id,
    title: view.title,
    subtitle: entry.label,
    dateLabel: formatShortDate(entry.createdAt),
    amountLabel: `${view.sign}${formatCentsBRL(entry.amountCents)}`,
    tone: view.tone,
    icon: view.icon,
    suffix: view.suffix,
    struck: view.struck,
  };
}

export interface CashbackLedgerMonth {
  key: string;
  title: string;
  rows: CashbackLedgerRow[];
}

const MONTH_TITLE_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** Agrupa pelo mês do navegador ("outubro de 2026"), mantendo a ordem de chegada — o extrato
 *  já vem `createdAt desc`. */
export function groupLedgerByMonth(entries: readonly CashbackLedgerEntry[]): CashbackLedgerMonth[] {
  const months: CashbackLedgerMonth[] = [];
  for (const entry of entries) {
    const d = entry.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let month = months.find((m) => m.key === key);
    if (!month) {
      month = { key, title: MONTH_TITLE_FMT.format(d), rows: [] };
      months.push(month);
    }
    month.rows.push(cashbackLedgerRow(entry));
  }
  return months;
}
