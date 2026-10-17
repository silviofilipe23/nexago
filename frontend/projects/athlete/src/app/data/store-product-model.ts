/**
 * Loja · Produto (tela 02): seleção de variação, preço, quantidade, galeria e "como receber".
 *
 * Regras em `docs/business-rules/loja-produto.md`, espelhadas no app
 * (`store_product_rules.dart`) — mudar aqui é mudar lá. Tudo puro, para teste sem Firestore.
 */
import {
  MAX_QTY_PER_ITEM,
  normalizeSearch,
  sortProducts,
  type StoreAxis,
  type StoreCartItem,
  type StoreDeliveryMode,
  type StorePhoto,
  type StoreProduct,
  type StoreVariant,
} from './store-showcase-model';

/** Eixo → valor escolhido. Eixo sem escolha não tem chave. */
export type AxisSelection = Readonly<Record<string, string>>;

/** Teto da rule de `storeCarts.items` (linhas distintas). */
export const MAX_CART_LINES = 30;

// ── Eixos ──────────────────────────────────────────────────────────

/** Eixo com cor (algum valor com `hex`) vira bolinha; os outros, botões. */
export function isColorAxis(axis: StoreAxis): boolean {
  return axis.values.some((v) => v.hex !== null);
}

function matches(v: StoreVariant, selected: AxisSelection, axes: readonly StoreAxis[]): boolean {
  return axes.every((a) => selected[a.id] === undefined || v.values[a.id] === selected[a.id]);
}

/**
 * Disponibilidade em cascata: o valor precisa de um SKU com saldo que bata com o escolhido nos
 * eixos ANTERIORES. A cor (1º eixo) só fica riscada sem saldo nenhum; o tamanho depende da cor.
 */
export function axisValueAvailable(p: StoreProduct, axisIndex: number, valueId: string, selected: AxisSelection): boolean {
  const axis = p.axes[axisIndex];
  if (!axis) return false;
  const before = p.axes.slice(0, axisIndex);
  return p.variants.some((v) => v.inStock && v.values[axis.id] === valueId && matches(v, selected, before));
}

/** 1ª cor com saldo (ou a 1ª, se tudo esgotou); eixo de um valor só já vem escolhido; tamanho nunca. */
export function initialSelection(p: StoreProduct): Record<string, string> {
  const selected: Record<string, string> = {};
  p.axes.forEach((axis, i) => {
    if (axis.values.length === 1) {
      selected[axis.id] = axis.values[0]!.id;
    } else if (i === 0 && isColorAxis(axis) && axis.values.length > 0) {
      const first = axis.values.find((v) => axisValueAvailable(p, 0, v.id, selected)) ?? axis.values[0]!;
      selected[axis.id] = first.id;
    }
  });
  return selected;
}

/** Escolhe o valor e solta as escolhas dos eixos seguintes que ficaram sem saldo. */
export function selectAxisValue(
  p: StoreProduct,
  selected: AxisSelection,
  axisId: string,
  valueId: string,
): Record<string, string> {
  const next: Record<string, string> = { ...selected, [axisId]: valueId };
  const index = p.axes.findIndex((a) => a.id === axisId);
  p.axes.forEach((axis, i) => {
    if (i > index && next[axis.id] !== undefined && !axisValueAvailable(p, i, next[axis.id]!, next)) {
      delete next[axis.id];
    }
  });
  return next;
}

/** SKU da seleção — só com todos os eixos escolhidos. Produto sem eixo: o SKU único. */
export function selectedVariant(p: StoreProduct, selected: AxisSelection): StoreVariant | null {
  if (p.axes.some((a) => selected[a.id] === undefined)) return null;
  return p.variants.find((v) => p.axes.every((a) => v.values[a.id] === selected[a.id])) ?? null;
}

export function missingAxis(p: StoreProduct, selected: AxisSelection): StoreAxis | null {
  return p.axes.find((a) => selected[a.id] === undefined) ?? null;
}

/** "Escolha um tamanho" / "Escolha uma cor" / "Escolha modelo". */
export function chooseAxisMessage(axis: StoreAxis): string {
  switch (normalizeSearch(axis.label)) {
    case 'tamanho':
      return 'Escolha um tamanho';
    case 'cor':
      return 'Escolha uma cor';
    default:
      return `Escolha ${axis.label.toLowerCase()}`;
  }
}

function valueLabel(axis: StoreAxis, valueId: string | undefined): string {
  return axis.values.find((v) => v.id === valueId)?.label ?? valueId ?? '';
}

/** "Branco areia · M" — rótulos na ordem dos eixos. */
export function variantLabel(p: StoreProduct, variant: StoreVariant): string {
  return p.axes
    .map((a) => valueLabel(a, variant.values[a.id]))
    .filter((label) => label !== '')
    .join(' · ');
}

/** "no tamanho M" / "na cor Branco" / "em Pro" — a última escolha, que é a que acaba. */
function lastChoicePhrase(p: StoreProduct, variant: StoreVariant): string | null {
  const axis = p.axes[p.axes.length - 1];
  if (!axis) return null;
  const label = valueLabel(axis, variant.values[axis.id]);
  if (isColorAxis(axis)) return `na cor ${label}`;
  if (normalizeSearch(axis.label) === 'tamanho') return `no tamanho ${label}`;
  return `em ${label}`;
}

/** "Só 2 no tamanho M"; acima do teto exposto, "Últimas unidades no tamanho M". */
export function lowStockCaption(p: StoreProduct, selected: AxisSelection): string | null {
  const v = selectedVariant(p, selected);
  if (!v || !v.inStock || !v.lowStock) return null;
  const where = lastChoicePhrase(p, v) ?? 'em estoque';
  return v.maxQty < MAX_QTY_PER_ITEM ? `Só ${v.maxQty} ${where}` : `Últimas unidades ${where}`;
}

/** O SKU acabou entre a escolha e o toque. */
export function soldOutMessage(p: StoreProduct, variant: StoreVariant): string {
  const axis = p.axes[p.axes.length - 1];
  if (!axis) return 'Esse produto acabou de esgotar';
  const label = valueLabel(axis, variant.values[axis.id]);
  const name = axis.label.toLowerCase();
  return isColorAxis(axis)
    ? `Acabou o estoque da cor ${label} · escolha outra ${name}`
    : `Acabou o estoque do ${label} · escolha outro ${name}`;
}

// ── Preço e quantidade ─────────────────────────────────────────────

export interface SelectionPrice {
  cents: number;
  /** Mais de um preço possível na seleção: "a partir de". */
  from: boolean;
  /** Preço "de" riscado; nunca junto com "a partir de". */
  strikeCents: number | null;
}

/** SKU escolhido → o preço dele; senão a faixa entre os SKUs com saldo que batem com a seleção. */
export function selectionPrice(p: StoreProduct, selected: AxisSelection): SelectionPrice {
  const variant = selectedVariant(p, selected);
  let cents: number;
  let from: boolean;
  if (variant) {
    cents = variant.priceCents;
    from = false;
  } else {
    const matching = p.variants.filter((v) => matches(v, selected, p.axes));
    const pool = matching.length > 0 ? matching : p.variants;
    const inStock = pool.filter((v) => v.inStock);
    const prices = (inStock.length > 0 ? inStock : pool).map((v) => v.priceCents);
    cents = prices.length > 0 ? Math.min(...prices) : p.minPriceCents;
    from = prices.length > 0 ? Math.max(...prices) !== cents : p.minPriceCents !== p.maxPriceCents;
  }
  const strikeCents = !from && p.compareAtPriceCents !== null && p.compareAtPriceCents > cents ? p.compareAtPriceCents : null;
  return { cents, from, strikeCents };
}

/** Teto do seletor: o `maxQty` do SKU escolhido; sem SKU, o teto da compra. */
export function maxQuantity(p: StoreProduct, selected: AxisSelection): number {
  const v = selectedVariant(p, selected);
  if (!v) return MAX_QTY_PER_ITEM;
  return Math.max(1, Math.min(v.maxQty, MAX_QTY_PER_ITEM));
}

export interface CartMerge {
  items: StoreCartItem[];
  /** Unidades que entraram de fato — 0 quando a linha já estava no teto. */
  added: number;
}

/**
 * Soma na linha do mesmo SKU sem passar do `maxQty` dele, ou abre linha nova.
 * `null` = carrinho cheio (30 linhas distintas, o teto da rule).
 */
export function mergeCartItem(
  items: readonly StoreCartItem[],
  item: { productId: string; skuId: string; qty: number; maxQty: number },
): CartMerge | null {
  const cap = Math.max(1, Math.min(item.maxQty, MAX_QTY_PER_ITEM));
  const index = items.findIndex((i) => i.productId === item.productId && i.skuId === item.skuId);
  if (index >= 0) {
    const current = items[index]!.qty;
    const next = Math.max(current, Math.min(current + item.qty, cap));
    return {
      items: items.map((i, k) => (k === index ? { ...i, qty: next } : i)),
      added: next - current,
    };
  }
  if (items.length >= MAX_CART_LINES) return null;
  const qty = Math.max(1, Math.min(item.qty, cap));
  return { items: [...items, { productId: item.productId, skuId: item.skuId, qty }], added: qty };
}

// ── Galeria e relacionados ─────────────────────────────────────────

/**
 * Fotos da cor escolhida seguidas das sem cor; cor sem foto própria → as sem cor; nenhuma → todas.
 * Sem galeria, a capa (doc anterior às fotos).
 */
export function galleryPhotos(p: StoreProduct, selected: AxisSelection): StorePhoto[] {
  const all: StorePhoto[] =
    p.photos.length > 0 ? p.photos : p.coverUrl ? [{ url: p.coverUrl, colorValueId: null }] : [];
  const first = p.axes[0];
  const color = first ? selected[first.id] : undefined;
  if (color === undefined) return all;
  const own = all.filter((ph) => ph.colorValueId === color);
  const generic = all.filter((ph) => ph.colorValueId === null);
  if (own.length > 0) return [...own, ...generic];
  return generic.length > 0 ? generic : all;
}

/** Mais vendidos da mesma categoria, completados pelos das outras; sem o próprio e sem esgotados. */
export function relatedProducts(p: StoreProduct, catalog: readonly StoreProduct[], limit: number): StoreProduct[] {
  const ranked = sortProducts(
    catalog.filter((x) => x.id !== p.id && !x.soldOut),
    'mais-vendidos',
  );
  return [...ranked.filter((x) => x.category === p.category), ...ranked.filter((x) => x.category !== p.category)].slice(
    0,
    limit,
  );
}

// ── Como receber ───────────────────────────────────────────────────

/** São Paulo não tem horário de verão desde 2019: UTC−3 fixo, a mesma conta no app. */
const SAO_PAULO_OFFSET_MS = 3 * 3_600_000;
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const OPENS_AT = 8;
const CLOSES_AT = 20;

/**
 * "Pronto amanhã a partir das 16h": agora + prazo do ponto, arredondado pra cima até a hora cheia
 * e trazido pra janela 8h–20h de São Paulo.
 */
export function pickupReadyLabel(readyHours: number, now: Date): string {
  // Relógio de parede de SP lido pelos getters UTC.
  const local = new Date(now.getTime() - SAO_PAULO_OFFSET_MS);
  const ready = new Date(local.getTime() + Math.max(0, readyHours) * 3_600_000);
  if (ready.getUTCMinutes() > 0 || ready.getUTCSeconds() > 0 || ready.getUTCMilliseconds() > 0) {
    ready.setUTCHours(ready.getUTCHours() + 1, 0, 0, 0);
  }
  if (ready.getUTCHours() < OPENS_AT) {
    ready.setUTCHours(OPENS_AT, 0, 0, 0);
  } else if (ready.getUTCHours() > CLOSES_AT) {
    ready.setUTCDate(ready.getUTCDate() + 1);
    ready.setUTCHours(OPENS_AT, 0, 0, 0);
  }
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const day = Date.UTC(ready.getUTCFullYear(), ready.getUTCMonth(), ready.getUTCDate());
  const diff = Math.round((day - today) / 86_400_000);
  const dd = String(ready.getUTCDate()).padStart(2, '0');
  const mm = String(ready.getUTCMonth() + 1).padStart(2, '0');
  const when = diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : diff < 7 ? WEEKDAYS[ready.getUTCDay()] : `${dd}/${mm}`;
  return `Pronto ${when} a partir das ${ready.getUTCHours()}h`;
}

/** 0 = grátis (pedido alcança o frete grátis); `null` = calculado no checkout. */
export function deliveryPriceCents(
  mode: StoreDeliveryMode,
  subtotalCents: number,
  freeAboveCents: number | null,
): number | null {
  if (freeAboveCents !== null && subtotalCents >= freeAboveCents) return 0;
  return mode.priceCents;
}
