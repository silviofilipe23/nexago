// Personalizados da Loja: leitura só para admin, escrita só por callable.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/store-custom.rules.test.mjs"
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

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-store-custom-test',
  firestore: { rules },
});

const asAdmin = () => testEnv.authenticatedContext('admin-uid', { roles: ['admin'] }).firestore();
const asAthlete = () => testEnv.authenticatedContext('athlete-uid', { roles: ['athlete'] }).firestore();

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'storeProductCustomization', 'p1'), { active: true });
    await setDoc(doc(db, 'storeCustomItems', 'i1'), { status: 'aprovar', customer: { uid: 'athlete-uid' } });
    await setDoc(doc(db, 'storeCustomBatches', 'b1'), { itemIds: ['i1'] });
    await setDoc(doc(db, 'storeConfig', 'blocklist'), { terms: ['x'] });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('admin lê config, fila, lotes e lista de bloqueio', async () => {
  const db = asAdmin();
  await assertSucceeds(getDoc(doc(db, 'storeProductCustomization', 'p1')));
  await assertSucceeds(getDoc(doc(db, 'storeCustomItems', 'i1')));
  await assertSucceeds(getDoc(doc(db, 'storeCustomBatches', 'b1')));
  await assertSucceeds(getDoc(doc(db, 'storeConfig', 'blocklist')));
});

test('atleta não lê a fila (nem o próprio item, por enquanto)', async () => {
  await assertFails(getDoc(doc(asAthlete(), 'storeCustomItems', 'i1')));
  await assertFails(getDoc(doc(asAthlete(), 'storeConfig', 'blocklist')));
});

test('ninguém escreve direto', async () => {
  const db = asAdmin();
  await assertFails(setDoc(doc(db, 'storeProductCustomization', 'p1'), { active: false }));
  await assertFails(setDoc(doc(db, 'storeCustomItems', 'i1'), { status: 'producao' }));
  await assertFails(setDoc(doc(db, 'storeCustomBatches', 'b1'), { itemIds: [] }));
});
