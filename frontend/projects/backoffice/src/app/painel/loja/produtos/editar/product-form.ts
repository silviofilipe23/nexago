import { PRODUCT_CATEGORY_LABELS, type ProductCategory } from '../data/products.repository';

/** Local de estoque que o ajuste manual da grade mexe: o CD principal. */
export const MAIN_LOCATION = 'cd';

export type ProductStatusValue = 'rascunho' | 'ativo' | 'arquivado';
export type ProductBadgeValue = 'nova' | 'mais-vendida' | 'edicao-limitada';

export const BADGE_OPTIONS: ReadonlyArray<{ id: ProductBadgeValue | ''; label: string }> = [
  { id: '', label: 'Nenhum' },
  { id: 'nova', label: 'Nova' },
  { id: 'mais-vendida', label: 'Mais vendida' },
  { id: 'edicao-limitada', label: 'Edição limitada' },
];

export const MAX_FEATURED = 8;

export interface AxisValueForm {
  id: string;
  label: string;
  hex: string;
}

export interface AxisForm {
  id: string;
  label: string;
  values: AxisValueForm[];
}

export interface SkuForm {
  /** Valor escolhido em cada eixo (`axisId → valueId`). Vazio = produto sem variação. */
  axisValues: Record<string, string>;
  barcode: string;
  /** Texto em reais; vazio = sem preço próprio. */
  price: string;
  stockByLocation: Record<string, number>;
}

export interface ProductForm {
  name: string;
  baseSku: string;
  category: string;
  collection: string;
  brand: string;
  description: string;
  technicalDetails: { label: string; value: string }[];
  badge: ProductBadgeValue | '';
  /** Reais, como o usuário digita ("289,90"). */
  price: string;
  compareAtPrice: string;
  cost: string;
  channels: { app: boolean; web: boolean };
  fulfillment: { pickup: boolean; delivery: boolean };
  featured: boolean;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  lowStockThreshold: number;
  status: ProductStatusValue;
  active: boolean;
  axes: AxisForm[];
  skus: SkuForm[];
}

export function emptyForm(): ProductForm {
  return {
    name: '',
    baseSku: '',
    category: '',
    collection: '',
    brand: 'NexaGO',
    description: '',
    technicalDetails: [],
    badge: '',
    price: '',
    compareAtPrice: '',
    cost: '',
    channels: { app: true, web: true },
    fulfillment: { pickup: true, delivery: false },
    featured: false,
    weightKg: '',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    lowStockThreshold: 3,
    status: 'rascunho',
    active: false,
    axes: [],
    skus: [{ axisValues: {}, barcode: '', price: '', stockByLocation: {} }],
  };
}

/** "289,90" ou "289.90" → centavos. Vazio ou inválido → `null`. */
export function parseMoney(text: string): number | null {
  const clean = text.trim().replace(/^R\$\s*/, '');
  if (clean === '') {
    return null;
  }
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Math.round(Number(normalized) * 100);
}

export function formatMoneyInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) {
    return '';
  }
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Slug de raiz do SKU: `Camiseta Dry Fit` → `CAMISETA-DRY-FIT`. */
export function baseSkuFromName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? '' : `NX-${slug}`.slice(0, 40).replace(/-+$/, '');
}

export function idFromLabel(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'valor'
  );
}

export type MarginTone = 'green' | 'yellow' | 'red';

/** `(venda − custo) / venda`. Sem custo ou sem preço não há margem. */
export function marginOf(
  priceCents: number | null,
  costCents: number | null,
): { percent: number; perUnitCents: number; tone: MarginTone } | null {
  if (priceCents === null || costCents === null || priceCents <= 0) {
    return null;
  }
  const perUnitCents = priceCents - costCents;
  const percent = (perUnitCents / priceCents) * 100;
  const tone: MarginTone = percent >= 40 ? 'green' : percent >= 20 ? 'yellow' : 'red';
  return { percent, perUnitCents, tone };
}

export function discountPercent(priceCents: number | null, compareAtCents: number | null): number | null {
  if (priceCents === null || compareAtCents === null || compareAtCents <= priceCents || priceCents <= 0) {
    return null;
  }
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100);
}

export function skuTotal(sku: SkuForm): number {
  return Object.values(sku.stockByLocation).reduce((sum, n) => sum + n, 0);
}

/** Ajuste manual: o total digitado vira o estoque do CD; os outros locais ficam como estão. */
export function withTotalStock(sku: SkuForm, total: number): SkuForm {
  const others = skuTotal(sku) - (sku.stockByLocation[MAIN_LOCATION] ?? 0);
  const main = Math.max(0, Math.floor(total) - others);
  return { ...sku, stockByLocation: { ...sku.stockByLocation, [MAIN_LOCATION]: main } };
}

export function stockTotal(form: ProductForm): number {
  return form.skus.reduce((sum, sku) => sum + skuTotal(sku), 0);
}

/** `Esgotado` é calculado: estoque total zero num produto que já saiu do rascunho. */
export type HeaderStatus = 'rascunho' | 'ativo' | 'esgotado' | 'arquivado';

export function headerStatus(form: ProductForm): HeaderStatus {
  if (form.status === 'arquivado') {
    return 'arquivado';
  }
  if (form.status === 'rascunho') {
    return 'rascunho';
  }
  return stockTotal(form) === 0 ? 'esgotado' : 'ativo';
}

export type StockCell = 'zero' | 'low' | 'ok';

export function stockCell(qty: number, threshold: number): StockCell {
  if (qty === 0) {
    return 'zero';
  }
  return qty < threshold ? 'low' : 'ok';
}

/** Produto de cartesiano dos eixos → uma combinação por SKU. Sem eixo, uma combinação vazia. */
export function combinations(axes: AxisForm[]): Record<string, string>[] {
  let result: Record<string, string>[] = [{}];
  for (const axis of axes) {
    result = result.flatMap((base) =>
      axis.values.map((value) => ({ ...base, [axis.id]: value.id })),
    );
  }
  return result;
}

const sameCombination = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

/** Depois de editar os eixos: mantém o SKU de cada combinação que continua existindo e cria os novos. */
export function reconcileSkus(axes: AxisForm[], current: SkuForm[]): SkuForm[] {
  return combinations(axes).map(
    (axisValues) =>
      current.find((sku) => sameCombination(sku.axisValues, axisValues)) ?? {
        axisValues,
        barcode: '',
        price: '',
        stockByLocation: {},
      },
  );
}

/** SKUs que sumiriam com a edição dos eixos e ainda têm estoque: a tela pede confirmação. */
export function skusLostWithStock(axes: AxisForm[], current: SkuForm[]): SkuForm[] {
  const kept = combinations(axes);
  return current.filter(
    (sku) => skuTotal(sku) > 0 && !kept.some((combo) => sameCombination(combo, sku.axisValues)),
  );
}

export type FormErrors = Partial<Record<
  'name' | 'category' | 'price' | 'compareAtPrice' | 'cost' | 'channels' | 'fulfillment' | 'shipping' | 'baseSku' | 'featured' | 'photos',
  string
>>;

const shippingFilled = (form: ProductForm) =>
  [form.weightKg, form.lengthCm, form.widthCm, form.heightCm].every((v) => parsePositive(v) !== null);

function parsePositive(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

/** O que impede de salvar, mesmo como rascunho (nome e raiz vão para chaves de unicidade). */
export function draftErrors(form: ProductForm): FormErrors {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (name.length < 3 || name.length > 80) {
    errors.name = 'Informe um nome de 3 a 80 caracteres.';
  }
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(form.baseSku)) {
    errors.baseSku = 'Use letras maiúsculas, números e hífen.';
  }
  if (form.price.trim() !== '' && parseMoney(form.price) === null) {
    errors.price = 'Valor inválido.';
  }
  if (form.compareAtPrice.trim() !== '' && parseMoney(form.compareAtPrice) === null) {
    errors.compareAtPrice = 'Valor inválido.';
  }
  if (form.cost.trim() !== '' && parseMoney(form.cost) === null) {
    errors.cost = 'Valor inválido.';
  }
  return errors;
}

/** Tudo o que falta para publicar (inclui os erros de rascunho). Fotos ficam de fora até a fatia D. */
export function publishErrors(form: ProductForm): FormErrors {
  const errors = draftErrors(form);
  if (!form.category) {
    errors.category = 'Escolha uma categoria.';
  }
  const price = parseMoney(form.price);
  if (price === null || price <= 0) {
    errors.price = errors.price ?? 'O preço de venda deve ser maior que zero.';
  }
  const compare = parseMoney(form.compareAtPrice);
  if (compare !== null && price !== null && compare <= price) {
    errors.compareAtPrice = 'O preço "de" deve ser maior que o de venda.';
  }
  if (!form.channels.app && !form.channels.web) {
    errors.channels = 'Ligue ao menos um canal.';
  }
  if (!form.fulfillment.pickup && !form.fulfillment.delivery) {
    errors.fulfillment = 'Ligue retirada ou entrega.';
  }
  if (form.fulfillment.delivery && !shippingFilled(form)) {
    errors.shipping = 'Peso e dimensões são obrigatórios com entrega.';
  }
  return errors;
}

/** Ordem em que a tela rola até o primeiro erro. */
export const ERROR_ORDER: (keyof FormErrors)[] = [
  'name', 'baseSku', 'category', 'price', 'compareAtPrice', 'cost', 'channels', 'fulfillment', 'shipping', 'photos',
];

export function firstErrorField(errors: FormErrors): keyof FormErrors | null {
  return ERROR_ORDER.find((key) => errors[key] !== undefined) ?? null;
}

/** Payload de `saveStoreProduct`. `version` só existe em produto já salvo. */
export function toSaveInput(
  form: ProductForm,
  meta: { productId: string | null; version: number | null },
  status: ProductStatusValue,
  options: { includeCost: boolean },
): Record<string, unknown> {
  const hasShipping = [form.weightKg, form.lengthCm, form.widthCm, form.heightCm].some(
    (v) => v.trim() !== '',
  );
  const toInt = (v: string, factor = 1) => Math.round((parsePositive(v) ?? 0) * factor);
  const cost = parseMoney(form.cost);
  return {
    ...(meta.productId ? { productId: meta.productId, version: meta.version } : {}),
    name: form.name.trim(),
    baseSku: form.baseSku,
    category: form.category,
    collection: form.collection || null,
    brand: form.brand.trim() || 'NexaGO',
    description: form.description,
    technicalDetails: form.technicalDetails.filter((d) => d.label.trim() !== '' && d.value.trim() !== ''),
    badge: form.badge || null,
    priceCents: parseMoney(form.price) ?? 0,
    compareAtPriceCents: parseMoney(form.compareAtPrice),
    ...(options.includeCost ? { costCents: cost } : {}),
    channels: form.channels,
    fulfillment: form.fulfillment,
    featured: form.featured,
    shipping: hasShipping
      ? {
          weightGrams: toInt(form.weightKg, 1000),
          lengthCm: toInt(form.lengthCm),
          widthCm: toInt(form.widthCm),
          heightCm: toInt(form.heightCm),
        }
      : null,
    lowStockThreshold: form.lowStockThreshold,
    status,
    // Publicar agora liga o produto; quem já estava no ar mantém o toggle que tinha.
    active: status === 'ativo' && (form.status !== 'ativo' || form.active),
  };
}

/** Payload de `saveStoreProductVariations`. */
export function toVariationsInput(form: ProductForm, productId: string, version: number) {
  return {
    productId,
    version,
    axes: form.axes.map((axis) => ({
      id: axis.id,
      label: axis.label,
      values: axis.values.map((v) => ({
        id: v.id,
        label: v.label,
        ...(v.hex ? { hex: v.hex } : {}),
      })),
    })),
    skus: form.skus.map((sku) => ({
      axisValues: sku.axisValues,
      barcode: sku.barcode.trim() === '' ? null : sku.barcode.trim(),
      priceCents: parseMoney(sku.price),
      stockByLocation: sku.stockByLocation,
    })),
  };
}

export function categoryLabel(id: string): string {
  return PRODUCT_CATEGORY_LABELS[id as ProductCategory] ?? id;
}
