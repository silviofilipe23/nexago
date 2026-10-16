import type { Order } from '../../pedidos/data/order';

/**
 * Visão geral da Loja (01): KPIs, receita por dia, mais vendidos e alertas,
 * calculados no cliente a partir dos pedidos do período atual + anterior.
 * Datas civis de São Paulo (UTC−3 fixo, sem horário de verão desde 2019).
 */

export type PeriodId = 'hoje' | '7d' | '30d' | 'mes' | 'custom';

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: 'mes', label: 'Mês atual' },
  { id: 'custom', label: 'Personalizado' },
];

export interface Range {
  /** Inclusivo. */
  start: Date;
  /** Exclusivo. */
  end: Date;
  /** Dias civis do período, `YYYY-MM-DD`. */
  days: string[];
}

const DAY = 86_400_000;
const SP_OFFSET = 3 * 3_600_000;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `YYYY-MM-DD` em São Paulo. */
export function spDay(d: Date): string {
  return new Date(d.getTime() - SP_OFFSET).toISOString().slice(0, 10);
}

/** Meia-noite de São Paulo do dia civil. */
export function spMidnight(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!) + SP_OFFSET);
}

function addDays(day: string, n: number): string {
  return spDay(new Date(spMidnight(day).getTime() + n * DAY));
}

function daysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Período escolhido. `custom` usa `from`/`to` (inclusivos, `YYYY-MM-DD`). */
export function rangeOf(period: PeriodId, now: Date, custom?: { from: string; to: string }): Range {
  const today = spDay(now);
  let first = today;
  let last = today;
  if (period === '7d') first = addDays(today, -6);
  if (period === '30d') first = addDays(today, -29);
  if (period === 'mes') first = `${today.slice(0, 8)}01`;
  if (period === 'custom' && custom?.from && custom?.to) {
    first = custom.from <= custom.to ? custom.from : custom.to;
    last = custom.from <= custom.to ? custom.to : custom.from;
  }
  const end = last === today ? now : spMidnight(addDays(last, 1));
  return { start: spMidnight(first), end, days: daysBetween(first, last) };
}

/** Período anterior com a mesma duração, colado no início do atual. */
export function previousRange(r: Range): Range {
  const len = r.end.getTime() - r.start.getTime();
  const start = new Date(r.start.getTime() - len);
  return { start, end: r.start, days: daysBetween(spDay(start), spDay(new Date(r.start.getTime() - 1))) };
}

/** "16 set – 15 out". */
export function rangeLabel(r: Range): string {
  const fmt = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
  const first = r.days[0]!;
  const last = r.days.at(-1)!;
  return first === last ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}

export function shortDay(day: string): string {
  return `${day.slice(8, 10)} ${MONTHS[Number(day.slice(5, 7)) - 1]}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

/** Pedido que conta como venda: pago e não cancelado. */
export function isSale(o: Order): boolean {
  return o.paidAt !== null && o.status !== 'pag' && o.status !== 'can';
}

/** Receita do pedido: total pago menos o que já foi reembolsado. */
export function revenueOf(o: Order): number {
  return Math.max(0, o.totalCents - o.refundedCents);
}

function inRange(d: Date | null, r: Range): boolean {
  return d !== null && d >= r.start && d < r.end;
}

export function salesIn(orders: Order[], r: Range): Order[] {
  return orders.filter((o) => isSale(o) && inRange(o.paidAt, r));
}

export interface Kpis {
  revenueCents: number;
  orders: number;
  ticketCents: number | null;
  pickupPct: number | null;
}

export function kpisOf(sales: Order[]): Kpis {
  const revenueCents = sales.reduce((n, o) => n + revenueOf(o), 0);
  const pickups = sales.filter((o) => o.delivery.type === 'arena').length;
  return {
    revenueCents,
    orders: sales.length,
    ticketCents: sales.length ? Math.round(revenueCents / sales.length) : null,
    pickupPct: sales.length ? Math.round((pickups / sales.length) * 100) : null,
  };
}

/** Variação % contra o anterior; `null` quando não há base (anterior zerado). */
export function deltaPct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export interface DayBar {
  day: string;
  revenueCents: number;
  orders: number;
}

export function dailyBars(sales: Order[], r: Range): DayBar[] {
  const by = new Map(r.days.map((d) => [d, { day: d, revenueCents: 0, orders: 0 }]));
  for (const o of sales) {
    const bar = by.get(spDay(o.paidAt!));
    if (bar) {
      bar.revenueCents += revenueOf(o);
      bar.orders += 1;
    }
  }
  return [...by.values()];
}

/** Web × App em % da receita. */
export function channelSplit(sales: Order[]): { web: number; app: number } | null {
  const total = sales.reduce((n, o) => n + revenueOf(o), 0);
  if (total === 0) return null;
  const web = sales.filter((o) => o.channel === 'web').reduce((n, o) => n + revenueOf(o), 0);
  const webPct = Math.round((web / total) * 100);
  return { web: webPct, app: 100 - webPct };
}

export interface TopProduct {
  productId: string;
  name: string;
  imageUrl: string | null;
  units: number;
  revenueCents: number;
}

/** Top N por unidades (receita como desempate). */
export function topProducts(sales: Order[], n = 5): TopProduct[] {
  const by = new Map<string, TopProduct>();
  for (const i of sales.flatMap((o) => o.items)) {
    const cur = by.get(i.productId) ?? { productId: i.productId, name: i.productName, imageUrl: i.imageUrl, units: 0, revenueCents: 0 };
    cur.units += i.qty;
    cur.revenueCents += i.totalCents;
    cur.imageUrl ??= i.imageUrl;
    by.set(i.productId, cur);
  }
  return [...by.values()].sort((a, b) => b.units - a.units || b.revenueCents - a.revenueCents).slice(0, n);
}

// ---------------------------------------------------------------------------
// Precisa de atenção
// ---------------------------------------------------------------------------

export interface Alert {
  id: 'estoque' | 'separacao' | 'trocas' | 'remessa' | 'artes';
  tone: 'red' | 'orange' | 'yellow';
  title: string;
  detail: string;
  action: string;
  link: string;
  query?: Record<string, string>;
}

export interface AlertInputs {
  lowStock: { productName: string; variantLabel: string }[];
  toPick: Order[];
  handlingHours: number;
  returnsToReview: { reasonLabel: string }[];
  lateTransfers: { id: string; code: string; arenaName: string; orders: number }[];
  /** Artes de personalizados em `aprovar` (tela 10). */
  artsToApprove: number;
  now: Date;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Camiseta M e G · Viseira preta · Bola Pro": variações agrupadas por produto, até 3 produtos. */
export function lowStockDetail(skus: { productName: string; variantLabel: string }[]): string {
  const by = new Map<string, string[]>();
  for (const s of skus) {
    const variants = by.get(s.productName) ?? [];
    const v = s.variantLabel && s.variantLabel !== 'único' ? s.variantLabel.split(' · ').at(-1)! : '';
    if (v) variants.push(v);
    by.set(s.productName, variants);
  }
  return [...by].slice(0, 3).map(([name, vs]) => [name, vs.length > 1 ? `${vs.slice(0, -1).join(', ')} e ${vs.at(-1)}` : vs[0]].filter(Boolean).join(' ')).join(' · ');
}

/** Só os alertas com N > 0, na ordem do desenho. */
export function alertsOf(a: AlertInputs): Alert[] {
  const out: Alert[] = [];
  if (a.lowStock.length > 0) {
    out.push({
      id: 'estoque', tone: 'red', title: `${plural(a.lowStock.length, 'SKU', 'SKUs')} com estoque baixo`,
      detail: lowStockDetail(a.lowStock),
      action: 'Ver estoque', link: '/painel/loja/estoque',
    });
  }
  const late = a.toPick.filter((o) => o.paidAt && a.now.getTime() - o.paidAt.getTime() > a.handlingHours * 3_600_000);
  if (late.length > 0) {
    out.push({
      id: 'separacao', tone: 'orange',
      title: `${plural(late.length, 'pedido pago', 'pedidos pagos')} há mais de ${a.handlingHours} h`,
      detail: 'Ainda não separados — prazo de retirada em risco',
      action: 'Separar', link: '/painel/loja/pedidos', query: { aba: 'sep' },
    });
  }
  if (a.returnsToReview.length > 0) {
    const reasons = [...new Set(a.returnsToReview.map((r) => r.reasonLabel))].slice(0, 2);
    out.push({
      id: 'trocas', tone: 'yellow', title: `${plural(a.returnsToReview.length, 'pedido de troca', 'pedidos de troca')} aguardando`,
      detail: reasons.join(' · '), action: 'Analisar', link: '/painel/loja/trocas',
    });
  }
  for (const t of a.lateTransfers) {
    out.push({
      id: 'remessa', tone: 'yellow', title: `${t.arenaName} sem confirmar recebimento`,
      detail: `Remessa ${t.code}${t.orders > 0 ? ` · ${plural(t.orders, 'pedido', 'pedidos')}` : ''}`,
      action: 'Ver remessa', link: `/painel/loja/estoque/transferencia/${t.id}`,
    });
  }
  if (a.artsToApprove > 0) {
    out.push({
      id: 'artes', tone: 'orange', title: `${plural(a.artsToApprove, 'arte', 'artes')} para aprovar`,
      detail: 'Personalizados esperando a revisão da arte', action: 'Aprovar', link: '/painel/loja/personalizados',
    });
  }
  return out;
}

/** "2026-10-17T08:00" (parede de SP) já passou? Sem data = não atrasada. */
export function transferLate(arriveAt: string, now: Date): boolean {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(arriveAt);
  if (!m) return false;
  const at = spMidnight(m[1]!).getTime() + (Number(m[2] ?? 23) * 60 + Number(m[3] ?? 59)) * 60_000;
  return now.getTime() > at;
}

// ---------------------------------------------------------------------------
// Exportar
// ---------------------------------------------------------------------------

const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function overviewCsv(label: string, k: Kpis, bars: DayBar[], top: TopProduct[]): string {
  const lines: (string | number)[][] = [
    ['Período', label],
    [],
    ['KPI', 'Valor'],
    ['Receita (R$)', reais(k.revenueCents)],
    ['Pedidos', k.orders],
    ['Ticket médio (R$)', k.ticketCents === null ? '' : reais(k.ticketCents)],
    ['Retirada na arena (%)', k.pickupPct ?? ''],
    [],
    ['Dia', 'Receita (R$)', 'Pedidos'],
    ...bars.map((b) => [b.day, reais(b.revenueCents), b.orders]),
    [],
    ['Posição', 'Produto', 'Unidades', 'Receita (R$)'],
    ...top.map((t, i) => [i + 1, t.name, t.units, reais(t.revenueCents)]),
  ];
  return lines.map((l) => l.map((v) => (/[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(';')).join('\n');
}
