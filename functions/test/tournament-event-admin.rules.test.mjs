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
const GESTOR = 'gestor-uid';
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
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', GESTOR), {
      role: 'manager', status: 'active',
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

// O papel dizia "opera o evento, não toca no dinheiro", mas o `allow update`
// não tinha guarda de campo nenhuma: o administrador gravava `managerId` = ele
// mesmo e virava DONO numa escrita só — e dono lê o caixa e saca
// (`tournament-wallet-access.ts`, ramo `managerId === uid`). Ele não se
// promovia a gestor; se promovia a dono. Vale para o gestor também: quem
// sequestra `managerId` tranca o dono fora de `canManageTournamentStaff`.
for (const [papel, uid] of [['administrador', ADMIN_EVENTO], ['gestor', GESTOR]]) {
  test(`${papel} NÃO se grava como managerId do torneio`, async () => {
    await assertFails(
      updateDoc(
        doc(testEnv.authenticatedContext(uid).firestore(), 'tournaments', TORNEIO),
        { managerId: uid },
      ),
    );
  });
}

test('administrador NÃO mexe no total arrecadado', async () => {
  await assertFails(
    updateDoc(doc(asAdminEvento(), 'tournaments', TORNEIO), { collectedCents: 0 }),
  );
});

test('administrador NÃO exclui o torneio', async () => {
  await assertFails(deleteDoc(doc(asAdminEvento(), 'tournaments', TORNEIO)));
});

test('administrador lê o próprio doc de staff (autoleitura, não prova canManageTournament)', async () => {
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

// Caixa PARCIAL: a migração grava `availableReais` e de propósito não grava
// `pendingReais` (não pode apagar reserva de saque em curso). Acesso direto a
// campo ausente estoura a avaliação da regra, e aí o delete ficava negado para
// sempre — o torneio virava impossível de excluir, com mensagem que não
// explica nada. Com `.get(campo, 0)` o campo ausente é zero.
test('caixa sem os campos de saldo não tranca a exclusão', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', 'copa-caixa-parcial'), {
      managerId: DONO, name: 'Caixa parcial',
    });
    await setDoc(doc(db, 'tournamentWallets', 'copa-caixa-parcial'), {
      tournamentId: 'copa-caixa-parcial', ownerId: DONO,
    });
  });
  await assertSucceeds(
    deleteDoc(doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', 'copa-caixa-parcial')),
  );
});

test('caixa só com availableReais zerado (sem pendingReais) o dono exclui', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', 'copa-migrada'), { managerId: DONO, name: 'Migrada' });
    await setDoc(doc(db, 'tournamentWallets', 'copa-migrada'), {
      tournamentId: 'copa-migrada', ownerId: DONO, availableReais: 0,
    });
  });
  await assertSucceeds(
    deleteDoc(doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', 'copa-migrada')),
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

// O caso "autoleitura" acima passa pela segunda cláusula do `allow read` de
// `staff` (`request.auth.uid == staffUserId`) e não prova nada sobre
// `canManageTournament`. O ganho real do papel `eventAdmin` sobre `staff` —
// ler o doc de OUTRO membro da equipe, que só passa pela primeira cláusula —
// não tinha teste nenhum. Este caso fecha o buraco: o uid de quem lê
// (ADMIN_EVENTO) é diferente do uid do doc lido (MESARIO), então a
// autoleitura não pode salvá-lo.
const MESARIO = 'mesario-uid';

test('administrador lê o doc de staff de outro membro da equipe', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tournaments', TORNEIO, 'staff', MESARIO), {
      role: 'scorer', status: 'active',
    });
  });
  await assertSucceeds(
    getDoc(doc(asAdminEvento(), 'tournaments', TORNEIO, 'staff', MESARIO)),
  );
});
