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
 * "Horários mais movimentados" do perfil da arena: o app lê o resumo de qualquer atleta
 * (e o portal sem login); só a agendada `refreshArenaPopularTimes` grava, pelo Admin SDK.
 * Ninguém pelo cliente — nem o dono da arena — escreve ou apaga, senão a arena poderia
 * pintar o próprio movimento.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-arena-popular-times-test';
const OWNER_UID = 'arena-owner';
const PATH = 'arenaPopularTimes/a1';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'arenas/a1'), { name: 'Arena', ownerId: OWNER_UID, managerId: OWNER_UID });
    await setDoc(doc(ctx.firestore(), PATH), { arenaId: 'a1', bookingsCount: 30, byWeekday: { 1: [0, 100] } });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('anônimo e atleta logado leem o resumo', async () => {
  await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), PATH)));
  await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('atleta').firestore(), PATH)));
});

test('ninguém grava pelo cliente, nem o dono da arena', async () => {
  const owner = testEnv.authenticatedContext(OWNER_UID, { arena: true }).firestore();
  await assertFails(setDoc(doc(owner, 'arenaPopularTimes/a2'), { arenaId: 'a2', byWeekday: null }));
  await assertFails(updateDoc(doc(owner, PATH), { bookingsCount: 999 }));
  await assertFails(deleteDoc(doc(owner, PATH)));
  const athlete = testEnv.authenticatedContext('atleta').firestore();
  await assertFails(updateDoc(doc(athlete, PATH), { bookingsCount: 0 }));
});
