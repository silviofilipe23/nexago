// Live Activity da reserva (`bookingLiveActivities/{uid}_{bookingId}`): o atleta
// cria a dele em "upcoming" e depois só troca os tokens; a fase é do servidor.
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
const BOOKING = 'booking-1';
const DOC_ID = `${ATHLETE}_${BOOKING}`;
const START = Date.now() + 60 * 60 * 1000;

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-booking-live-activities-test',
  firestore: { rules },
});

function createData(overrides = {}) {
  return {
    uid: ATHLETE,
    bookingId: BOOKING,
    fcmToken: 'fcm-token',
    liveActivityToken: 'la-token',
    startAt: Timestamp.fromMillis(START),
    endAt: Timestamp.fromMillis(START + 60 * 60 * 1000),
    phase: 'upcoming',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function seed(data = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'bookingLiveActivities', DOC_ID), {
      ...createData(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...data,
    });
  });
}

const dbAs = (uid) => testEnv.authenticatedContext(uid).firestore();
const tokens = { fcmToken: 'fcm-2', liveActivityToken: 'la-2', updatedAt: serverTimestamp() };

beforeEach(async () => {
  await testEnv.clearFirestore();
});
after(async () => {
  await testEnv.cleanup();
});

test('o atleta cria o doc da própria reserva em "upcoming"', async () => {
  await assertSucceeds(setDoc(doc(dbAs(ATHLETE), 'bookingLiveActivities', DOC_ID), createData()));
});

test('não cria com fase do servidor, chave de outra pessoa ou horário invertido', async () => {
  const db = dbAs(ATHLETE);
  await assertFails(setDoc(doc(db, 'bookingLiveActivities', DOC_ID), createData({ phase: 'onCourt' })));
  await assertFails(setDoc(doc(db, 'bookingLiveActivities', `${OTHER}_${BOOKING}`), createData()));
  await assertFails(setDoc(doc(db, 'bookingLiveActivities', DOC_ID), createData({
    endAt: Timestamp.fromMillis(START - 1000),
  })));
  await assertFails(setDoc(doc(db, 'bookingLiveActivities', DOC_ID), createData({ extra: 1 })));
});

test('outra conta não ocupa a chave do atleta', async () => {
  await assertFails(setDoc(doc(dbAs(OTHER), 'bookingLiveActivities', DOC_ID), createData({ uid: OTHER })));
});

test('o dono lê o próprio doc, e ler doc inexistente não é negado', async () => {
  await assertSucceeds(getDoc(doc(dbAs(ATHLETE), 'bookingLiveActivities', DOC_ID)));
  await seed();
  await assertSucceeds(getDoc(doc(dbAs(ATHLETE), 'bookingLiveActivities', DOC_ID)));
  await assertFails(getDoc(doc(dbAs(OTHER), 'bookingLiveActivities', DOC_ID)));
});

test('o dono troca só os tokens; fase e horário são do servidor', async () => {
  await seed();
  const ref = doc(dbAs(ATHLETE), 'bookingLiveActivities', DOC_ID);
  await assertSucceeds(updateDoc(ref, tokens));
  await assertFails(updateDoc(ref, { phase: 'finished' }));
  await assertFails(updateDoc(ref, { ...tokens, endAt: Timestamp.fromMillis(START + 1) }));
  await assertFails(updateDoc(doc(dbAs(OTHER), 'bookingLiveActivities', DOC_ID), tokens));
});

test('o dono apaga; outra conta e sem login, não', async () => {
  await seed();
  await assertFails(deleteDoc(doc(dbAs(OTHER), 'bookingLiveActivities', DOC_ID)));
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'bookingLiveActivities', DOC_ID)));
  await assertSucceeds(deleteDoc(doc(dbAs(ATHLETE), 'bookingLiveActivities', DOC_ID)));
});
