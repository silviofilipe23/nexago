/**
 * Anotação privada do professor sobre um aluno (`users/{uid}/professorStudentNotes/{arenaId}_{studentId}`):
 * só o dono lê e grava, com allow-list de campos. Uso: `npm run test:rules`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-professor-notes-test';
const PROF = 'prof-uid';
const ARENA_OWNER = 'dono-arena-uid';
const ALUNO = 'u1';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

after(() => testEnv.cleanup());
beforeEach(() => testEnv.clearFirestore());

const notePath = (uid, id = `arena1_${ALUNO}`) => `users/${uid}/professorStudentNotes/${id}`;

/** O que o app grava ao salvar a anotação. */
function note(extra = {}) {
  return { arenaId: 'arena1', studentId: ALUNO, text: 'Dor no ombro direito.', updatedAt: serverTimestamp(), ...extra };
}

test('professor grava e lê a própria anotação', async () => {
  const db = testEnv.authenticatedContext(PROF).firestore();
  await assertSucceeds(setDoc(doc(db, notePath(PROF)), note()));
  await assertSucceeds(getDoc(doc(db, notePath(PROF))));
  await assertSucceeds(setDoc(doc(db, notePath(PROF)), note({ text: 'Melhorou.' })));
  await assertSucceeds(deleteDoc(doc(db, notePath(PROF))));
});

test('professor lê anotação que ainda não existe (tela abre antes de escrever)', async () => {
  const db = testEnv.authenticatedContext(PROF).firestore();
  await assertSucceeds(getDoc(doc(db, notePath(PROF, 'arena9_ninguem'))));
});

test('ninguém mais lê nem grava: arena, aluno, sem login', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), notePath(PROF)), { arenaId: 'arena1', studentId: ALUNO, text: 'x', updatedAt: new Date() });
  });
  for (const uid of [ARENA_OWNER, ALUNO]) {
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, notePath(PROF))));
    await assertFails(setDoc(doc(db, notePath(PROF)), note()));
    await assertFails(deleteDoc(doc(db, notePath(PROF))));
  }
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, notePath(PROF))));
});

test('campo fora da lista, texto longo, id trocado ou data do cliente: recusa', async () => {
  const db = testEnv.authenticatedContext(PROF).firestore();
  await assertFails(setDoc(doc(db, notePath(PROF)), note({ phone: '62999990000' })));
  await assertFails(setDoc(doc(db, notePath(PROF)), note({ text: 'a'.repeat(2001) })));
  await assertFails(setDoc(doc(db, notePath(PROF, 'arena2_u1')), note()));
  await assertFails(setDoc(doc(db, notePath(PROF)), note({ updatedAt: new Date('2020-01-01') })));
  await assertSucceeds(setDoc(doc(db, notePath(PROF)), note({ text: 'a'.repeat(2000) })));
});
