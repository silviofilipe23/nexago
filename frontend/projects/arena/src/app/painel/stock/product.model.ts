/** Espelha `nexago_app/.../arena/domain/products/*.dart` — schema de
 *  `arenas/{arenaId}/products` e `arenas/{arenaId}/stockMovements`. */

export type ArenaProductCategory = 'bebidas' | 'alimentacao' | 'equipamentos' | 'servicos';

export const ARENA_PRODUCT_CATEGORIES: readonly ArenaProductCategory[] = [
  'bebidas',
  'alimentacao',
  'equipamentos',
  'servicos',
];

export const ARENA_PRODUCT_CATEGORY_LABEL: Record<ArenaProductCategory, string> = {
  bebidas: 'Bebidas',
  alimentacao: 'Alimentação',
  equipamentos: 'Equipamentos',
  servicos: 'Serviços',
};

export interface ArenaProduct {
  id: string;
  name: string;
  category: ArenaProductCategory;
  active: boolean;
  priceCents: number;
  stockQuantity: number;
  minStockQuantity: number;
  description?: string;
  emoji?: string;
  imageUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ArenaStockMovementType = 'purchase' | 'adjustment' | 'loss' | 'sale';

export const ARENA_STOCK_MOVEMENT_TYPE_LABEL: Record<ArenaStockMovementType, string> = {
  purchase: 'Compra',
  adjustment: 'Ajuste',
  loss: 'Perda',
  sale: 'Venda',
};

export interface ArenaStockMovement {
  id: string;
  productId: string;
  productName: string;
  type: ArenaStockMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  createdByUid: string;
  note?: string;
  createdAt?: Date;
}

export type ArenaProductStockStatus = 'ok' | 'low' | 'out';

export const ARENA_PRODUCT_STOCK_STATUS_LABEL: Record<ArenaProductStockStatus, string> = {
  ok: 'Em estoque',
  low: 'Estoque baixo',
  out: 'Esgotado',
};

/** `out` se inativo ou sem estoque; `low` se estoque <= mínimo; senão `ok`. */
export function productStockStatus(
  product: Pick<ArenaProduct, 'active' | 'stockQuantity' | 'minStockQuantity'>,
): ArenaProductStockStatus {
  if (!product.active || product.stockQuantity <= 0) return 'out';
  if (product.stockQuantity <= product.minStockQuantity) return 'low';
  return 'ok';
}

export interface ArenaProductSummary {
  activeCount: number;
  lowCount: number;
  outCount: number;
  inventoryValueCents: number;
}

export function buildProductSummary(products: readonly ArenaProduct[]): ArenaProductSummary {
  let activeCount = 0;
  let lowCount = 0;
  let outCount = 0;
  let inventoryValueCents = 0;

  for (const product of products) {
    if (!product.active) continue;
    activeCount++;
    inventoryValueCents += product.priceCents * product.stockQuantity;
    const status = productStockStatus(product);
    if (status === 'out') outCount++;
    else if (status === 'low') lowCount++;
  }

  return { activeCount, lowCount, outCount, inventoryValueCents };
}

/** purchase=+qty · loss/sale=-qty · adjustment=delta cru (pode zerar/reverter). */
export function signedDeltaForMovementType(type: ArenaStockMovementType, quantity: number): number {
  const absQty = Math.abs(quantity);
  switch (type) {
    case 'purchase':
      return absQty;
    case 'adjustment':
      return quantity;
    case 'loss':
    case 'sale':
      return -absQty;
  }
}

export function formatSignedQuantityDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function movementTypeDetailLabel(type: ArenaStockMovementType, quantityDelta: number): string {
  switch (type) {
    case 'purchase':
      return 'Entrada · Compra';
    case 'adjustment':
      return quantityDelta >= 0 ? 'Entrada · Ajuste' : 'Saída · Ajuste';
    case 'loss':
      return 'Saída · Perda';
    case 'sale':
      return 'Saída · Vendas';
  }
}

export function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "1.234,56" / "6,00" → 123456 / 600. Entradas inválidas ou negativas viram 0. */
export function parseBRLInputToCents(value: string): number {
  const cleaned = value.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function formatCentsInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Capacidade "cheia" da barra de estoque (maior entre estoque atual e mínimo). */
export function productStockBarCapacity(product: Pick<ArenaProduct, 'stockQuantity' | 'minStockQuantity'>): number {
  const { stockQuantity, minStockQuantity } = product;
  if (stockQuantity <= 0) return minStockQuantity > 0 ? minStockQuantity : 1;
  if (minStockQuantity <= 0) return stockQuantity;
  return stockQuantity > minStockQuantity ? stockQuantity : minStockQuantity;
}

export function productStockBarFillRatio(product: Pick<ArenaProduct, 'stockQuantity' | 'minStockQuantity'>): number {
  const capacity = productStockBarCapacity(product);
  if (capacity <= 0) return 0;
  return Math.min(1, Math.max(0, product.stockQuantity / capacity));
}

export function movementHistoryTitle(movement: Pick<ArenaStockMovement, 'type' | 'quantityDelta' | 'note'>): string {
  const typeLabel = movementTypeDetailLabel(movement.type, movement.quantityDelta);
  const note = movement.note?.trim();
  return note ? `${typeLabel} (${note})` : typeLabel;
}

export function formatMovementDate(date: Date | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}
