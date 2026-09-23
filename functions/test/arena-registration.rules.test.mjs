import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-arena-registration-test';
const OWNER_UID = 'arena-owner-uid';
const STAFF_UID = 'arena-staff-uid';
const STRANGER_UID = 'atleta-curioso-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

const REGISTRATION_PATH = ['arenas', 'arena-parceira', 'registration', 'data'];

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-parceira'), {
      managerUserId: OWNER_UID,
      name: 'Arena Parceira',
      city: 'Florianópolis',
      state: 'SC',
    });
    // Staff com a área 'perfil' liberada: edita o perfil, mas não é o dono.
    await setDoc(doc(db, 'arenas', 'arena-parceira', 'staff', STAFF_UID), {
      role: 'gestor',
      status: 'active',
    });
    await setDoc(doc(db, ...REGISTRATION_PATH), {
      cpfCnpj: '11222333000181',
      razaoSocial: 'Arena Parceira Ltda',
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('o dono lê o próprio cadastro', async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(getDoc(doc(db, ...REGISTRATION_PATH)));
});

test('o dono grava o cadastro', async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(
    setDoc(doc(db, ...REGISTRATION_PATH), { cpfCnpj: '11222333000181', razaoSocial: 'Arena Parceira Ltda' }),
  );
});

test('atleta qualquer não lê o CNPJ, mesmo o doc da arena sendo público', async () => {
  const db = testEnv.authenticatedContext(STRANGER_UID).firestore();
  await assertFails(getDoc(doc(db, ...REGISTRATION_PATH)));
});

test('visitante sem login não lê o cadastro', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, ...REGISTRATION_PATH)));
});

test('staff da arena não grava o cadastro: documento da empresa é do dono', async () => {
  const db = testEnv.authenticatedContext(STAFF_UID).firestore();
  await assertFails(setDoc(doc(db, ...REGISTRATION_PATH), { cpfCnpj: '52998224725' }));
});

test('atleta qualquer não grava o cadastro', async () => {
  const db = testEnv.authenticatedContext(STRANGER_UID).firestore();
  await assertFails(setDoc(doc(db, ...REGISTRATION_PATH), { cpfCnpj: '52998224725' }));
});
