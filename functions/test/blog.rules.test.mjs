import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(
  path.join(__dirname, '../../firestore.rules'),
  'utf8',
);

const PROJECT_ID = 'nexago-blog-rules-test';
const ATHLETE_UID = 'athlete-uid';
const OTHER_UID = 'other-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

function db(uid = ATHLETE_UID) {
  return testEnv.authenticatedContext(uid).firestore();
}

function adminDb() {
  return testEnv.authenticatedContext('admin-uid', { roles: ['admin'] }).firestore();
}

/** O que o app grava em `users/{uid}/blogLibrary/{postId}`. */
function library(extra = {}) {
  return {
    saved: true,
    savedAt: serverTimestamp(),
    progress: 0,
    readStartedAt: null,
    finishedAt: null,
    updatedAt: serverTimestamp(),
    ...extra,
  };
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const store = ctx.firestore();
    await setDoc(doc(store, 'blogPosts', 'pub'), { status: 'published', title: 'No ar' });
    await setDoc(doc(store, 'blogPosts', 'draft'), { status: 'draft', title: 'Rascunho' });
    await setDoc(doc(store, 'blogPosts', 'sched'), { status: 'scheduled', title: 'Amanhã' });
    await setDoc(doc(store, 'blogSlugs', 'no-ar'), { postId: 'pub' });
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

after(async () => {
  await testEnv.cleanup();
});

test('qualquer um lê post publicado; rascunho e agendado só o admin', async () => {
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anon, 'blogPosts', 'pub')));
  await assertFails(getDoc(doc(anon, 'blogPosts', 'draft')));
  await assertFails(getDoc(doc(db(), 'blogPosts', 'sched')));
  await assertSucceeds(getDoc(doc(adminDb(), 'blogPosts', 'draft')));
});

test('consulta pública só passa com o filtro de publicado', async () => {
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(query(collection(anon, 'blogPosts'), where('status', '==', 'published'))));
  await assertFails(getDocs(collection(anon, 'blogPosts')));
});

test('ninguém escreve post nem reserva de endereço pelo cliente', async () => {
  await assertFails(setDoc(doc(adminDb(), 'blogPosts', 'novo'), { status: 'draft' }));
  await assertFails(setDoc(doc(db(), 'blogPosts', 'pub'), { status: 'published' }));
  await assertFails(getDoc(doc(db(), 'blogSlugs', 'no-ar')));
});

test('"Ajudou": o atleta cria e apaga a própria reação, só em post publicado', async () => {
  const mine = doc(db(), 'blogPosts', 'pub', 'reactions', ATHLETE_UID);
  await assertSucceeds(setDoc(mine, { kind: 'helpful', createdAt: serverTimestamp() }));
  await assertSucceeds(getDoc(mine));
  await assertFails(setDoc(mine, { kind: 'helpful', createdAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(mine));

  await assertFails(setDoc(doc(db(), 'blogPosts', 'pub', 'reactions', OTHER_UID), { kind: 'helpful', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db(), 'blogPosts', 'draft', 'reactions', ATHLETE_UID), { kind: 'helpful', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db(), 'blogPosts', 'pub', 'reactions', ATHLETE_UID), { kind: 'love', createdAt: serverTimestamp() }));
});

test('biblioteca: só o dono, com as chaves e tipos do contrato', async () => {
  const mine = doc(db(), 'users', ATHLETE_UID, 'blogLibrary', 'pub');
  await assertSucceeds(setDoc(mine, library()));
  await assertSucceeds(setDoc(mine, library({ progress: 0.4, readStartedAt: serverTimestamp() })));
  await assertSucceeds(getDoc(mine));

  await assertFails(getDoc(doc(db(OTHER_UID), 'users', ATHLETE_UID, 'blogLibrary', 'pub')));
  await assertFails(setDoc(doc(db(OTHER_UID), 'users', ATHLETE_UID, 'blogLibrary', 'pub'), library()));
  await assertFails(setDoc(mine, library({ progress: 1.5 })));
  await assertFails(setDoc(mine, library({ extra: true })));
  await assertFails(setDoc(mine, library({ updatedAt: new Date('2026-01-01') })));
});
