import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

/**
 * Página pública do Squad: o espelho `squadPublic` é aberto (visitante deslogado lê a lista
 * inteira), ninguém grava pelo cliente — nem o próprio embaixador — e o contrato de verdade
 * (`squadAmbassadors`, com comissão e %) continua só do backoffice.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-squad-public-test';
const EMBAIXADOR = 'joao';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'squadPublic', EMBAIXADOR), { name: 'João Victor', tier: 'amb', code: 'JOAO10' });
    await setDoc(doc(db, 'squadAmbassadors', EMBAIXADOR), { tier: 'amb', code: 'JOAO10', commissionPct: 10 });
  });
});

after(async () => { await testEnv.cleanup(); });

const anon = () => testEnv.unauthenticatedContext().firestore();
const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();

test('visitante deslogado lê o espelho e a lista inteira', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'squadPublic', EMBAIXADOR)));
  await assertSucceeds(getDocs(collection(anon(), 'squadPublic')));
});

test('ninguém grava no espelho pelo cliente, nem o próprio embaixador', async () => {
  await assertFails(setDoc(doc(dbOf(EMBAIXADOR), 'squadPublic', EMBAIXADOR), { code: 'GRATIS' }));
  await assertFails(setDoc(doc(anon(), 'squadPublic', 'novo'), { code: 'NOVO10' }));
  await assertFails(deleteDoc(doc(dbOf(EMBAIXADOR), 'squadPublic', EMBAIXADOR)));
});

test('o contrato segue fechado para o atleta e para o visitante', async () => {
  await assertFails(getDoc(doc(anon(), 'squadAmbassadors', EMBAIXADOR)));
  await assertFails(getDoc(doc(dbOf(EMBAIXADOR), 'squadAmbassadors', EMBAIXADOR)));
  await assertFails(getDocs(collection(anon(), 'squadAmbassadors')));
});
