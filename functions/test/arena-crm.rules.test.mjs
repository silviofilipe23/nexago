// CRM comercial das arenas (backoffice): `arenaCrm/{arenaId}` fica fora do doc público da
// arena. Só admin/superAdmin lê e grava; status fechado na lista; quem gravou e quando vêm do
// token e do relógio do servidor; ninguém apaga.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/arena-crm.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const ADMIN = 'admin-uid';
const SUPER = 'super-uid';
const GESTOR = 'gestor-uid';

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-arena-crm-test',
  firestore: { rules },
});

const asAdmin = () => testEnv.authenticatedContext(ADMIN, { roles: ['admin'] }).firestore();
const asSuper = () => testEnv.authenticatedContext(SUPER, { superAdmin: true }).firestore();
const asGestor = () => testEnv.authenticatedContext(GESTOR, { roles: ['arena'] }).firestore();

const entry = (uid, over = {}) => ({
  status: 'negotiating',
  note: 'ligar terça',
  updatedAt: serverTimestamp(),
  updatedBy: uid,
  updatedByName: 'Comercial',
  ...over,
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'arenas', 'a1'), { name: 'Arena 1', managerUserId: GESTOR });
    await setDoc(doc(ctx.firestore(), 'arenaCrm', 'a1'), { status: 'contacted', updatedBy: ADMIN });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('admin e superAdmin leem e gravam o status', async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), 'arenaCrm', 'a1')));
  await assertSucceeds(setDoc(doc(asAdmin(), 'arenaCrm', 'a1'), entry(ADMIN)));
  await assertSucceeds(setDoc(doc(asSuper(), 'arenaCrm', 'a2'), entry(SUPER, { status: 'not_contacted', note: null })));
});

test('gestor da arena, atleta e anônimo não leem nem gravam', async () => {
  await assertFails(getDoc(doc(asGestor(), 'arenaCrm', 'a1')));
  await assertFails(setDoc(doc(asGestor(), 'arenaCrm', 'a1'), entry(GESTOR)));
  const atleta = testEnv.authenticatedContext('atleta', { roles: ['athlete'] }).firestore();
  await assertFails(getDoc(doc(atleta, 'arenaCrm', 'a1')));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'arenaCrm', 'a1')));
});

test('status fora da lista, autor falso, data do cliente ou campo extra são recusados', async () => {
  await assertFails(setDoc(doc(asAdmin(), 'arenaCrm', 'a1'), entry(ADMIN, { status: 'lost' })));
  await assertFails(setDoc(doc(asAdmin(), 'arenaCrm', 'a1'), entry('outro-uid')));
  await assertFails(setDoc(doc(asAdmin(), 'arenaCrm', 'a1'), entry(ADMIN, { updatedAt: new Date() })));
  await assertFails(setDoc(doc(asAdmin(), 'arenaCrm', 'a1'), entry(ADMIN, { planTier: 'elite' })));
  await assertFails(setDoc(doc(asAdmin(), 'arenaCrm', 'a1'), entry(ADMIN, { note: 'x'.repeat(501) })));
});

test('ninguém apaga o registro', async () => {
  await assertFails(deleteDoc(doc(asAdmin(), 'arenaCrm', 'a1')));
});
