import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-followed-matches-test';
const DONO = 'dono-uid';
const ESTRANHO = 'estranho-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

after(() => testEnv.cleanup());

/** O que o app grava ao tocar em "Seguir partida". */
function followDoc() {
  return {
    matchId: 'm1',
    tournamentId: 't1',
    categoryId: 'c1',
    source: 'manual',
    followedAt: new Date(),
  };
}

const followPath = (uid) => `users/${uid}/followedMatches/m1`;

test('dono segue a própria partida', async () => {
  const db = testEnv.authenticatedContext(DONO).firestore();
  await assertSucceeds(setDoc(doc(db, followPath(DONO)), followDoc()));
});

test('dono lê o que está seguindo', async () => {
  const db = testEnv.authenticatedContext(DONO).firestore();
  await assertSucceeds(getDoc(doc(db, followPath(DONO))));
});

test('dono deixa de seguir', async () => {
  const db = testEnv.authenticatedContext(DONO).firestore();
  await assertSucceeds(deleteDoc(doc(db, followPath(DONO))));
});

test('estranho não lê o que outro atleta segue', async () => {
  const db = testEnv.authenticatedContext(ESTRANHO).firestore();
  await assertFails(getDoc(doc(db, followPath(DONO))));
});

test('estranho não faz outro atleta seguir uma partida', async () => {
  const db = testEnv.authenticatedContext(ESTRANHO).firestore();
  await assertFails(setDoc(doc(db, followPath(DONO)), followDoc()));
});

test('sem login não se segue partida', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(db, followPath(DONO)), followDoc()));
});

test('sem login não se lê partida seguida', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, followPath(DONO))));
});

// `matchLiveNotify` é estado interno do fan-out (throttle e rótulos das duplas).
// Só o Admin SDK escreve nele, e o Admin SDK ignora rules — para o cliente é
// fechado dos dois lados. Se abrisse para leitura, qualquer um saberia quando o
// servidor notificou; se abrisse para escrita, daria para silenciar o placar de
// uma partida gravando um `lastPushAt` no futuro.
const NOTIFY_PATH = 'matchLiveNotify/m1';

test('atleta autenticado não lê o estado interno do fan-out', async () => {
  const db = testEnv.authenticatedContext(DONO).firestore();
  await assertFails(getDoc(doc(db, NOTIFY_PATH)));
});

test('atleta autenticado não escreve no estado interno do fan-out', async () => {
  const db = testEnv.authenticatedContext(DONO).firestore();
  await assertFails(setDoc(doc(db, NOTIFY_PATH), { lastPushAt: 9_999_999_999_999 }));
});

test('sem login também não se toca no estado interno do fan-out', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, NOTIFY_PATH)));
  await assertFails(setDoc(doc(db, NOTIFY_PATH), { lastPushAt: 1 }));
});
