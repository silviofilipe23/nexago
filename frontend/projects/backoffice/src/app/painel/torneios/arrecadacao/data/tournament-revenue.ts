/**
 * Arrecadação da NexaGO por torneio (Torneios › Arrecadação).
 *
 * Fonte: o extrato do caixa do torneio (`tournamentWallets/{id}/ledger`, só `type: credit`), que
 * `functions/src/tournament-wallet.ts` grava quando o pagamento entra no caixa (Pix na hora; cartão
 * na liquidação ou na antecipação). Receita da NexaGO = a taxa descontada do organizador
 * (`platformFeeReais`) + a parte paga pelo atleta por cima do preço (`serviceFeeReais`), menos o que
 * a NexaGO banca: o cashback usado e o desconto do Squad (os dois entram no bruto, o organizador
 * recebe igual) e a comissão do embaixador (`squadCommissions` liberadas ou pagas).
 *
 * Fica de fora, de propósito: a tarifa do Asaas no Pix (a plataforma absorve e o extrato não grava)
 * e a taxa do cartão paga pelo atleta (`cardFeeReais`), que vai para o Asaas — repasse, não receita.
 *
 * Tudo em centavos: o extrato grava reais com duas casas, e somar float acumula resíduo.
 */
import type { PillTone } from '../../../ui/pill.component';
import type { TournamentRow } from '../../data/tournaments.repository';
import type { ContractStatus } from '../../contratos/data/plan-contracts';
import { rowMode, type FeeRow } from '../../taxas/data/fee-rows';
import { brl, pctLabel } from '../../taxas/data/tournament-fees';

export type PaymentMethod = 'pix' | 'card';

/** Um crédito do extrato do caixa: um pagamento de inscrição. */
export interface LedgerLine {
  id: string;
  createdAt: Date | null;
  registrationId: string | null;
  payerUid: string | null;
  paymentId: string | null;
  /** Preço pago (a parte do atleta na taxa fica fora). */
  grossCents: number;
  /** Taxa descontada do organizador. */
  organizerFeeCents: number;
  /** Parte da taxa que o atleta pagou por cima do preço ("Quem paga"). */
  athleteFeeCents: number;
  /** Tarifa do cartão descontada do organizador; Pix é 0. */
  gatewayCents: number;
  /** O que entrou no caixa do organizador. */
  organizerNetCents: number;
  cashbackCents: number;
  squadDiscountCents: number;
  method: PaymentMethod;
}

export interface RevenueTotals {
  payments: number;
  grossCents: number;
  organizerNetCents: number;
  gatewayCents: number;
  organizerFeeCents: number;
  athleteFeeCents: number;
  cashbackCents: number;
  squadDiscountCents: number;
  squadCommissionCents: number;
}

export const EMPTY_TOTALS: RevenueTotals = {
  payments: 0,
  grossCents: 0,
  organizerNetCents: 0,
  gatewayCents: 0,
  organizerFeeCents: 0,
  athleteFeeCents: 0,
  cashbackCents: 0,
  squadDiscountCents: 0,
  squadCommissionCents: 0,
};

/** Comissão de embaixador que já é custo: pagamento confirmado (`released`) ou repassada (`paid`). */
export interface SquadCommissionCost {
  tournamentId: string;
  registrationId: string | null;
  payerUid: string | null;
  amountCents: number;
}

export const COST_COMMISSION_STATUSES = ['released', 'paid'] as const;

type Raw = Record<string, unknown>;

function cents(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v * 100)) : 0;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  return v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate(): Date }).toDate() : null;
}

/** `null` = não é crédito de inscrição (o extrato hoje só tem `credit`, mas não confiar nisso). */
export function ledgerLineFromRaw(id: string, raw: Raw | undefined): LedgerLine | null {
  if (!raw || raw['type'] !== 'credit') return null;
  const gatewayCents = cents(raw['gatewayFeeReais']);
  return {
    id,
    createdAt: dateOf(raw['createdAt']),
    registrationId: text(raw['registrationId']),
    payerUid: text(raw['payerUid']),
    paymentId: text(raw['asaasPaymentId']),
    grossCents: cents(raw['grossReais']),
    organizerFeeCents: cents(raw['platformFeeReais']),
    athleteFeeCents: cents(raw['serviceFeeReais']),
    gatewayCents,
    organizerNetCents: cents(raw['netReais']),
    cashbackCents: cents(raw['cashbackAppliedReais']),
    squadDiscountCents: cents(raw['squadDiscountReais']),
    // O extrato não grava a forma: no cartão o organizador paga a tarifa ou o atleta pagou a
    // antecipação por cima; no Pix nenhum dos dois existe.
    method: gatewayCents > 0 || cents(raw['cardFeeReais']) > 0 ? 'card' : 'pix',
  };
}

export function commissionFromRaw(raw: Raw | undefined): SquadCommissionCost | null {
  if (!raw || !(COST_COMMISSION_STATUSES as readonly unknown[]).includes(raw['status'])) return null;
  const tournamentId = text(raw['tournamentId']);
  const amountCents = typeof raw['amountCents'] === 'number' && Number.isFinite(raw['amountCents'])
    ? Math.max(0, Math.round(raw['amountCents']))
    : 0;
  if (!tournamentId || amountCents === 0) return null;
  return { tournamentId, registrationId: text(raw['registrationId']), payerUid: text(raw['payerUid']), amountCents };
}

export function commissionByTournament(list: readonly SquadCommissionCost[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of list) out.set(c.tournamentId, (out.get(c.tournamentId) ?? 0) + c.amountCents);
  return out;
}

export function totalsOf(lines: readonly LedgerLine[], squadCommissionCents = 0): RevenueTotals {
  const t = { ...EMPTY_TOTALS, squadCommissionCents };
  for (const l of lines) {
    t.payments += 1;
    t.grossCents += l.grossCents;
    t.organizerNetCents += l.organizerNetCents;
    t.gatewayCents += l.gatewayCents;
    t.organizerFeeCents += l.organizerFeeCents;
    t.athleteFeeCents += l.athleteFeeCents;
    t.cashbackCents += l.cashbackCents;
    t.squadDiscountCents += l.squadDiscountCents;
  }
  return t;
}

export function addTotals(a: RevenueTotals, b: RevenueTotals): RevenueTotals {
  return {
    payments: a.payments + b.payments,
    grossCents: a.grossCents + b.grossCents,
    organizerNetCents: a.organizerNetCents + b.organizerNetCents,
    gatewayCents: a.gatewayCents + b.gatewayCents,
    organizerFeeCents: a.organizerFeeCents + b.organizerFeeCents,
    athleteFeeCents: a.athleteFeeCents + b.athleteFeeCents,
    cashbackCents: a.cashbackCents + b.cashbackCents,
    squadDiscountCents: a.squadDiscountCents + b.squadDiscountCents,
    squadCommissionCents: a.squadCommissionCents + b.squadCommissionCents,
  };
}

/** Taxa cobrada: a do organizador + a do atleta. */
export function feeCents(t: RevenueTotals): number {
  return t.organizerFeeCents + t.athleteFeeCents;
}

/** O que a NexaGO banca: cashback usado, desconto e comissão do Squad. */
export function costsCents(t: RevenueTotals): number {
  return t.cashbackCents + t.squadDiscountCents + t.squadCommissionCents;
}

/** Receita líquida da NexaGO; pode ser negativa (cashback maior que a taxa). */
export function netCents(t: RevenueTotals): number {
  return feeCents(t) - costsCents(t);
}

/** Líquido ÷ pago na plataforma; `null` sem pagamento. */
export function takeRate(t: RevenueTotals): number | null {
  return t.grossCents > 0 ? netCents(t) / t.grossCents : null;
}

// ── por fora ────────────────────────────────────────────────────────────────

/**
 * Recebido por fora (baixa manual do organizador, sem taxa), do recorte que
 * `functions/src/tournament-collected-stats.ts` mantém no doc do torneio. Doc anterior ao recorte
 * (sem `collectedViaOrganizerCents`): o total cai inteiro no canal do `paymentMode`, como no portal
 * do organizador (`painel/data/tournament-collected.ts`).
 */
export function offPlatformCentsOf(data: Raw): number {
  const via = data['collectedViaOrganizerCents'];
  if (typeof via === 'number' && Number.isFinite(via)) return Math.max(0, Math.round(via));
  const total = data['collectedCents'];
  return data['paymentMode'] === 'directWithOrganizer' && typeof total === 'number' && Number.isFinite(total)
    ? Math.max(0, Math.round(total))
    : 0;
}

// ── linhas da tabela ────────────────────────────────────────────────────────

export interface RevenueRow {
  tournament: TournamentRow;
  organizerName: string | null;
  /** Regra de taxa vigente (a da tela de Taxas); `null` = ainda não carregou. */
  fee: FeeRow | null;
  totals: RevenueTotals;
  offPlatformCents: number;
  /** Líquido de cartões aprovados que ainda não entraram no caixa (`awaitingSettlementReais`). */
  awaitingCents: number;
}

export type RevenueFilter = 'todos' | 'plataforma' | 'por-fora';
export type RevenueSort = 'receita' | 'data' | 'volume';
export type RevenuePeriod = 'tudo' | 'mes' | 'mes-passado' | 'ano';

export const PERIODS: ReadonlyArray<{ id: RevenuePeriod; label: string }> = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'mes', label: 'Este mês' },
  { id: 'mes-passado', label: 'Mês passado' },
  { id: 'ano', label: 'Este ano' },
];

export const SORTS: ReadonlyArray<{ id: RevenueSort; label: string }> = [
  { id: 'receita', label: 'Maior receita' },
  { id: 'data', label: 'Data do torneio' },
  { id: 'volume', label: 'Maior volume' },
];

/** Entra na tela quem teve algum dinheiro: pela plataforma, por fora ou a liberar. */
export function hasMoney(row: RevenueRow): boolean {
  return row.totals.payments > 0 || row.offPlatformCents > 0 || row.awaitingCents > 0;
}

export function matchesFilter(row: RevenueRow, filter: RevenueFilter): boolean {
  if (filter === 'plataforma') return row.totals.payments > 0;
  if (filter === 'por-fora') return row.totals.payments === 0 && row.offPlatformCents > 0;
  return true;
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Nome do torneio ou do organizador, sem acento nem caixa. */
export function matchesTerm(row: RevenueRow, term: string): boolean {
  const t = fold(term.trim());
  if (!t) return true;
  return fold(row.tournament.name).includes(t) || fold(row.organizerName ?? '').includes(t);
}

export function sortRows(rows: readonly RevenueRow[], sort: RevenueSort): RevenueRow[] {
  // Sem data vai para o fim (subtrair dois -Infinity daria NaN e bagunçaria a ordenação).
  const byDate = (a: RevenueRow, b: RevenueRow) => {
    const ta = a.tournament.startAt?.getTime() ?? -Infinity;
    const tb = b.tournament.startAt?.getTime() ?? -Infinity;
    return ta === tb ? 0 : tb > ta ? 1 : -1;
  };
  const key: (r: RevenueRow) => number =
    sort === 'volume' ? (r) => r.totals.grossCents + r.offPlatformCents : (r) => netCents(r.totals);
  return [...rows].sort((a, b) => (sort === 'data' ? byDate(a, b) : key(b) - key(a) || byDate(a, b)));
}

export function sumRows(rows: readonly RevenueRow[]): { totals: RevenueTotals; offPlatformCents: number; awaitingCents: number } {
  return rows.reduce(
    (acc, r) => ({
      totals: addTotals(acc.totals, r.totals),
      offPlatformCents: acc.offPlatformCents + r.offPlatformCents,
      awaitingCents: acc.awaitingCents + r.awaitingCents,
    }),
    { totals: EMPTY_TOTALS, offPlatformCents: 0, awaitingCents: 0 },
  );
}

/** Selo da taxa vigente, com os mesmos rótulos da tela de Taxas. */
export function feeBadge(fee: FeeRow | null): { label: string; tone: PillTone } {
  if (!fee) return { label: '…', tone: 'dim' };
  switch (rowMode(fee)) {
    case 'isento':
      return { label: 'Isento', tone: 'green' };
    case 'custom':
      return { label: `${pctLabel(fee.rule.percent)} · personalizada`, tone: 'orange' };
    default:
      return { label: `${pctLabel(fee.rule.percent)} · ${fee.rule.source === 'organizer' ? 'do cadastro' : 'padrão'}`, tone: 'dim' };
  }
}

// ── período (data do torneio, civil de São Paulo) ──────────────────────────

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTH_NAME = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** `YYYY-MM` do instante em São Paulo. */
export function monthKeyOf(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(date)
    .slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** `today` = data civil de SP (`YYYY-MM-DD`). Sem data de início, só entra em "Tudo". */
export function inPeriod(startAt: Date | null, period: RevenuePeriod, today: string): boolean {
  if (period === 'tudo') return true;
  if (!startAt) return false;
  const key = monthKeyOf(startAt);
  const current = today.slice(0, 7);
  if (period === 'mes') return key === current;
  if (period === 'mes-passado') return key === shiftMonth(current, -1);
  return key.slice(0, 4) === current.slice(0, 4);
}

export function periodLabel(period: RevenuePeriod, today: string): string {
  const current = today.slice(0, 7);
  const name = (key: string) => `${MONTH_NAME[Number(key.slice(5, 7)) - 1]}/${key.slice(0, 4)}`;
  switch (period) {
    case 'mes':
      return `Torneios de ${name(current)}`;
    case 'mes-passado':
      return `Torneios de ${name(shiftMonth(current, -1))}`;
    case 'ano':
      return `Torneios de ${current.slice(0, 4)}`;
    default:
      return 'Todos os torneios';
  }
}

export interface MonthBar {
  key: string;
  label: string;
  netCents: number;
  current: boolean;
}

/**
 * Líquido por mês do torneio, `count` meses terminando no atual — ou no último mês com receita,
 * quando torneio futuro já arrecadou (inscrição abre semanas antes).
 */
export function monthSeries(rows: readonly RevenueRow[], today: string, count = 6): MonthBar[] {
  const current = today.slice(0, 7);
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    if (!r.tournament.startAt) continue;
    const key = monthKeyOf(r.tournament.startAt);
    byMonth.set(key, (byMonth.get(key) ?? 0) + netCents(r.totals));
  }
  const latest = [...byMonth.entries()].filter(([, v]) => v !== 0).map(([k]) => k).sort().pop();
  const end = latest && latest > current ? latest : current;
  return Array.from({ length: count }, (_, i) => {
    const key = shiftMonth(end, i - count + 1);
    return { key, label: MONTH_ABBR[Number(key.slice(5, 7)) - 1], netCents: byMonth.get(key) ?? 0, current: key === current };
  });
}

// ── detalhe: pagamento a pagamento ─────────────────────────────────────────

export interface PaymentRow {
  line: LedgerLine;
  commissionCents: number;
  feeCents: number;
  costsCents: number;
  netCents: number;
}

/**
 * Mais recentes primeiro, cada um com o custo que a NexaGO bancou nele. A comissão do embaixador é
 * por inscrição × pagador e entra uma vez só, na cobrança mais recente desse par (cobrança refeita
 * gera outra linha no extrato, não outra comissão).
 */
export function paymentRows(lines: readonly LedgerLine[], commissions: readonly SquadCommissionCost[]): PaymentRow[] {
  const pending = new Map<string, number>();
  for (const c of commissions) {
    if (!c.registrationId || !c.payerUid) continue;
    const k = `${c.registrationId}|${c.payerUid}`;
    pending.set(k, (pending.get(k) ?? 0) + c.amountCents);
  }
  return [...lines]
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .map((line) => {
      const k = `${line.registrationId}|${line.payerUid}`;
      const commissionCents = pending.get(k) ?? 0;
      pending.delete(k);
      const fee = line.organizerFeeCents + line.athleteFeeCents;
      const costs = line.cashbackCents + line.squadDiscountCents + commissionCents;
      return { line, commissionCents, feeCents: fee, costsCents: costs, netCents: fee - costs };
    });
}

/** "Cashback − R$ 16,00 · Squad − R$ 8,00"; nada bancado → "—". */
export function costsLabel(p: PaymentRow): string {
  const parts: string[] = [];
  if (p.line.cashbackCents > 0) parts.push(`Cashback − ${money(p.line.cashbackCents)}`);
  const squad = p.line.squadDiscountCents + p.commissionCents;
  if (squad > 0) parts.push(`Squad − ${money(squad)}`);
  return parts.length ? parts.join(' · ') : '—';
}

/** Plano NexaGO contratado para o evento: o que já foi recebido (cobrança à mão, fora do caixa). */
export function contractReceivedCents(c: { status: ContractStatus; depositCents: number; priceCents: number }): number {
  if (c.status === 'deposit_paid') return c.depositCents;
  return c.status === 'paid' || c.status === 'completed' ? c.priceCents : 0;
}

// ── rótulos ─────────────────────────────────────────────────────────────────

export function money(centsValue: number): string {
  return brl(centsValue / 100);
}

/** Negativo com o sinal separado, como o resto da tela ("− R$ 3,20"). */
export function signedMoney(centsValue: number): string {
  return centsValue < 0 ? `− ${money(-centsValue)}` : money(centsValue);
}

/** Custo como dedução; zero vira "—". */
export function costMoney(centsValue: number): string {
  return centsValue > 0 ? `− ${money(centsValue)}` : '—';
}

export function rateLabel(rate: number | null): string {
  return rate == null ? '—' : `${(rate * 100).toFixed(1).replace('.', ',')}%`;
}

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function dateTimeLabel(d: Date | null): string {
  return d ? DATE_TIME.format(d).replace(',', '') : '—';
}

const METHOD_LABEL: Record<PaymentMethod, string> = { pix: 'Pix', card: 'Cartão' };

export function methodLabel(m: PaymentMethod): string {
  return METHOD_LABEL[m];
}

function csvCell(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function csvMoney(centsValue: number): string {
  return (centsValue / 100).toFixed(2).replace('.', ',');
}

/** CSV com `;` e vírgula decimal: abre direto no Excel em pt-BR. */
export function paymentsCsv(rows: readonly PaymentRow[], nameOf: (uid: string | null) => string): string {
  const head = [
    'Data', 'Atleta', 'Forma', 'Valor', 'Taxa do organizador', 'Taxa do atleta', 'Cashback',
    'Desconto Squad', 'Comissão Squad', 'Líquido NexaGO', 'Pagamento Asaas',
  ];
  const lines = rows.map((p) => [
    dateTimeLabel(p.line.createdAt),
    nameOf(p.line.payerUid),
    methodLabel(p.line.method),
    csvMoney(p.line.grossCents),
    csvMoney(p.line.organizerFeeCents),
    csvMoney(p.line.athleteFeeCents),
    csvMoney(p.line.cashbackCents),
    csvMoney(p.line.squadDiscountCents),
    csvMoney(p.commissionCents),
    csvMoney(p.netCents),
    p.line.paymentId ?? '',
  ]);
  return [head, ...lines].map((cells) => cells.map(csvCell).join(';')).join('\n');
}
