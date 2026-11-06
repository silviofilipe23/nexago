/**
 * Financeiro da empresa — espelho do retorno de `getCompanyFinance`
 * (`functions/src/backoffice-company-finance.ts` + `company-finance.ts`). Mudou lá, muda aqui.
 * Dinheiro em centavos; meses `YYYY-MM` civis de São Paulo.
 */

export const REVENUE_SOURCES = [
  'torneios', 'quadras', 'aulas', 'horarios', 'clubinho', 'planosArena',
  'saques', 'loja', 'professores', 'centros', 'planosNexago',
] as const;
export type RevenueSource = (typeof REVENUE_SOURCES)[number];

export const DEDUCTIONS = ['cashback', 'squadDiscount', 'squadCommission'] as const;
export type Deduction = (typeof DEDUCTIONS)[number];

export const SOURCE_LABEL: Record<RevenueSource, string> = {
  torneios: 'Torneios',
  quadras: 'Aluguel de quadra',
  aulas: 'Aulas',
  horarios: 'Planos de horário',
  clubinho: 'Clubinho',
  planosArena: 'Planos das arenas',
  saques: 'Tarifas de saque',
  loja: 'Loja',
  professores: 'Professores',
  centros: 'Centros de treino',
  planosNexago: 'Planos nexaGO',
};

/** Fontes cuja taxa é estimada (o split do Asaas não grava a parte da plataforma). */
export const ESTIMATED_SOURCES: ReadonlySet<RevenueSource> = new Set(['professores', 'centros']);

export const DEDUCTION_LABEL: Record<Deduction, string> = {
  cashback: 'Cashback usado',
  squadDiscount: 'Desconto NexaSquad',
  squadCommission: 'Comissão dos embaixadores',
};

export interface MonthResult {
  key: string;
  revenue: Record<RevenueSource, number>;
  deductions: Record<Deduction, number>;
  /** `null` = extrato do Asaas indisponível. */
  asaasFees: number | null;
  feesRecovered: number;
  stockPurchases: number;
  operatingCosts: number;
}

export interface Holding {
  availableCents: number;
  pendingCents: number;
  awaitingCents: number;
  count: number;
}

export type ThirdPartyKind = 'tournaments' | 'organizersLegacy' | 'arenas' | 'professors' | 'squad';

export const THIRD_PARTY_LABEL: Record<ThirdPartyKind, string> = {
  tournaments: 'Caixas de torneio',
  organizersLegacy: 'Organizadores (carteira antiga)',
  arenas: 'Carteiras de arena',
  professors: 'Professores da equipe',
  squad: 'Embaixadores Squad (saldo)',
};

export const THIRD_PARTY_ORDER: readonly ThirdPartyKind[] = ['tournaments', 'organizersLegacy', 'arenas', 'professors', 'squad'];

export type HolderKind = 'torneio' | 'arena' | 'organizador' | 'professor' | 'embaixador';

export interface Holder {
  kind: HolderKind;
  id: string;
  name: string | null;
  availableCents: number;
  pendingCents: number;
}

export interface StuckWithdrawal {
  kind: 'organizador' | 'arena' | 'professor';
  id: string;
  amountCents: number;
  payoutStatus: string;
  approvedAt: Date | null;
}

export interface StatementEntry {
  id: string;
  date: string;
  type: string;
  description: string;
  valueCents: number;
  balanceCents: number | null;
}

export interface CompanyFinance {
  month: string;
  generatedAt: Date | null;
  balance: {
    asaasCents: number | null;
    thirdPartyCents: number;
    provisionsCents: number;
    companyCents: number | null;
    freeCents: number | null;
  };
  thirdParty: Record<ThirdPartyKind, Holding>;
  awaitingCents: number;
  provisions: {
    cashbackAvailableCents: number;
    cashbackPendingCents: number;
    squadToPayCents: number;
    squadToPayCount: number;
    storeRefundsCents: number;
    storeRefundsCount: number;
  };
  holders: Holder[];
  pendingWithdrawals: Record<'organizer' | 'arena' | 'professor', { count: number; cents: number }>;
  stuckWithdrawals: StuckWithdrawal[];
  months: MonthResult[];
  statement: { available: boolean; entries: StatementEntry[] };
  warnings: string[];
}

// ── leitura defensiva do retorno ───────────────────────────────────────────

type Raw = Record<string, unknown>;

function obj(v: unknown): Raw {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};
}

function int(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
}

function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function list(v: unknown): Raw[] {
  return Array.isArray(v) ? v.map(obj) : [];
}

function holdingFrom(v: unknown): Holding {
  const h = obj(v);
  return { availableCents: int(h['availableCents']), pendingCents: int(h['pendingCents']), awaitingCents: int(h['awaitingCents']), count: int(h['count']) };
}

function monthFrom(v: unknown): MonthResult {
  const m = obj(v);
  const revenue = obj(m['revenue']);
  const deductions = obj(m['deductions']);
  return {
    key: str(m['key']),
    revenue: Object.fromEntries(REVENUE_SOURCES.map((s) => [s, int(revenue[s])])) as Record<RevenueSource, number>,
    deductions: Object.fromEntries(DEDUCTIONS.map((d) => [d, int(deductions[d])])) as Record<Deduction, number>,
    asaasFees: intOrNull(m['asaasFees']),
    feesRecovered: int(m['feesRecovered']),
    stockPurchases: int(m['stockPurchases']),
    operatingCosts: int(m['operatingCosts']),
  };
}

const HOLDER_KINDS: readonly HolderKind[] = ['torneio', 'arena', 'organizador', 'professor', 'embaixador'];

export function companyFinanceFrom(raw: unknown): CompanyFinance {
  const r = obj(raw);
  const b = obj(r['balance']);
  const tp = obj(r['thirdParty']);
  const p = obj(r['provisions']);
  const pw = obj(r['pendingWithdrawals']);
  const st = obj(r['statement']);
  const pending = (k: string) => ({ count: int(obj(pw[k])['count']), cents: int(obj(pw[k])['cents']) });
  return {
    month: str(r['month']),
    generatedAt: dateOrNull(r['generatedAt']),
    balance: {
      asaasCents: intOrNull(b['asaasCents']),
      thirdPartyCents: int(b['thirdPartyCents']),
      provisionsCents: int(b['provisionsCents']),
      companyCents: intOrNull(b['companyCents']),
      freeCents: intOrNull(b['freeCents']),
    },
    thirdParty: Object.fromEntries(THIRD_PARTY_ORDER.map((k) => [k, holdingFrom(tp[k])])) as Record<ThirdPartyKind, Holding>,
    awaitingCents: int(r['awaitingCents']),
    provisions: {
      cashbackAvailableCents: int(p['cashbackAvailableCents']),
      cashbackPendingCents: int(p['cashbackPendingCents']),
      squadToPayCents: int(p['squadToPayCents']),
      squadToPayCount: int(p['squadToPayCount']),
      storeRefundsCents: int(p['storeRefundsCents']),
      storeRefundsCount: int(p['storeRefundsCount']),
    },
    holders: list(r['holders'])
      .filter((h) => (HOLDER_KINDS as readonly unknown[]).includes(h['kind']))
      .map((h) => ({
        kind: h['kind'] as HolderKind,
        id: str(h['id']),
        name: typeof h['name'] === 'string' && h['name'].trim() ? h['name'].trim() : null,
        availableCents: int(h['availableCents']),
        pendingCents: int(h['pendingCents']),
      })),
    pendingWithdrawals: { organizer: pending('organizer'), arena: pending('arena'), professor: pending('professor') },
    stuckWithdrawals: list(r['stuckWithdrawals']).map((w) => ({
      kind: w['kind'] === 'arena' || w['kind'] === 'professor' ? w['kind'] : 'organizador',
      id: str(w['id']),
      amountCents: int(w['amountCents']),
      payoutStatus: str(w['payoutStatus']),
      approvedAt: dateOrNull(w['approvedAt']),
    })),
    months: list(r['months']).map(monthFrom),
    statement: {
      available: st['available'] === true,
      entries: list(st['entries']).map((e) => ({
        id: str(e['id']),
        date: str(e['date']),
        type: str(e['type']),
        description: str(e['description']),
        valueCents: int(e['valueCents']),
        balanceCents: intOrNull(e['balanceCents']),
      })),
    },
    warnings: Array.isArray(r['warnings']) ? r['warnings'].filter((w): w is string => typeof w === 'string') : [],
  };
}

// ── totais (mesmas regras do servidor) ─────────────────────────────────────

export function revenueTotal(m: MonthResult): number {
  return REVENUE_SOURCES.reduce((s, k) => s + m.revenue[k], 0);
}

export function deductionsTotal(m: MonthResult): number {
  return DEDUCTIONS.reduce((s, k) => s + m.deductions[k], 0);
}

/** Tarifas do Asaas bancadas pela NexaGO: extrato − recuperadas. Sem extrato, 0. */
export function asaasNetCost(m: MonthResult): number {
  return m.asaasFees === null ? 0 : m.asaasFees - m.feesRecovered;
}

export function costsTotal(m: MonthResult): number {
  return asaasNetCost(m) + m.stockPurchases + m.operatingCosts;
}

export function monthResult(m: MonthResult): number {
  return revenueTotal(m) - deductionsTotal(m) - costsTotal(m);
}

/** Resultado ÷ receita bruta; `null` sem receita. */
export function margin(m: MonthResult): number | null {
  const revenue = revenueTotal(m);
  return revenue > 0 ? monthResult(m) / revenue : null;
}

export function sumMonths(months: readonly MonthResult[], key: string): MonthResult {
  const nullFees = months.some((m) => m.asaasFees === null);
  return {
    key,
    revenue: Object.fromEntries(REVENUE_SOURCES.map((s) => [s, months.reduce((t, m) => t + m.revenue[s], 0)])) as Record<RevenueSource, number>,
    deductions: Object.fromEntries(DEDUCTIONS.map((d) => [d, months.reduce((t, m) => t + m.deductions[d], 0)])) as Record<Deduction, number>,
    asaasFees: nullFees ? null : months.reduce((t, m) => t + (m.asaasFees ?? 0), 0),
    feesRecovered: months.reduce((t, m) => t + m.feesRecovered, 0),
    stockPurchases: months.reduce((t, m) => t + m.stockPurchases, 0),
    operatingCosts: months.reduce((t, m) => t + m.operatingCosts, 0),
  };
}

/** Fontes do mês com receita, da maior para a menor, com a fatia de cada uma. */
export function sourcesOf(m: MonthResult): { source: RevenueSource; cents: number; share: number }[] {
  const total = revenueTotal(m);
  return REVENUE_SOURCES.map((source) => ({ source, cents: m.revenue[source], share: total > 0 ? m.revenue[source] / total : 0 }))
    .filter((s) => s.cents !== 0)
    .sort((a, b) => b.cents - a.cents);
}

export function inAccountCents(h: Holding): number {
  return h.availableCents + h.pendingCents;
}

// ── meses ──────────────────────────────────────────────────────────────────

const MONTH_NAME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function currentMonthKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** "novembro/2026". */
export function monthLabel(key: string): string {
  return `${MONTH_NAME[Number(key.slice(5, 7)) - 1]}/${key.slice(0, 4)}`;
}

/** "nov/26". */
export function monthShort(key: string): string {
  return `${MONTH_ABBR[Number(key.slice(5, 7)) - 1]}/${key.slice(2, 4)}`;
}

/** Os últimos `count` meses até o atual, do mais novo para o mais antigo (o seletor). */
export function monthOptions(current: string, count = 12): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(current, -i));
}

// ── rótulos ────────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function money(cents: number): string {
  return BRL.format(cents / 100).replace(/ /g, ' ');
}

/** "− R$ 3,20" com o sinal separado. */
export function signedMoney(cents: number): string {
  return cents < 0 ? `− ${money(-cents)}` : money(cents);
}

/** Valor que sai (dedução/custo): "− R$ X"; zero vira "—". */
export function outMoney(cents: number): string {
  return cents === 0 ? '—' : cents > 0 ? `− ${money(cents)}` : `+ ${money(-cents)}`;
}

export function pctLabel(ratio: number | null): string {
  return ratio == null ? '—' : `${(ratio * 100).toFixed(1).replace('.', ',')}%`;
}

const HOLDER_FALLBACK: Record<HolderKind, string> = {
  torneio: 'Torneio',
  arena: 'Arena',
  organizador: 'Organizador',
  professor: 'Professor',
  embaixador: 'Embaixador',
};

export function holderName(h: Pick<Holder, 'kind' | 'id' | 'name'>): string {
  return h.name ?? `${HOLDER_FALLBACK[h.kind]} sem nome (…${h.id.slice(-6)})`;
}

/** Tipos do extrato do Asaas em português; tipo novo aparece cru. */
const STATEMENT_TYPE: Record<string, string> = {
  PAYMENT_RECEIVED: 'Cobrança recebida',
  PAYMENT_FEE: 'Tarifa de cobrança',
  TRANSFER: 'Transferência (PIX/TED)',
  TRANSFER_FEE: 'Tarifa de transferência',
  TRANSFER_REVERSAL: 'Transferência estornada',
  PAYMENT_REVERSAL: 'Estorno de cobrança',
  PAYMENT_REFUND_CANCELLED: 'Estorno cancelado',
  RECEIVABLE_ANTICIPATION_GROSS_CREDIT: 'Antecipação creditada',
  RECEIVABLE_ANTICIPATION_DEBIT: 'Antecipação descontada',
  RECEIVABLE_ANTICIPATION_FEE: 'Tarifa de antecipação',
  PIX_TRANSACTION_DEBIT: 'Pix enviado',
  PIX_TRANSACTION_CREDIT: 'Pix recebido',
  PIX_TRANSACTION_DEBIT_FEE: 'Tarifa de Pix',
  BILL_PAYMENT: 'Pagamento de conta',
  BILL_PAYMENT_FEE: 'Tarifa de pagamento de conta',
  INTERNAL_TRANSFER_DEBIT: 'Transferência entre contas Asaas',
  INTERNAL_TRANSFER_CREDIT: 'Transferência entre contas Asaas',
  CHARGEBACK: 'Chargeback',
  CHARGEBACK_REVERSAL: 'Chargeback revertido',
};

export function statementTypeLabel(type: string): string {
  return STATEMENT_TYPE[type] ?? (type.includes('FEE') ? `Tarifa (${type})` : type || '—');
}

export function isFeeEntry(e: StatementEntry): boolean {
  return e.type.includes('FEE') && e.valueCents < 0;
}

// ── CSV do resultado ───────────────────────────────────────────────────────

function csvMoney(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

/** DRE do período com `;` e vírgula decimal (abre direto no Excel). */
export function resultCsv(months: readonly MonthResult[]): string {
  const head = ['Linha', ...months.map((m) => monthShort(m.key))];
  const row = (label: string, value: (m: MonthResult) => number | null) => [label, ...months.map((m) => csvMoney(value(m)))];
  const rows = [
    head,
    ...REVENUE_SOURCES.map((s) => row(SOURCE_LABEL[s], (m) => m.revenue[s])),
    row('Receita bruta', revenueTotal),
    ...DEDUCTIONS.map((d) => row(DEDUCTION_LABEL[d], (m) => -m.deductions[d])),
    row('Receita líquida', (m) => revenueTotal(m) - deductionsTotal(m)),
    row('Tarifas Asaas (extrato)', (m) => (m.asaasFees == null ? null : -m.asaasFees)),
    row('Tarifas recuperadas', (m) => m.feesRecovered),
    row('Compras de estoque', (m) => -m.stockPurchases),
    row('Custos operacionais', (m) => -m.operatingCosts),
    row('Resultado', monthResult),
  ];
  return rows.map((r) => r.join(';')).join('\n');
}
