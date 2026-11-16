/**
 * Métricas do clube a partir de `benefitEvents` (gravados só pelo servidor, com debounce de 30 s).
 * Mesma conta do script `functions/scripts/benefits-report.js`: por tipo e por parceiro, o total de
 * eventos e os atletas únicos. Atleta único é o número honesto para a reunião com o parceiro.
 */
import { toCsv } from './csv';
import type { Partner } from './partner';

export const BENEFIT_EVENT_TYPES = [
  'hub_card_view',
  'club_view',
  'partner_view',
  'cta_click',
  'code_copy',
  'lead_submit',
] as const;
export type BenefitEventType = (typeof BENEFIT_EVENT_TYPES)[number];

/** Rótulos do CSV, iguais aos do script. */
export const EVENT_LABELS: Record<BenefitEventType, string> = {
  hub_card_view: 'Card do Hub visto',
  club_view: 'Clube aberto',
  partner_view: 'Parceiro visto',
  cta_click: 'Clique no botão',
  code_copy: 'Cupom copiado',
  lead_submit: 'Lead enviado',
};

/** Origem da visita (`source` do evento e do lead). */
export const SOURCE_LABELS: Record<string, string> = {
  hub_card: 'Card do Hub (app)',
  competir_web: 'Card do Competir (portal)',
  home: 'Início',
  deeplink: 'Link direto',
  push: 'Push',
  club_list: 'Lista do clube',
  sponsor_banner: 'Banner do patrocinador',
  unknown: 'Não informada',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export interface BenefitEvent {
  type: BenefitEventType;
  partnerId: string | null;
  uid: string;
  source: string;
  createdAt: Date | null;
}

function dateOf(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  return value instanceof Date ? value : null;
}

/** Evento de tipo desconhecido ou sem uid fica de fora (`null`). */
export function benefitEventFromDoc(data: Record<string, unknown>): BenefitEvent | null {
  const type = data['type'];
  const uid = data['uid'];
  if (typeof type !== 'string' || !(BENEFIT_EVENT_TYPES as readonly string[]).includes(type)) return null;
  if (typeof uid !== 'string' || uid === '') return null;
  const partnerId = data['partnerId'];
  const source = data['source'];
  return {
    type: type as BenefitEventType,
    partnerId: typeof partnerId === 'string' && partnerId !== '' ? partnerId : null,
    uid,
    source: typeof source === 'string' && source !== '' ? source : 'unknown',
    createdAt: dateOf(data['createdAt']),
  };
}

// ── período ────────────────────────────────────────────────────────────────

export type MetricsPeriod = 'today' | '7d' | '30d' | 'all';

export const METRICS_PERIODS: ReadonlyArray<{ id: MetricsPeriod; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'all', label: 'Tudo' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Início do período (`createdAt >=`). Hoje = desde a meia-noite local; Tudo = sem filtro (`null`). */
export function periodStart(period: MetricsPeriod, now: Date): Date | null {
  switch (period) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case '7d':
      return new Date(now.getTime() - 7 * DAY_MS);
    case '30d':
      return new Date(now.getTime() - 30 * DAY_MS);
    default:
      return null;
  }
}

// ── agregação ──────────────────────────────────────────────────────────────

export interface EventCount {
  total: number;
  athletes: number;
}

export type CountsByType = Record<BenefitEventType, EventCount>;

export interface PartnerCounts {
  partnerId: string;
  counts: CountsByType;
}

export interface SourceCount {
  source: string;
  total: number;
  athletes: number;
}

export interface BenefitMetrics {
  eventCount: number;
  /** Clube inteiro: cada tipo somando todos os parceiros, atleta único no clube. */
  overall: CountsByType;
  /** Eventos sem parceiro (card do Hub, clube aberto): a linha "Clube (todos)" do script. */
  club: CountsByType;
  byPartner: PartnerCounts[];
  /** Leads = pares parceiro + atleta (um lead por atleta e parceiro, reenvio não conta de novo). */
  leads: number;
  /** Cliques no botão por origem da visita, do maior para o menor. */
  clickSources: SourceCount[];
}

type Tally = Map<BenefitEventType, { total: number; uids: Set<string> }>;

function bump(tally: Tally, type: BenefitEventType, uid: string): void {
  const entry = tally.get(type) ?? { total: 0, uids: new Set<string>() };
  entry.total++;
  entry.uids.add(uid);
  tally.set(type, entry);
}

function countsOf(tally: Tally | undefined): CountsByType {
  const out = {} as CountsByType;
  for (const type of BENEFIT_EVENT_TYPES) {
    const entry = tally?.get(type);
    out[type] = { total: entry?.total ?? 0, athletes: entry?.uids.size ?? 0 };
  }
  return out;
}

export function aggregateEvents(events: readonly BenefitEvent[]): BenefitMetrics {
  const overall: Tally = new Map();
  const club: Tally = new Map();
  const partners = new Map<string, Tally>();
  const sources = new Map<string, { total: number; uids: Set<string> }>();
  const leadPairs = new Set<string>();

  for (const e of events) {
    bump(overall, e.type, e.uid);
    if (e.partnerId === null) {
      bump(club, e.type, e.uid);
    } else {
      const tally = partners.get(e.partnerId) ?? new Map();
      bump(tally, e.type, e.uid);
      partners.set(e.partnerId, tally);
    }
    if (e.type === 'lead_submit' && e.partnerId !== null) {
      leadPairs.add(`${e.partnerId}\u0000${e.uid}`);
    }
    if (e.type === 'cta_click') {
      const s = sources.get(e.source) ?? { total: 0, uids: new Set<string>() };
      s.total++;
      s.uids.add(e.uid);
      sources.set(e.source, s);
    }
  }

  return {
    eventCount: events.length,
    overall: countsOf(overall),
    club: countsOf(club),
    byPartner: [...partners.entries()].map(([partnerId, tally]) => ({ partnerId, counts: countsOf(tally) })),
    leads: leadPairs.size,
    clickSources: [...sources.entries()]
      .map(([source, s]) => ({ source, total: s.total, athletes: s.uids.size }))
      .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source)),
  };
}

// ── tabela por parceiro ────────────────────────────────────────────────────

export interface PartnerMetricRow {
  partnerId: string;
  name: string;
  views: number;
  viewers: number;
  clicks: number;
  clickers: number;
  codeCopies: number;
  leads: number;
  /** Atletas que clicaram ÷ atletas que viram. `null` sem visita. */
  clickRate: number | null;
  /** Cupom e lead só fazem sentido em parte dos parceiros: o resto mostra "—". */
  couponApplies: boolean;
  leadApplies: boolean;
}

/**
 * Uma linha por parceiro com evento no período, mais os ativos sem evento (zerados). Parceiro
 * excluído que ainda tem evento aparece pelo id. Ordem: mais atletas que viram primeiro.
 */
export function partnerMetricRows(metrics: BenefitMetrics, partners: readonly Partner[]): PartnerMetricRow[] {
  const byId = new Map(partners.map((p) => [p.id, p]));
  const counted = new Map(metrics.byPartner.map((p) => [p.partnerId, p.counts]));
  const ids = new Set([...counted.keys(), ...partners.filter((p) => p.active).map((p) => p.id)]);

  return [...ids]
    .map((id): PartnerMetricRow => {
      const c = counted.get(id) ?? countsOf(undefined);
      const p = byId.get(id);
      return {
        partnerId: id,
        name: p?.name ?? id,
        views: c.partner_view.total,
        viewers: c.partner_view.athletes,
        clicks: c.cta_click.total,
        clickers: c.cta_click.athletes,
        codeCopies: c.code_copy.total,
        leads: c.lead_submit.athletes,
        clickRate: c.partner_view.athletes > 0 ? c.cta_click.athletes / c.partner_view.athletes : null,
        couponApplies: p ? p.couponMode !== 'none' || c.code_copy.total > 0 : true,
        leadApplies: p ? p.ctaType === 'lead_form' || c.lead_submit.total > 0 : true,
      };
    })
    .sort((a, b) => b.viewers - a.viewers || b.views - a.views || a.name.localeCompare(b.name, 'pt-BR'));
}

/** 0,25 → "25%"; `null` → "—". */
export function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${(Math.round(rate * 1000) / 10).toLocaleString('pt-BR')}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('pt-BR');
}

/**
 * CSV no formato do script (`parceiro;evento;total;atletas_unicos`): "Clube (todos)" com os eventos
 * sem parceiro e uma linha por parceiro e tipo. Tipo sem evento fica de fora, como no script.
 */
export function metricsCsv(metrics: BenefitMetrics, rows: readonly PartnerMetricRow[]): string {
  const lines: Array<Array<string | number>> = [['parceiro', 'evento', 'total', 'atletas_unicos']];
  const push = (name: string, counts: CountsByType) => {
    for (const type of BENEFIT_EVENT_TYPES) {
      const c = counts[type];
      if (c.total > 0) lines.push([name, EVENT_LABELS[type], c.total, c.athletes]);
    }
  };
  push('Clube (todos)', metrics.club);
  const counted = new Map(metrics.byPartner.map((p) => [p.partnerId, p.counts]));
  for (const row of rows) {
    const counts = counted.get(row.partnerId);
    if (counts) push(row.name, counts);
  }
  return toCsv(lines);
}
