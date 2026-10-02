import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

/**
 * Carteira de cashback do atleta: saldo é dinheiro. Só o dono lê; ninguém
 * escreve pelo cliente — nem o próprio atleta (senão ele se dava saldo).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-athlete-wallet-test';
const DONO = 'atleta-uid';
const OUTRO = 'outro-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'athleteWallets', DONO), { uid: DONO, availableCents: 500 });
    await setDoc(doc(db, 'athleteWallets', DONO, 'lots', 'pay1'), { earnedCents: 500 });
    await setDoc(doc(db, 'athleteWallets', DONO, 'holds', 'h1'), { amountCents: 100 });
    await setDoc(doc(db, 'athleteWallets', DONO, 'ledger', 'e1'), { type: 'earn' });
  });
});

after(async () => { await testEnv.cleanup(); });

const dbOf = (uid) => testEnv.authenticatedContext(uid).firestore();

test('dono lê a carteira e as subcoleções', async () => {
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'athleteWallets', DONO)));
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'lots', 'pay1')));
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'holds', 'h1')));
  await assertSucceeds(getDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'ledger', 'e1')));
});

test('outro atleta não lê', async () => {
  await assertFails(getDoc(doc(dbOf(OUTRO), 'athleteWallets', DONO)));
  await assertFails(getDoc(doc(dbOf(OUTRO), 'athleteWallets', DONO, 'ledger', 'e1')));
});

test('anônimo não lê', async () => {
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'athleteWallets', DONO)));
});

test('nem o dono escreve na carteira', async () => {
  await assertFails(updateDoc(doc(dbOf(DONO), 'athleteWallets', DONO), { availableCents: 999999 }));
  await assertFails(setDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'lots', 'fake'), { earnedCents: 999999 }));
  await assertFails(setDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'ledger', 'fake'), { type: 'earn' }));
  await assertFails(deleteDoc(doc(dbOf(DONO), 'athleteWallets', DONO, 'holds', 'h1')));
});

test('ninguém cria carteira para si', async () => {
  await assertFails(setDoc(doc(dbOf(OUTRO), 'athleteWallets', OUTRO), { availableCents: 100 }));
});
