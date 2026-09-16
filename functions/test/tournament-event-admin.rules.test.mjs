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

const COM_SALDO = 'copa-com-saldo';
const SEM_SALDO = 'copa-sem-saldo';

test('torneio com saldo no caixa não pode ser excluído', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', COM_SALDO), { managerId: DONO, name: 'Com saldo' });
    await setDoc(doc(db, 'tournamentWallets', COM_SALDO), {
      tournamentId: COM_SALDO, availableReais: 42, pendingReais: 0,
    });
  });
  await assertFails(
    deleteDoc(doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', COM_SALDO)),
  );
});

test('saque pendente também tranca a exclusão', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', 'copa-pendente'), { managerId: DONO, name: 'Pendente' });
    await setDoc(doc(db, 'tournamentWallets', 'copa-pendente'), {
      tournamentId: 'copa-pendente', availableReais: 0, pendingReais: 30,
    });
  });
  await assertFails(
    deleteDoc(doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', 'copa-pendente')),
  );
});

test('torneio com caixa zerado o dono exclui', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', SEM_SALDO), { managerId: DONO, name: 'Sem saldo' });
    await setDoc(doc(db, 'tournamentWallets', SEM_SALDO), {
      tournamentId: SEM_SALDO, availableReais: 0, pendingReais: 0,
    });
  });
  await assertSucceeds(
    deleteDoc(doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', SEM_SALDO)),
  );
});

test('torneio que nunca teve caixa o dono exclui', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tournaments', 'copa-sem-caixa'), {
      managerId: DONO, name: 'Sem caixa',
    });
  });
  await assertSucceeds(
    deleteDoc(doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', 'copa-sem-caixa')),
  );
});
