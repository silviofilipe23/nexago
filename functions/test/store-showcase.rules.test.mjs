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
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

/**
 * Vitrine da Loja: o espelho e a config são públicos (o visitante deslogado vê a vitrine);
 * favoritos, arena de retirada e carrinho são do dono e de mais ninguém. O catálogo de
 * verdade (`storeProducts`) continua fechado — ele leva autor, alerta e saldo por local.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-store-showcase-test';
const DONO = 'atleta-uid';
const OUTRO = 'outro-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'storeShowcase', 'p1'), { name: 'Bola', channels: { app: true, web: true } });
    await setDoc(doc(db, 'storePublic', 'showcase'), { banners: [] });
    await setDoc(doc(db, 'storeProducts', 'p1'), { name: 'Bola', updatedBy: { uid: 'admin' } });
    await setDoc(doc(db, 'storeShoppers', DONO), { favoriteIds: ['p1'] });
    await setDoc(doc(db, 'storeCarts', DONO), { items: [] });
  });
});

after(async () => { await testEnv.cleanup(); });

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

test('vitrine é pública, inclusive a consulta por canal', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'storeShowcase', 'p1')));
  await assertSucceeds(getDocs(query(collection(anon(), 'storeShowcase'), where('channels.web', '==', true))));
  await assertSucceeds(getDoc(doc(anon(), 'storePublic', 'showcase')));
});

test('ninguém grava na vitrine pelo cliente', async () => {
  await assertFails(setDoc(doc(dbOf(DONO), 'storeShowcase', 'p1'), { name: 'Grátis', priceCents: 1 }));
  await assertFails(setDoc(doc(dbOf(DONO), 'storePublic', 'showcase'), { banners: [] }));
});

test('o catálogo de verdade segue fechado para o atleta', async () => {
  await assertFails(getDoc(doc(dbOf(DONO), 'storeProducts', 'p1')));
  await assertFails(getDoc(doc(anon(), 'storeProducts', 'p1')));
});

test('dono lê e grava favoritos, arena e buscas recentes', async () => {
  const db = dbOf(DONO);
  await assertSucceeds(getDoc(doc(db, 'storeShoppers', DONO)));
  await assertSucceeds(setDoc(
    doc(db, 'storeShoppers', DONO),
    { favoriteIds: arrayUnion('p2'), pickupArenaId: 'a1', recentSearches: ['bola'], updatedAt: serverTimestamp() },
    { merge: true },
  ));
  await assertSucceeds(updateDoc(doc(db, 'storeShoppers', DONO), { pickupArenaId: null }));
});

test('outro atleta e anônimo não leem nem gravam as preferências', async () => {
  await assertFails(getDoc(doc(dbOf(OUTRO), 'storeShoppers', DONO)));
  await assertFails(getDoc(doc(anon(), 'storeShoppers', DONO)));
  await assertFails(setDoc(doc(dbOf(OUTRO), 'storeShoppers', DONO), { favoriteIds: [] }));
});

test('preferências não aceitam campo estranho nem lista sem teto', async () => {
  const db = dbOf(DONO);
  await assertFails(setDoc(doc(db, 'storeShoppers', DONO), { vip: true }, { merge: true }));
  await assertFails(setDoc(
    doc(db, 'storeShoppers', DONO),
    { recentSearches: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { merge: true },
  ));
});

test('carrinho: só o dono, só itens, com teto', async () => {
  const db = dbOf(DONO);
  const item = { productId: 'p1', skuId: 'unico', qty: 1 };
  await assertSucceeds(setDoc(doc(db, 'storeCarts', DONO), { items: [item], updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'storeCarts', DONO), { items: [item], totalCents: 1 }));
  await assertFails(setDoc(doc(db, 'storeCarts', DONO), { items: Array.from({ length: 31 }, () => item) }));
  await assertFails(getDoc(doc(dbOf(OUTRO), 'storeCarts', DONO)));
  await assertFails(setDoc(doc(dbOf(OUTRO), 'storeCarts', DONO), { items: [] }));
});
