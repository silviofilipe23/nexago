import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-class-reviews-test',
  firestore: { rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') },
});
const as = (uid) => testEnv.authenticatedContext(uid).firestore();

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'classReviews', 'a_s1_carla'), { uid: 'carla', arenaId: 'cfc', scores: {} });
    await setDoc(doc(db, 'classReviewSummaries', 'arena_cfc'), { sum: 9, count: 2 });
  });
});
after(() => testEnv.cleanup());

test('avaliação de aula: só a autora lê; ninguém grava pelo cliente', async () => {
  await assertSucceeds(getDoc(doc(as('carla'), 'classReviews', 'a_s1_carla')));
  await assertSucceeds(getDocs(query(collection(as('carla'), 'classReviews'), where('uid', '==', 'carla'))));
  await assertFails(getDoc(doc(as('gestor'), 'classReviews', 'a_s1_carla')));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'classReviews', 'a_s1_carla')));
  await assertFails(setDoc(doc(as('carla'), 'classReviews', 'a_s2_carla'), { uid: 'carla' }));
});

test('resumo do local: público, só o servidor grava', async () => {
  await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'classReviewSummaries', 'arena_cfc')));
  await assertFails(setDoc(doc(as('carla'), 'classReviewSummaries', 'arena_cfc'), { sum: 50, count: 10 }));
});
