import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-organizer-public-profiles-test';
const ORG = 'org-uid';
const ATHLETE = 'athlete-uid';
const OTHER = 'other-uid';

const testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });
const as = (uid) => testEnv.authenticatedContext(uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();
const followerRef = (db, orgId, uid) => doc(db, 'organizerPublicProfiles', orgId, 'followers', uid);

before(async () => {
  // Sem isto, rodar duas vezes no mesmo emulador deixa o seguidor do teste anterior e o
  // "seguir" vira update (negado).
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'organizerPublicProfiles', ORG), { uid: ORG, name: 'Liga A', listed: true });
    await setDoc(followerRef(db, ORG, OTHER), { userId: OTHER, organizerId: ORG, followedAt: Timestamp.now() });
    await setDoc(doc(db, 'organizerFollowerPushes', 't1'), { status: 'sent' });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('perfil: leitura pública, inclusive sem login', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'organizerPublicProfiles', ORG)));
  await assertSucceeds(getDoc(doc(as(ATHLETE), 'organizerPublicProfiles', ORG)));
});

test('perfil: ninguém grava pelo cliente, nem o próprio organizador', async () => {
  await assertFails(setDoc(doc(as(ORG), 'organizerPublicProfiles', ORG), { name: 'Hack' }, { merge: true }));
  await assertFails(setDoc(doc(as(ATHLETE), 'organizerPublicProfiles', ORG), { followersCount: 999 }, { merge: true }));
});

test('seguidores: leitura só logado', async () => {
  await assertSucceeds(getDocs(collection(as(ATHLETE), 'organizerPublicProfiles', ORG, 'followers')));
  await assertFails(getDocs(collection(anon(), 'organizerPublicProfiles', ORG, 'followers')));
});

test('seguir: o próprio atleta, com as três chaves e serverTimestamp', async () => {
  const db = as(ATHLETE);
  await assertSucceeds(setDoc(followerRef(db, ORG, ATHLETE), { userId: ATHLETE, organizerId: ORG, followedAt: serverTimestamp() }));
});

test('seguir: negado em nome de outro, com chave extra, data forjada ou a si mesmo', async () => {
  const db = as(ATHLETE);
  await assertFails(setDoc(followerRef(db, ORG, 'someone-else'), { userId: 'someone-else', organizerId: ORG, followedAt: serverTimestamp() }));
  await assertFails(setDoc(followerRef(db, ORG, ATHLETE), { userId: ATHLETE, organizerId: ORG, followedAt: serverTimestamp(), extra: 1 }));
  await assertFails(setDoc(followerRef(db, ORG, ATHLETE), { userId: ATHLETE, organizerId: ORG, followedAt: Timestamp.fromMillis(0) }));
  await assertFails(setDoc(followerRef(db, ORG, ATHLETE), { userId: ATHLETE, organizerId: 'other-org', followedAt: serverTimestamp() }));
  await assertFails(setDoc(followerRef(as(ORG), ORG, ORG), { userId: ORG, organizerId: ORG, followedAt: serverTimestamp() }));
});

test('deixar de seguir: só o próprio', async () => {
  await assertFails(deleteDoc(followerRef(as(ATHLETE), ORG, OTHER)));
  await assertSucceeds(deleteDoc(followerRef(as(OTHER), ORG, OTHER)));
});

test('seguidor não é editável (sem update)', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(followerRef(ctx.firestore(), ORG, ATHLETE), { userId: ATHLETE, organizerId: ORG, followedAt: Timestamp.now() });
  });
  await assertFails(setDoc(followerRef(as(ATHLETE), ORG, ATHLETE), { userId: ATHLETE, organizerId: ORG, followedAt: serverTimestamp() }));
});

test('trava de push: fechada para todos', async () => {
  await assertFails(getDoc(doc(as(ORG), 'organizerFollowerPushes', 't1')));
  await assertFails(setDoc(doc(as(ORG), 'organizerFollowerPushes', 't2'), { status: 'sent' }));
});
