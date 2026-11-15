/**
 * Espelho à mão de `functions/src/arena-fees.ts` (padrão, limites, validação e cascata): mudou lá,
 * muda aqui. A cobrança refaz a conta no servidor; isto só desenha a tela.
 */

export const ARENA_FEE_PRODUCTS = ['booking', 'schedulePlan', 'class', 'crm', 'club'] as const;
export type ArenaFeeProduct = (typeof ARENA_FEE_PRODUCTS)[number];

export const PRODUCT_LABEL: Record<ArenaFeeProduct, string> = {
  booking: 'Reservas',
  schedulePlan: 'Planos de horário',
  class: 'Aulas',
  crm: 'Cobranças do CRM',
  club: 'Clubinho',
};

export const PRODUCT_HINT: Record<ArenaFeeProduct, string> = {
  booking: 'Reserva avulsa e cota de amigo',
  schedulePlan: 'Mensalidade e anual dos planos',
  class: 'Mensalidade de aula',
  crm: 'Mensalista, pacote e cobrança avulsa',
  club: 'Vaga de clubinho · sem mínimo',
};

export const ARENA_FEE_TIERS = ['starter', 'pro', 'elite', 'none'] as const;
export type ArenaFeeTier = (typeof ARENA_FEE_TIERS)[number];

export const TIER_LABEL: Record<ArenaFeeTier, string> = {
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite',
  none: 'Sem plano',
};

export const ARENA_FEE_REASONS = [
  'Parceria comercial',
  'Campanha de lançamento',
  'Arena piloto',
  'Correção de cadastro',
] as const;

export const MAX_ARENA_FEE_PERCENT = 20;

export interface ArenaFeeDefaults {
  tierPercent: Record<ArenaFeeTier, number>;
  clubPercent: number;
}

export interface ArenaFeeOverride {
  products: Partial<Record<ArenaFeeProduct, number>>;
  reason: string;
  until: string | null;
}

export const DEFAULT_ARENA_FEE_DEFAULTS: ArenaFeeDefaults = {
  tierPercent: { starter: 8, pro: 6, elite: 5, none: 8 },
  clubPercent: 5,
};

type Raw = Record<string, unknown>;

function isObj(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isValidArenaFeePercent(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= 0 &&
    v <= MAX_ARENA_FEE_PERCENT &&
    Math.abs(Math.round(v * 100) - v * 100) < 1e-6
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCivilDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function arenaFeeDefaultsFromRaw(raw: unknown): ArenaFeeDefaults {
  const data = isObj(raw) ? raw : {};
  const tiers = isObj(data['tierPercent']) ? data['tierPercent'] : {};
  const tierPercent = { ...DEFAULT_ARENA_FEE_DEFAULTS.tierPercent };
  for (const t of ARENA_FEE_TIERS) {
    const v = tiers[t];
    if (isValidArenaFeePercent(v)) tierPercent[t] = v;
  }
  const club = data['clubPercent'];
  return { tierPercent, clubPercent: isValidArenaFeePercent(club) ? club : DEFAULT_ARENA_FEE_DEFAULTS.clubPercent };
}

export function arenaFeeOverrideFromRaw(raw: unknown): ArenaFeeOverride | null {
  if (!isObj(raw) || raw['mode'] !== 'custom') return null;
  const src = isObj(raw['products']) ? raw['products'] : {};
  const products: Partial<Record<ArenaFeeProduct, number>> = {};
  for (const p of ARENA_FEE_PRODUCTS) {
    const v = src[p];
    if (isValidArenaFeePercent(v)) products[p] = v;
  }
  if (Object.keys(products).length === 0) return null;
  return {
    products,
    reason: typeof raw['reason'] === 'string' ? raw['reason'] : '',
    until: isCivilDate(raw['until']) ? raw['until'] : null,
  };
}

export function isOverrideActive(o: ArenaFeeOverride, today: string): boolean {
  return o.until === null || today <= o.until;
}

/**
 * Linha da tabela por plano para a tela: plano gravado com status que dá titularidade. O servidor
 * olha também o fim do período pago (`planActiveUntil`); aqui é só a leitura do cadastro.
 */
export function feeTierOf(planTier: string | null, planStatus: string | null): ArenaFeeTier {
  const entitled = planStatus === 'active' || planStatus === 'overdue' || planStatus === 'canceling';
  return entitled && (planTier === 'starter' || planTier === 'pro' || planTier === 'elite') ? planTier : 'none';
}

export function defaultPercentOf(defaults: ArenaFeeDefaults, tier: ArenaFeeTier, product: ArenaFeeProduct): number {
  return product === 'club' ? defaults.clubPercent : defaults.tierPercent[tier];
}

export function resolveArenaFee(
  defaults: ArenaFeeDefaults,
  tier: ArenaFeeTier,
  override: ArenaFeeOverride | null,
  product: ArenaFeeProduct,
  today: string,
): { percent: number; fromArena: boolean } {
  const v = override && isOverrideActive(override, today) ? override.products[product] : undefined;
  return v === undefined
    ? { percent: defaultPercentOf(defaults, tier, product), fromArena: false }
    : { percent: v, fromArena: true };
}

// ── edição ───────────────────────────────────────────────────────────────────

const PERCENT_ERR = `Entre 0 e ${MAX_ARENA_FEE_PERCENT}%, até duas casas.`;

export function defaultsIssues(d: ArenaFeeDefaults): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of ARENA_FEE_TIERS) {
    if (!isValidArenaFeePercent(d.tierPercent[t])) out[t] = PERCENT_ERR;
  }
  if (!isValidArenaFeePercent(d.clubPercent)) out['club'] = PERCENT_ERR;
  return out;
}

export function sameDefaults(a: ArenaFeeDefaults, b: ArenaFeeDefaults): boolean {
  return a.clubPercent === b.clubPercent && ARENA_FEE_TIERS.every((t) => a.tierPercent[t] === b.tierPercent[t]);
}

export interface ArenaFeeDraft {
  mode: 'padrao' | 'custom';
  /** `null` = o produto segue o padrão. */
  products: Record<ArenaFeeProduct, number | null>;
  reason: string;
  /** `''` = sem data de fim. */
  until: string;
}

export function draftOf(o: ArenaFeeOverride | null): ArenaFeeDraft {
  const products = {} as Record<ArenaFeeProduct, number | null>;
  for (const p of ARENA_FEE_PRODUCTS) products[p] = o?.products[p] ?? null;
  return { mode: o ? 'custom' : 'padrao', products, reason: o?.reason ?? '', until: o?.until ?? '' };
}

export function draftIssues(d: ArenaFeeDraft, today: string): Record<string, string> {
  if (d.mode === 'padrao') return {};
  const out: Record<string, string> = {};
  for (const p of ARENA_FEE_PRODUCTS) {
    const v = d.products[p];
    if (v !== null && !isValidArenaFeePercent(v)) out[p] = PERCENT_ERR;
  }
  if (ARENA_FEE_PRODUCTS.every((p) => d.products[p] === null)) {
    out['products'] = 'Defina a taxa de ao menos um produto, ou volte ao padrão.';
  }
  if (!(ARENA_FEE_REASONS as readonly string[]).includes(d.reason)) out['reason'] = 'Escolha o motivo da exceção.';
  if (d.until && (!isCivilDate(d.until) || d.until < today)) out['until'] = 'Data de hoje em diante.';
  return out;
}

export function sameDraft(a: ArenaFeeDraft, b: ArenaFeeDraft): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'padrao') return true;
  return a.reason === b.reason && a.until === b.until && ARENA_FEE_PRODUCTS.every((p) => a.products[p] === b.products[p]);
}

/** Só os produtos definidos, no formato da callable. */
export function draftProducts(d: ArenaFeeDraft): Partial<Record<ArenaFeeProduct, number>> {
  const out: Partial<Record<ArenaFeeProduct, number>> = {};
  for (const p of ARENA_FEE_PRODUCTS) {
    const v = d.products[p];
    if (v !== null) out[p] = v;
  }
  return out;
}
