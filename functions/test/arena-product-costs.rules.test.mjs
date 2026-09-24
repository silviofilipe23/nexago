import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-arena-product-costs-test';
const OWNER = 'owner-uid';
const RECEPCAO = 'recepcao-uid';
const ATLETA = 'atleta-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

/** O custo do produto mora em `productCosts`, fora do doc do produto, porque
 *  `products` é o cardápio e qualquer usuário logado lê. Estes testes guardam
 *  exatamente essa fronteira. */
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-pro'), {
      managerUserId: OWNER,
      name: 'Arena Pro',
      planTier: 'pro',
      planStatus: 'active',
      courtsCount: 3,
    });
    await setDoc(doc(db, 'arenas', 'arena-sem-plano'), {
      managerUserId: OWNER,
      name: 'Arena Sem Plano',
      courtsCount: 1,
    });
    for (const arenaId of ['arena-pro', 'arena-sem-plano']) {
      await setDoc(doc(db, 'arenas', arenaId, 'staff', RECEPCAO), {
        role: 'recepcao',
        status: 'active',
        email: 'recepcao@arena.com',
        displayName: 'Recepção',
        addedBy: OWNER,
      });
      await setDoc(doc(db, 'arenas', arenaId, 'products', 'agua'), {
        name: 'Água mineral 500ml',
        nameLower: 'água mineral 500ml',
        category: 'bebidas',
        active: true,
        priceCents: 1000,
        stockQuantity: 10,
        minStockQuantity: 2,
      });
      await setDoc(doc(db, 'arenas', arenaId, 'productCosts', 'agua'), {
        costCents: 400,
        updatedAt: new Date(),
      });
    }
  });
}

before(async () => {
  await testEnv.clearFirestore();
  await seed();
});

after(async () => {
  await testEnv.cleanup();
});

test('atleta logado lê o cardápio mas não enxerga o custo', async () => {
  const db = testEnv.authenticatedContext(ATLETA).firestore();
  await assertSucceeds(getDoc(doc(db, 'arenas', 'arena-pro', 'products', 'agua')));
  await assertFails(getDoc(doc(db, 'arenas', 'arena-pro', 'productCosts', 'agua')));
});

test('visitante sem login não lê o custo', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'arenas', 'arena-pro', 'productCosts', 'agua')));
});

test('dono da arena lê e grava o custo', async () => {
  const db = testEnv.authenticatedContext(OWNER).firestore();
  await assertSucceeds(getDoc(doc(db, 'arenas', 'arena-pro', 'productCosts', 'agua')));
  await assertSucceeds(
    setDoc(doc(db, 'arenas', 'arena-pro', 'productCosts', 'agua'), {
      costCents: 450,
      updatedAt: serverTimestamp(),
    }),
  );
});

test('dono da arena apaga o custo quando o campo é esvaziado', async () => {
  const db = testEnv.authenticatedContext(OWNER).firestore();
  await assertSucceeds(deleteDoc(doc(db, 'arenas', 'arena-pro', 'productCosts', 'efemero')));
});

test('recepção lê o custo (lê estoque) mas não grava', async () => {
  const db = testEnv.authenticatedContext(RECEPCAO).firestore();
  await assertSucceeds(getDoc(doc(db, 'arenas', 'arena-pro', 'productCosts', 'agua')));
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-pro', 'productCosts', 'agua'), {
      costCents: 1,
      updatedAt: serverTimestamp(),
    }),
  );
});

test('arena sem plano não grava custo, como já não edita o catálogo', async () => {
  const db = testEnv.authenticatedContext(OWNER).firestore();
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-sem-plano', 'productCosts', 'agua'), {
      costCents: 450,
      updatedAt: serverTimestamp(),
    }),
  );
});

test('custo negativo é rejeitado', async () => {
  const db = testEnv.authenticatedContext(OWNER).firestore();
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-pro', 'productCosts', 'agua'), {
      costCents: -1,
      updatedAt: serverTimestamp(),
    }),
  );
});

test('campo fora do contrato é rejeitado', async () => {
  const db = testEnv.authenticatedContext(OWNER).firestore();
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-pro', 'productCosts', 'agua'), {
      costCents: 400,
      updatedAt: serverTimestamp(),
      margemFake: 0.9,
    }),
  );
});
