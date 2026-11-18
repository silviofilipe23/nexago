import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

// Meta de faturamento do mês (`arenas/{arenaId}/goals/monthlyRevenue`).
// Fica FORA do doc da arena porque ele é público (`allow read: if true`):
// a meta revela quanto a arena fatura. Lê quem lê o financeiro; grava só o
// dono, e só o formato esperado.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(
  path.join(__dirname, '../../firestore.rules'),
  'utf8',
);

const ARENA = 'arena-meta';
const DONO = 'dono-uid';
const GESTOR = 'gestor-uid';
const FINANCEIRO = 'financeiro-uid';
const RECEPCAO = 'recepcao-uid';
const ATLETA = 'atleta-uid';
const GOAL_PATH = ['arenas', ARENA, 'goals', 'monthlyRevenue'];

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-arena-goals-test',
  firestore: { rules },
});

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();
const goalRef = (db) => doc(db, ...GOAL_PATH);
const validGoal = (uid, amount = 38000) => ({
  amountReais: amount,
  updatedAt: serverTimestamp(),
  updatedBy: uid,
});

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', ARENA), {
      managerUserId: DONO,
      name: 'Arena Meta',
      planTier: 'pro',
      planStatus: 'active',
    });
    for (const [uid, role] of [
      [GESTOR, 'gestor'],
      [FINANCEIRO, 'financeiro'],
      [RECEPCAO, 'recepcao'],
    ]) {
      await setDoc(doc(db, 'arenas', ARENA, 'staff', uid), {
        role,
        status: 'active',
      });
    }
    await setDoc(doc(db, ...GOAL_PATH), {
      amountReais: 30000,
      updatedBy: DONO,
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('dono, gestor e financeiro leem a meta (leem o financeiro)', async () => {
  for (const uid of [DONO, GESTOR, FINANCEIRO]) {
    await assertSucceeds(getDoc(goalRef(dbOf(uid))));
  }
});

test('recepção e atleta não leem a meta', async () => {
  await assertFails(getDoc(goalRef(dbOf(RECEPCAO))));
  await assertFails(getDoc(goalRef(dbOf(ATLETA))));
  await assertFails(getDoc(goalRef(testEnv.unauthenticatedContext().firestore())));
});

test('dono grava a meta no formato esperado', async () => {
  await assertSucceeds(setDoc(goalRef(dbOf(DONO)), validGoal(DONO)));
});

test('gestor e financeiro não gravam a meta (só leem o financeiro)', async () => {
  await assertFails(setDoc(goalRef(dbOf(GESTOR)), validGoal(GESTOR)));
  await assertFails(setDoc(goalRef(dbOf(FINANCEIRO)), validGoal(FINANCEIRO)));
});

test('dono não grava valor inválido, campo extra ou autoria de outro', async () => {
  const db = dbOf(DONO);
  await assertFails(setDoc(goalRef(db), validGoal(DONO, 0)));
  await assertFails(setDoc(goalRef(db), validGoal(DONO, -10)));
  await assertFails(setDoc(goalRef(db), validGoal(DONO, 20000000)));
  await assertFails(setDoc(goalRef(db), { ...validGoal(DONO), amountReais: '38000' }));
  await assertFails(setDoc(goalRef(db), { ...validGoal(DONO), planTier: 'elite' }));
  await assertFails(setDoc(goalRef(db), validGoal(GESTOR)));
  await assertFails(
    setDoc(goalRef(db), { amountReais: 38000, updatedAt: new Date(0), updatedBy: DONO }),
  );
});

test('só a meta mensal existe na subcoleção', async () => {
  await assertFails(
    setDoc(doc(dbOf(DONO), 'arenas', ARENA, 'goals', 'outra'), validGoal(DONO)),
  );
});

test('dono apaga a meta; gestor não', async () => {
  await assertFails(deleteDoc(goalRef(dbOf(GESTOR))));
  await assertSucceeds(deleteDoc(goalRef(dbOf(DONO))));
});
