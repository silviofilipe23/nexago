// Pontos de retirada e regras de frete da Loja: leitura só para admin, escrita só por callable.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/store-pickup.rules.test.mjs"
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
  projectId: 'nexago-store-pickup-test',
  firestore: { rules },
});

const asAdmin = () => testEnv.authenticatedContext('admin-uid', { roles: ['admin'] }).firestore();
const asArenaManager = () =>
  testEnv.authenticatedContext('manager-uid', { roles: ['arena_manager'] }).firestore();

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'storePickupPoints', 'a1'), { arenaId: 'a1', active: true, commissionPct: null });
    await setDoc(doc(db, 'storeConfig', 'shipping'), { freeShippingAboveCents: 39900 });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('admin lê ponto de retirada e config de frete', async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), 'storePickupPoints', 'a1')));
  await assertSucceeds(getDoc(doc(asAdmin(), 'storeConfig', 'shipping')));
});

test('gestor de arena não lê a comissão nem a config', async () => {
  await assertFails(getDoc(doc(asArenaManager(), 'storePickupPoints', 'a1')));
  await assertFails(getDoc(doc(asArenaManager(), 'storeConfig', 'shipping')));
});

test('nem o admin escreve direto: escrita é só por callable', async () => {
  await assertFails(setDoc(doc(asAdmin(), 'storePickupPoints', 'a1'), { active: false }));
  await assertFails(setDoc(doc(asAdmin(), 'storeConfig', 'shipping'), { freeShippingAboveCents: 0 }));
});
