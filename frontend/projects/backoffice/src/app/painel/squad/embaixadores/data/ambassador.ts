/**
 * Linhas da tela 02 · Embaixadores: contrato + conversões/receita/custo do período + status derivado.
 *
 * Conv./Receita = comissões liberadas e pagas atribuídas (`squadCommissions`), pela data da inscrição.
 * Custo = comissões + kit do nível. Inscrições gratuitas usadas, cachês e bônus ainda não têm fonte
 * no Firestore e entram como zero (registrado no PR). O status olha o contrato inteiro (o período só
 * muda as colunas); o Score é sempre do ciclo e não muda com o período.
 * Dinheiro em centavos.
 */
import { TIER_LABELS, type SquadRules, type SquadTier } from '../../niveis-regras/data/squad-rules';
import type { Contract, CountedCommission } from '../../data/squad-program.repository';
import { DAY_MS, STATUS_LABELS, deriveStatus, roiOf, type DerivedStatus } from '../../data/squad-program';

export type AmbPeriod = 'pilot' | 'last30' | 'month';

export const PERIOD_LABELS: Record<AmbPeriod, string> = {
  pilot: 'piloto inteiro',
  last30: 'últimos 30 dias',
  month: 'mês atual',
};

export type SortKey = 'roi' | 'score' | 'conversions' | 'revenue' | 'name' | 'joined';

export const SORT_LABELS: Record<SortKey, string> = {
  roi: 'ROI · maior primeiro',
  score: 'Score · maior primeiro',
  conversions: 'Conversões · mais primeiro',
  revenue: 'Receita · maior primeiro',
  name: 'Nome · A–Z',
  joined: 'Entrada · mais recente',
};

/** Opções do filtro Status ("Ativo" inclui "Ativo · início"). */
export type StatusFilter = Exclude<DerivedStatus, 'active_start'>;
export const STATUS_FILTERS: readonly StatusFilter[] = ['active', 'eligible', 'below_goal', 'at_risk', 'paused', 'ended'];
export const DEFAULT_STATUS_FILTER: readonly StatusFilter[] = STATUS_FILTERS.filter((s) => s !== 'ended');

export type Tab = 'all' | SquadTier;

export interface AmbassadorRow {
  contract: Contract;
  conversions: number;
  revenueCents: number;
  costCents: number;
  roi: number | null;
  status: DerivedStatus;
}

export interface Filters {
  tab: Tab;
  search: string;
  cities: string[];
  statuses: StatusFilter[];
  sort: SortKey;
}

const SP = 'America/Sao_Paulo';

/** Início do período (inclusivo); `null` = piloto inteiro. */
export function periodStart(period: AmbPeriod, now: Date): Date | null {
  if (period === 'last30') return new Date(now.getTime() - 30 * DAY_MS);
  if (period === 'month') {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: SP }).format(now).slice(0, 7);
    return new Date(`${key}-01T00:00:00-03:00`);
  }
  return null;
}

function sums(list: CountedCommission[]): { conversions: number; revenueCents: number; commissionCents: number } {
  let revenueCents = 0;
  let commissionCents = 0;
  for (const c of list) {
    revenueCents += c.netCents;
    commissionCents += c.amountCents;
  }
  return { conversions: list.length, revenueCents, commissionCents };
}

export function buildRows(input: {
  contracts: Contract[];
  commissions: CountedCommission[];
  rules: SquadRules;
  period: AmbPeriod;
  now: Date;
}): AmbassadorRow[] {
  const from = periodStart(input.period, input.now);
  const byAmbassador = new Map<string, CountedCommission[]>();
  for (const c of input.commissions) {
    const list = byAmbassador.get(c.ambassadorId) ?? [];
    list.push(c);
    byAmbassador.set(c.ambassadorId, list);
  }
  return input.contracts.map((contract) => {
    const all = byAmbassador.get(contract.uid) ?? [];
    const kit = input.rules.tiers[contract.tier].kitCostCents;
    const total = sums(all);
    const totalRoi = roiOf(total.revenueCents, total.commissionCents + kit);
    const inPeriod = from ? all.filter((c) => c.registeredAt !== null && c.registeredAt >= from) : all;
    const period = sums(inPeriod);
    // O kit pesa no período em que o contrato começou.
    const kitInPeriod = !from || (contract.start !== null && contract.start >= from) ? kit : 0;
    const costCents = period.commissionCents + kitInPeriod;
    return {
      contract,
      conversions: period.conversions,
      revenueCents: period.revenueCents,
      costCents,
      roi: roiOf(period.revenueCents, costCents),
      status: deriveStatus({
        state: contract.state,
        tier: contract.tier,
        start: contract.start,
        conversions: total.conversions,
        roi: totalRoi,
        rules: input.rules,
        now: input.now,
      }),
    };
  });
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}

/** Busca por nome, código ou arena — vale a partir de 2 caracteres. */
export function matchesSearch(row: AmbassadorRow, term: string): boolean {
  const q = fold(term.trim());
  if (q.length < 2) return true;
  const c = row.contract;
  return [c.name, c.code, c.arenaName ?? ''].some((v) => fold(v).includes(q));
}

export function statusFilterOf(status: DerivedStatus): StatusFilter {
  return status === 'active_start' ? 'active' : status;
}

export function applyFilters(rows: AmbassadorRow[], f: Filters): AmbassadorRow[] {
  return rows.filter(
    (r) =>
      (f.tab === 'all' || r.contract.tier === f.tab) &&
      f.statuses.includes(statusFilterOf(r.status)) &&
      (f.cities.length === 0 || (r.contract.city !== null && f.cities.includes(r.contract.city))) &&
      matchesSearch(r, f.search),
  );
}

/** Contagem das abas: contratos não encerrados (encerrados ficam no filtro Status). */
export function tabCounts(rows: AmbassadorRow[]): Record<Tab, number> {
  const out: Record<Tab, number> = { all: 0, ath: 0, amb: 0, pro: 0, cap: 0 };
  for (const r of rows) {
    if (r.contract.state === 'ended') continue;
    out.all++;
    out[r.contract.tier]++;
  }
  return out;
}

/** Ordem pedida, com o nome como desempate. Sem ROI/Score vai para o fim. */
export function sortRows(rows: AmbassadorRow[], key: SortKey): AmbassadorRow[] {
  const byName = (a: AmbassadorRow, b: AmbassadorRow) => a.contract.name.localeCompare(b.contract.name, 'pt-BR');
  const desc = (pick: (r: AmbassadorRow) => number | null) => (a: AmbassadorRow, b: AmbassadorRow) => {
    const va = pick(a);
    const vb = pick(b);
    if (va === vb) return byName(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  };
  const cmp: Record<SortKey, (a: AmbassadorRow, b: AmbassadorRow) => number> = {
    roi: desc((r) => r.roi),
    score: desc((r) => r.contract.score),
    conversions: desc((r) => r.conversions),
    revenue: desc((r) => r.revenueCents),
    name: byName,
    joined: desc((r) => r.contract.start?.getTime() ?? null),
  };
  return [...rows].sort(cmp[key]);
}

export function citiesOf(rows: AmbassadorRow[]): string[] {
  return [...new Set(rows.map((r) => r.contract.city).filter((c): c is string => !!c))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
}

/** "6,4x" com 1 casa; sem custo = "—". */
export function roiLabel(roi: number | null): string {
  return roi === null ? '—' : `${roi.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
}

export function statusLabel(status: DerivedStatus): string {
  return STATUS_LABELS[status];
}

export function dateLabel(date: Date | null): string {
  return date ? date.toLocaleDateString('pt-BR', { timeZone: SP }) : '';
}

/** Score em recálculo (03:00–03:15 de SP): mostra o anterior com "Atualizando". */
export function scoreRecalculating(now: Date): boolean {
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: SP, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return hm >= '03:00' && hm < '03:15';
}

const csvCell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');

/** CSV com `;` (abre direto no Excel em pt-BR), nas colunas da spec da tela 02. */
export function ambassadorsCsv(rows: AmbassadorRow[]): string {
  const head = [
    'nome', 'cidade', 'arena', 'nivel', 'codigo', 'status', 'inicio_contrato', 'fim_contrato',
    'conversoes', 'receita', 'custo', 'roi', 'score', 'pontos',
  ];
  const lines = rows.map((r) => [
    r.contract.name,
    r.contract.city ?? '',
    r.contract.arenaName ?? '',
    TIER_LABELS[r.contract.tier],
    r.contract.code,
    statusLabel(r.status),
    dateLabel(r.contract.start),
    dateLabel(r.contract.end),
    String(r.conversions),
    reais(r.revenueCents),
    reais(r.costCents),
    r.roi === null ? '' : r.roi.toFixed(1).replace('.', ','),
    r.contract.score === null ? '' : String(r.contract.score),
    r.contract.points === null ? '' : String(r.contract.points),
  ]);
  return [head, ...lines].map((l) => l.map(csvCell).join(';')).join('\n');
}
