// Live Activity "minha próxima partida" (`nextMatchActivities/{uid}_{tournamentId}`):
// o servidor cria o doc (callable `startNextMatchActivity`) e o estado é dele; o
// atleta só lê o próprio doc, troca os tokens e pode apagá-lo.
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
const TOURNAMENT = 't1';
const DOC_ID = `${ATHLETE}_${TOURNAMENT}`;

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-next-match-activities-test',
  firestore: { rules },
});

async function seed(data = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'nextMatchActivities', DOC_ID), {
      uid: ATHLETE,
      tournamentId: TOURNAMENT,
      teamIds: ['team-1'],
      dayKey: '2026-11-21',
      phase: 'scheduled',
      stateKey: '{}',
      startedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...data,
    });
  });
}

function dbAs(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

const tokens = {
  fcmToken: 'fcm-token',
  liveActivityToken: 'la-token',
  updatedAt: serverTimestamp(),
};

before(async () => {});
beforeEach(async () => {
  await testEnv.clearFirestore();
});
after(async () => {
  await testEnv.cleanup();
});

test('o atleta não cria o doc: quem cria é a callable', async () => {
  await assertFails(
    setDoc(doc(dbAs(ATHLETE), 'nextMatchActivities', DOC_ID), {
      uid: ATHLETE,
      tournamentId: TOURNAMENT,
      teamIds: ['team-1'],
      ...tokens,
    }),
  );
});

test('o dono lê o próprio doc, e ler doc inexistente não é negado', async () => {
  await assertSucceeds(getDoc(doc(dbAs(ATHLETE), 'nextMatchActivities', DOC_ID)));
  await seed();
  await assertSucceeds(getDoc(doc(dbAs(ATHLETE), 'nextMatchActivities', DOC_ID)));
});

test('outra conta não lê nem apaga o doc do atleta', async () => {
  await seed();
  await assertFails(getDoc(doc(dbAs(OTHER), 'nextMatchActivities', DOC_ID)));
  await assertFails(deleteDoc(doc(dbAs(OTHER), 'nextMatchActivities', DOC_ID)));
});

test('o dono grava os tokens', async () => {
  await seed();
  await assertSucceeds(updateDoc(doc(dbAs(ATHLETE), 'nextMatchActivities', DOC_ID), tokens));
});

test('outra conta não troca os tokens (o push iria para o aparelho dela)', async () => {
  await seed();
  await assertFails(updateDoc(doc(dbAs(OTHER), 'nextMatchActivities', DOC_ID), tokens));
});

test('o dono não mexe no estado nem nas duplas', async () => {
  await seed();
  const ref = doc(dbAs(ATHLETE), 'nextMatchActivities', DOC_ID);
  await assertFails(updateDoc(ref, { phase: 'dayOver' }));
  await assertFails(updateDoc(ref, { teamIds: ['team-de-outro'] }));
  await assertFails(updateDoc(ref, { ...tokens, stateKey: 'x' }));
});

test('token com tipo ou tamanho errado é recusado', async () => {
  await seed();
  const ref = doc(dbAs(ATHLETE), 'nextMatchActivities', DOC_ID);
  await assertFails(updateDoc(ref, { ...tokens, liveActivityToken: 42 }));
  await assertFails(updateDoc(ref, { ...tokens, liveActivityToken: 'x'.repeat(600) }));
});

test('o dono apaga o próprio doc', async () => {
  await seed();
  await assertSucceeds(deleteDoc(doc(dbAs(ATHLETE), 'nextMatchActivities', DOC_ID)));
});

test('sem login, nada', async () => {
  await seed();
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'nextMatchActivities', DOC_ID)));
  await assertFails(updateDoc(doc(anon, 'nextMatchActivities', DOC_ID), tokens));
});
