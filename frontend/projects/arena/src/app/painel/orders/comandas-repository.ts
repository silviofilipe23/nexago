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
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore';
import { signedDeltaForMovementType } from '../stock/product.model';
import {
  comandaItemReverseBlockReason,
  comandaStatusIsActive,
  formatComandaNumber,
  type ArenaComanda,
  type ArenaComandaItem,
  type ArenaComandaItemSource,
  type ArenaComandaPayment,
  type ArenaComandaPaymentMethod,
  type ArenaComandaStatus,
  type ArenaComandaType,
} from './comanda.model';

/** Espelha `ArenaComandasRepository` (Flutter) — `arenaComandas` é coleção top-level
 *  (não subcoleção de `arenas`), com `items`/`payments` como subcoleções. */

function comandasCol(db: Firestore) {
  return collection(db, 'arenaComandas');
}

function counterRef(db: Firestore, arenaId: string) {
  return doc(db, 'arenas', arenaId, 'metadata', 'comandaCounter');
}

function productsCol(db: Firestore, arenaId: string) {
  return collection(db, 'arenas', arenaId, 'products');
}

function movementsCol(db: Firestore, arenaId: string) {
  return collection(db, 'arenas', arenaId, 'stockMovements');
}

function itemsCol(db: Firestore, comandaId: string) {
  return collection(db, 'arenaComandas', comandaId, 'items');
}

function paymentsCol(db: Firestore, comandaId: string) {
  return collection(db, 'arenaComandas', comandaId, 'payments');
}

function toDate(value: unknown): Date | undefined {
  return value instanceof Timestamp ? value.toDate() : undefined;
}

function comandaFromDoc(id: string, data: Record<string, unknown>): ArenaComanda {
  return {
    id,
    arenaId: typeof data['arenaId'] === 'string' ? data['arenaId'] : '',
    displayNumber: typeof data['displayNumber'] === 'number' ? data['displayNumber'] : 0,
    type: (data['type'] as ArenaComandaType | undefined) ?? 'individual',
    status: (data['status'] as ArenaComandaStatus | undefined) ?? 'open',
    bookingId: typeof data['bookingId'] === 'string' ? data['bookingId'] : undefined,
    bookingDisplayCode: typeof data['bookingDisplayCode'] === 'string' ? data['bookingDisplayCode'] : undefined,
    locationLabel: typeof data['locationLabel'] === 'string' ? data['locationLabel'] : undefined,
    customerName: typeof data['customerName'] === 'string' ? data['customerName'] : 'Cliente',
    customerWhatsapp: typeof data['customerWhatsapp'] === 'string' ? data['customerWhatsapp'] : undefined,
    customerCpf: typeof data['customerCpf'] === 'string' ? data['customerCpf'] : undefined,
    allowAppOrders: data['allowAppOrders'] === true,
    rentalCents: typeof data['rentalCents'] === 'number' ? data['rentalCents'] : 0,
    itemsTotalCents: typeof data['itemsTotalCents'] === 'number' ? data['itemsTotalCents'] : 0,
    totalCents: typeof data['totalCents'] === 'number' ? data['totalCents'] : 0,
    itemsCount: typeof data['itemsCount'] === 'number' ? data['itemsCount'] : 0,
    paidCents: typeof data['paidCents'] === 'number' ? data['paidCents'] : 0,
    openedByUid: typeof data['openedByUid'] === 'string' ? data['openedByUid'] : '',
    openedAt: toDate(data['openedAt']),
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

function itemFromDoc(id: string, data: Record<string, unknown>): ArenaComandaItem {
  return {
    id,
    productId: typeof data['productId'] === 'string' ? data['productId'] : '',
    productName: typeof data['productName'] === 'string' ? data['productName'] : 'Item',
    emoji: typeof data['emoji'] === 'string' ? data['emoji'] : undefined,
    quantity: typeof data['quantity'] === 'number' ? data['quantity'] : 0,
    unitPriceCents: typeof data['unitPriceCents'] === 'number' ? data['unitPriceCents'] : 0,
    lineTotalCents: typeof data['lineTotalCents'] === 'number' ? data['lineTotalCents'] : 0,
    source: (data['source'] as ArenaComandaItemSource | undefined) ?? 'counter',
    addedByName: typeof data['addedByName'] === 'string' ? data['addedByName'] : 'Gestor',
    addedByUid: typeof data['addedByUid'] === 'string' ? data['addedByUid'] : '',
    createdAt: toDate(data['createdAt']),
  };
}

function paymentFromDoc(id: string, data: Record<string, unknown>): ArenaComandaPayment {
  return {
    id,
    method: (data['method'] as ArenaComandaPaymentMethod | undefined) ?? 'other',
    amountCents: typeof data['amountCents'] === 'number' ? data['amountCents'] : 0,
    payerName: typeof data['payerName'] === 'string' ? data['payerName'] : 'Cliente',
    receivedByUid: typeof data['receivedByUid'] === 'string' ? data['receivedByUid'] : '',
    createdAt: toDate(data['createdAt']),
  };
}

export async function fetchComandas(db: Firestore, arenaId: string): Promise<ArenaComanda[]> {
  const snap = await getDocs(
    query(comandasCol(db), where('arenaId', '==', arenaId), orderBy('openedAt', 'desc'), limit(50)),
  );
  return snap.docs.map((d) => comandaFromDoc(d.id, d.data()));
}

export async function fetchComanda(db: Firestore, comandaId: string): Promise<ArenaComanda | null> {
  const snap = await getDoc(doc(db, 'arenaComandas', comandaId));
  if (!snap.exists()) return null;
  return comandaFromDoc(snap.id, snap.data());
}

export async function fetchComandaItems(db: Firestore, comandaId: string): Promise<ArenaComandaItem[]> {
  const snap = await getDocs(query(itemsCol(db, comandaId), orderBy('createdAt', 'desc'), limit(50)));
  return snap.docs.map((d) => itemFromDoc(d.id, d.data()));
}

export async function fetchComandaPayments(db: Firestore, comandaId: string): Promise<ArenaComandaPayment[]> {
  const snap = await getDocs(query(paymentsCol(db, comandaId), orderBy('createdAt', 'desc'), limit(50)));
  return snap.docs.map((d) => paymentFromDoc(d.id, d.data()));
}

export interface CreateComandaInput {
  customerName: string;
  customerWhatsapp?: string;
  customerCpf?: string;
}

/** Abre uma comanda "sem vínculo" (sem reserva de quadra ligada — esse fluxo ainda não
 *  existe neste portal). Sempre tipo `individual`, o único aceito na criação pelas rules
 *  (`isValidArenaComandaCreate`). Numeração sequencial via `arenas/{arenaId}/metadata/comandaCounter`. */
export async function createComanda(
  db: Firestore,
  arenaId: string,
  openedByUid: string,
  input: CreateComandaInput,
): Promise<string> {
  const comandaRef = doc(comandasCol(db));

  await runTransaction(db, async (txn) => {
    const counterSnap = await txn.get(counterRef(db, arenaId));
    const lastNumber = counterSnap.exists() ? ((counterSnap.data()['lastNumber'] as number | undefined) ?? 0) : 0;
    const displayNumber = lastNumber + 1;

    txn.set(comandaRef, {
      arenaId,
      displayNumber,
      type: 'individual',
      status: 'open',
      customerName: input.customerName,
      ...(input.customerWhatsapp ? { customerWhatsapp: input.customerWhatsapp } : {}),
      ...(input.customerCpf ? { customerCpf: input.customerCpf } : {}),
      allowAppOrders: false,
      rentalCents: 0,
      itemsTotalCents: 0,
      totalCents: 0,
      itemsCount: 0,
      paidCents: 0,
      openedByUid,
      openedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    txn.set(counterRef(db, arenaId), { lastNumber: displayNumber, updatedAt: serverTimestamp() }, { merge: true });
  });

  return comandaRef.id;
}

export class InsufficientStockError extends Error {}

export interface AddItemLine {
  productId: string;
  quantity: number;
}

/** Adiciona itens à comanda: lê todos os produtos primeiro (Firestore exige toda leitura
 *  antes de qualquer escrita numa transaction), valida estoque suficiente pra cada linha,
 *  grava os itens + os `stockMovements` (tipo `sale`) e atualiza `stockQuantity` de cada
 *  produto — tudo atômico. Espelha `addItemsBatch` do Flutter. */
export async function addItemsBatch(
  db: Firestore,
  arenaId: string,
  comandaId: string,
  lines: readonly AddItemLine[],
  addedByUid: string,
  addedByName: string,
): Promise<void> {
  const validLines = lines.filter((l) => l.quantity > 0);
  if (validLines.length === 0) return;

  const comandaRef = doc(db, 'arenaComandas', comandaId);

  await runTransaction(db, async (txn) => {
    const comandaSnap = await txn.get(comandaRef);
    if (!comandaSnap.exists()) {
      throw new Error('Comanda não encontrada.');
    }
    const comanda = comandaFromDoc(comandaSnap.id, comandaSnap.data());
    if (comanda.arenaId !== arenaId) {
      throw new Error('Comanda não pertence a esta arena.');
    }
    if (!comandaStatusIsActive(comanda.status)) {
      throw new Error('Comanda não está aberta para lançamentos.');
    }

    const productIds = [...new Set(validLines.map((l) => l.productId))];
    const productSnaps = new Map<string, DocumentSnapshot<DocumentData>>();
    for (const productId of productIds) {
      productSnaps.set(productId, await txn.get(doc(productsCol(db, arenaId), productId)));
    }

    const notePrefix = `comanda ${formatComandaNumber(comanda.displayNumber)}`;
    const stockAfterByProduct = new Map<string, number>();
    let addedItemsTotal = 0;
    let addedItemsCount = 0;
    const pending: { item: Record<string, unknown>; movement: Record<string, unknown> }[] = [];

    for (const line of validLines) {
      const snap = productSnaps.get(line.productId);
      if (!snap || !snap.exists()) {
        throw new Error('Produto não encontrado.');
      }
      const data = snap.data() as Record<string, unknown>;
      const productName = typeof data['name'] === 'string' ? data['name'] : 'Produto';
      if (data['active'] !== true) {
        throw new Error(`Produto "${productName}" está inativo.`);
      }

      const delta = signedDeltaForMovementType('sale', line.quantity);
      const initialStock = typeof data['stockQuantity'] === 'number' ? data['stockQuantity'] : 0;
      const before = stockAfterByProduct.has(line.productId) ? stockAfterByProduct.get(line.productId)! : initialStock;
      const after = before + delta;
      if (after < 0) {
        throw new InsufficientStockError(`Estoque insuficiente para "${productName}".`);
      }
      stockAfterByProduct.set(line.productId, after);

      const priceCents = typeof data['priceCents'] === 'number' ? data['priceCents'] : 0;
      const lineTotalCents = priceCents * line.quantity;
      addedItemsTotal += lineTotalCents;
      addedItemsCount += line.quantity;

      pending.push({
        item: {
          productId: line.productId,
          productName,
          ...(typeof data['emoji'] === 'string' && data['emoji'] ? { emoji: data['emoji'] } : {}),
          quantity: line.quantity,
          unitPriceCents: priceCents,
          lineTotalCents,
          source: 'counter',
          addedByName,
          addedByUid,
          createdAt: serverTimestamp(),
        },
        movement: {
          productId: line.productId,
          productName,
          type: 'sale',
          quantityDelta: delta,
          quantityBefore: before,
          quantityAfter: after,
          createdByUid: addedByUid,
          note: notePrefix,
          createdAt: serverTimestamp(),
        },
      });
    }

    for (const p of pending) {
      txn.set(doc(itemsCol(db, comandaId)), p.item);
      txn.set(doc(movementsCol(db, arenaId)), p.movement);
    }
    for (const [productId, after] of stockAfterByProduct) {
      txn.update(doc(productsCol(db, arenaId), productId), { stockQuantity: after, updatedAt: serverTimestamp() });
    }

    const newItemsTotal = comanda.itemsTotalCents + addedItemsTotal;
    const newItemsCount = comanda.itemsCount + addedItemsCount;
    const newTotal = comanda.rentalCents + newItemsTotal;
    txn.update(comandaRef, {
      itemsTotalCents: newItemsTotal,
      itemsCount: newItemsCount,
      totalCents: newTotal,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Estorna um item: apaga o item, cria um `stockMovements` tipo `adjustment` devolvendo a
 *  quantidade ao estoque e recalcula os totais da comanda. Espelha `reverseComandaItem`. */
export async function reverseComandaItem(
  db: Firestore,
  arenaId: string,
  comandaId: string,
  itemId: string,
  performedByUid: string,
): Promise<void> {
  const comandaRef = doc(db, 'arenaComandas', comandaId);
  const itemRef = doc(itemsCol(db, comandaId), itemId);

  await runTransaction(db, async (txn) => {
    const comandaSnap = await txn.get(comandaRef);
    if (!comandaSnap.exists()) {
      throw new Error('Comanda não encontrada.');
    }
    const itemSnap = await txn.get(itemRef);
    if (!itemSnap.exists()) {
      throw new Error('Item não encontrado.');
    }

    const comanda = comandaFromDoc(comandaSnap.id, comandaSnap.data());
    const item = itemFromDoc(itemSnap.id, itemSnap.data());
    if (comanda.arenaId !== arenaId) {
      throw new Error('Comanda não pertence a esta arena.');
    }

    const blockReason = comandaItemReverseBlockReason(comanda, item);
    if (blockReason) {
      throw new Error(blockReason);
    }

    const productRef = doc(productsCol(db, arenaId), item.productId);
    const productSnap = await txn.get(productRef);

    if (productSnap.exists()) {
      const data = productSnap.data() as Record<string, unknown>;
      const before = typeof data['stockQuantity'] === 'number' ? data['stockQuantity'] : 0;
      const delta = signedDeltaForMovementType('adjustment', item.quantity);
      const after = before + delta;

      txn.set(doc(movementsCol(db, arenaId)), {
        productId: item.productId,
        productName: typeof data['name'] === 'string' ? data['name'] : item.productName,
        type: 'adjustment',
        quantityDelta: delta,
        quantityBefore: before,
        quantityAfter: after,
        createdByUid: performedByUid,
        note: `estorno comanda ${formatComandaNumber(comanda.displayNumber)}`,
        createdAt: serverTimestamp(),
      });
      txn.update(productRef, { stockQuantity: after, updatedAt: serverTimestamp() });
    }

    txn.delete(itemRef);

    const newItemsTotal = comanda.itemsTotalCents - item.lineTotalCents;
    const newItemsCount = Math.max(0, comanda.itemsCount - item.quantity);
    const newTotal = comanda.rentalCents + newItemsTotal;
    txn.update(comandaRef, {
      itemsTotalCents: newItemsTotal,
      itemsCount: newItemsCount,
      totalCents: newTotal,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Registra um pagamento; fecha a comanda automaticamente quando `paidCents` atinge o total. */
export async function registerPayment(
  db: Firestore,
  comandaId: string,
  method: ArenaComandaPaymentMethod,
  amountCents: number,
  payerName: string,
  receivedByUid: string,
): Promise<void> {
  if (amountCents <= 0) {
    throw new Error('Valor do pagamento inválido.');
  }
  const comandaRef = doc(db, 'arenaComandas', comandaId);

  await runTransaction(db, async (txn) => {
    const comandaSnap = await txn.get(comandaRef);
    if (!comandaSnap.exists()) {
      throw new Error('Comanda não encontrada.');
    }
    const comanda = comandaFromDoc(comandaSnap.id, comandaSnap.data());
    if (!comandaStatusIsActive(comanda.status)) {
      throw new Error('Comanda não está aberta para pagamento.');
    }

    txn.set(doc(paymentsCol(db, comandaId)), {
      method,
      amountCents,
      payerName,
      receivedByUid,
      createdAt: serverTimestamp(),
    });

    const newPaidCents = comanda.paidCents + amountCents;
    const newStatus: ArenaComandaStatus = newPaidCents >= comanda.totalCents ? 'closed' : 'partiallyPaid';
    txn.update(comandaRef, {
      paidCents: newPaidCents,
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
  });
}
