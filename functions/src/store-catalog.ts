/**
 * Catálogo da Loja: tipos e as regras que dá para decidir sem banco.
 *
 * Separado das callables de propósito — rollup, unicidade e validação são o
 * miolo das decisões e merecem teste direto, sem Firestore no caminho.
 */

export type ProductStatus = "rascunho" | "ativo" | "arquivado";
export type ProductBadge = "nova" | "mais-vendida" | "edicao-limitada";

/** Teto por produto: a troca completa de variações toca ~400 operações, e o limite é 500. */
export const MAX_SKUS_PER_PRODUCT = 100;

/** Teto de unidades de um SKU por compra (página do produto, personalização, carrinho). */
export const MAX_QTY_PER_ITEM = 10;

/** Quantos dias o selo "nova" aparece depois da publicação. */
const NEW_BADGE_DAYS = 30;

export interface AxisValue {
  id: string;
  label: string;
  hex?: string;
}

export interface Axis {
  id: string;
  label: string;
  values: AxisValue[];
}

export interface SkuDoc {
  id: string;
  code: string;
  barcode: string | null;
  axisValues: Record<string, string>;
  priceCents: number | null;
  stockByLocation: Record<string, number>;
  stock: number;
}

export interface ProductForValidation {
  name: string;
  category: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  channels: {app: boolean; web: boolean};
  fulfillment: {pickup: boolean; delivery: boolean};
  shipping: {weightGrams: number; lengthCm: number; widthCm: number; heightCm: number} | null;
}

/** Minúscula, sem acento, só letras/números/hífen. Nome sem letra nenhuma vira "produto". */
export function slugify(name: string): string {
  const out = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "produto";
}

function orderedValues(axisValues: Record<string, string>, axes: Axis[]): string[] {
  // A ordem vem dos eixos, nunca das chaves do objeto: id de documento precisa ser estável.
  return axes.map((axis) => axisValues[axis.id] ?? "").filter((v) => v !== "");
}

/** Id do documento do SKU. Vem dos valores de eixo, não do código: renomear código não move o doc. */
export function skuIdFromAxisValues(axisValues: Record<string, string>, axes: Axis[]): string {
  const parts = orderedValues(axisValues, axes);
  return parts.length === 0 ? "unico" : parts.join("_");
}

/** `NX-CAM` + branco/p → `NX-CAM-BRANCO-P`. Sem eixo, o código é a própria raiz. */
export function skuCodeFrom(
  baseSku: string,
  axisValues: Record<string, string>,
  axes: Axis[],
): string {
  const parts = orderedValues(axisValues, axes).map((v) => slugify(v).toUpperCase());
  return [baseSku, ...parts].join("-");
}

export function sumStock(stockByLocation: Record<string, number>): number {
  return Object.values(stockByLocation).reduce((total, n) => total + n, 0);
}

export function rollupsOf(
  skus: SkuDoc[],
  priceCents: number,
): {skuCount: number; stockTotal: number; priceFromCents: number} {
  const prices = skus.map((s) => s.priceCents).filter((p): p is number => p !== null);
  return {
    skuCount: skus.length,
    stockTotal: skus.reduce((total, s) => total + s.stock, 0),
    priceFromCents: Math.min(priceCents, ...prices),
  };
}

/**
 * O que falta para publicar. Rascunho salva sem nada disso.
 *
 * Foto NÃO entra: `photos` só é preenchido na fatia D, e cobrar aqui deixaria
 * o catálogo inteiro impublicável.
 */
export function publishValidationErrors(product: ProductForValidation): string[] {
  const errors: string[] = [];
  if (product.name.trim().length < 3 || product.name.trim().length > 80) {
    errors.push("name");
  }
  if (!product.category) {
    errors.push("category");
  }
  if (!(product.priceCents > 0)) {
    errors.push("priceCents");
  }
  if (product.compareAtPriceCents !== null && product.compareAtPriceCents <= product.priceCents) {
    errors.push("compareAtPriceCents");
  }
  if (!product.channels.app && !product.channels.web) {
    errors.push("channels");
  }
  if (!product.fulfillment.pickup && !product.fulfillment.delivery) {
    errors.push("fulfillment");
  }
  if (product.fulfillment.delivery && product.shipping === null) {
    errors.push("shipping");
  }
  return errors.sort();
}

/** O selo "nova" expira na leitura: comparar data custa nada e não deixa janela em que ele mente. */
export function badgeIsVisible(
  badge: ProductBadge | null,
  publishedAt: Date | null,
  now: Date,
): boolean {
  if (badge === null) {
    return false;
  }
  if (badge !== "nova") {
    return true;
  }
  if (publishedAt === null) {
    return false;
  }
  const days = (now.getTime() - publishedAt.getTime()) / 86_400_000;
  return days < NEW_BADGE_DAYS;
}

export type StockMovementType = "entrada" | "saida" | "transferencia" | "ajuste";

export interface StockMovementItem {
  productId: string;
  skuId: string;
  skuCode: string;
  productName: string;
  /** "Branco areia · M"; vazio em produto sem variação. */
  variantLabel: string;
  locationId: string;
  /** Com sinal: +3 entrou, −2 saiu do local. */
  delta: number;
  before: number;
  after: number;
}

/** "Branco areia · M": rótulos na ordem dos eixos. */
export function variantLabelOf(axisValues: Record<string, string>, axes: Axis[]): string {
  return axes
    .map((axis) => axis.values.find((v) => v.id === axisValues[axis.id])?.label ?? axisValues[axis.id] ?? "")
    .filter((label) => label !== "")
    .join(" · ");
}

/**
 * Diferença de saldo por SKU e local entre o que está gravado e o que vai ser.
 * É o que vira a movimentação "ajuste": saldo nunca muda sem deixar rastro.
 */
export function stockDeltas(
  before: Map<string, Record<string, number>>,
  after: {id: string; stockByLocation: Record<string, number>}[],
): {skuId: string; locationId: string; delta: number; before: number; after: number}[] {
  const out: {skuId: string; locationId: string; delta: number; before: number; after: number}[] = [];
  for (const sku of after) {
    const old = before.get(sku.id) ?? {};
    const locations = [...new Set([...Object.keys(old), ...Object.keys(sku.stockByLocation)])].sort();
    for (const locationId of locations) {
      const b = old[locationId] ?? 0;
      const a = sku.stockByLocation[locationId] ?? 0;
      if (a !== b) out.push({skuId: sku.id, locationId, delta: a - b, before: b, after: a});
    }
  }
  return out;
}

/** SKUs abaixo do alerta do produto (esgotado conta). Vai no pai para o badge do menu ler um doc só. */
export function lowStockSkuCount(skus: {stock: number}[], threshold: number): number {
  return skus.filter((sku) => sku.stock < threshold).length;
}
