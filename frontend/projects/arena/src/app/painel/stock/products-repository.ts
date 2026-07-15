import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
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

export interface ProductInput {
  name: string;
  category: ArenaProductCategory;
  active: boolean;
  priceCents: number;
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
  const ref = await addDoc(productsCol(db, arenaId), { ...productPayload(input), createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateProduct(
  db: Firestore,
  arenaId: string,
  productId: string,
  input: ProductInput,
): Promise<void> {
  await updateDoc(doc(db, 'arenas', arenaId, 'products', productId), productPayload(input));
}

/** Desativa produto (preferível a excluir quando já tem histórico de movimentações). */
export async function deactivateProduct(db: Firestore, arenaId: string, productId: string): Promise<void> {
  await updateDoc(doc(db, 'arenas', arenaId, 'products', productId), {
    active: false,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProduct(db: Firestore, arenaId: string, productId: string): Promise<void> {
  await deleteDoc(doc(db, 'arenas', arenaId, 'products', productId));
}

/** Recria produto excluído (desfazer exclusão), preservando createdAt original quando disponível. */
export async function restoreProduct(db: Firestore, arenaId: string, product: ArenaProduct): Promise<void> {
  const payload: Record<string, unknown> = {
    ...productPayload(product),
    createdAt: product.createdAt ? Timestamp.fromDate(product.createdAt) : serverTimestamp(),
  };
  await setDoc(doc(db, 'arenas', arenaId, 'products', product.id), payload);
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
