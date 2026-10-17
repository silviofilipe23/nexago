import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

/**
 * Checkout da Loja: endereços e a visão do pedido são do dono e de mais ninguém; o pedido de
 * verdade (`storeOrders`, com CPF e código de retirada) e o uso de cupom continuam só do servidor.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-store-checkout-test';
const DONO = 'atleta-uid';
const OUTRO = 'outro-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

const endereco = (id, extra = {}) => ({
  id, label: 'Casa', recipient: 'Ana', phone: '11999990000', zip: '01310100',
  street: 'Av. Paulista', number: '1000', complement: '', district: 'Bela Vista',
  city: 'São Paulo', uf: 'SP', ...extra,
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'storeOrderViews', 'ord_dono_1'), { uid: DONO, number: 'NX-1', createdAt: new Date() });
    await setDoc(doc(db, 'storeOrderViews', 'ord_outro_1'), { uid: OUTRO, number: 'NX-2', createdAt: new Date() });
    await setDoc(doc(db, 'storeOrders', 'ord_dono_1'), { uid: DONO, buyer: { cpf: '00000000000' } });
    await setDoc(doc(db, 'storeAddresses', OUTRO), { items: [endereco('a1')] });
    await setDoc(doc(db, 'storeCouponUses', 'c1_' + DONO), { uses: 1 });
  });
});

after(async () => { await testEnv.cleanup(); });

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

test('endereços: o dono grava e lê; ninguém mais', async () => {
  const ref = doc(dbOf(DONO), 'storeAddresses', DONO);
  await assertSucceeds(setDoc(ref, { items: [endereco('a1'), endereco('a2', { main: true })], updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(ref));
  await assertFails(getDoc(doc(dbOf(DONO), 'storeAddresses', OUTRO)));
  await assertFails(setDoc(doc(dbOf(DONO), 'storeAddresses', OUTRO), { items: [] }));
  await assertFails(getDoc(doc(anon(), 'storeAddresses', DONO)));
});

test('endereços: forma conferida em todas as posições, teto de 10', async () => {
  const ref = doc(dbOf(DONO), 'storeAddresses', DONO);
  await assertFails(setDoc(ref, { items: [endereco('a1'), endereco('a2', { uf: 'SAO' })] }));
  await assertFails(setDoc(ref, { items: [endereco('a1'), 'Av. Paulista, 1000'] }));
  await assertFails(setDoc(ref, { items: [endereco('a1'), endereco('')] }));
  await assertFails(setDoc(ref, { items: [endereco('a1')], cpf: '123' }));
  const onze = Array.from({ length: 11 }, (_, i) => endereco('a' + i));
  await assertFails(setDoc(ref, { items: onze }));
  await assertSucceeds(setDoc(ref, { items: onze.slice(0, 10) }));
  await assertSucceeds(setDoc(ref, { items: [] }));
});

test('visão do pedido: só o dono lê, e ninguém escreve', async () => {
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'storeOrderViews', 'ord_dono_1')));
  await assertFails(getDoc(doc(dbOf(DONO), 'storeOrderViews', 'ord_outro_1')));
  await assertFails(getDoc(doc(anon(), 'storeOrderViews', 'ord_dono_1')));
  await assertSucceeds(getDocs(query(
    collection(dbOf(DONO), 'storeOrderViews'), where('uid', '==', DONO), orderBy('createdAt', 'desc'),
  )));
  await assertFails(getDocs(collection(dbOf(DONO), 'storeOrderViews')));
  await assertFails(setDoc(doc(dbOf(DONO), 'storeOrderViews', 'ord_dono_1'), { uid: DONO, status: 'ent' }));
  await assertFails(setDoc(doc(dbOf(DONO), 'storeOrderViews', 'ord_novo_1'), { uid: DONO }));
});

test('pedido de verdade e uso de cupom seguem fechados', async () => {
  await assertFails(getDoc(doc(dbOf(DONO), 'storeOrders', 'ord_dono_1')));
  await assertFails(getDoc(doc(dbOf(DONO), 'storeCouponUses', 'c1_' + DONO)));
  await assertFails(setDoc(doc(dbOf(DONO), 'storeCouponUses', 'c1_' + DONO), { uses: 0 }));
});
