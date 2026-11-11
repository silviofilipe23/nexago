// Meu contrato (app do atleta): `arenaCrmMembers/{uid}` diz ao app se o atleta tem contrato de
// mensalista. Só o próprio atleta lê; ninguém grava pelo cliente (gatilho do contrato). O contrato
// em si (`arenaCrmContracts`, com a anotação interna da arena) continua fechado.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/arena-crm-members.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-arena-crm-members-test',
  firestore: { rules },
});

const as = (uid) => testEnv.authenticatedContext(uid, { roles: ['athlete'] }).firestore();

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'arenaCrmMembers', 'u1'), { contractIds: ['c1'] });
    await setDoc(doc(ctx.firestore(), 'arenaCrmContracts', 'c1'), { athleteId: 'u1', note: 'interna' });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('o atleta lê o próprio espelho', async () => {
  await assertSucceeds(getDoc(doc(as('u1'), 'arenaCrmMembers', 'u1')));
});

test('outro atleta e anônimo não leem', async () => {
  await assertFails(getDoc(doc(as('u2'), 'arenaCrmMembers', 'u1')));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'arenaCrmMembers', 'u1')));
});

test('ninguém grava nem apaga pelo cliente', async () => {
  await assertFails(setDoc(doc(as('u1'), 'arenaCrmMembers', 'u1'), { contractIds: [] }));
  await assertFails(deleteDoc(doc(as('u1'), 'arenaCrmMembers', 'u1')));
});

test('o contrato continua fechado até para o dono', async () => {
  await assertFails(getDoc(doc(as('u1'), 'arenaCrmContracts', 'c1')));
});
