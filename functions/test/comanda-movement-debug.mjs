import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
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

async function tryOp(label, fn) {
  await testEnv.clearFirestore();
  await seedBase();
  const ctx = testEnv.authenticatedContext(MANAGER_UID);
  const db = ctx.firestore();
  try {
    await fn(db);
    console.log('PASS', label);
  } catch (e) {
    console.log('FAIL', label, e.code, e.message.split('\n')[0]);
  }
}

await tryOp('txn product update only', async (db) => {
  await runTransaction(db, async (txn) => {
    txn.update(doc(db, 'arenas', ARENA_ID, 'products', PRODUCT_ID), {
      stockQuantity: 9,
      updatedAt: serverTimestamp(),
    });
  });
});

await tryOp('txn movement then product (Date ts)', async (db) => {
  const now = Timestamp.now();
  await runTransaction(db, async (txn) => {
    txn.set(doc(db, 'arenas', ARENA_ID, 'stockMovements', 'mov-1'), {
      productId: PRODUCT_ID,
      productName: 'Agua',
      type: 'sale',
      quantityDelta: -1,
      quantityBefore: 10,
      quantityAfter: 9,
      createdByUid: MANAGER_UID,
      createdAt: now,
    });
    txn.update(doc(db, 'arenas', ARENA_ID, 'products', PRODUCT_ID), {
      stockQuantity: 9,
      updatedAt: now,
    });
  });
});

await tryOp('txn product then movement', async (db) => {
  await runTransaction(db, async (txn) => {
    txn.update(doc(db, 'arenas', ARENA_ID, 'products', PRODUCT_ID), {
      stockQuantity: 9,
      updatedAt: serverTimestamp(),
    });
    txn.set(doc(db, 'arenas', ARENA_ID, 'stockMovements', 'mov-2'), {
      productId: PRODUCT_ID,
      productName: 'Agua',
      type: 'sale',
      quantityDelta: -1,
      quantityBefore: 10,
      quantityAfter: 9,
      createdByUid: MANAGER_UID,
      createdAt: serverTimestamp(),
    });
  });
});

await tryOp('movement with matching stock no txn', async (db) => {
  await updateDoc(doc(db, 'arenas', ARENA_ID, 'products', PRODUCT_ID), {
    stockQuantity: 9,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'arenas', ARENA_ID, 'stockMovements', 'mov-3'), {
    productId: PRODUCT_ID,
    productName: 'Agua',
    type: 'sale',
    quantityDelta: -1,
    quantityBefore: 9,
    quantityAfter: 8,
    createdByUid: MANAGER_UID,
    createdAt: serverTimestamp(),
  });
});

await testEnv.cleanup();
