/**
 * Tela 01 · Visão geral do programa: os números do ciclo inteiro, por nível, e o que pede ação.
 *
 * Parte das mesmas linhas da tela 02 (`buildRows` no período "piloto inteiro"): conversões, receita,
 * custo (comissões + kit), ROI e status derivado batem embaixador por embaixador com a lista.
 * Dinheiro em centavos.
 */
import { SQUAD_TIERS, TIER_LABELS, type SquadRules, type SquadTier } from '../../niveis-regras/data/squad-rules';
import { brl, dayMonthOfKey, type Commission } from '../../comissoes/data/commission';
import { contractDays, projectedConversions, roiOf } from '../../data/squad-program';
import { roiLabel, type AmbassadorRow } from '../../embaixadores/data/ambassador';
import { plural, weekOf } from '../../data/squad-metrics';
import type { PanelIconName } from '../../../ui/icon.component';

export const TIER_PLURAL: Record<SquadTier, string> = {
  ath: 'Athletes',
  amb: 'Ambassadors',
  pro: 'Pro Ambassadors',
  cap: 'Captains',
};

// ── KPIs ────────────────────────────────────────────────────────────────────

export interface OverviewKpis {
  /** Contratos não encerrados (ativos + pausados), como o "{n} de {vagas}" da tela 02. */
  live: number;
  liveByTier: Record<SquadTier, number>;
  conversions: number;
  conversionsWeek: number;
  revenueCents: number;
  revenueWeekCents: number;
  commissionCents: number;
  kitCents: number;
  costCents: number;
  roi: number | null;
}

export function overviewKpis(input: {
  rows: AmbassadorRow[];
  commissions: Commission[];
  rules: SquadRules;
  now: Date;
}): OverviewKpis {
  const liveByTier: Record<SquadTier, number> = { ath: 0, amb: 0, pro: 0, cap: 0 };
  let conversions = 0;
  let revenueCents = 0;
  let costCents = 0;
  let kitCents = 0;
  for (const r of input.rows) {
    if (r.contract.state !== 'ended') liveByTier[r.contract.tier]++;
    conversions += r.conversions;
    revenueCents += r.revenueCents;
    costCents += r.costCents;
    kitCents += input.rules.tiers[r.contract.tier].kitCostCents;
  }
  // A semana só conta quem tem contrato, como as linhas.
  const ids = new Set(input.rows.map((r) => r.contract.uid));
  const week = weekOf(input.commissions.filter((c) => ids.has(c.ambassadorId)), input.now);
  return {
    live: SQUAD_TIERS.reduce((n, t) => n + liveByTier[t], 0),
    liveByTier,
    conversions,
    conversionsWeek: week.conversions,
    revenueCents,
    revenueWeekCents: week.revenueCents,
    commissionCents: costCents - kitCents,
    kitCents,
    costCents,
    roi: roiOf(revenueCents, costCents),
  };
}

/** "10 · 5 · 2 · 3 por nível", na ordem da escada (Athlete → Captain). */
export function tierMixLabel(byTier: Record<SquadTier, number>): string {
  return `${SQUAD_TIERS.map((t) => byTier[t]).join(' · ')} por nível`;
}

// ── ROI por perfil ──────────────────────────────────────────────────────────

export interface TierSummary {
  tier: SquadTier;
  /** Contratos não encerrados no nível. */
  count: number;
  conversions: number;
  revenueCents: number;
  costCents: number;
  roi: number | null;
  /** Custo por conversão; `null` sem conversão. */
  cpcCents: number | null;
  /** Conversões por embaixador do nível (todos que já passaram por ele no ciclo). */
  perAmbassador: number;
}

/** Um bloco por nível com contrato no ciclo, maior ROI primeiro (sem ROI no fim). */
export function tierSummaries(rows: AmbassadorRow[]): TierSummary[] {
  const out: TierSummary[] = [];
  for (const tier of SQUAD_TIERS) {
    const list = rows.filter((r) => r.contract.tier === tier);
    if (list.length === 0) continue;
    const conversions = list.reduce((n, r) => n + r.conversions, 0);
    const revenueCents = list.reduce((n, r) => n + r.revenueCents, 0);
    const costCents = list.reduce((n, r) => n + r.costCents, 0);
    out.push({
      tier,
      count: list.filter((r) => r.contract.state !== 'ended').length,
      conversions,
      revenueCents,
      costCents,
      roi: roiOf(revenueCents, costCents),
      cpcCents: conversions > 0 ? Math.round(costCents / conversions) : null,
      perAmbassador: Math.round(conversions / list.length),
    });
  }
  return out.sort((a, b) => (b.roi ?? -1) - (a.roi ?? -1));
}

/** Barra do ROI: 7x enche (o desenho), ou o maior ROI se passar disso. */
export function roiBarPct(roi: number | null, all: TierSummary[]): number {
  if (roi === null) return 0;
  const top = Math.max(7, ...all.map((s) => s.roi ?? 0));
  return (roi / top) * 100;
}

export interface Insight {
  lead: string;
  rest: string;
}

/**
 * "Captains: R$ 18 por conversão, 28 conversões por embaixador — contra R$ 43 dos Pro Ambassadors."
 * Só aparece com dois níveis convertendo e custos diferentes.
 */
export function costInsight(summaries: TierSummary[]): Insight | null {
  const ranked = summaries.filter((s) => s.cpcCents !== null).sort((a, b) => a.cpcCents! - b.cpcCents!);
  if (ranked.length < 2) return null;
  const best = ranked[0]!;
  const worst = ranked[ranked.length - 1]!;
  if (best.cpcCents === worst.cpcCents) return null;
  return {
    lead: `${TIER_PLURAL[best.tier]}: ${brl(best.cpcCents!, false)} por conversão`,
    rest: `, ${plural(best.perAmbassador, 'conversão', 'conversões')} por embaixador — contra ${brl(worst.cpcCents!, false)} dos ${TIER_PLURAL[worst.tier]}.`,
  };
}

// ── custo no ciclo ──────────────────────────────────────────────────────────

export interface CostLine {
  label: string;
  /** `null` = ainda sem fonte no NexaGO. */
  cents: number | null;
  pct: number;
}

export function costLines(k: Pick<OverviewKpis, 'commissionCents' | 'kitCents'>): CostLine[] {
  const lines: Array<[string, number | null]> = [
    ['Comissões', k.commissionCents],
    ['Kits', k.kitCents],
    ['Inscrições gratuitas', null],
    ['Cachês de campanha', null],
    ['Eventos', null],
  ];
  const max = Math.max(1, ...lines.map(([, c]) => c ?? 0));
  return lines.map(([label, cents]) => ({ label, cents, pct: cents === null ? 0 : (cents / max) * 100 }));
}

// ── precisa de atenção ──────────────────────────────────────────────────────

export interface AttentionItem {
  key: string;
  icon: PanelIconName;
  tone: 'orange' | 'red';
  title: string;
  sub: string;
  action: string;
  route: string;
}

export const PROFILE_ROUTE = '/painel/squad/embaixadores';

export function attentionItems(input: {
  rows: AmbassadorRow[];
  released: { cents: number; ambassadors: number };
  payoutDate: string | null;
  newApplications: number;
  pilotFull: boolean;
  freeSeats: number;
  rules: SquadRules;
  now: Date;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { released } = input;
  if (released.cents > 0) {
    items.push({
      key: 'payout',
      icon: 'cash',
      tone: 'orange',
      title: `${brl(released.cents, released.cents % 100 !== 0)} em comissões liberadas`,
      sub: [plural(released.ambassadors, 'embaixador', 'embaixadores'), input.payoutDate ? `repasse em ${dayMonthOfKey(input.payoutDate)}` : null]
        .filter(Boolean)
        .join(' · '),
      action: 'Revisar',
      route: '/painel/squad/comissoes',
    });
  }
  const promoOf = (tier: SquadTier) => input.rules.promotion.find((p) => p.from === tier) ?? null;
  const byName = (a: AmbassadorRow, b: AmbassadorRow) => a.contract.name.localeCompare(b.contract.name, 'pt-BR');
  const live = input.rows.filter((r) => r.contract.state !== 'ended').sort(byName);
  for (const r of live.filter((x) => x.status === 'eligible')) {
    const promo = promoOf(r.contract.tier);
    if (!promo) continue;
    items.push({
      key: `eligible-${r.contract.uid}`,
      icon: 'star',
      tone: 'orange',
      title: `${r.contract.name} elegível a ${TIER_LABELS[promo.to]}`,
      sub: `${plural(r.conversions, 'conversão', 'conversões')} · meta era ${promo.minConversions}`,
      action: 'Promover',
      route: `${PROFILE_ROUTE}/${r.contract.uid}`,
    });
  }
  for (const r of live.filter((x) => x.status === 'at_risk')) {
    const days = contractDays(r.contract.start, input.now);
    items.push({
      key: `risk-${r.contract.uid}`,
      icon: 'alert',
      tone: 'red',
      title: `${r.contract.name} com ROI ${roiLabel(r.roi)}`,
      sub: `${plural(r.conversions, 'conversão', 'conversões')} em ${plural(days, 'dia', 'dias')}`,
      action: 'Ver perfil',
      route: `${PROFILE_ROUTE}/${r.contract.uid}`,
    });
  }
  for (const r of live.filter((x) => x.status === 'below_goal')) {
    const promo = promoOf(r.contract.tier);
    if (!promo) continue;
    const pace = Math.round(projectedConversions(r.conversions, contractDays(r.contract.start, input.now)));
    items.push({
      key: `below-${r.contract.uid}`,
      icon: 'trend-up',
      tone: 'red',
      title: `${r.contract.name} abaixo da meta`,
      sub: `ritmo de ${plural(pace, 'conversão', 'conversões')} no dia 90 · meta ${promo.minConversions}`,
      action: 'Ver perfil',
      route: `${PROFILE_ROUTE}/${r.contract.uid}`,
    });
  }
  if (input.newApplications > 0) {
    items.push({
      key: 'applications',
      icon: 'squad',
      tone: 'orange',
      title: `${plural(input.newApplications, 'candidatura nova', 'candidaturas novas')}`,
      sub: input.pilotFull
        ? 'Piloto cheio · vão para a lista de espera'
        : `${plural(input.freeSeats, 'vaga livre', 'vagas livres')} no ciclo`,
      action: 'Analisar',
      route: '/painel/squad/candidaturas',
    });
  }
  for (const r of live.filter((x) => x.contract.pendingTier !== null)) {
    items.push({
      key: `amendment-${r.contract.uid}`,
      icon: 'file',
      tone: 'orange',
      title: `Aditivo de ${r.contract.name} sem aceite`,
      sub: `${TIER_LABELS[r.contract.tier]} → ${TIER_LABELS[r.contract.pendingTier!]} · o nível muda no aceite do app`,
      action: 'Ver perfil',
      route: `${PROFILE_ROUTE}/${r.contract.uid}`,
    });
  }
  return items;
}

// ── Score ───────────────────────────────────────────────────────────────────

/** Os 5 maiores Scores entre os contratos vivos; vazio enquanto o Score não for calculado. */
export function scoreLeaders(rows: AmbassadorRow[], limit = 5): AmbassadorRow[] {
  return rows
    .filter((r) => r.contract.state !== 'ended' && r.contract.score !== null)
    .sort((a, b) => b.contract.score! - a.contract.score! || a.contract.name.localeCompare(b.contract.name, 'pt-BR'))
    .slice(0, limit);
}

// ── exportação ──────────────────────────────────────────────────────────────

const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const ratio = (v: number | null) => (v === null ? '' : v.toFixed(1).replace('.', ','));

/** CSV com `;` (abre direto no Excel em pt-BR): o quadro "ROI por perfil" + a linha de total. */
export function overviewCsv(summaries: TierSummary[], k: OverviewKpis): string {
  const head = ['perfil', 'embaixadores', 'conversoes', 'receita', 'custo', 'roi', 'custo_por_conversao'];
  const lines = summaries.map((s) => [
    TIER_LABELS[s.tier],
    String(s.count),
    String(s.conversions),
    reais(s.revenueCents),
    reais(s.costCents),
    ratio(s.roi),
    s.cpcCents === null ? '' : reais(s.cpcCents),
  ]);
  const total = [
    'Total',
    String(k.live),
    String(k.conversions),
    reais(k.revenueCents),
    reais(k.costCents),
    ratio(k.roi),
    k.conversions > 0 ? reais(Math.round(k.costCents / k.conversions)) : '',
  ];
  return [head, ...lines, total].map((l) => l.join(';')).join('\n');
}
