// Cupons da Loja: leitura só para admin, escrita só por callable, chaves invisíveis.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/store-coupons.rules.test.mjs"
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
  projectId: 'nexago-store-coupons-test',
  firestore: { rules },
});

const asAdmin = () => testEnv.authenticatedContext('admin-uid', { roles: ['admin'] }).firestore();
const asAthlete = () => testEnv.authenticatedContext('athlete-uid', { roles: ['athlete'] }).firestore();

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'storeCoupons', 'c1'), { code: 'VERAO26', uses: 3 });
    await setDoc(doc(db, 'storeCouponCodes', 'VERAO26'), { couponId: 'c1' });
    await setDoc(doc(db, 'storeConfig', 'discounts'), { rules: [] });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('admin lê cupom e descontos automáticos', async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), 'storeCoupons', 'c1')));
  await assertSucceeds(getDoc(doc(asAdmin(), 'storeConfig', 'discounts')));
});

test('atleta não lê cupom (não dá pra listar códigos)', async () => {
  await assertFails(getDoc(doc(asAthlete(), 'storeCoupons', 'c1')));
});

test('ninguém escreve direto nem lê as chaves de código', async () => {
  await assertFails(setDoc(doc(asAdmin(), 'storeCoupons', 'c1'), { uses: 0 }));
  await assertFails(getDoc(doc(asAdmin(), 'storeCouponCodes', 'VERAO26')));
  await assertFails(setDoc(doc(asAdmin(), 'storeConfig', 'discounts'), { rules: [] }));
});
