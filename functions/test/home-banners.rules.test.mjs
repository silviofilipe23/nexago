// Banner de novidades da Home: a fonte (appAdminConfig/homeBanners) e os contadores são só do
// admin e só o servidor grava; o app lê o espelho (appConfig/homeBanners) e marca, uma vez cada,
// o que o atleta fez com o banner (users/{uid}/homeBanners/{id}).
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/home-banners.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-home-banners-test',
  firestore: { rules },
});

const asAdmin = () => testEnv.authenticatedContext('admin-uid', { roles: ['admin'] }).firestore();
const asAthlete = () => testEnv.authenticatedContext('athlete-uid', { roles: ['athlete'] }).firestore();
const BANNER = { id: 'bora-jogar', title: 'Bora Jogar', published: true, active: true };

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'appAdminConfig', 'homeBanners'), { banners: [BANNER], version: 1 });
    await setDoc(doc(db, 'appConfig', 'homeBanners'), { banners: [BANNER], version: 1 });
    await setDoc(doc(db, 'homeBannerStats', 'bora-jogar'), { seen: 10, clicked: 2 });
    await setDoc(doc(db, 'users', 'athlete-uid', 'homeBanners', 'ja-visto'), {
      seenAt: Timestamp.fromDate(new Date('2026-10-20T12:00:00Z')),
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('admin lê a fonte e os contadores; atleta não', async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), 'appAdminConfig', 'homeBanners')));
  await assertSucceeds(getDoc(doc(asAdmin(), 'homeBannerStats', 'bora-jogar')));
  await assertFails(getDoc(doc(asAthlete(), 'appAdminConfig', 'homeBanners')));
  await assertFails(getDoc(doc(asAthlete(), 'homeBannerStats', 'bora-jogar')));
});

test('nem o admin grava fonte, espelho ou contador direto: só a callable e o gatilho', async () => {
  await assertFails(setDoc(doc(asAdmin(), 'appAdminConfig', 'homeBanners'), { banners: [], version: 2 }));
  await assertFails(setDoc(doc(asAdmin(), 'appConfig', 'homeBanners'), { banners: [] }));
  await assertFails(setDoc(doc(asAthlete(), 'homeBannerStats', 'bora-jogar'), { seen: 9999 }));
});

test('o espelho é lido por quem está logado, não por visitante', async () => {
  await assertSucceeds(getDoc(doc(asAthlete(), 'appConfig', 'homeBanners')));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'appConfig', 'homeBanners')));
});

test('atleta marca o próprio banner com a hora do servidor', async () => {
  const ref = doc(asAthlete(), 'users', 'athlete-uid', 'homeBanners', 'bora-jogar');
  await assertSucceeds(setDoc(ref, { seenAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { clickedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(ref));
});

test('marca com hora do cliente, campo estranho ou id malformado é recusada', async () => {
  const db = asAthlete();
  await assertFails(
    setDoc(doc(db, 'users', 'athlete-uid', 'homeBanners', 'b2'), {
      seenAt: Timestamp.fromDate(new Date('2020-01-01')),
    }),
  );
  await assertFails(setDoc(doc(db, 'users', 'athlete-uid', 'homeBanners', 'b3'), { seenAt: serverTimestamp(), views: 5 }));
  await assertFails(setDoc(doc(db, 'users', 'athlete-uid', 'homeBanners', 'Bora Jogar'), { seenAt: serverTimestamp() }));
});

test('marca gravada não muda, não some e o doc não é apagado', async () => {
  const ref = doc(asAthlete(), 'users', 'athlete-uid', 'homeBanners', 'ja-visto');
  await assertFails(updateDoc(ref, { seenAt: serverTimestamp() }));
  await assertFails(setDoc(ref, { dismissedAt: serverTimestamp() }));
  await assertFails(deleteDoc(ref));
  await assertSucceeds(updateDoc(ref, { dismissedAt: serverTimestamp() }));
});

test('ninguém lê nem marca o banner de outro atleta', async () => {
  const other = testEnv.authenticatedContext('outro-uid', { roles: ['athlete'] }).firestore();
  await assertFails(getDoc(doc(other, 'users', 'athlete-uid', 'homeBanners', 'ja-visto')));
  await assertFails(setDoc(doc(other, 'users', 'athlete-uid', 'homeBanners', 'novo'), { seenAt: serverTimestamp() }));
});
