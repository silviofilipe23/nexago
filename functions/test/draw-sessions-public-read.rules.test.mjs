import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * O telão do Sorteio ao Vivo abre SEM LOGIN — é o link que vai pra TV da arena
 * e pro OBS. Estas provas são o que sustenta essa promessa nos dois sentidos:
 * anônimo lê a sessão, e ninguém (nem organizador logado) escreve nela pelo
 * cliente. Toda escrita passa por Cloud Function, que usa Admin SDK e não é
 * sujeita a estas regras.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-draw-sessions-public-read-test';
const APP_ID = 'volley-track-2dd3b';
const ORGANIZER_UID = 'organizer-uid';
const SESSION_PATH = `artifacts/${APP_ID}/public/data/drawSessions/sess1`;

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), SESSION_PATH), {
      tournamentId: 'tour1',
      categoryId: 'cat1',
      status: 'live',
      format: 'groups_knockout',
      reveals: [],
      genesisHash: 'abc',
    });
    await setDoc(doc(ctx.firestore(), 'tournaments/tour1'), {
      name: 'Copa Verão',
      managerId: ORGANIZER_UID,
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('anônimo lê a sessão — é o telão abrindo na TV sem login', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  const snap = await assertSucceeds(getDoc(doc(db, SESSION_PATH)));
  if (snap.data().status !== 'live') {
    throw new Error('a sessão veio sem os campos que o telão desenha');
  }
});

test('anônimo NÃO cria sessão', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(
    setDoc(doc(db, `artifacts/${APP_ID}/public/data/drawSessions/forjada`), { status: 'live' }),
  );
});

test('anônimo NÃO escreve na sessão — não dá pra forjar revelação', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(updateDoc(doc(db, SESSION_PATH), { status: 'published' }));
});

test('o próprio organizador do torneio também NÃO escreve pelo cliente', async () => {
  // A escrita é exclusiva das callables: é isso que garante que o resultado
  // nasce no servidor e que o log encadeado não pode ser reescrito.
  const db = testEnv.authenticatedContext(ORGANIZER_UID).firestore();
  await assertFails(updateDoc(doc(db, SESSION_PATH), { status: 'voided' }));
});

test('ninguém apaga a sessão pelo cliente — o comprovante da anulada fica público', async () => {
  const db = testEnv.authenticatedContext(ORGANIZER_UID).firestore();
  await assertFails(deleteDoc(doc(db, SESSION_PATH)));
});
