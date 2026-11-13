import {
  Timestamp,
  collection,
  deleteField,
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
import { deleteObject, getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { productImagePath, replacedProductImagePath } from '../data/arena-image-path';
import { shrinkImageFile } from '../data/image-shrink';
import { validateArenaImageFile } from '../profile/arena-profile-repository';
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
  /** `null` = remover a foto (só faz diferença na edição; na criação é o mesmo que omitir). */
  imageUrl?: string | null;
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

/** Id de um produto ainda não gravado — a foto sobe antes do doc existir, já no caminho final. */
export function newProductId(db: Firestore, arenaId: string): string {
  return doc(productsCol(db, arenaId)).id;
}

export async function createProduct(
  db: Firestore,
  arenaId: string,
  input: ProductInput,
  productId: string = newProductId(db, arenaId),
): Promise<string> {
  const productRef = doc(productsCol(db, arenaId), productId);
  const batch = writeBatch(db);
  batch.set(productRef, { ...productPayload(input), createdAt: serverTimestamp() });
  applyCostWrite(batch, db, arenaId, productId, input.costCents);
  await batch.commit();
  return productId;
}

export async function updateProduct(
  db: Firestore,
  arenaId: string,
  productId: string,
  input: ProductInput,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'arenas', arenaId, 'products', productId), {
    ...productPayload(input),
    ...(input.imageUrl === null ? { imageUrl: deleteField() } : {}),
  });
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


/** Sobe a foto do produto e devolve a download URL — ela ainda precisa ir pro doc do produto. */
export async function uploadProductImage(
  storage: FirebaseStorage,
  arenaId: string,
  productId: string,
  file: File,
): Promise<string> {
  const error = validateArenaImageFile(file);
  if (error) {
    throw new Error(error);
  }
  // Reduz antes de subir: fora do try abaixo, pra mensagem de "não abriu a imagem" chegar inteira.
  const blob = await shrinkImageFile(file, 'product');
  // Nome novo a cada envio, igual ao app (`productImagePath`): sobrescrever trocaria o token e a
  // foto salva no produto responderia 403 até a nova ser gravada. storage.rules libera o dono e a
  // equipe que grava o estoque (gestor/manutenção, com plano em dia).
  const fileRef = ref(storage, productImagePath(arenaId, productId));
  try {
    await uploadBytes(fileRef, blob, { contentType: blob.type || file.type });
  } catch (err) {
    if ((err as { code?: string }).code === 'storage/unauthorized') {
      throw new Error('Sem permissão para enviar a foto do produto. A equipe só edita o estoque com o plano da arena em dia.');
    }
    throw new Error('Não foi possível enviar a foto do produto.');
  }
  return getDownloadURL(fileRef);
}

/** Apaga a foto antiga do produto DEPOIS que o doc passou a apontar para a nova (ou para
 *  nenhuma). Só arquivo da pasta de produtos desta arena (`replacedProductImagePath`). Melhor
 *  esforço: o doc já não aponta mais pra ele, então uma falha só deixa um arquivo sobrando. */
export async function deleteReplacedProductImage(
  storage: FirebaseStorage,
  arenaId: string,
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined,
): Promise<void> {
  const path = replacedProductImagePath(arenaId, previousUrl, nextUrl);
  if (!path) {
    return;
  }
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // arquivo inexistente ou sem permissão — nada a fazer
  }
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
