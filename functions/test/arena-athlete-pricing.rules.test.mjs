// Preço por perfil do atleta: `arenas/{id}.athletePricing` e `arenaAthletePricingMembers` só as
// Cloud Functions gravam. O atleta lê o próprio vínculo (inclusive inexistente); a equipe com
// leitura de "promocoes" lê a lista da arena.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const OWNER_UID = 'arena-owner-uid';
const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-arena-athlete-pricing-test',
  firestore: { rules },
});

const PRICING = { student: { enabled: true, mode: 'fixed', pricePerHourReais: 100 } };

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'a1'), { managerUserId: OWNER_UID, name: 'Arena', athletePricing: PRICING });
    await setDoc(doc(db, 'arenaAthletePricingMembers', 'a1_aluno'), {
      arenaId: 'a1', athleteId: 'aluno', tier: 'student',
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('dono salva o perfil com merge sem mandar athletePricing', async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(setDoc(doc(db, 'arenas', 'a1'), { name: 'Arena Nova' }, { merge: true }));
});

test('dono não grava athletePricing pelo cliente', async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertFails(setDoc(doc(db, 'arenas', 'a1'), {
    athletePricing: { student: { enabled: true, mode: 'fixed', pricePerHourReais: 1 } },
  }, { merge: true }));
});

test('arena nova não nasce com athletePricing', async () => {
  const db = testEnv.authenticatedContext('novo-dono', { roles: ['arena'] }).firestore();
  await assertFails(setDoc(doc(db, 'arenas', 'a2'), {
    managerUserId: 'novo-dono', name: 'Outra', athletePricing: PRICING,
  }));
});

test('atleta lê o próprio vínculo (existente ou não) e não o dos outros', async () => {
  const aluno = testEnv.authenticatedContext('aluno').firestore();
  await assertSucceeds(getDoc(doc(aluno, 'arenaAthletePricingMembers', 'a1_aluno')));
  const outro = testEnv.authenticatedContext('outro').firestore();
  await assertSucceeds(getDoc(doc(outro, 'arenaAthletePricingMembers', 'a1_outro')));
  await assertFails(getDoc(doc(outro, 'arenaAthletePricingMembers', 'a1_aluno')));
});

test('ninguém grava o vínculo pelo cliente', async () => {
  const aluno = testEnv.authenticatedContext('aluno').firestore();
  await assertFails(setDoc(doc(aluno, 'arenaAthletePricingMembers', 'a1_aluno'), {
    arenaId: 'a1', athleteId: 'aluno', tier: 'professor',
  }));
  const owner = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertFails(setDoc(doc(owner, 'arenaAthletePricingMembers', 'a1_x'), {
    arenaId: 'a1', athleteId: 'x', tier: 'student',
  }));
});

test('dono lista os vínculos da arena', async () => {
  const owner = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(getDocs(query(collection(owner, 'arenaAthletePricingMembers'), where('arenaId', '==', 'a1'))));
  const outro = testEnv.authenticatedContext('outro').firestore();
  await assertFails(getDocs(query(collection(outro, 'arenaAthletePricingMembers'), where('arenaId', '==', 'a1'))));
});
