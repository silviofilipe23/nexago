import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-tournament-wallet-test';
const DONO = 'dono-uid';
const GESTOR = 'gestor-uid';
const ADMIN_EVENTO = 'admin-evento-uid';
const MESARIO = 'mesario-uid';
const ESTRANHO = 'estranho-uid';
const TORNEIO = 'copa-caixa';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', TORNEIO), { managerId: DONO, name: 'Copa Caixa' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', GESTOR), { role: 'manager', status: 'active' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', ADMIN_EVENTO), { role: 'eventAdmin', status: 'active' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', MESARIO), { role: 'scorer', status: 'active' });
    await setDoc(doc(db, 'tournamentWallets', TORNEIO), {
      tournamentId: TORNEIO, ownerId: DONO, availableReais: 100, pendingReais: 0,
    });
    await setDoc(doc(db, 'tournamentWallets', TORNEIO, 'ledger', 'l1'), { netReais: 92 });
    await setDoc(doc(db, 'organizerPayoutProfiles', GESTOR), {
      payoutPixKey: 'gestor@exemplo.com', payoutPixKeyType: 'EMAIL',
    });
  });
});

after(async () => { await testEnv.cleanup(); });

const walletOf = (uid) => doc(testEnv.authenticatedContext(uid).firestore(), 'tournamentWallets', TORNEIO);

test('dono lê o caixa do torneio', async () => {
  await assertSucceeds(getDoc(walletOf(DONO)));
});

test('gestor da equipe lê o caixa', async () => {
  await assertSucceeds(getDoc(walletOf(GESTOR)));
});

test('administrador do evento NÃO lê o caixa', async () => {
  await assertFails(getDoc(walletOf(ADMIN_EVENTO)));
});

test('mesário não lê o caixa', async () => {
  await assertFails(getDoc(walletOf(MESARIO)));
});

test('estranho não lê o caixa', async () => {
  await assertFails(getDoc(walletOf(ESTRANHO)));
});

test('anônimo não lê o caixa', async () => {
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'tournamentWallets', TORNEIO)));
});

test('extrato segue a mesma regra do caixa', async () => {
  const ledgerPath = ['tournamentWallets', TORNEIO, 'ledger', 'l1'];
  await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(GESTOR).firestore(), ...ledgerPath)));
  await assertFails(getDoc(doc(testEnv.authenticatedContext(ADMIN_EVENTO).firestore(), ...ledgerPath)));
});

test('ninguém escreve no caixa pelo cliente', async () => {
  await assertFails(setDoc(walletOf(DONO), { availableReais: 999 }, { merge: true }));
});

test('perfil de repasse é privado do dono', async () => {
  const db = (uid) => doc(testEnv.authenticatedContext(uid).firestore(), 'organizerPayoutProfiles', GESTOR);
  await assertSucceeds(getDoc(db(GESTOR)));
  await assertFails(getDoc(db(DONO)));
  await assertFails(setDoc(db(GESTOR), { payoutPixKey: 'outro@exemplo.com' }, { merge: true }));
});
