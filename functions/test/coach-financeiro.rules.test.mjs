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
 * Financeiro do treinador (fase 1, livro-caixa manual): planos, matrículas e parcelas são
 * só do próprio treinador. Outro usuário autenticado e anônimo não leem nem escrevem.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-coach-financeiro-test';
const DONO = 'treinador-uid';
const OUTRO = 'outro-treinador-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

const COLECOES = [
  ['plans', 'p1', { name: 'Mensal', amountCents: 18000, cycle: 'mensal', active: true }],
  ['enrollments', 'aluno-1', { athleteUid: 'aluno-1', planId: 'p1', status: 'ativa' }],
  ['charges', 'c1', { athleteUid: 'aluno-1', status: 'pendente', dueDate: '2026-11-05', amountCents: 18000 }],
];

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [col, id, data] of COLECOES) {
      await setDoc(doc(db, 'coaches', DONO, col, id), data);
    }
  });
});

after(async () => { await testEnv.cleanup(); });

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();

for (const [col, id, data] of COLECOES) {
  test(`${col}: o dono lê, cria, altera e apaga`, async () => {
    await assertSucceeds(getDoc(doc(dbOf(DONO), 'coaches', DONO, col, id)));
    await assertSucceeds(setDoc(doc(dbOf(DONO), 'coaches', DONO, col, 'novo'), data));
    await assertSucceeds(updateDoc(doc(dbOf(DONO), 'coaches', DONO, col, 'novo'), { note: 'x' }));
    await assertSucceeds(deleteDoc(doc(dbOf(DONO), 'coaches', DONO, col, 'novo')));
  });

  test(`${col}: outro treinador autenticado não lê nem escreve`, async () => {
    await assertFails(getDoc(doc(dbOf(OUTRO), 'coaches', DONO, col, id)));
    await assertFails(setDoc(doc(dbOf(OUTRO), 'coaches', DONO, col, 'invasao'), data));
    await assertFails(updateDoc(doc(dbOf(OUTRO), 'coaches', DONO, col, id), { note: 'x' }));
    await assertFails(deleteDoc(doc(dbOf(OUTRO), 'coaches', DONO, col, id)));
  });

  test(`${col}: anônimo não lê nem escreve`, async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'coaches', DONO, col, id)));
    await assertFails(setDoc(doc(anon, 'coaches', DONO, col, 'anon'), data));
  });
}
