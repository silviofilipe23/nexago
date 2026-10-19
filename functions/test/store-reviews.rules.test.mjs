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
  setDoc,
  where,
} from 'firebase/firestore';

/**
 * Avaliação da compra da Loja: o doc da avaliação (com uid e pedido) é só do dono; o público lê o
 * espelho em storeShowcase/{id}/reviews; o agregado e as escritas são do servidor.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const DONO = 'atleta-uid';
const OUTRO = 'outro-uid';

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-store-reviews-test',
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'storeOrderReviews', 'ord_dono'), { uid: DONO, orderId: 'ord_dono', items: [] });
    await setDoc(doc(db, 'storeOrderReviews', 'ord_outro'), { uid: OUTRO, orderId: 'ord_outro', items: [] });
    await setDoc(doc(db, 'storeShowcase', 'cam'), { name: 'Camiseta' });
    await setDoc(doc(db, 'storeShowcase', 'cam', 'reviews', 'r1'), { rating: 5, createdAt: new Date() });
    await setDoc(doc(db, 'storeProductRatings', 'cam'), { count: 1, sum: 5 });
  });
});

after(async () => { await testEnv.cleanup(); });

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

test('avaliação do pedido: o dono lê a dele (e sabe que ainda não existe); ninguém grava', async () => {
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'storeOrderReviews', 'ord_dono')));
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'storeOrderReviews', 'ord_nova')));
  await assertSucceeds(getDocs(query(collection(dbOf(DONO), 'storeOrderReviews'), where('uid', '==', DONO))));
  await assertFails(getDoc(doc(dbOf(DONO), 'storeOrderReviews', 'ord_outro')));
  await assertFails(getDocs(collection(dbOf(DONO), 'storeOrderReviews')));
  await assertFails(getDoc(doc(anon(), 'storeOrderReviews', 'ord_dono')));
  await assertFails(setDoc(doc(dbOf(DONO), 'storeOrderReviews', 'ord_dono'), { uid: DONO, items: [{ rating: 5 }] }));
});

test('avaliação do pedido: o backoffice lê todas (moderação), mas também não grava', async () => {
  const admin = testEnv.authenticatedContext('admin-uid', { roles: ['admin'] }).firestore();
  const superAdmin = testEnv.authenticatedContext('super-uid', { superAdmin: true }).firestore();
  const organizer = testEnv.authenticatedContext('org-uid', { roles: ['organizer'] }).firestore();
  await assertSucceeds(getDocs(query(collection(admin, 'storeOrderReviews'), orderBy('updatedAt', 'desc'))));
  await assertSucceeds(getDoc(doc(admin, 'storeOrderReviews', 'ord_outro')));
  await assertSucceeds(getDocs(collection(superAdmin, 'storeOrderReviews')));
  await assertFails(getDocs(collection(organizer, 'storeOrderReviews')));
  await assertFails(setDoc(doc(admin, 'storeOrderReviews', 'ord_dono'), { uid: DONO, items: [] }));
});

test('espelho público: qualquer um lê, ninguém grava', async () => {
  await assertSucceeds(getDocs(query(collection(anon(), 'storeShowcase', 'cam', 'reviews'), orderBy('createdAt', 'desc'))));
  await assertFails(setDoc(doc(dbOf(DONO), 'storeShowcase', 'cam', 'reviews', 'r2'), { rating: 5 }));
});

test('agregado do produto: fora do alcance do atleta', async () => {
  await assertFails(getDoc(doc(dbOf(DONO), 'storeProductRatings', 'cam')));
  await assertFails(setDoc(doc(dbOf(DONO), 'storeProductRatings', 'cam'), { count: 99, sum: 495 }));
});
