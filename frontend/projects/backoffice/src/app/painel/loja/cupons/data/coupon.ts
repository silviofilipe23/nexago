export type CouponType = 'percent' | 'fixed';
export type ScopeType = 'store' | 'category' | 'collection' | 'products' | 'tournament' | 'arena';
export type CouponStatus = 'ativo' | 'agendado' | 'encerrado' | 'pausado';

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  /** Porcentagem (1–100) ou centavos, conforme `type`. */
  value: number;
  maxDiscountCents: number | null;
  scope: { type: ScopeType; ids: string[]; labels: string[] };
  minOrderCents: number | null;
  usageLimit: number | null;
  uses: number;
  onePerAthlete: boolean;
  stacksWithPix: boolean;
  appOnly: boolean;
  /** Datas civis de São Paulo (YYYY-MM-DD), inclusivas. */
  startDate: string;
  endDate: string | null;
  paused: boolean;
  ended: boolean;
}

export type AutoDiscountId = 'pix' | 'leve3pague2' | 'nivel5';

export interface AutoDiscount {
  id: AutoDiscountId;
  name: string;
  description: string;
  percent: number | null;
  active: boolean;
}

/**
 * Espelho de `DEFAULT_AUTO_DISCOUNTS` (functions/src/store-coupons.ts): vale enquanto
 * `storeConfig/discounts` não existir. Mudar lá exige mudar aqui.
 */
export const DEFAULT_AUTO_DISCOUNTS: readonly AutoDiscount[] = [
  { id: 'pix', name: 'Pix', description: '5% em todo o carrinho (exceto frete)', percent: 5, active: true },
  { id: 'leve3pague2', name: 'Kit leve 3, pague 2', description: 'Viseiras e garrafas · menor preço sai grátis', percent: null, active: false },
  { id: 'nivel5', name: 'Atleta nível 5+', description: '8% em vestuário para atletas avançados', percent: 8, active: true },
];

export const SCOPE_LABELS: Record<ScopeType, string> = {
  store: 'Toda a loja',
  category: 'Categoria',
  collection: 'Coleção',
  products: 'Produtos específicos',
  tournament: 'Torneio (inscritos)',
  arena: 'Retirada em arena',
};

type Raw = Record<string, any>;

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function couponFromDoc(id: string, d: Raw): Coupon {
  const scope = (d['scope'] ?? {}) as Raw;
  return {
    id,
    code: String(d['code'] ?? ''),
    type: d['type'] === 'fixed' ? 'fixed' : 'percent',
    value: int(d['value']) ?? 0,
    maxDiscountCents: int(d['maxDiscountCents']),
    scope: {
      type: (Object.keys(SCOPE_LABELS) as ScopeType[]).includes(scope['type']) ? scope['type'] : 'store',
      ids: Array.isArray(scope['ids']) ? scope['ids'] : [],
      labels: Array.isArray(scope['labels']) ? scope['labels'] : [],
    },
    minOrderCents: int(d['minOrderCents']),
    usageLimit: int(d['usageLimit']),
    uses: int(d['uses']) ?? 0,
    onePerAthlete: d['onePerAthlete'] !== false,
    stacksWithPix: d['stacksWithPix'] !== false,
    appOnly: d['appOnly'] === true,
    startDate: String(d['startDate'] ?? ''),
    endDate: typeof d['endDate'] === 'string' ? d['endDate'] : null,
    paused: d['paused'] === true,
    ended: d['endedAt'] != null,
  };
}

export function discountsFromDoc(d: Raw | undefined): AutoDiscount[] {
  const saved = Array.isArray(d?.['rules']) ? (d!['rules'] as Raw[]) : [];
  return DEFAULT_AUTO_DISCOUNTS.map((rule) => {
    const s = saved.find((r) => r?.['id'] === rule.id);
    return s ? { ...rule, active: s['active'] === true, percent: int(s['percent']) ?? rule.percent } : { ...rule };
  });
}

/** Hoje no calendário de São Paulo, não no do navegador. */
export function todaySaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

/** Encerrado ganha de tudo; pausado ganha de agendado. */
export function couponStatus(c: Coupon, today: string): CouponStatus {
  if (c.ended || (c.endDate !== null && c.endDate < today) || (c.usageLimit !== null && c.uses >= c.usageLimit)) {
    return 'encerrado';
  }
  if (c.paused) {
    return 'pausado';
  }
  return c.startDate > today ? 'agendado' : 'ativo';
}

/** R$ 30 / R$ 29,90 — sem ",00" quando o valor é redondo. */
export function shortBrl(cents: number): string {
  const reais = cents / 100;
  return Number.isInteger(reais)
    ? `R$ ${reais.toLocaleString('pt-BR')}`
    : `R$ ${reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function discountLabel(c: Pick<Coupon, 'type' | 'value'>): string {
  return c.type === 'percent' ? `${c.value}% off` : `${shortBrl(c.value)} off`;
}

/** "Coleção Verão 2026 · mín. R$ 199 · máx. R$ 60". */
export function ruleLabel(c: Coupon): string {
  const scope = c.scope.type === 'store'
    ? SCOPE_LABELS.store
    : c.scope.type === 'tournament'
      ? `Inscritos em ${c.scope.labels.join(', ')}`
      : c.scope.type === 'arena'
        ? `Retirada na ${c.scope.labels.join(', ')}`
        : c.scope.type === 'products'
          ? (c.scope.labels.length === 1 ? c.scope.labels[0]! : `${c.scope.labels.length} produtos`)
          : `${SCOPE_LABELS[c.scope.type]} ${c.scope.labels.join(', ')}`;
  const parts = [scope];
  if (c.minOrderCents !== null) {
    parts.push(`mín. ${shortBrl(c.minOrderCents)}`);
  }
  if (c.type === 'percent' && c.maxDiscountCents !== null) {
    parts.push(`máx. ${shortBrl(c.maxDiscountCents)}`);
  }
  return parts.join(' · ');
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function dayMonth(date: string): { day: number; month: string } {
  return { day: Number(date.slice(8, 10)), month: MONTHS[Number(date.slice(5, 7)) - 1] ?? '' };
}

/** "até 31 dez" · "27–30 nov" · "20 out–30 nov" · "a partir de 20 out" · "sem prazo". */
export function validityLabel(c: Pick<Coupon, 'startDate' | 'endDate'>, today: string): string {
  const future = c.startDate > today;
  const s = dayMonth(c.startDate);
  if (c.endDate === null) {
    return future ? `a partir de ${s.day} ${s.month}` : 'sem prazo';
  }
  const e = dayMonth(c.endDate);
  if (!future) {
    return `até ${e.day} ${e.month}`;
  }
  return s.month === e.month && c.startDate.slice(0, 4) === c.endDate.slice(0, 4)
    ? `${s.day}–${e.day} ${e.month}`
    : `${s.day} ${s.month}–${e.day} ${e.month}`;
}

/** Fração da barra de uso; `null` quando não há limite (só o número aparece). */
export function usageRatio(c: Pick<Coupon, 'uses' | 'usageLimit'>): number | null {
  return c.usageLimit === null ? null : Math.min(1, c.uses / c.usageLimit);
}

/** Desconto num carrinho de exemplo, todo elegível: % com teto, ou fixo até o subtotal. */
export function previewDiscountCents(
  c: Pick<Coupon, 'type' | 'value' | 'maxDiscountCents' | 'minOrderCents'>,
  subtotalCents: number,
): number {
  if (c.minOrderCents !== null && subtotalCents < c.minOrderCents) {
    return 0;
  }
  if (c.type === 'fixed') {
    return Math.min(c.value, subtotalCents);
  }
  const raw = Math.round((subtotalCents * c.value) / 100);
  return c.maxDiscountCents === null ? raw : Math.min(raw, c.maxDiscountCents);
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Sem 0/O e 1/I/L: o atleta digita o código. */
export function generateCode(length = 8, random: () => number = Math.random): string {
  return Array.from({ length }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join('');
}
