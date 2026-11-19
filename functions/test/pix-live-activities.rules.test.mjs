// Live Activity do Pix (`pixLiveActivities/{asaasPaymentId}`): o atleta cria a
// dele em "waiting" e depois só troca os tokens; a fase é do servidor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const ATHLETE = 'athlete-uid';
const OTHER = 'other-uid';
const PAYMENT = 'pay_123';
const DOC_ID = `${ATHLETE}_${PAYMENT}`;

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-pix-live-activities-test',
  firestore: { rules },
});

function createData(overrides = {}) {
  return {
    uid: ATHLETE,
    paymentId: PAYMENT,
    kind: 'booking',
    fcmToken: 'fcm-token',
    liveActivityToken: 'la-token',
    expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
    phase: 'waiting',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function seed(data = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'pixLiveActivities', DOC_ID), {
      ...createData(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...data,
    });
  });
}

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const ref = (db, id = DOC_ID) => doc(db, 'pixLiveActivities', id);

before(async () => {
  await testEnv.clearFirestore();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test('atleta cria a própria activity em "waiting"', async () => {
  await assertSucceeds(setDoc(ref(dbOf(ATHLETE)), createData()));
});

test('não cria em nome de outro atleta', async () => {
  await assertFails(setDoc(ref(dbOf(OTHER)), createData()));
});

test('não ocupa a chave da cobrança de outra pessoa (a chave leva o próprio uid)', async () => {
  // Outro atleta tenta o doc com a chave nua ou com o uid da vítima.
  await assertFails(setDoc(ref(dbOf(OTHER), PAYMENT), createData({ uid: OTHER })));
  await assertFails(setDoc(ref(dbOf(OTHER), DOC_ID), createData({ uid: OTHER })));
  // Com a chave dele, o doc é dele — e o da vítima continua livre.
  await assertSucceeds(setDoc(
    ref(dbOf(OTHER), `${OTHER}_${PAYMENT}`),
    createData({ uid: OTHER }),
  ));
  await assertSucceeds(setDoc(ref(dbOf(ATHLETE)), createData()));
});

test('não cria já em fase do servidor', async () => {
  await assertFails(setDoc(ref(dbOf(ATHLETE)), createData({ phase: 'paid' })));
});

test('não cria com campo fora do formato', async () => {
  await assertFails(setDoc(ref(dbOf(ATHLETE)), createData({ amount: 10 })));
  await assertFails(setDoc(ref(dbOf(ATHLETE)), createData({ expiresAt: 'amanhã' })));
});

test('sem login não cria nem lê', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(setDoc(ref(db), createData()));
  await seed();
  await assertFails(getDoc(ref(db)));
});

test('dono troca os tokens depois que o servidor mudou a fase', async () => {
  await seed({ phase: 'urgent', phaseChangedAt: Timestamp.now() });
  await assertSucceeds(updateDoc(ref(dbOf(ATHLETE)), {
    liveActivityToken: 'la-token-2',
    updatedAt: serverTimestamp(),
  }));
});

test('dono não mexe na fase nem no prazo', async () => {
  await seed();
  await assertFails(updateDoc(ref(dbOf(ATHLETE)), { phase: 'paid' }));
  await assertFails(updateDoc(ref(dbOf(ATHLETE)), { paymentId: 'pay_outro' }));
  await assertFails(updateDoc(ref(dbOf(ATHLETE)), {
    expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  }));
});

test('só o dono lê e apaga', async () => {
  await seed();
  await assertSucceeds(getDoc(ref(dbOf(ATHLETE))));
  await assertFails(getDoc(ref(dbOf(OTHER))));
  await assertFails(deleteDoc(ref(dbOf(OTHER))));
  await assertSucceeds(deleteDoc(ref(dbOf(ATHLETE))));
});

test('atleta lê um doc que ainda não existe (decide entre criar e trocar token)', async () => {
  await assertSucceeds(getDoc(ref(dbOf(ATHLETE))));
});

test('outro atleta não troca os tokens', async () => {
  await seed();
  await assertFails(updateDoc(ref(dbOf(OTHER)), { liveActivityToken: 'sequestro' }));
});
