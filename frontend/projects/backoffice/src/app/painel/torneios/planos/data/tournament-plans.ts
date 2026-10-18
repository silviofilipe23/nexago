/**
 * Planos de torneio v2: tipos, padrão, limites e validação. Espelho à mão de
 * `functions/src/tournament-plans.ts` — mudou lá, muda aqui. Dinheiro em centavos.
 */

export const PLAN_STATUSES = ['ativo', 'oculto', 'rascunho'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const CANCEL_POLICIES = ['total', 'parcial', 'nenhum'] as const;
export type CancelPolicy = (typeof CANCEL_POLICIES)[number];

/**
 * Comissão padrão sobre inscrições (`TOURNAMENT_FEE_PERCENT` de `platform-fees.ts`). Não é
 * editada aqui: é a taxa da plataforma, negociável por organizador no cadastro dele.
 */
export const COMMISSION_PCT = 8;

export const LIMITS = {
  nameMin: 2,
  nameMax: 40,
  descMax: 100,
  priceCents: 100_000_00,
  balanceDays: 60,
  courts: 8,
  refsPerCourt: 4,
  hoursMin: 2,
  hoursMax: 16,
  extraHourCents: 10_000_00,
  leadDays: 180,
  maxPerDay: 20,
  cities: 40,
  cityMax: 60,
  costCents: 100_000_00,
  minMarginPct: 90,
  tiers: 6,
  tierNameMax: 20,
  tierPriceCents: 10_000_00,
  appearances: 500,
  secondsMax: 60,
  mentions: 20,
  maxPerEvent: 50,
  perHour: 120,
  sharePct: 100,
} as const;

export interface TournamentPlan {
  name: string;
  description: string;
  status: PlanStatus;
  priceCents: number;
  depositPct: number;
  balanceDays: number;
  cancelPolicy: CancelPolicy;
  courts: number;
  refsPerCourt: number;
  live: boolean;
  narrator: boolean;
  hours: number;
  extraHourCents: number;
  leadDays: number;
  maxPerDay: number;
  cities: string[];
}

export interface PlanRules {
  fixedCostCents: number;
  courtCostCents: number;
  minMarginPct: number;
}

export interface SponsorTier {
  id: string;
  name: string;
  color: string;
  priceCents: number;
  appearances: number;
  seconds: number;
  mentions: number;
  maxPerEvent: number;
  onSale: boolean;
}

export interface SponsorsConfig {
  tiers: SponsorTier[];
  maxPerHour: number;
  hours: number;
  organizerSharePct: number;
  organizerCanSell: boolean;
  logoApproval: boolean;
  segmentExclusive: boolean;
}

export interface ScheduledPlan {
  plan: TournamentPlan;
  version: number;
  /** `YYYY-MM-DD` em São Paulo. */
  effectiveFrom: string;
}

/** Um plano como a tela o enxerga: o vigente, o agendado e o rascunho salvo. */
export interface PlanEntry {
  id: string;
  order: number;
  /** 0 = nunca publicado. */
  version: number;
  current: TournamentPlan | null;
  next: ScheduledPlan | null;
  draft: TournamentPlan | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

// ── padrão ──────────────────────────────────────────────────────────────────

const BASE_PLAN: Omit<TournamentPlan, 'name' | 'description' | 'priceCents' | 'courts'> = {
  status: 'ativo',
  depositPct: 50,
  balanceDays: 7,
  cancelPolicy: 'parcial',
  refsPerCourt: 2,
  live: true,
  narrator: true,
  hours: 10,
  extraHourCents: 0,
  leadDays: 21,
  maxPerDay: 3,
  cities: ['Goiânia', 'Brasília'],
};

export const DEFAULT_PLANS: ReadonlyArray<{ id: string; order: number; plan: TournamentPlan }> = [
  { id: 'plano-1', order: 1, plan: { ...BASE_PLAN, name: 'Plano 1', priceCents: 1700_00, courts: 1,
    description: 'Uma quadra com arbitragem e transmissão narrada.' } },
  { id: 'plano-2', order: 2, plan: { ...BASE_PLAN, name: 'Plano 2', priceCents: 2500_00, courts: 2,
    description: 'Duas quadras com arbitragem completa e transmissão narrada da quadra principal.' } },
  { id: 'plano-3', order: 3, plan: { ...BASE_PLAN, name: 'Plano 3', priceCents: 3000_00, courts: 3,
    description: 'Três quadras com arbitragem completa e transmissão narrada da quadra principal.' } },
  { id: 'plano-4', order: 4, plan: { ...BASE_PLAN, name: 'Plano 4', priceCents: 3500_00, courts: 4,
    description: 'Quatro quadras com arbitragem completa e transmissão narrada da quadra principal.' } },
];

export const DEFAULT_RULES: PlanRules = { fixedCostCents: 500_00, courtCostCents: 500_00, minMarginPct: 35 };

export const DEFAULT_SPONSORS: SponsorsConfig = {
  tiers: [
    { id: 'bronze', name: 'Bronze', color: '#C98A5A', priceCents: 50_00, appearances: 10, seconds: 5, mentions: 0,
      maxPerEvent: 8, onSale: true },
    { id: 'prata', name: 'Prata', color: '#C9CDD4', priceCents: 100_00, appearances: 25, seconds: 5, mentions: 0,
      maxPerEvent: 4, onSale: true },
    { id: 'ouro', name: 'Ouro', color: '#F4C543', priceCents: 200_00, appearances: 50, seconds: 5, mentions: 2,
      maxPerEvent: 2, onSale: true },
  ],
  maxPerHour: 12,
  hours: 10,
  organizerSharePct: 20,
  organizerCanSell: true,
  logoApproval: true,
  segmentExclusive: false,
};

export const clone = <T>(v: T): T => structuredClone(v);

/** Modelo do "Novo plano": o último publicado + 1 quadra, em rascunho. */
export function newPlanFrom(last: TournamentPlan | null, count: number): TournamentPlan {
  const base = clone(last ?? DEFAULT_PLANS[0]!.plan);
  const courts = Math.min(LIMITS.courts, base.courts + 1);
  return {
    ...base,
    name: `Plano ${count + 1}`,
    status: 'rascunho',
    courts,
    priceCents: base.priceCents + 500_00,
    description: '',
  };
}

// ── conta ───────────────────────────────────────────────────────────────────

export function planCost(courts: number, r: PlanRules): number {
  return r.fixedCostCents + courts * r.courtCostCents;
}

export function marginCents(p: Pick<TournamentPlan, 'priceCents' | 'courts'>, r: PlanRules): number {
  return p.priceCents - planCost(p.courts, r);
}

export function marginPct(p: Pick<TournamentPlan, 'priceCents' | 'courts'>, r: PlanRules): number {
  return p.priceCents > 0 ? Math.round((marginCents(p, r) / p.priceCents) * 100) : 0;
}

export type MarginTone = 'red' | 'yellow' | 'green';

/** Até 5 pontos abaixo da mínima é atenção; mais que isso é vermelho. */
export function marginTone(pct: number, min: number): MarginTone {
  return pct < min - 5 ? 'red' : pct < min ? 'yellow' : 'green';
}

/** Menor preço (múltiplo de R$ 10) que alcança a margem mínima. */
export function suggestedPrice(courts: number, r: PlanRules): number {
  const cost = planCost(courts, r);
  if (r.minMarginPct >= 100) {
    return cost;
  }
  return Math.ceil(cost / (1 - r.minMarginPct / 100) / 1000) * 1000;
}

/** O plano que vale hoje: o agendado passa a valer no dia. */
export function effectivePlan(e: Pick<PlanEntry, 'current' | 'next'>, today: string): TournamentPlan | null {
  return e.next && e.next.effectiveFrom <= today ? e.next.plan : e.current;
}

/** A última versão publicada (agendada ou não): a base do diff do editor. */
export function latestPublished(e: Pick<PlanEntry, 'current' | 'next'>): TournamentPlan | null {
  return e.next?.plan ?? e.current;
}

export function saoPauloDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `2026-11-01` → `01/11/2026`. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

export function brl(cents: number, decimals?: number): string {
  if (!Number.isFinite(cents)) {
    return '—';
  }
  const frac = decimals ?? (cents % 100 ? 2 : 0);
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });
}

/** Reais digitados → centavos inteiros. NaN segue NaN, para a validação acusar. */
export function toCents(reais: number): number {
  return Number.isFinite(reais) ? Math.round(reais * 100) : NaN;
}

// ── validação (mensagens por campo) ─────────────────────────────────────────

export type Issues = Record<string, string>;

const isInt = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;

export function validatePlan(p: TournamentPlan): Issues {
  const out: Issues = {};
  const name = p.name.trim().length;
  if (name < LIMITS.nameMin || name > LIMITS.nameMax) {
    out['name'] = `De ${LIMITS.nameMin} a ${LIMITS.nameMax} caracteres`;
  }
  if (p.description.trim().length > LIMITS.descMax) {
    out['description'] = `Até ${LIMITS.descMax} caracteres`;
  }
  if (!isInt(p.priceCents, 0, LIMITS.priceCents)) {
    out['priceCents'] = `De R$ 0 a ${brl(LIMITS.priceCents)}`;
  }
  if (!isInt(p.depositPct, 0, 100)) {
    out['depositPct'] = 'De 0 a 100%';
  }
  if (!isInt(p.balanceDays, 0, LIMITS.balanceDays)) {
    out['balanceDays'] = `De 0 a ${LIMITS.balanceDays} dias`;
  }
  if (!isInt(p.extraHourCents, 0, LIMITS.extraHourCents)) {
    out['extraHourCents'] = `De R$ 0 a ${brl(LIMITS.extraHourCents)}`;
  }
  if (!isInt(p.leadDays, 0, LIMITS.leadDays)) {
    out['leadDays'] = `De 0 a ${LIMITS.leadDays} dias`;
  }
  if (!isInt(p.maxPerDay, 1, LIMITS.maxPerDay)) {
    out['maxPerDay'] = `De 1 a ${LIMITS.maxPerDay}`;
  }
  if (p.cities.length > LIMITS.cities) {
    out['cities'] = `Até ${LIMITS.cities} cidades`;
  }
  return out;
}

export function validateRules(r: PlanRules): Issues {
  const out: Issues = {};
  if (!isInt(r.fixedCostCents, 0, LIMITS.costCents)) {
    out['fixedCostCents'] = 'Valor inválido';
  }
  if (!isInt(r.courtCostCents, 0, LIMITS.costCents)) {
    out['courtCostCents'] = 'Valor inválido';
  }
  if (!isInt(r.minMarginPct, 0, LIMITS.minMarginPct)) {
    out['minMarginPct'] = `De 0 a ${LIMITS.minMarginPct}%`;
  }
  return out;
}

export function validateSponsors(s: SponsorsConfig): Issues {
  const out: Issues = {};
  s.tiers.forEach((t, i) => {
    const at = (k: string) => `tiers.${i}.${k}`;
    const name = t.name.trim().length;
    if (name < 2 || name > LIMITS.tierNameMax) {
      out[at('name')] = `De 2 a ${LIMITS.tierNameMax} caracteres`;
    } else if (s.tiers.some((x, j) => j < i && x.name.trim().toLowerCase() === t.name.trim().toLowerCase())) {
      out[at('name')] = 'Já existe uma cota com esse nome';
    }
    if (!isInt(t.priceCents, 0, LIMITS.tierPriceCents)) {
      out[at('priceCents')] = `De R$ 0 a ${brl(LIMITS.tierPriceCents)}`;
    }
    if (!isInt(t.appearances, 0, LIMITS.appearances)) {
      out[at('appearances')] = `De 0 a ${LIMITS.appearances}`;
    }
    if (!isInt(t.seconds, 1, LIMITS.secondsMax)) {
      out[at('seconds')] = `De 1 a ${LIMITS.secondsMax}s`;
    }
    if (!isInt(t.mentions, 0, LIMITS.mentions)) {
      out[at('mentions')] = `De 0 a ${LIMITS.mentions}`;
    }
    if (!isInt(t.maxPerEvent, 0, LIMITS.maxPerEvent)) {
      out[at('maxPerEvent')] = `De 0 a ${LIMITS.maxPerEvent}`;
    }
  });
  if (!isInt(s.maxPerHour, 1, LIMITS.perHour)) {
    out['maxPerHour'] = `De 1 a ${LIMITS.perHour}`;
  }
  if (!isInt(s.hours, LIMITS.hoursMin, LIMITS.hoursMax)) {
    out['hours'] = `De ${LIMITS.hoursMin} a ${LIMITS.hoursMax}h`;
  }
  if (!isInt(s.organizerSharePct, 0, LIMITS.sharePct)) {
    out['organizerSharePct'] = 'De 0 a 100%';
  }
  return out;
}

/** Id estável da cota nova (vai para o pedido do patrocinador quando existir). */
export function tierIdFor(name: string, taken: readonly string[]): string {
  const base =
    name
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 18) || 'cota';
  let id = base.length >= 2 ? base : `cota-${base}`;
  for (let n = 2; taken.includes(id); n++) {
    id = `${base}-${n}`;
  }
  return id;
}

// ── diferenças (modal de publicação) ────────────────────────────────────────

export const STATUS_LABEL: Record<PlanStatus, string> = { ativo: 'Ativo', oculto: 'Oculto', rascunho: 'Rascunho' };
export const CANCEL_LABEL: Record<CancelPolicy, string> = {
  total: 'Reembolso total até 15 dias',
  parcial: 'Retém o sinal',
  nenhum: 'Sem reembolso',
};

const yesNo = (v: boolean) => (v ? 'Sim' : 'Não');

const DIFF_FIELDS: ReadonlyArray<[keyof TournamentPlan, string, (v: never) => string]> = [
  ['name', 'Nome', (v: string) => v],
  ['description', 'Descrição', (v: string) => (v ? (v.length > 24 ? v.slice(0, 24) + '…' : v) : '—')],
  ['status', 'Status', (v: PlanStatus) => STATUS_LABEL[v]],
  ['priceCents', 'Preço por evento', (v: number) => brl(v)],
  ['depositPct', 'Sinal', (v: number) => `${v}%`],
  ['balanceDays', 'Saldo até', (v: number) => `${v} dias antes`],
  ['cancelPolicy', 'Cancelamento', (v: CancelPolicy) => CANCEL_LABEL[v]],
  ['courts', 'Quadras', (v: number) => String(v)],
  ['refsPerCourt', 'Árbitros por quadra', (v: number) => String(v)],
  ['live', 'Transmissão', yesNo],
  ['narrator', 'Narrador', yesNo],
  ['hours', 'Cobertura', (v: number) => `${v}h`],
  ['extraHourCents', 'Hora extra', (v: number) => (v ? brl(v) : '—')],
  ['leadDays', 'Antecedência mínima', (v: number) => `${v} dias`],
  ['maxPerDay', 'Máx. eventos no dia', (v: number) => String(v)],
  ['cities', 'Cidades atendidas', (v: string[]) => (v.length ? `${v.length} cidade${v.length > 1 ? 's' : ''}` : '—')],
];

export interface PlanDiff {
  label: string;
  before: string;
  after: string;
}

/** `prev` nulo = plano novo: cada campo aparece com "—" antes. */
export function planDiffs(prev: TournamentPlan | null, next: TournamentPlan): PlanDiff[] {
  const out: PlanDiff[] = [];
  for (const [key, label, fmt] of DIFF_FIELDS) {
    const a = prev?.[key];
    const b = next[key];
    if (prev && JSON.stringify(a) === JSON.stringify(b)) {
      continue;
    }
    const f = fmt as (v: unknown) => string;
    out.push({ label, before: prev ? f(a) : '—', after: f(b) });
  }
  return out;
}

/** Narrador só existe com transmissão (igual ao servidor). */
export function normalizeDraft(p: TournamentPlan): TournamentPlan {
  return { ...p, narrator: p.live && p.narrator };
}

export function samePlan(a: TournamentPlan | null, b: TournamentPlan | null): boolean {
  return JSON.stringify(a && normalizeDraft(a)) === JSON.stringify(b && normalizeDraft(b));
}

// ── leitura de doc ──────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => v !== null && typeof v === 'object' && !Array.isArray(v);
const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const s = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

export function planFromRaw(v: unknown): TournamentPlan | null {
  if (!isObj(v)) {
    return null;
  }
  const d = DEFAULT_PLANS[0]!.plan;
  return {
    name: s(v['name'], ''),
    description: s(v['description'], ''),
    status: PLAN_STATUSES.includes(v['status'] as PlanStatus) ? (v['status'] as PlanStatus) : 'ativo',
    priceCents: n(v['priceCents'], 0),
    depositPct: n(v['depositPct'], d.depositPct),
    balanceDays: n(v['balanceDays'], d.balanceDays),
    cancelPolicy: CANCEL_POLICIES.includes(v['cancelPolicy'] as CancelPolicy)
      ? (v['cancelPolicy'] as CancelPolicy)
      : d.cancelPolicy,
    courts: n(v['courts'], 1),
    refsPerCourt: n(v['refsPerCourt'], d.refsPerCourt),
    live: b(v['live'], true),
    narrator: b(v['narrator'], true),
    hours: n(v['hours'], d.hours),
    extraHourCents: n(v['extraHourCents'], 0),
    leadDays: n(v['leadDays'], d.leadDays),
    maxPerDay: n(v['maxPerDay'], d.maxPerDay),
    cities: Array.isArray(v['cities']) ? (v['cities'] as unknown[]).filter((c): c is string => typeof c === 'string') : [],
  };
}

export function scheduledFromRaw(v: unknown): ScheduledPlan | null {
  if (!isObj(v) || typeof v['effectiveFrom'] !== 'string') {
    return null;
  }
  const plan = planFromRaw(v['plan']);
  return plan ? { plan, version: n(v['version'], 0), effectiveFrom: v['effectiveFrom'] } : null;
}

export function rulesFromRaw(v: unknown): PlanRules {
  if (!isObj(v)) {
    return clone(DEFAULT_RULES);
  }
  return {
    fixedCostCents: n(v['fixedCostCents'], DEFAULT_RULES.fixedCostCents),
    courtCostCents: n(v['courtCostCents'], DEFAULT_RULES.courtCostCents),
    minMarginPct: n(v['minMarginPct'], DEFAULT_RULES.minMarginPct),
  };
}

export function sponsorsFromRaw(v: unknown): SponsorsConfig {
  if (!isObj(v) || !Array.isArray(v['tiers'])) {
    return clone(DEFAULT_SPONSORS);
  }
  const d = DEFAULT_SPONSORS;
  return {
    tiers: (v['tiers'] as unknown[]).filter(isObj).map((t) => ({
      id: s(t['id'], ''),
      name: s(t['name'], ''),
      color: s(t['color'], '#C9CDD4'),
      priceCents: n(t['priceCents'], 0),
      appearances: n(t['appearances'], 0),
      seconds: n(t['seconds'], 5),
      mentions: n(t['mentions'], 0),
      maxPerEvent: n(t['maxPerEvent'], 0),
      onSale: b(t['onSale'], true),
    })),
    maxPerHour: n(v['maxPerHour'], d.maxPerHour),
    hours: n(v['hours'], d.hours),
    organizerSharePct: n(v['organizerSharePct'], d.organizerSharePct),
    organizerCanSell: b(v['organizerCanSell'], d.organizerCanSell),
    logoApproval: b(v['logoApproval'], d.logoApproval),
    segmentExclusive: b(v['segmentExclusive'], d.segmentExclusive),
  };
}
