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
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(
  path.join(__dirname, '../../firestore.rules'),
  'utf8',
);

const PROJECT_ID = 'nexago-athlete-plus-waitlist-test';
const ATHLETE_UID = 'athlete-uid';
const OTHER_UID = 'other-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

function db(uid = ATHLETE_UID) {
  return testEnv.authenticatedContext(uid).firestore();
}

function entry(uid = ATHLETE_UID) {
  return doc(db(uid), 'athletePlusWaitlist', uid);
}

/** O que o app grava em "Quero ser avisado". */
function joined(extra = {}) {
  return {
    status: 'joined',
    source: 'home',
    interests: ['savings', 'evolution'],
    priceBand: 'up_to_20',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  };
}

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test('atleta entra na lista com interesses e faixa de preço', async () => {
  await assertSucceeds(setDoc(entry(), joined()));
});

test('entrar sem responder as perguntas opcionais vale', async () => {
  const { priceBand, ...rest } = joined({ interests: [] });
  await assertSucceeds(setDoc(entry(), rest));
});

test('"Agora não" grava dismissed', async () => {
  const { priceBand, ...rest } = joined({ status: 'dismissed', interests: [] });
  await assertSucceeds(setDoc(entry(), rest));
});

test('atleta lê o próprio doc, não o de outro, e ninguém lista', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'athletePlusWaitlist', OTHER_UID), {
      status: 'joined',
    });
  });
  await assertSucceeds(getDoc(entry()));
  await assertFails(getDoc(doc(db(), 'athletePlusWaitlist', OTHER_UID)));
  await assertFails(getDocs(collection(db(), 'athletePlusWaitlist')));
});

test('não grava no doc de outro atleta nem deslogado', async () => {
  await assertFails(setDoc(doc(db(), 'athletePlusWaitlist', OTHER_UID), joined()));
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(anon, 'athletePlusWaitlist', ATHLETE_UID), joined()));
});

test('resposta é única: sem regravar, atualizar ou apagar', async () => {
  await assertSucceeds(setDoc(entry(), joined()));
  await assertFails(setDoc(entry(), joined({ status: 'dismissed' })));
  await assertFails(updateDoc(entry(), { priceBand: 'up_to_10' }));
  await assertFails(deleteDoc(entry()));
});

test('status, interesses e faixa fora da lista são negados', async () => {
  await assertFails(setDoc(entry(), joined({ status: 'subscribed' })));
  await assertFails(setDoc(entry(), joined({ interests: ['ranking_boost'] })));
  await assertFails(setDoc(entry(), joined({ interests: 'savings' })));
  await assertFails(setDoc(entry(), joined({ priceBand: 'free' })));
  await assertFails(setDoc(entry(), joined({ source: 'push' })));
});

test('campo extra e datas do cliente são negados', async () => {
  await assertFails(setDoc(entry(), joined({ plan: 'plus' })));
  await assertFails(setDoc(entry(), joined({ createdAt: new Date(2020, 0, 1) })));
  const { updatedAt, ...withoutUpdatedAt } = joined();
  await assertFails(setDoc(entry(), withoutUpdatedAt));
});
