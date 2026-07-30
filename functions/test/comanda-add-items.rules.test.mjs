import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
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
    // Comanda/estoque são capabilities Pro+: sem planTier/planStatus a arena
    // não é "entitled" e todo create abaixo bate em PERMISSION_DENIED.
    await setDoc(doc(db, 'arenas', ARENA_ID), {
      managerUserId: MANAGER_UID,
      name: 'Arena Test',
      planTier: 'pro',
      planStatus: 'active',
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

after(() => testEnv.cleanup());

// Cada probe roda isolado: limpa e ressemeia o Firestore antes de agir, para
// que a escrita de um teste anterior não mascare a regra sob teste. A falha
// precisa propagar (assertSucceeds dentro de test()) — capturar em try/catch e
// só logar faz o runner reportar o arquivo inteiro como verde.
function probe(label, fn) {
  test(label, async () => {
    await testEnv.clearFirestore();
    await seedBase();
    await assertSucceeds(fn());
  });
}

probe('item create', async () => {
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

probe('stock movement create', async () => {
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

probe('product stock update', async () => {
  const db = managerCtx().firestore();
  await updateDoc(doc(db, 'arenas', ARENA_ID, 'products', PRODUCT_ID), {
    stockQuantity: 9,
    updatedAt: serverTimestamp(),
  });
});

probe('comanda totals update', async () => {
  const db = managerCtx().firestore();
  await updateDoc(doc(db, 'arenaComandas', COMANDA_ID), {
    itemsTotalCents: 500,
    itemsCount: 1,
    totalCents: 500,
    updatedAt: serverTimestamp(),
  });
});

probe('movement + product update transaction', async () => {
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

probe('full addItemsBatch transaction', runAddItemsTransaction);

probe('reverse comanda item transaction', async () => {
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

// Contraprova do gate: sem titularidade Pro a comanda fica read-only. Sem
// isto, um seed sem planTier faria todos os probes acima falharem em silêncio.
test('item create bloqueado sem titularidade Pro', async () => {
  await testEnv.clearFirestore();
  await seedBase();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), 'arenas', ARENA_ID),
      { planTier: 'starter' },
      { merge: true },
    );
  });

  const db = managerCtx().firestore();
  await assertFails(
    setDoc(doc(db, 'arenaComandas', COMANDA_ID, 'items', 'item-gated'), {
      productId: PRODUCT_ID,
      productName: 'Agua',
      quantity: 1,
      unitPriceCents: 500,
      lineTotalCents: 500,
      source: 'counter',
      addedByName: 'Gestor',
      addedByUid: MANAGER_UID,
      createdAt: serverTimestamp(),
    }),
  );
});
