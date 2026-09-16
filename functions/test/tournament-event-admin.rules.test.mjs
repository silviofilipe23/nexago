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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-event-admin-test';
const DONO = 'dono-uid';
const ADMIN_EVENTO = 'admin-evento-uid';
const TORNEIO = 'copa-admin';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', TORNEIO), {
      managerId: DONO, name: 'Copa Admin', listingStatus: 'open',
    });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', ADMIN_EVENTO), {
      role: 'eventAdmin', status: 'active',
    });
  });
});

after(async () => { await testEnv.cleanup(); });

const asAdminEvento = () => testEnv.authenticatedContext(ADMIN_EVENTO).firestore();

test('administrador edita o torneio', async () => {
  await assertSucceeds(
    updateDoc(doc(asAdminEvento(), 'tournaments', TORNEIO), { name: 'Copa Admin 2026' }),
  );
});

test('administrador NÃO exclui o torneio', async () => {
  await assertFails(deleteDoc(doc(asAdminEvento(), 'tournaments', TORNEIO)));
});

test('administrador lê a equipe', async () => {
  await assertSucceeds(
    getDoc(doc(asAdminEvento(), 'tournaments', TORNEIO, 'staff', ADMIN_EVENTO)),
  );
});

test('administrador não se promove a gestor', async () => {
  await assertFails(
    setDoc(
      doc(asAdminEvento(), 'tournaments', TORNEIO, 'staff', ADMIN_EVENTO),
      { role: 'manager', status: 'active' },
    ),
  );
});

test('o dono cria staff com o papel novo', async () => {
  await assertSucceeds(
    setDoc(
      doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', TORNEIO, 'staff', 'novo-uid'),
      { role: 'eventAdmin', status: 'active' },
    ),
  );
});
