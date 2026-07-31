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

const PROJECT_ID = 'nexago-arena-staff-rbac-test';
const OWNER = 'owner-uid';
const GESTOR = 'gestor-uid';
const RECEPCAO = 'recepcao-uid';
const FINANCEIRO = 'financeiro-uid';
const MANUTENCAO = 'manutencao-uid';
const ESTRANHO = 'estranho-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

/** Arena Pro ativa, com um membro de cada cargo. */
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-pro'), {
      managerUserId: OWNER,
      name: 'Arena Pro',
      planTier: 'pro',
      planStatus: 'active',
      courtsCount: 3,
    });
    // Arena sem plano: os mesmos membros existem, mas o gate de titularidade derruba.
    await setDoc(doc(db, 'arenas', 'arena-sem-plano'), {
      managerUserId: OWNER,
      name: 'Arena Sem Plano',
      courtsCount: 1,
    });
    const membros = [
      [GESTOR, 'gestor'],
      [RECEPCAO, 'recepcao'],
      [FINANCEIRO, 'financeiro'],
      [MANUTENCAO, 'manutencao'],
    ];
    for (const [uid, role] of membros) {
      for (const arenaId of ['arena-pro', 'arena-sem-plano']) {
        await setDoc(doc(db, 'arenas', arenaId, 'staff', uid), {
          role,
          status: 'active',
          email: `${role}@arena.com`,
          displayName: role,
          addedBy: OWNER,
        });
      }
    }
    await setDoc(doc(db, 'arenaStaffInvites', 'convite-1'), {
      arenaId: 'arena-pro',
      arenaName: 'Arena Pro',
      emailLower: 'novo@arena.com',
      role: 'recepcao',
      status: 'pending',
      invitedBy: OWNER,
    });
    await setDoc(doc(db, 'users', GESTOR, 'arenaStaff', 'arena-pro'), {
      role: 'gestor',
      status: 'active',
      arenaName: 'Arena Pro',
    });
    // Convite malformado (sem emailLower) — nao pode ser legivel por ninguem
    // alem do dono/admin, nem por sessao sem e-mail.
    await setDoc(doc(db, 'arenaStaffInvites', 'convite-sem-email'), {
      arenaId: 'arena-pro',
      arenaName: 'Arena Pro',
      role: 'recepcao',
      status: 'pending',
      invitedBy: OWNER,
    });
  });
}

before(async () => {
  await seed();
});

after(async () => {
  await testEnv.cleanup();
});

function ctx(uid, extra = {}) {
  return testEnv.authenticatedContext(uid, { roles: ['arena'], ...extra }).firestore();
}

test('dono le a subcolecao staff', async () => {
  await assertSucceeds(getDoc(doc(ctx(OWNER), 'arenas/arena-pro/staff/' + GESTOR)));
});

test('membro le o proprio doc de staff', async () => {
  await assertSucceeds(getDoc(doc(ctx(GESTOR), 'arenas/arena-pro/staff/' + GESTOR)));
});

test('membro nao le o doc de staff de outro', async () => {
  await assertFails(getDoc(doc(ctx(RECEPCAO), 'arenas/arena-pro/staff/' + GESTOR)));
});

test('ninguem escreve direto na subcolecao staff, nem o dono', async () => {
  await assertFails(
    setDoc(doc(ctx(OWNER), 'arenas/arena-pro/staff/' + ESTRANHO), {
      role: 'gestor',
      status: 'active',
    }),
  );
});

test('gestor nao se promove trocando o proprio cargo', async () => {
  await assertFails(
    setDoc(doc(ctx(GESTOR), 'arenas/arena-pro/staff/' + GESTOR), {
      role: 'gestor',
      status: 'active',
    }),
  );
});

test('dono le convites da propria arena', async () => {
  await assertSucceeds(getDoc(doc(ctx(OWNER), 'arenaStaffInvites/convite-1')));
});

test('convidado le o convite pelo proprio email', async () => {
  const db = testEnv
    .authenticatedContext('novo-uid', { email: 'novo@arena.com' })
    .firestore();
  await assertSucceeds(getDoc(doc(db, 'arenaStaffInvites/convite-1')));
});

test('terceiro nao le convite alheio', async () => {
  const db = testEnv
    .authenticatedContext(ESTRANHO, { email: 'outro@arena.com' })
    .firestore();
  await assertFails(getDoc(doc(db, 'arenaStaffInvites/convite-1')));
});

test('cliente nao escreve convite', async () => {
  await assertFails(
    setDoc(doc(ctx(OWNER), 'arenaStaffInvites/convite-2'), {
      arenaId: 'arena-pro',
      emailLower: 'x@y.com',
      role: 'gestor',
      status: 'pending',
    }),
  );
});

test('sessao sem e-mail nao le convite malformado sem emailLower', async () => {
  const db = testEnv.authenticatedContext('phone-uid').firestore();
  await assertFails(getDoc(doc(db, 'arenaStaffInvites/convite-sem-email')));
});

test('sessao sem e-mail nao le convite normal', async () => {
  const db = testEnv.authenticatedContext('phone-uid-2').firestore();
  await assertFails(getDoc(doc(db, 'arenaStaffInvites/convite-1')));
});

test('sessao com e-mail vazio nao le convite malformado', async () => {
  const db = testEnv.authenticatedContext('empty-email-uid', { email: '' }).firestore();
  await assertFails(getDoc(doc(db, 'arenaStaffInvites/convite-sem-email')));
});

test('dono ainda le o convite malformado da propria arena', async () => {
  await assertSucceeds(getDoc(doc(ctx(OWNER), 'arenaStaffInvites/convite-sem-email')));
});

test('usuario le o proprio espelho de arenaStaff', async () => {
  await assertSucceeds(getDoc(doc(ctx(GESTOR), `users/${GESTOR}/arenaStaff/arena-pro`)));
});

test('usuario nao le o espelho de outro', async () => {
  await assertFails(getDoc(doc(ctx(RECEPCAO), `users/${GESTOR}/arenaStaff/arena-pro`)));
});

test('cliente nao escreve no espelho', async () => {
  await assertFails(
    setDoc(doc(ctx(GESTOR), `users/${GESTOR}/arenaStaff/arena-pro`), { role: 'gestor' }),
  );
});
