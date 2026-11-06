import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

/**
 * Saque de organizador e de arena só muda pelas Cloud Functions (revisão do backoffice, webhook do
 * Asaas). Em 19/09/2026 um saque teve o `status` trocado para `approved` por fora do fluxo: o PIX
 * saiu, mas a reserva ficou presa no caixa por semanas. Nenhum portal escreve nessas coleções, então
 * nem o admin edita pelo cliente — ele lê, e decide pela fila de Saques.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-withdrawals-rules-test',
  firestore: { rules },
});

const ADMIN = 'admin-uid';
const ORGANIZER = 'organizer-uid';

const admin = () => testEnv.authenticatedContext(ADMIN, { roles: ['admin'] }).firestore();
const organizer = () => testEnv.authenticatedContext(ORGANIZER, { roles: ['organizer'] }).firestore();

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('organizerWithdrawals/w1').set({ organizerId: ORGANIZER, amountReais: 571.03, status: 'pending', payoutStatus: 'pending' });
    await db.doc('arenaWithdrawals/a1').set({ arenaId: 'arena-1', amountReais: 14, status: 'pending', payoutStatus: 'pending' });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('admin lê os saques', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'organizerWithdrawals/w1')));
  await assertSucceeds(getDoc(doc(admin(), 'arenaWithdrawals/a1')));
});

test('organizador lê o próprio saque', async () => {
  await assertSucceeds(getDoc(doc(organizer(), 'organizerWithdrawals/w1')));
});

test('admin não troca o status do saque do organizador pelo cliente', async () => {
  await assertFails(updateDoc(doc(admin(), 'organizerWithdrawals/w1'), { status: 'approved' }));
});

test('admin não troca o status do saque da arena pelo cliente', async () => {
  await assertFails(updateDoc(doc(admin(), 'arenaWithdrawals/a1'), { status: 'approved' }));
});

test('organizador não mexe no próprio saque', async () => {
  await assertFails(updateDoc(doc(organizer(), 'organizerWithdrawals/w1'), { amountReais: 1 }));
});
