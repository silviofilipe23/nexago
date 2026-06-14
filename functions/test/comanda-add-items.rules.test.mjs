import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(
  path.join(__dirname, '../../firestore.rules'),
  'utf8',
);

const PROJECT_ID = 'nexago-rules-test';
const MANAGER_UID = 'manager-uid-1';
const ARENA_ID = 'arena-1';
const COMANDA_ID = 'comanda-1';
const PRODUCT_ID = 'product-1';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

function managerCtx() {
  return testEnv.authenticatedContext(MANAGER_UID);
}

async function seedBase() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', ARENA_ID), {
      managerUserId: MANAGER_UID,
      name: 'Arena Test',
    });
    await setDoc(doc(db, 'arenaComandas', COMANDA_ID), {
      arenaId: ARENA_ID,
      displayNumber: 1,
      type: 'individual',
      status: 'open',
      customerName: 'Cliente',
      allowAppOrders: false,
      rentalCents: 0,
      itemsTotalCents: 0,
      totalCents: 0,
      itemsCount: 0,
      paidCents: 0,
      openedByUid: MANAGER_UID,
      openedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'arenas', ARENA_ID, 'products', PRODUCT_ID), {
      name: 'Agua',
      nameLower: 'agua',
      category: 'bebidas',
      active: true,
      priceCents: 500,
      stockQuantity: 10,
      minStockQuantity: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
}

async function runAddItemsTransaction() {
  const ctx = managerCtx();
  const db = ctx.firestore();
  const comandaRef = doc(db, 'arenaComandas', COMANDA_ID);
  const productRef = doc(db, 'arenas', ARENA_ID, 'products', PRODUCT_ID);

  await runTransaction(db, async (txn) => {
    const comandaSnap = await txn.get(comandaRef);
    const productSnap = await txn.get(productRef);
    const before = productSnap.data().stockQuantity;
    const quantity = 1;
    const delta = -quantity;
    const after = before + delta;
    const unitPriceCents = productSnap.data().priceCents;
    const lineTotalCents = unitPriceCents * quantity;

    txn.set(doc(db, 'arenaComandas', COMANDA_ID, 'items', 'item-1'), {
      productId: PRODUCT_ID,
      productName: 'Agua',
      quantity,
      unitPriceCents,
      lineTotalCents,
      source: 'counter',
      addedByName: 'Gestor',
      addedByUid: MANAGER_UID,
      createdAt: serverTimestamp(),
    });

    txn.set(doc(db, 'arenas', ARENA_ID, 'stockMovements', 'mov-1'), {
      productId: PRODUCT_ID,
      productName: 'Agua',
      type: 'sale',
      quantityDelta: delta,
      quantityBefore: before,
      quantityAfter: after,
      createdByUid: MANAGER_UID,
      note: 'comanda 001',
      createdAt: serverTimestamp(),
    });

    txn.update(productRef, {
      stockQuantity: after,
      updatedAt: serverTimestamp(),
    });

    const comanda = comandaSnap.data();
    txn.update(comandaRef, {
      itemsTotalCents: comanda.itemsTotalCents + lineTotalCents,
      itemsCount: comanda.itemsCount + quantity,
      totalCents: comanda.rentalCents + comanda.itemsTotalCents + lineTotalCents,
      updatedAt: serverTimestamp(),
    });
  });
}

async function probeIsolated(label, fn) {
  await testEnv.clearFirestore();
  await seedBase();
  try {
    await assertSucceeds(fn());
    console.log(`PASS ${label}`);
  } catch (e) {
    console.log(`FAIL ${label}: ${e.message}`);
  }
}

await probeIsolated('item create', async () => {
  const db = managerCtx().firestore();
  await setDoc(doc(db, 'arenaComandas', COMANDA_ID, 'items', 'item-only'), {
    productId: PRODUCT_ID,
    productName: 'Agua',
    quantity: 1,
    unitPriceCents: 500,
    lineTotalCents: 500,
    source: 'counter',
    addedByName: 'Gestor',
    addedByUid: MANAGER_UID,
    createdAt: serverTimestamp(),
  });
});

await probeIsolated('stock movement create', async () => {
  const db = managerCtx().firestore();
  await setDoc(doc(db, 'arenas', ARENA_ID, 'stockMovements', 'mov-only'), {
    productId: PRODUCT_ID,
    productName: 'Agua',
    type: 'sale',
    quantityDelta: -1,
    quantityBefore: 10,
    quantityAfter: 9,
    createdByUid: MANAGER_UID,
    note: 'comanda 001',
    createdAt: serverTimestamp(),
  });
});

await probeIsolated('product stock update', async () => {
  const db = managerCtx().firestore();
  await updateDoc(doc(db, 'arenas', ARENA_ID, 'products', PRODUCT_ID), {
    stockQuantity: 9,
    updatedAt: serverTimestamp(),
  });
});

await probeIsolated('comanda totals update', async () => {
  const db = managerCtx().firestore();
  await updateDoc(doc(db, 'arenaComandas', COMANDA_ID), {
    itemsTotalCents: 500,
    itemsCount: 1,
    totalCents: 500,
    updatedAt: serverTimestamp(),
  });
});

await probeIsolated('movement + product update transaction', async () => {
  const db = managerCtx().firestore();
  const productRef = doc(db, 'arenas', ARENA_ID, 'products', PRODUCT_ID);
  await runTransaction(db, async (txn) => {
    txn.set(doc(db, 'arenas', ARENA_ID, 'stockMovements', 'mov-txn'), {
      productId: PRODUCT_ID,
      productName: 'Agua',
      type: 'sale',
      quantityDelta: -1,
      quantityBefore: 10,
      quantityAfter: 9,
      createdByUid: MANAGER_UID,
      createdAt: serverTimestamp(),
    });
    txn.update(productRef, {
      stockQuantity: 9,
      updatedAt: serverTimestamp(),
    });
  });
});

await probeIsolated('full addItemsBatch transaction', runAddItemsTransaction);

await probeIsolated('reverse comanda item transaction', async () => {
  const db = managerCtx().firestore();
  const comandaRef = doc(db, 'arenaComandas', COMANDA_ID);
  const productRef = doc(db, 'arenas', ARENA_ID, 'products', PRODUCT_ID);
  const itemRef = doc(db, 'arenaComandas', COMANDA_ID, 'items', 'item-1');

  await setDoc(itemRef, {
    productId: PRODUCT_ID,
    productName: 'Agua',
    quantity: 1,
    unitPriceCents: 500,
    lineTotalCents: 500,
    source: 'counter',
    addedByName: 'Gestor',
    addedByUid: MANAGER_UID,
    createdAt: serverTimestamp(),
  });
  await updateDoc(comandaRef, {
    itemsTotalCents: 500,
    itemsCount: 1,
    totalCents: 500,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(productRef, {
    stockQuantity: 9,
    updatedAt: serverTimestamp(),
  });

  await runTransaction(db, async (txn) => {
    txn.delete(itemRef);
    txn.set(doc(db, 'arenas', ARENA_ID, 'stockMovements', 'mov-reverse'), {
      productId: PRODUCT_ID,
      productName: 'Agua',
      type: 'adjustment',
      quantityDelta: 1,
      quantityBefore: 9,
      quantityAfter: 10,
      createdByUid: MANAGER_UID,
      note: 'estorno comanda 0001',
      createdAt: serverTimestamp(),
    });
    txn.update(productRef, {
      stockQuantity: 10,
      updatedAt: serverTimestamp(),
    });
    txn.update(comandaRef, {
      itemsTotalCents: 0,
      itemsCount: 0,
      totalCents: 0,
      updatedAt: serverTimestamp(),
    });
  });
});

await testEnv.cleanup();
