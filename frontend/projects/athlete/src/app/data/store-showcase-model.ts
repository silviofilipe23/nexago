/**
 * Vitrine da Loja (tela 01): leitura do espelho público e as regras de exibição.
 *
 * O contrato e as regras vivem em `docs/business-rules/loja-vitrine.md` e valem igual no app —
 * mudar uma regra aqui é mudar lá também. Tudo puro, para teste sem Firestore.
 */

export type StoreBadge = 'mais-vendida' | 'nova' | 'edicao-limitada';

export interface StoreAxisValue {
  id: string;
  label: string;
  hex: string | null;
}

export interface StoreAxis {
  id: string;
  label: string;
  values: StoreAxisValue[];
}

export interface StoreVariant {
  id: string;
  values: Record<string, string>;
  priceCents: number;
  inStock: boolean;
}

export interface StoreProduct {
  id: string;
  name: string;
  slug: string;
  category: string;
  collection: string | null;
  brand: string;
  badge: StoreBadge | null;
  badgeExpiresAt: Date | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  minPriceCents: number;
  maxPriceCents: number;
  coverUrl: string | null;
  pickup: boolean;
  delivery: boolean;
  axes: StoreAxis[];
  variants: StoreVariant[];
  soldOut: boolean;
  customizable: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  soldLast30: number;
  publishedAt: Date | null;
}

export interface StoreBanner {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  primary: { label: string; collectionId: string };
  secondary: { label: string; categoryId: string | null; url: string | null } | null;
  startDate: string | null;
  endDate: string | null;
}

export interface StoreLabel {
  id: string;
  label: string;
}

export interface StorePickupArena {
  arenaId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  readyHours: number;
}

export interface StoreShowcaseConfig {
  banners: StoreBanner[];
  benefits: { pixDiscountPct: number | null; pickupReadyHours: number | null; exchangeDays: number };
  categories: StoreLabel[];
  collections: StoreLabel[];
  pickupArenas: StorePickupArena[];
}

/** Ordem e rótulos de reserva enquanto `storePublic/showcase` não existir (espelha o servidor). */
const FALLBACK_CATEGORIES: StoreLabel[] = [
  { id: 'bolas', label: 'Bolas' },
  { id: 'vestuario', label: 'Vestuário' },
  { id: 'acessorios', label: 'Acessórios' },
  { id: 'rede-quadra', label: 'Rede & quadra' },
  { id: 'kits', label: 'Kits' },
];

const FALLBACK_COLLECTIONS: StoreLabel[] = [
  { id: 'verao-2026', label: 'Verão 2026' },
  { id: 'linha-pro', label: 'Linha Pro' },
];

/**
 * Sem o doc de config (o gatilho ainda não rodou), nada de prometer desconto ou prazo que
 * ninguém configurou: Pix e retirada somem; a troca fica no padrão da política (30 dias).
 */
export const EMPTY_SHOWCASE_CONFIG: StoreShowcaseConfig = {
  banners: [],
  benefits: { pixDiscountPct: null, pickupReadyHours: null, exchangeDays: 30 },
  categories: FALLBACK_CATEGORIES,
  collections: FALLBACK_COLLECTIONS,
  pickupArenas: [],
};

type Raw = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function count(v: unknown): number {
  const n = num(v);
  return n !== null && n > 0 ? Math.floor(n) : 0;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const ts = v as { toDate?: () => Date } | null | undefined;
  return typeof ts?.toDate === 'function' ? ts.toDate() : null;
}

function labels(v: unknown): StoreLabel[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({ id: str((x as Raw)?.['id']), label: str((x as Raw)?.['label']) }))
    .filter((x) => x.id !== '' && x.label !== '');
}

const BADGES: StoreBadge[] = ['mais-vendida', 'nova', 'edicao-limitada'];

/** Doc → produto. Doc sem nome ou sem preço é descartado em vez de virar card quebrado. */
export function storeProductFromDoc(id: string, data: Raw | undefined): StoreProduct | null {
  if (!data) return null;
  const name = str(data['name']);
  const priceCents = count(data['priceCents']);
  if (!name || priceCents === 0) return null;
  const minPriceCents = count(data['minPriceCents']) || priceCents;
  const maxPriceCents = Math.max(count(data['maxPriceCents']) || priceCents, minPriceCents);
  const compareAt = count(data['compareAtPriceCents']);
  const badge = BADGES.includes(data['badge'] as StoreBadge) ? (data['badge'] as StoreBadge) : null;

  const axes: StoreAxis[] = Array.isArray(data['axes'])
    ? (data['axes'] as Raw[]).map((a) => ({
        id: str(a?.['id']),
        label: str(a?.['label']),
        values: Array.isArray(a?.['values'])
          ? (a['values'] as Raw[]).map((v) => ({
              id: str(v?.['id']),
              label: str(v?.['label']),
              hex: str(v?.['hex']) || null,
            }))
          : [],
      }))
    : [];
  const variants: StoreVariant[] = Array.isArray(data['variants'])
    ? (data['variants'] as Raw[]).map((v) => ({
        id: str(v?.['id']),
        values: (v?.['values'] ?? {}) as Record<string, string>,
        priceCents: count(v?.['priceCents']) || priceCents,
        inStock: v?.['inStock'] === true,
      }))
    : [];

  return {
    id,
    name,
    slug: str(data['slug']),
    category: str(data['category']),
    collection: str(data['collection']) || null,
    brand: str(data['brand']) || 'NexaGO',
    badge,
    badgeExpiresAt: toDate(data['badgeExpiresAt']),
    priceCents,
    compareAtPriceCents: compareAt > priceCents ? compareAt : null,
    minPriceCents,
    maxPriceCents,
    coverUrl: str(data['coverUrl']) || null,
    pickup: data['pickup'] === true,
    delivery: data['delivery'] === true,
    axes,
    variants,
    soldOut: data['soldOut'] === true,
    customizable: data['customizable'] === true,
    ratingAvg: num(data['ratingAvg']),
    ratingCount: count(data['ratingCount']),
    soldLast30: count(data['soldLast30']),
    publishedAt: toDate(data['publishedAt']),
  };
}

function bannerFromRaw(raw: Raw): StoreBanner | null {
  const id = str(raw['id']);
  const title = str(raw['title']);
  const primary = (raw['primary'] ?? {}) as Raw;
  const collectionId = str(primary['collectionId']);
  if (!id || !title || !collectionId) return null;
  const sec = raw['secondary'] as Raw | null | undefined;
  return {
    id,
    kicker: str(raw['kicker']),
    title,
    subtitle: str(raw['subtitle']),
    imageUrl: str(raw['imageUrl']) || null,
    primary: { label: str(primary['label']) || 'Ver coleção', collectionId },
    secondary:
      sec && str(sec['label'])
        ? { label: str(sec['label']), categoryId: str(sec['categoryId']) || null, url: str(sec['url']) || null }
        : null,
    startDate: str(raw['startDate']) || null,
    endDate: str(raw['endDate']) || null,
  };
}

export function storeConfigFromDoc(data: Raw | undefined): StoreShowcaseConfig {
  if (!data) return EMPTY_SHOWCASE_CONFIG;
  const benefits = (data['benefits'] ?? {}) as Raw;
  const categories = labels(data['categories']);
  const collections = labels(data['collections']);
  const pix = num(benefits['pixDiscountPct']);
  const ready = num(benefits['pickupReadyHours']);
  return {
    banners: Array.isArray(data['banners'])
      ? (data['banners'] as Raw[]).map((b) => (b ? bannerFromRaw(b) : null)).filter((b): b is StoreBanner => b !== null)
      : [],
    benefits: {
      pixDiscountPct: pix !== null && pix > 0 ? pix : null,
      pickupReadyHours: ready !== null && ready > 0 ? ready : null,
      exchangeDays: count(benefits['exchangeDays']) || EMPTY_SHOWCASE_CONFIG.benefits.exchangeDays,
    },
    categories: categories.length > 0 ? categories : FALLBACK_CATEGORIES,
    collections: collections.length > 0 ? collections : FALLBACK_COLLECTIONS,
    pickupArenas: Array.isArray(data['pickupArenas'])
      ? (data['pickupArenas'] as Raw[])
          .map((a) => ({
            arenaId: str(a?.['arenaId']),
            name: str(a?.['name']),
            address: str(a?.['address']),
            city: str(a?.['city']),
            state: str(a?.['state']),
            latitude: num(a?.['latitude']),
            longitude: num(a?.['longitude']),
            readyHours: count(a?.['readyHours']) || 48,
          }))
          .filter((a) => a.arenaId !== '')
      : [],
  };
}

// ── Preço ──────────────────────────────────────────────────────────

/** Preço do card: o menor entre as variações à venda. */
export function displayPriceCents(p: StoreProduct): number {
  return p.minPriceCents;
}

/** Variações com preços diferentes: o card diz "a partir de". */
export function priceVaries(p: StoreProduct): boolean {
  return p.minPriceCents !== p.maxPriceCents;
}

/** Preço "de" riscado — só quando o preço não varia (senão "a partir de" e "de" brigam). */
export function strikePriceCents(p: StoreProduct): number | null {
  if (priceVaries(p) || p.compareAtPriceCents === null) return null;
  return p.compareAtPriceCents > displayPriceCents(p) ? p.compareAtPriceCents : null;
}

/** Mesma conta do servidor (`pixPriceCents` em store-showcase.ts): meio centavo sobe. */
export function pixPriceCents(priceCents: number, discountPct: number): number {
  return Math.round((priceCents * (100 - discountPct)) / 100);
}

export function discountPercent(p: StoreProduct): number | null {
  const from = strikePriceCents(p);
  if (from === null) return null;
  return Math.round((1 - displayPriceCents(p) / from) * 100);
}

// ── Selo e nota ────────────────────────────────────────────────────

export interface CardBadge {
  label: string;
  tone: 'orange' | 'dark';
}

/** Esgotado manda; depois o selo do produto (se ainda vale); por último o "-X%". */
export function cardBadge(p: StoreProduct, now: Date, channel: 'web' | 'app' = 'web'): CardBadge | null {
  if (p.soldOut) return { label: 'Esgotado', tone: 'dark' };
  const badgeValid = p.badge !== null && (p.badgeExpiresAt === null || now < p.badgeExpiresAt);
  if (badgeValid) {
    switch (p.badge) {
      case 'mais-vendida':
        return { label: channel === 'app' ? 'Top' : 'Mais vendida', tone: 'orange' };
      case 'nova':
        return { label: 'Nova', tone: 'dark' };
      case 'edicao-limitada':
        return { label: 'Edição limitada', tone: 'dark' };
    }
  }
  const off = discountPercent(p);
  return off !== null && off > 0 ? { label: `-${off}%`, tone: 'orange' } : null;
}

/** Menos de 3 avaliações não diz nada — a nota some. */
export function showRating(p: StoreProduct): boolean {
  return p.ratingAvg !== null && p.ratingCount >= 3;
}

/** 4.9 → "4,9". */
export function formatRating(avg: number): string {
  return avg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// ── Ordenação ──────────────────────────────────────────────────────

export type StoreSort = 'mais-vendidos' | 'menor-preco' | 'maior-preco' | 'novidades' | 'melhor-avaliados';

export const STORE_SORT_OPTIONS: ReadonlyArray<{ id: StoreSort; label: string }> = [
  { id: 'mais-vendidos', label: 'Mais vendidos' },
  { id: 'menor-preco', label: 'Menor preço' },
  { id: 'maior-preco', label: 'Maior preço' },
  { id: 'novidades', label: 'Novidades' },
  { id: 'melhor-avaliados', label: 'Melhor avaliados' },
];

export function isStoreSort(v: unknown): v is StoreSort {
  return STORE_SORT_OPTIONS.some((o) => o.id === v);
}

function newestFirst(a: StoreProduct, b: StoreProduct): number {
  return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
}

export function sortProducts(list: readonly StoreProduct[], sort: StoreSort): StoreProduct[] {
  const out = [...list];
  const byName = (a: StoreProduct, b: StoreProduct) => a.name.localeCompare(b.name, 'pt-BR');
  switch (sort) {
    case 'mais-vendidos':
      return out.sort((a, b) => b.soldLast30 - a.soldLast30 || newestFirst(a, b) || byName(a, b));
    case 'menor-preco':
      return out.sort((a, b) => displayPriceCents(a) - displayPriceCents(b) || byName(a, b));
    case 'maior-preco':
      return out.sort((a, b) => displayPriceCents(b) - displayPriceCents(a) || byName(a, b));
    case 'novidades':
      return out.sort((a, b) => newestFirst(a, b) || byName(a, b));
    case 'melhor-avaliados':
      return out.sort((a, b) => {
        if (a.ratingAvg === null && b.ratingAvg !== null) return 1;
        if (b.ratingAvg === null && a.ratingAvg !== null) return -1;
        return (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) || b.ratingCount - a.ratingCount || byName(a, b);
      });
  }
}

// ── Busca e categorias ────────────────────────────────────────────

/** "Óculos  Polarizado" → "oculos polarizado". */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function labelOf(list: readonly StoreLabel[], id: string | null): string {
  return id ? (list.find((x) => x.id === id)?.label ?? '') : '';
}

/** Todo termo tem de aparecer no nome, na categoria ou na coleção. */
export function matchesSearch(p: StoreProduct, query: string, config: StoreShowcaseConfig): boolean {
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeSearch(
    [p.name, labelOf(config.categories, p.category), labelOf(config.collections, p.collection)].join(' '),
  );
  return terms.every((t) => haystack.includes(t));
}

export interface SearchSuggestions {
  products: StoreProduct[];
  categories: StoreLabel[];
}

/** A partir de 2 caracteres: até 5 produtos (mais vendidos primeiro) e até 3 categorias. */
export function searchSuggestions(
  products: readonly StoreProduct[],
  config: StoreShowcaseConfig,
  query: string,
): SearchSuggestions {
  const q = normalizeSearch(query);
  if (q.length < 2) return { products: [], categories: [] };
  const withProducts = new Set(products.map((p) => p.category));
  return {
    products: sortProducts(
      products.filter((p) => matchesSearch(p, q, config)),
      'mais-vendidos',
    ).slice(0, 5),
    categories: config.categories
      .filter((c) => withProducts.has(c.id) && normalizeSearch(c.label).includes(q))
      .slice(0, 3),
  };
}

/** Chips: categorias da config, na ordem dela, que têm ao menos um produto à venda. */
export function visibleCategories(config: StoreShowcaseConfig, products: readonly StoreProduct[]): StoreLabel[] {
  const used = new Set(products.map((p) => p.category));
  return config.categories.filter((c) => used.has(c.id));
}

export function collectionLabel(config: StoreShowcaseConfig, id: string | null): string {
  return labelOf(config.collections, id);
}

export function categoryLabel(config: StoreShowcaseConfig, id: string): string {
  return labelOf(config.categories, id) || id;
}

// ── Banners ────────────────────────────────────────────────────────

const SP_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data civil de São Paulo, `YYYY-MM-DD` — as datas de campanha são do calendário de lá. */
export function saoPauloDateKey(now: Date): string {
  return SP_DATE.format(now);
}

export const MAX_LIVE_BANNERS = 3;

export function liveBanners(config: StoreShowcaseConfig, now: Date): StoreBanner[] {
  const today = saoPauloDateKey(now);
  return config.banners
    .filter((b) => (b.startDate === null || b.startDate <= today) && (b.endDate === null || b.endDate >= today))
    .slice(0, MAX_LIVE_BANNERS);
}

// ── Carrinho ───────────────────────────────────────────────────────

export interface StoreCartItem {
  productId: string;
  skuId: string;
  qty: number;
}

export function cartItemsFromDoc(data: Raw | undefined): StoreCartItem[] {
  if (!data || !Array.isArray(data['items'])) return [];
  return (data['items'] as Raw[])
    .map((i) => ({ productId: str(i?.['productId']), skuId: str(i?.['skuId']), qty: count(i?.['qty']) }))
    .filter((i) => i.productId !== '' && i.skuId !== '' && i.qty > 0);
}

/** O contador do botão Carrinho: soma das unidades, não das linhas. */
export function cartUnits(items: readonly StoreCartItem[]): number {
  return items.reduce((total, i) => total + i.qty, 0);
}
