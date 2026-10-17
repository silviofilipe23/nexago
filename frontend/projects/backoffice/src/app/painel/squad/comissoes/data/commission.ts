/**
 * Comissões do NexaSquad (tela 05 · Comissões & repasse).
 *
 * O ciclo do repasse e o plano por embaixador são espelho à mão de
 * `functions/src/squad-commissions.ts` — a tela mostra o que a callable vai pagar.
 * Dinheiro em centavos.
 */
import { TIER_LABELS, type SquadTier } from '../../niveis-regras/data/squad-rules';

export type CommissionStatus = 'pending' | 'released' | 'paid' | 'canceled';
export type CommissionOrigin = 'code' | 'link' | 'qr';
export type StatusTone = 'yellow' | 'green' | 'dim' | 'red';

export interface TimelineEntry {
  at: Date | null;
  event: string;
  by: string | null;
  note: string | null;
}

export interface Commission {
  id: string;
  ambassadorId: string;
  ambassadorName: string;
  ambassadorCode: string | null;
  ambassadorTier: SquadTier | null;
  registrationId: string;
  tournamentName: string;
  categoryName: string;
  paymentId: string;
  convertedLabel: string;
  convertedCount: number;
  origin: CommissionOrigin;
  grossCents: number;
  feeCents: number;
  netCents: number;
  pct: number;
  amountCents: number;
  rulesVersion: number | null;
  status: CommissionStatus;
  cancelReason: string | null;
  cancelNote: string | null;
  payoutId: string | null;
  hold: { payoutDate: string; reason: string; by: string | null } | null;
  timeline: TimelineEntry[];
  registeredAt: Date | null;
  releasedAt: Date | null;
}

export interface Adjustment {
  id: string;
  ambassadorId: string;
  ambassadorName: string;
  amountCents: number;
}

export interface PayoutItem {
  ambassadorId: string;
  ambassadorName: string;
  commissionIds: string[];
  netCents: number;
  status: 'credited' | 'failed' | 'held';
  holdReason: string | null;
}

export interface Payout {
  id: string;
  status: 'processing' | 'done' | 'partial';
  totalCents: number;
  creditedCount: number;
  failedCount: number;
  approvedBy: string | null;
  approvedAt: Date | null;
  items: PayoutItem[];
}

export interface PayoutConfig {
  days: number[];
  minNetCents: number;
}

export const DEFAULT_PAYOUT_CONFIG: PayoutConfig = { days: [6, 20], minNetCents: 20_00 };

export const ORIGIN_LABEL: Record<CommissionOrigin, string> = { code: 'Código', link: 'Link', qr: 'QR' };

export const STATUS_META: Record<CommissionStatus, { label: string; tab: string; tone: StatusTone }> = {
  pending: { label: 'Aguardando pgto', tab: 'Aguardando', tone: 'yellow' },
  released: { label: 'Liberada', tab: 'Liberadas', tone: 'green' },
  paid: { label: 'Paga', tab: 'Pagas', tone: 'dim' },
  canceled: { label: 'Cancelada', tab: 'Canceladas', tone: 'red' },
};

const CANCEL_LABEL: Record<string, string> = {
  refund: 'reembolso',
  chargeback: 'chargeback',
  payment_failed: 'pagamento não concluído',
  manual: 'manual',
};

export function statusLabel(c: Pick<Commission, 'status' | 'cancelReason'>): string {
  if (c.status === 'canceled') {
    const reason = c.cancelReason ? CANCEL_LABEL[c.cancelReason] ?? c.cancelReason : null;
    return reason ? `Cancelada · ${reason}` : 'Cancelada';
  }
  return STATUS_META[c.status].label;
}

// ── leitura do Firestore ─────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

export function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  return v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate(): Date }).toDate() : null;
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const actorName = (v: unknown) => (v && typeof v === 'object' ? str((v as Raw)['name']) || null : null);

const STATUSES: readonly CommissionStatus[] = ['pending', 'released', 'paid', 'canceled'];
const ORIGINS: readonly CommissionOrigin[] = ['code', 'link', 'qr'];
const TIERS: readonly SquadTier[] = ['ath', 'amb', 'pro', 'cap'];

export function commissionFromDoc(id: string, d: Raw): Commission {
  const hold = d['hold'] as Raw | null | undefined;
  const athletes = Array.isArray(d['convertedAthleteIds']) ? d['convertedAthleteIds'].length : 1;
  return {
    id,
    ambassadorId: str(d['ambassadorId']),
    ambassadorName: str(d['ambassadorName'], 'Embaixador'),
    ambassadorCode: str(d['ambassadorCode']) || null,
    ambassadorTier: TIERS.includes(d['ambassadorTier'] as SquadTier) ? (d['ambassadorTier'] as SquadTier) : null,
    registrationId: str(d['registrationId']),
    tournamentName: str(d['tournamentName']),
    categoryName: str(d['categoryName']),
    paymentId: str(d['paymentId']),
    convertedLabel: str(d['convertedLabel'], '—'),
    convertedCount: Math.max(1, athletes),
    origin: ORIGINS.includes(d['origin'] as CommissionOrigin) ? (d['origin'] as CommissionOrigin) : 'code',
    grossCents: num(d['grossCents']),
    feeCents: num(d['feeCents']),
    netCents: num(d['netCents']),
    pct: num(d['pct']),
    amountCents: num(d['amountCents']),
    rulesVersion: typeof d['rulesVersion'] === 'number' ? d['rulesVersion'] : null,
    status: STATUSES.includes(d['status'] as CommissionStatus) ? (d['status'] as CommissionStatus) : 'pending',
    cancelReason: str(d['cancelReason']) || null,
    cancelNote: str(d['cancelNote']) || null,
    payoutId: str(d['payoutId']) || null,
    hold:
      hold && typeof hold['payoutDate'] === 'string'
        ? { payoutDate: hold['payoutDate'], reason: str(hold['reason']), by: actorName(hold['by']) }
        : null,
    timeline: (Array.isArray(d['timeline']) ? (d['timeline'] as Raw[]) : []).map((t) => ({
      at: dateOf(t['at']),
      event: str(t['event']),
      by: actorName(t['by']),
      note: str(t['note']) || null,
    })),
    registeredAt: dateOf(d['registeredAt']),
    releasedAt: dateOf(d['releasedAt']),
  };
}

export function payoutFromDoc(id: string, d: Raw): Payout {
  const status = d['status'] === 'done' || d['status'] === 'partial' ? d['status'] : 'processing';
  return {
    id,
    status,
    totalCents: num(d['totalCents']),
    creditedCount: num(d['creditedCount']),
    failedCount: num(d['failedCount']),
    approvedBy: actorName(d['approvedBy']),
    approvedAt: dateOf(d['approvedAt']),
    items: (Array.isArray(d['items']) ? (d['items'] as Raw[]) : []).map((i) => ({
      ambassadorId: str(i['ambassadorId']),
      ambassadorName: str(i['ambassadorName']),
      commissionIds: Array.isArray(i['commissionIds']) ? (i['commissionIds'] as string[]) : [],
      netCents: num(i['netCents']),
      status: i['status'] === 'failed' || i['status'] === 'held' ? i['status'] : 'credited',
      holdReason: str(i['holdReason']) || null,
    })),
  };
}

// ── formatação ───────────────────────────────────────────────────────────────

const SP = 'America/Sao_Paulo';

export function brl(cents: number, decimals = true): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
}

/** Valor dos KPIs: inteiro como no desenho ("R$ 1.284"), centavos só quando houver. */
export function brlShort(cents: number): string {
  return brl(cents, cents % 100 !== 0);
}

export function spDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SP }).format(date);
}

/** "13 out", sem o ponto que o Intl põe na abreviação. */
export function dayMonth(date: Date): string {
  const day = date.toLocaleDateString('pt-BR', { timeZone: SP, day: '2-digit' });
  const month = date.toLocaleDateString('pt-BR', { timeZone: SP, month: 'short' }).replace('.', '');
  return `${day} ${month}`;
}

export function dayMonthOfKey(key: string): string {
  return dayMonth(new Date(`${key}T12:00:00-03:00`));
}

/** "Hoje 14:12", "Ontem", "13 out" — como a coluna Data do desenho. */
export function whenLabel(date: Date | null, now: Date): string {
  if (!date) return '—';
  const key = spDateKey(date);
  if (key === spDateKey(now)) {
    return `Hoje ${date.toLocaleTimeString('pt-BR', { timeZone: SP, hour: '2-digit', minute: '2-digit' })}`;
  }
  if (key === spDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return 'Ontem';
  return dayMonth(date);
}

export function stamp(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleString('pt-BR', { timeZone: SP, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return ((parts[0]![0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '')).toUpperCase();
}

/** Tom do avatar por embaixador: estável entre telas. */
export function avatarTone(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 6;
}

export function tierLabel(tier: SquadTier | null): string {
  return tier ? TIER_LABELS[tier] : '';
}

// ── período ──────────────────────────────────────────────────────────────────

export type Period =
  | { kind: 'month'; key: string } // "2026-10"
  | { kind: 'pilot' }
  | { kind: 'custom'; from: string; to: string }; // datas civis inclusivas

export function monthKey(date: Date): string {
  return spDateKey(date).slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Início e fim (exclusivo) do período, em instantes de SP. `null` = sem limite. */
export function periodRange(p: Period): { start: Date | null; end: Date | null } {
  const at = (key: string) => new Date(`${key}T00:00:00-03:00`);
  switch (p.kind) {
    case 'pilot':
      return { start: null, end: null };
    case 'month':
      return { start: at(`${p.key}-01`), end: at(`${shiftMonth(p.key, 1)}-01`) };
    case 'custom': {
      const end = new Date(`${p.to}T12:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      return { start: at(p.from), end: at(end.toISOString().slice(0, 10)) };
    }
  }
}

export function periodLabel(p: Period): string {
  switch (p.kind) {
    case 'pilot':
      return 'Ciclo do piloto';
    case 'month': {
      const name = new Date(`${p.key}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    case 'custom':
      return `${dayMonthOfKey(p.from)} – ${dayMonthOfKey(p.to)}`;
  }
}

/** "em outubro", "no ciclo do piloto", "de 01 out a 15 out" — para o estado vazio. */
export function periodPhrase(p: Period): string {
  if (p.kind === 'pilot') return 'no ciclo do piloto';
  if (p.kind === 'month') return `em ${periodLabel(p).toLowerCase()}`;
  return `de ${dayMonthOfKey(p.from)} a ${dayMonthOfKey(p.to)}`;
}

// ── filtros, abas e KPIs ─────────────────────────────────────────────────────

export type Tab = 'all' | CommissionStatus;

export interface Filters {
  ambassadorIds: string[];
  origins: CommissionOrigin[];
}

export function applyFilters(list: Commission[], f: Filters): Commission[] {
  return list.filter(
    (c) =>
      (f.ambassadorIds.length === 0 || f.ambassadorIds.includes(c.ambassadorId)) &&
      (f.origins.length === 0 || f.origins.includes(c.origin)),
  );
}

export function applyTab(list: Commission[], tab: Tab): Commission[] {
  return tab === 'all' ? list : list.filter((c) => c.status === tab);
}

export function tabCounts(list: Commission[]): Record<Tab, number> {
  const out: Record<Tab, number> = { all: list.length, pending: 0, released: 0, paid: 0, canceled: 0 };
  for (const c of list) out[c.status]++;
  return out;
}

/** Mais recente primeiro (a ordem padrão da tabela). */
export function sortByDate(list: Commission[]): Commission[] {
  return [...list].sort((a, b) => (b.registeredAt?.getTime() ?? 0) - (a.registeredAt?.getTime() ?? 0));
}

export interface Kpis {
  pendingCents: number;
  releasedCents: number;
  releasedAmbassadors: number;
  paidCents: number;
  canceledCents: number;
  refundCount: number;
}

/** Os 4 cards seguem só o período (abas e chips não mexem neles). */
export function kpisOf(list: Commission[]): Kpis {
  const sum = (s: CommissionStatus) => list.filter((c) => c.status === s).reduce((n, c) => n + c.amountCents, 0);
  return {
    pendingCents: sum('pending'),
    releasedCents: sum('released'),
    releasedAmbassadors: new Set(list.filter((c) => c.status === 'released').map((c) => c.ambassadorId)).size,
    paidCents: sum('paid'),
    canceledCents: sum('canceled'),
    refundCount: list.filter((c) => c.status === 'canceled' && (c.cancelReason === 'refund' || c.cancelReason === 'chargeback')).length,
  };
}

// ── ciclo do repasse (espelho de functions/src/squad-commissions.ts) ────────

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nextPayoutDate(fromKey: string, days: number[]): string {
  for (let i = 0; i < 62; i++) {
    const key = addDays(fromKey, i);
    if (days.includes(Number(key.slice(8, 10)))) return key;
  }
  return fromKey;
}

export function openPayoutDate(todayKey: string, lastDoneKey: string | null, days: number[]): string {
  return nextPayoutDate(lastDoneKey ? addDays(lastDoneKey, 1) : todayKey, days);
}

export function payoutCutoff(payoutDate: string): Date {
  return new Date(`${payoutDate}T00:00:00-03:00`);
}

export function lastDoneKey(payouts: Payout[]): string | null {
  return payouts.filter((p) => p.status === 'done').map((p) => p.id).sort().pop() ?? null;
}

export type PlanStatus = 'included' | 'accumulating' | 'held';

export interface PlanRow {
  ambassadorId: string;
  ambassadorName: string;
  ambassadorTier: SquadTier | null;
  commissionIds: string[];
  adjustmentIds: string[];
  heldCommissionIds: string[];
  grossCents: number;
  adjustmentsCents: number;
  netCents: number;
  status: PlanStatus;
  holdReason: string | null;
}

export function planPayout(input: {
  payoutDate: string;
  cutoff: Date;
  commissions: Commission[];
  adjustments: Adjustment[];
  minNetCents: number;
}): PlanRow[] {
  const rows = new Map<string, PlanRow>();
  const row = (id: string, name: string, tier: SquadTier | null) => {
    let r = rows.get(id);
    if (!r) {
      r = {
        ambassadorId: id,
        ambassadorName: name,
        ambassadorTier: tier,
        commissionIds: [],
        adjustmentIds: [],
        heldCommissionIds: [],
        grossCents: 0,
        adjustmentsCents: 0,
        netCents: 0,
        status: 'included',
        holdReason: null,
      };
      rows.set(id, r);
    } else {
      r.ambassadorName ||= name;
      r.ambassadorTier ??= tier;
    }
    return r;
  };
  for (const c of input.commissions) {
    if (c.status !== 'released' || c.payoutId || !c.releasedAt || c.releasedAt.getTime() >= input.cutoff.getTime()) {
      continue;
    }
    const r = row(c.ambassadorId, c.ambassadorName, c.ambassadorTier);
    if (c.hold && c.hold.payoutDate === input.payoutDate) {
      r.heldCommissionIds.push(c.id);
      r.holdReason ??= c.hold.reason;
      continue;
    }
    r.commissionIds.push(c.id);
    r.grossCents += c.amountCents;
  }
  for (const a of input.adjustments) {
    const r = row(a.ambassadorId, a.ambassadorName, null);
    r.adjustmentIds.push(a.id);
    r.adjustmentsCents += a.amountCents;
  }
  for (const r of rows.values()) {
    r.netCents = r.grossCents + r.adjustmentsCents;
    if (r.commissionIds.length === 0 && r.heldCommissionIds.length > 0) r.status = 'held';
    else if (r.netCents < input.minNetCents) r.status = 'accumulating';
  }
  return [...rows.values()].sort((a, b) => a.ambassadorName.localeCompare(b.ambassadorName, 'pt-BR'));
}

export function includedTotals(plan: PlanRow[]): { totalCents: number; count: number } {
  const included = plan.filter((r) => r.status === 'included');
  return { totalCents: included.reduce((n, r) => n + r.netCents, 0), count: included.length };
}

// ── exportação ───────────────────────────────────────────────────────────────

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');

/** CSV com `;` (abre direto no Excel em pt-BR), nas colunas do spec da tela 05. */
export function commissionsCsv(list: Commission[]): string {
  const head = [
    'data_inscricao', 'embaixador', 'codigo', 'nivel', 'atleta(s)', 'origem', 'torneio', 'categoria',
    'payment_id', 'valor_pago', 'taxa', 'receita_liquida', 'pct', 'comissao', 'status',
    'motivo_cancelamento', 'repasse_id', 'data_repasse',
  ];
  const lines = list.map((c) => [
    c.registeredAt ? c.registeredAt.toLocaleString('pt-BR', { timeZone: SP }) : '',
    c.ambassadorName,
    c.ambassadorCode ?? '',
    tierLabel(c.ambassadorTier),
    c.convertedLabel,
    ORIGIN_LABEL[c.origin],
    c.tournamentName,
    c.categoryName,
    c.paymentId,
    reais(c.grossCents),
    reais(c.feeCents),
    reais(c.netCents),
    String(c.pct).replace('.', ','),
    reais(c.amountCents),
    statusLabel(c),
    c.status === 'canceled' ? [c.cancelReason, c.cancelNote].filter(Boolean).join(' · ') : '',
    c.payoutId ?? '',
    c.payoutId ? c.payoutId.split('-').reverse().join('/') : '',
  ]);
  return [head, ...lines].map((l) => l.map(csvCell).join(';')).join('\n');
}

/** Rótulo de cada evento da linha do tempo da comissão. */
export const TIMELINE_LABEL: Record<string, string> = {
  click: 'Clique',
  signup: 'Cadastro',
  registered: 'Inscrição',
  released: 'Pagamento confirmado · liberada',
  paid: 'Paga',
  canceled: 'Cancelada',
  held: 'Retida no repasse',
  hold_released: 'Retenção desfeita',
  reassigned: 'Reatribuída',
};
