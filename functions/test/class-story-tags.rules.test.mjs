import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

// Story do treino: cada aluno marcado lê só o PRÓPRIO `classStoryTags`. O
// professor, os colegas e quem não está logado não leem; ninguém grava pelo
// cliente (só a `shareClassStory`).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const MARINA = 'marina';
const ELISA = 'elisa';
const PROF = 'thiago';
const MARINA_TAG = 'classStoryTags/s1_marina';

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-class-story-tags-test',
  firestore: { rules },
});

after(() => testEnv.cleanup());

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    for (const uid of [MARINA, ELISA]) {
      await setDoc(doc(ctx.firestore(), `classStoryTags/s1_${uid}`), {
        uid, sessionId: 's1', teacherUserId: PROF, className: 'Intermediário B',
        people: [{ firstName: 'Marina', initials: 'MT', photoUrl: null }],
      });
    }
  });
});

async function assertDeniedByRule(promise) {
  try {
    await promise;
  } catch (e) {
    const message = String(e.message || e);
    if (e.code === 'permission-denied' || /PERMISSION_DENIED/.test(message)) return;
    throw new Error(`negado, mas por erro inesperado: ${message}`);
  }
  throw new Error('esperava negação, mas passou');
}

const db = (uid) => testEnv.authenticatedContext(uid).firestore();

test('o aluno marcado lê o próprio story', async () => {
  await assertSucceeds(getDoc(doc(db(MARINA), MARINA_TAG)));
});

test('colega da turma e o professor não leem o story de outro aluno', async () => {
  await assertDeniedByRule(getDoc(doc(db(ELISA), MARINA_TAG)));
  await assertDeniedByRule(getDoc(doc(db(PROF), MARINA_TAG)));
});

test('sem login não lê; listar a coleção é negado', async () => {
  await assertDeniedByRule(getDoc(doc(testEnv.unauthenticatedContext().firestore(), MARINA_TAG)));
  await assertDeniedByRule(getDocs(collection(db(MARINA), 'classStoryTags')));
});

test('ninguém grava pelo cliente', async () => {
  await assertDeniedByRule(setDoc(doc(db(MARINA), 'classStoryTags/s2_marina'), { uid: MARINA }));
  await assertDeniedByRule(updateDoc(doc(db(MARINA), MARINA_TAG), { className: 'x' }));
  await assertDeniedByRule(deleteDoc(doc(db(MARINA), MARINA_TAG)));
  await assertDeniedByRule(setDoc(doc(db(PROF), 'classStoryTags/s1_elisa'), { uid: ELISA }));
});
