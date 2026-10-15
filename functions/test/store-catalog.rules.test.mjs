// Catálogo da Loja: leitura só para admin da plataforma, escrita só por callable.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/store-catalog.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-store-catalog-test';
const ADMIN = 'admin-uid';
const ORGANIZER = 'organizer-uid';
const ATHLETE = 'athlete-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

const asAdmin = () => testEnv.authenticatedContext(ADMIN, { roles: ['admin'] }).firestore();
const asOrganizer = () => testEnv.authenticatedContext(ORGANIZER, { roles: ['organizer'] }).firestore();
const asAthlete = () => testEnv.authenticatedContext(ATHLETE, { roles: ['athlete'] }).firestore();

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'storeProducts', 'p1'), {
      name: 'Camiseta Dry UV50 Areia',
      slug: 'camiseta-dry-uv50-areia',
      priceCents: 12990,
      status: 'ativo',
      version: 1,
    });
    await setDoc(doc(db, 'storeProducts', 'p1', 'skus', 'branco_p'), {
      code: 'NX-CAM-BRANCO-P',
      stock: 6,
    });
    await setDoc(doc(db, 'storeProductCosts', 'p1'), { costCents: 4820, updatedAt: new Date() });
    await setDoc(doc(db, 'storeCatalogKeys', 'slug:camiseta-dry-uv50-areia'), { productId: 'p1' });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('admin lê produto, SKU e custo', async () => {
  const db = asAdmin();
  await assertSucceeds(getDoc(doc(db, 'storeProducts', 'p1')));
  await assertSucceeds(getDoc(doc(db, 'storeProducts', 'p1', 'skus', 'branco_p')));
  await assertSucceeds(getDoc(doc(db, 'storeProductCosts', 'p1')));
});

test('organizador de torneio não lê nada do catálogo', async () => {
  const db = asOrganizer();
  await assertFails(getDoc(doc(db, 'storeProducts', 'p1')));
  await assertFails(getDoc(doc(db, 'storeProductCosts', 'p1')));
});

test('atleta logado não lê o custo', async () => {
  await assertFails(getDoc(doc(asAthlete(), 'storeProductCosts', 'p1')));
});

test('nem o admin escreve direto: escrita é só por callable', async () => {
  const db = asAdmin();
  await assertFails(setDoc(doc(db, 'storeProducts', 'p1'), { name: 'x' }));
  await assertFails(setDoc(doc(db, 'storeProducts', 'p1', 'skus', 'branco_p'), { stock: 1 }));
  await assertFails(setDoc(doc(db, 'storeProductCosts', 'p1'), { costCents: 1 }));
});

test('ninguém enxerga a coleção de chaves de unicidade', async () => {
  await assertFails(getDoc(doc(asAdmin(), 'storeCatalogKeys', 'slug:camiseta-dry-uv50-areia')));
});
