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

test('avisos do blog: o atleta silencia categorias só no próprio doc', async () => {
  const mine = doc(db(), 'blogNotifyPrefs', ATHLETE_UID);
  await assertSucceeds(setDoc(mine, { muted: ['loja', 'regras'], updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(mine));
  await assertSucceeds(setDoc(mine, { muted: [], updatedAt: serverTimestamp() }));
  await assertFails(setDoc(mine, { muted: ['xadrez'], updatedAt: serverTimestamp() }));
  await assertFails(setDoc(mine, { muted: [], updatedAt: serverTimestamp(), extra: 1 }));
  await assertFails(getDoc(doc(db(OTHER_UID), 'blogNotifyPrefs', ATHLETE_UID)));
  await assertFails(setDoc(doc(db(OTHER_UID), 'blogNotifyPrefs', ATHLETE_UID), { muted: [], updatedAt: serverTimestamp() }));
});

/** O que o app grava em `blogReads` ao sair do post. */
function read(extra = {}) {
  return {
    postId: 'pub',
    uid: ATHLETE_UID,
    category: 'torneios',
    seconds: 95,
    progress: 0.8,
    finished: false,
    ctaClicked: true,
    at: serverTimestamp(),
    ...extra,
  };
}

test('sessão de leitura: o atleta grava a própria, de post publicado, e só o admin lê', async () => {
  await assertSucceeds(setDoc(doc(db(), 'blogReads', 'r1'), read()));
  await assertFails(setDoc(doc(db(), 'blogReads', 'r1'), read({ seconds: 10 })));
  await assertFails(setDoc(doc(db(), 'blogReads', 'r2'), read({ uid: OTHER_UID })));
  await assertFails(setDoc(doc(db(), 'blogReads', 'r3'), read({ postId: 'draft' })));
  await assertFails(setDoc(doc(db(), 'blogReads', 'r4'), read({ seconds: 4000 })));
  await assertFails(setDoc(doc(db(), 'blogReads', 'r5'), read({ seconds: 9.5 })));
  await assertFails(setDoc(doc(db(), 'blogReads', 'r6'), read({ extra: 1 })));
  await assertFails(getDoc(doc(db(), 'blogReads', 'r1')));
  await assertSucceeds(getDoc(doc(adminDb(), 'blogReads', 'r1')));
  await assertFails(setDoc(doc(adminDb(), 'blogReaders', ATHLETE_UID), { firstReadAt: serverTimestamp() }));
});

test('comentários: aprovado para quem está logado, o próprio em qualquer status, escrita só servidor', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const store = ctx.firestore();
    await setDoc(doc(store, 'blogPosts', 'pub', 'blogComments', 'ok'), { uid: OTHER_UID, status: 'approved', text: 'Boa' });
    await setDoc(doc(store, 'blogPosts', 'pub', 'blogComments', 'mine'), { uid: ATHLETE_UID, status: 'pending', text: 'Dúvida' });
    await setDoc(doc(store, 'blogPosts', 'pub', 'blogComments', 'theirs'), { uid: OTHER_UID, status: 'pending', text: 'Oi' });
  });
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'blogPosts', 'pub', 'blogComments', 'ok')));
  await assertSucceeds(getDoc(doc(db(), 'blogPosts', 'pub', 'blogComments', 'ok')));
  await assertSucceeds(getDoc(doc(db(), 'blogPosts', 'pub', 'blogComments', 'mine')));
  await assertFails(getDoc(doc(db(), 'blogPosts', 'pub', 'blogComments', 'theirs')));
  await assertSucceeds(getDocs(query(collection(db(), 'blogPosts', 'pub', 'blogComments'), where('status', '==', 'approved'))));
  await assertSucceeds(getDocs(query(collection(db(), 'blogPosts', 'pub', 'blogComments'), where('uid', '==', ATHLETE_UID))));
  await assertFails(getDocs(collection(db(), 'blogPosts', 'pub', 'blogComments')));
  await assertFails(setDoc(doc(db(), 'blogPosts', 'pub', 'blogComments', 'new'), { uid: ATHLETE_UID, status: 'approved', text: 'x' }));
  await assertFails(deleteDoc(doc(db(), 'blogPosts', 'pub', 'blogComments', 'theirs')));
  await assertSucceeds(deleteDoc(doc(db(), 'blogPosts', 'pub', 'blogComments', 'mine')));
  await assertSucceeds(getDoc(doc(adminDb(), 'blogPosts', 'pub', 'blogComments', 'theirs')));
});
