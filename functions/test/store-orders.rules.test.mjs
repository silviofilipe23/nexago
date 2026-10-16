// Pedidos da Loja: só o backoffice lê (CPF, telefone, endereço); ninguém escreve direto.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/store-orders.rules.test.mjs"
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
  projectId: 'nexago-store-orders-test',
  firestore: { rules },
});

const asAdmin = () => testEnv.authenticatedContext('admin-uid', { roles: ['admin'] }).firestore();
const asAthlete = () => testEnv.authenticatedContext('athlete-uid', { roles: ['athlete'] }).firestore();

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'storeOrders', 'o1'), { number: 'NX-0001', status: 'ret', customer: { uid: 'athlete-uid' } });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('admin lê o pedido', async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), 'storeOrders', 'o1')));
});

test('nem o próprio cliente lê o doc do backoffice (código de retirada, CPF)', async () => {
  await assertFails(getDoc(doc(asAthlete(), 'storeOrders', 'o1')));
});

test('ninguém escreve direto: status e reserva só por callable', async () => {
  await assertFails(setDoc(doc(asAdmin(), 'storeOrders', 'o1'), { status: 'rtd' }));
  await assertFails(setDoc(doc(asAthlete(), 'storeOrders', 'o2'), { status: 'sep' }));
});
