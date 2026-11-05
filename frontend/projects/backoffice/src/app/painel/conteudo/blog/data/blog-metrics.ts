import { formatCount } from './blog-post';

/**
 * Métricas do blog (só app; o site é anônimo). As contagens chegam prontas das agregações do
 * Firestore (`blog-metrics.repository.ts`); aqui só a janela e os textos. Spec: seção "Métricas"
 * de `docs/superpowers/specs/2026-11-05-blog-fase-1-design.md`.
 */

export const METRICS_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Últimos 30 dias até agora e os 30 antes deles. */
export function metricsWindow(now: Date): { start: Date; prevStart: Date } {
  const start = new Date(now.getTime() - METRICS_WINDOW_DAYS * DAY_MS);
  return { start, prevStart: new Date(start.getTime() - METRICS_WINDOW_DAYS * DAY_MS) };
}

/** O que as agregações da lista devolvem para a janela. */
export interface BlogWindowMetrics {
  reads: number;
  prevReads: number;
  /** `null` = nenhuma leitura (a média do Firestore vem nula). */
  avgSeconds: number | null;
  finished: number;
  ctaClicks: number;
  readers: number;
  /** Leitores da janela cuja primeira leitura é de antes dela. */
  returningReaders: number;
}

/** O que as agregações devolvem para um post. */
export interface BlogPostMetrics {
  reads: number;
  avgSeconds: number | null;
  finished: number;
  ctaClicks: number;
}

/** "2m 48s", "45s", "1h 2m". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) {
    return `${total}s`;
  }
  if (total < 3600) {
    return `${Math.floor(total / 60)}m ${total % 60}s`;
  }
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
}

/** Fração → "4,9%" (uma casa só abaixo de 10%; ",0" some) ou "38%". */
export function formatPercent(ratio: number): string {
  const pct = Math.max(0, ratio * 100);
  if (pct > 0 && pct < 9.95) {
    return `${pct.toFixed(1).replace(/\.0$/, '').replace('.', ',')}%`;
  }
  return `${Math.round(pct)}%`;
}

export type Trend = 'up' | 'down' | 'flat';

/** Linha de variação: sempre com seta e texto (a cor só reforça). */
export function variation(current: number, previous: number): { text: string; trend: Trend | null } {
  if (previous <= 0) {
    return { text: 'primeiros 30 dias', trend: null };
  }
  const change = (current - previous) / previous;
  const label = formatPercent(Math.abs(change));
  if (label === '0%') {
    return { text: '= igual aos 30 dias antes', trend: 'flat' };
  }
  return change > 0
    ? { text: `▲ ${label} vs. 30 dias antes`, trend: 'up' }
    : { text: `▼ ${label} vs. 30 dias antes`, trend: 'down' };
}

export interface MetricCard {
  label: string;
  value: string;
  note: string;
  trend: Trend | null;
}

export const METRIC_LABELS = ['Leituras · 30 dias', 'Leitores únicos', 'Tempo médio de leitura', 'Cliques nas chamadas'] as const;

const NO_READS = 'sem leituras no app ainda';

/** Os 4 cards da lista. `null` = carregando ou falhou: valores "—" sem linha de baixo. */
export function metricCards(m: BlogWindowMetrics | null): MetricCard[] {
  if (!m) {
    return METRIC_LABELS.map((label) => ({ label, value: '—', note: '', trend: null }));
  }
  if (m.reads === 0) {
    return METRIC_LABELS.map((label) => ({ label, value: '—', note: NO_READS, trend: null }));
  }
  const delta = variation(m.reads, m.prevReads);
  return [
    { label: METRIC_LABELS[0], value: formatCount(m.reads), note: delta.text, trend: delta.trend },
    {
      label: METRIC_LABELS[1],
      value: formatCount(m.readers),
      // O leitor entra pelo gatilho da leitura: logo depois da 1ª leitura pode ainda não ter chegado.
      note: m.readers > 0 ? `${formatPercent(m.returningReaders / m.readers)} já liam antes` : 'leitores ainda sendo contados',
      trend: null,
    },
    {
      label: METRIC_LABELS[2],
      value: m.avgSeconds === null ? '—' : formatDuration(m.avgSeconds),
      note: `lido até o fim: ${formatPercent(m.finished / m.reads)}`,
      trend: null,
    },
    {
      label: METRIC_LABELS[3],
      value: formatCount(m.ctaClicks),
      note: `${formatPercent(m.ctaClicks / m.reads)} das leituras`,
      trend: null,
    },
  ];
}

/** Linhas do "Resultado do post" no editor. Cliques só quando o post tem chamada. */
export function postResultRows(
  m: BlogPostMetrics,
  post: { hasCta: boolean; helpfulCount: number; readCount: number },
): Array<{ label: string; value: string }> {
  const none = m.reads === 0;
  return [
    { label: 'Leituras no app', value: formatCount(m.reads) },
    { label: 'Tempo médio', value: none || m.avgSeconds === null ? '—' : formatDuration(m.avgSeconds) },
    { label: 'Lido até o fim', value: none ? '—' : formatPercent(m.finished / m.reads) },
    ...(post.hasCta
      ? [{ label: 'Cliques na chamada', value: none ? '0' : `${formatCount(m.ctaClicks)} · ${formatPercent(m.ctaClicks / m.reads)}` }]
      : []),
    { label: '“Ajudou”', value: formatCount(post.helpfulCount) },
    { label: 'Leitores', value: formatCount(post.readCount) },
  ];
}
