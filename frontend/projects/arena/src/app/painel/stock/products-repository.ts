import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore';
import {
  signedDeltaForMovementType,
  type ArenaProduct,
  type ArenaProductCategory,
  type ArenaStockMovement,
  type ArenaStockMovementType,
} from './product.model';

/** Espelha `ArenaProductsRepository` (Flutter) — mesmas coleções, mesmos campos, mesma transaction. */

function productsCol(db: Firestore, arenaId: string) {
  return collection(db, 'arenas', arenaId, 'products');
}

function movementsCol(db: Firestore, arenaId: string) {
  return collection(db, 'arenas', arenaId, 'stockMovements');
}

/** Custo mora fora do produto: o catálogo é legível por qualquer usuário logado
 *  (é o cardápio do "Peça na quadra") e custo/margem são dado de gestão. Esta
 *  coleção só é legível por quem tem acesso a `estoque` na arena. Id do doc =
 *  id do produto, então casa sem query. */
function costsCol(db: Firestore, arenaId: string) {
  return collection(db, 'arenas', arenaId, 'productCosts');
}

function costDocRef(db: Firestore, arenaId: string, productId: string) {
  return doc(db, 'arenas', arenaId, 'productCosts', productId);
}

/** `undefined` = sem custo informado (doc ausente ou valor imprestável). Zero é
 *  custo informado e passa. */
export function costCentsFromDoc(data: Record<string, unknown> | undefined): number | undefined {
  const raw = data?.['costCents'];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return undefined;
  return Math.round(raw);
}

export function mergeProductCosts(
  products: readonly ArenaProduct[],
  costsByProductId: ReadonlyMap<string, number>,
): ArenaProduct[] {
  return products.map((product) => {
    const costCents = costsByProductId.get(product.id);
    return costCents == null ? product : { ...product, costCents };
  });
}

function applyCostWrite(
  batch: WriteBatch,
  db: Firestore,
  arenaId: string,
  productId: string,
  costCents: number | null,
): void {
  const ref = costDocRef(db, arenaId, productId);
  if (costCents == null) {
    batch.delete(ref);
    return;
  }
  batch.set(ref, { costCents: Math.max(0, Math.round(costCents)), updatedAt: serverTimestamp() });
}

function toDate(value: unknown): Date | undefined {
  return value instanceof Timestamp ? value.toDate() : undefined;
}

function productFromDoc(id: string, data: Record<string, unknown>): ArenaProduct {
  return {
    id,
    name: typeof data['name'] === 'string' ? data['name'] : 'Produto',
    category: (data['category'] as ArenaProductCategory | undefined) ?? 'bebidas',
    active: data['active'] === true,
    priceCents: typeof data['priceCents'] === 'number' ? data['priceCents'] : 0,
    stockQuantity: typeof data['stockQuantity'] === 'number' ? data['stockQuantity'] : 0,
    minStockQuantity: typeof data['minStockQuantity'] === 'number' ? data['minStockQuantity'] : 0,
    description: typeof data['description'] === 'string' ? data['description'] : undefined,
    emoji: typeof data['emoji'] === 'string' ? data['emoji'] : undefined,
    imageUrl: typeof data['imageUrl'] === 'string' ? data['imageUrl'] : undefined,
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

function movementFromDoc(id: string, data: Record<string, unknown>): ArenaStockMovement {
  return {
    id,
    productId: typeof data['productId'] === 'string' ? data['productId'] : '',
    productName: typeof data['productName'] === 'string' ? data['productName'] : '',
    type: (data['type'] as ArenaStockMovementType | undefined) ?? 'adjustment',
    quantityDelta: typeof data['quantityDelta'] === 'number' ? data['quantityDelta'] : 0,
    quantityBefore: typeof data['quantityBefore'] === 'number' ? data['quantityBefore'] : 0,
    quantityAfter: typeof data['quantityAfter'] === 'number' ? data['quantityAfter'] : 0,
    createdByUid: typeof data['createdByUid'] === 'string' ? data['createdByUid'] : '',
    note: typeof data['note'] === 'string' ? data['note'] : undefined,
    createdAt: toDate(data['createdAt']),
  };
}

export async function fetchProducts(db: Firestore, arenaId: string): Promise<ArenaProduct[]> {
  const snap = await getDocs(query(productsCol(db, arenaId), orderBy('nameLower'), limit(100)));
  return snap.docs.map((d) => productFromDoc(d.id, d.data()));
}

export async function fetchProduct(db: Firestore, arenaId: string, productId: string): Promise<ArenaProduct | null> {
  const snap = await getDoc(doc(db, 'arenas', arenaId, 'products', productId));
  if (!snap.exists()) return null;
  return productFromDoc(snap.id, snap.data());
}

export async function fetchProductCosts(db: Firestore, arenaId: string): Promise<Map<string, number>> {
  const snap = await getDocs(query(costsCol(db, arenaId), limit(200)));
  const costs = new Map<string, number>();
  for (const d of snap.docs) {
    const costCents = costCentsFromDoc(d.data());
    if (costCents != null) costs.set(d.id, costCents);
  }
  return costs;
}

/** Listagem do Estoque: produtos + custos em paralelo. `fetchProducts` segue sem
 *  custo porque a tela de comandas também usa e não tem por que ler custo. */
export async function fetchProductsWithCosts(db: Firestore, arenaId: string): Promise<ArenaProduct[]> {
  const [products, costs] = await Promise.all([fetchProducts(db, arenaId), fetchProductCosts(db, arenaId)]);
  return mergeProductCosts(products, costs);
}

export async function fetchProductWithCost(
  db: Firestore,
  arenaId: string,
  productId: string,
): Promise<ArenaProduct | null> {
  const [product, costSnap] = await Promise.all([
    fetchProduct(db, arenaId, productId),
    getDoc(costDocRef(db, arenaId, productId)),
  ]);
  if (!product) return null;
  const costCents = costSnap.exists() ? costCentsFromDoc(costSnap.data()) : undefined;
  return costCents == null ? product : { ...product, costCents };
}

export interface ProductInput {
  name: string;
  category: ArenaProductCategory;
  active: boolean;
  priceCents: number;
  /** `null` = sem custo informado; apaga o doc de custo. Explícito de propósito:
   *  quem grava o produto sempre decide o que acontece com o custo. */
  costCents: number | null;
  stockQuantity: number;
  minStockQuantity: number;
  description?: string;
  emoji?: string;
  imageUrl?: string;
}

function productPayload(input: ProductInput): Record<string, unknown> {
  return {
    name: input.name,
    nameLower: input.name.toLowerCase(),
    category: input.category,
    active: input.active,
    priceCents: input.priceCents,
    stockQuantity: input.stockQuantity,
    minStockQuantity: input.minStockQuantity,
    ...(input.description ? { description: input.description } : {}),
    ...(input.emoji ? { emoji: input.emoji } : {}),
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    updatedAt: serverTimestamp(),
  };
}

export async function createProduct(db: Firestore, arenaId: string, input: ProductInput): Promise<string> {
  const ref = doc(productsCol(db, arenaId));
  const batch = writeBatch(db);
  batch.set(ref, { ...productPayload(input), createdAt: serverTimestamp() });
  applyCostWrite(batch, db, arenaId, ref.id, input.costCents);
  await batch.commit();
  return ref.id;
}

export async function updateProduct(
  db: Firestore,
  arenaId: string,
  productId: string,
  input: ProductInput,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'arenas', arenaId, 'products', productId), productPayload(input));
  applyCostWrite(batch, db, arenaId, productId, input.costCents);
  await batch.commit();
}

/** Desativa produto (preferível a excluir quando já tem histórico de movimentações). */
export async function deactivateProduct(db: Firestore, arenaId: string, productId: string): Promise<void> {
  await updateDoc(doc(db, 'arenas', arenaId, 'products', productId), {
    active: false,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProduct(db: Firestore, arenaId: string, productId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'arenas', arenaId, 'products', productId));
  batch.delete(costDocRef(db, arenaId, productId));
  await batch.commit();
}

/** Recria produto excluído (desfazer exclusão), preservando createdAt original quando disponível. */
export async function restoreProduct(db: Firestore, arenaId: string, product: ArenaProduct): Promise<void> {
  const payload: Record<string, unknown> = {
    ...productPayload({ ...product, costCents: product.costCents ?? null }),
    createdAt: product.createdAt ? Timestamp.fromDate(product.createdAt) : serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'arenas', arenaId, 'products', product.id), payload);
  applyCostWrite(batch, db, arenaId, product.id, product.costCents ?? null);
  await batch.commit();
}

export class InsufficientStockError extends Error {}

/** Movimentação manual (compra/ajuste/perda) — transaction: lê estoque atual, valida
 *  não-negativo, grava o movimento e atualiza `stockQuantity` atomicamente. */
export async function registerStockMovement(
  db: Firestore,
  arenaId: string,
  productId: string,
  type: ArenaStockMovementType,
  quantity: number,
  createdByUid: string,
  note?: string,
): Promise<void> {
  const delta = signedDeltaForMovementType(type, quantity);
  const productRef = doc(db, 'arenas', arenaId, 'products', productId);

  await runTransaction(db, async (txn) => {
    const productSnap = await txn.get(productRef);
    if (!productSnap.exists()) {
      throw new Error('Produto não encontrado.');
    }
    const data = productSnap.data() as Record<string, unknown>;
    const before = typeof data['stockQuantity'] === 'number' ? data['stockQuantity'] : 0;
    const after = before + delta;
    if (after < 0) {
      throw new InsufficientStockError('Estoque não pode ficar negativo.');
    }

    const movementRef = doc(movementsCol(db, arenaId));
    txn.set(movementRef, {
      productId,
      productName: typeof data['name'] === 'string' ? data['name'] : 'Produto',
      type,
      quantityDelta: delta,
      quantityBefore: before,
      quantityAfter: after,
      createdByUid,
      ...(note ? { note } : {}),
      createdAt: serverTimestamp(),
    });
    txn.update(productRef, { stockQuantity: after, updatedAt: serverTimestamp() });
  });
}

export async function fetchMovements(
  db: Firestore,
  arenaId: string,
  productId: string,
  limitCount = 30,
): Promise<ArenaStockMovement[]> {
  const snap = await getDocs(
    query(
      movementsCol(db, arenaId),
      where('productId', '==', productId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    ),
  );
  return snap.docs.map((d) => movementFromDoc(d.id, d.data()));
}
