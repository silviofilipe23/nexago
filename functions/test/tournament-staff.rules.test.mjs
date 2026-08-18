import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-tournament-staff-test';
const DONO = 'dono-uid';
const SUPER = 'super-admin-uid';
const ADMIN = 'admin-sem-super-uid';
const ESTRANHO = 'organizador-estranho-uid';
const MESARIO = 'mesario-uid';
const NOVATO = 'novato-uid';
const TORNEIO = 'copa-teste';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

/** Torneio de DONO com um mesário já na equipe. */
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', TORNEIO), {
      managerId: DONO,
      name: 'Copa Teste',
      listingStatus: 'open',
      enrolledCount: 0,
      collectedCents: 0,
      categories: [{ id: 'cat-1', name: 'Open' }],
    });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', MESARIO), {
      role: 'scorer',
      status: 'active',
      displayName: 'Mesário',
      nickname: '',
      photoUrl: null,
      addedBy: DONO,
    });
  });
}

before(seed);
after(() => testEnv.cleanup());

function ctx(uid, claims) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

const dono = () => ctx(DONO, { roles: ['organizer'] });
const superAdmin = () => ctx(SUPER, { roles: ['admin', 'organizer'], superAdmin: true });
const adminSemSuper = () => ctx(ADMIN, { roles: ['admin'] });
const estranho = () => ctx(ESTRANHO, { roles: ['organizer'] });

/** Payload de adição idêntico ao que `staff-repository.ts` grava no portal web. */
function membro(role, addedBy) {
  return {
    role,
    status: 'active',
    displayName: 'Fulano de Tal',
    nickname: 'Fulano',
    photoUrl: null,
    addedBy,
  };
}

/** Cada teste escreve num uid próprio: assertSucceeds persiste, e um doc deixado
 *  para trás mudaria o resultado do teste seguinte. */
function staffRef(db, uid) {
  return doc(db, 'tournaments', TORNEIO, 'staff', uid);
}

test('dono adiciona gestor na própria equipe', async () => {
  await assertSucceeds(setDoc(staffRef(dono(), 'add-dono'), membro('manager', DONO)));
});

test('super admin adiciona gestor em torneio alheio', async () => {
  await assertSucceeds(setDoc(staffRef(superAdmin(), 'add-super'), membro('manager', SUPER)));
});

test('super admin adiciona mesário em torneio alheio', async () => {
  await assertSucceeds(setDoc(staffRef(superAdmin(), 'add-super-scorer'), membro('scorer', SUPER)));
});

test('super admin troca o papel de um membro', async () => {
  await assertSucceeds(
    setDoc(staffRef(superAdmin(), MESARIO), { role: 'manager', status: 'active' }, { merge: true }),
  );
});

test('super admin remove membro da equipe', async () => {
  await testEnv.withSecurityRulesDisabled(async (c) => {
    await setDoc(staffRef(c.firestore(), 'remover-super'), membro('manager', DONO));
  });
  await assertSucceeds(deleteDoc(staffRef(superAdmin(), 'remover-super')));
});

test('super admin lê a equipe do torneio alheio', async () => {
  await assertSucceeds(getDoc(staffRef(superAdmin(), MESARIO)));
});

test('organizador estranho não adiciona ninguém', async () => {
  await assertFails(setDoc(staffRef(estranho(), NOVATO), membro('manager', ESTRANHO)));
});

test('organizador estranho não remove ninguém', async () => {
  await assertFails(deleteDoc(staffRef(estranho(), MESARIO)));
});

test('role admin sem a claim superAdmin não mexe na equipe', async () => {
  await assertFails(setDoc(staffRef(adminSemSuper(), NOVATO), membro('manager', ADMIN)));
});

test('super admin não adiciona o dono do torneio como staff dele mesmo', async () => {
  await assertFails(setDoc(staffRef(superAdmin(), DONO), membro('manager', SUPER)));
});

test('dono não vira staff do próprio torneio', async () => {
  await assertFails(setDoc(staffRef(dono(), DONO), membro('manager', DONO)));
});

test('super admin não se adiciona à equipe', async () => {
  await assertFails(setDoc(staffRef(superAdmin(), SUPER), membro('manager', SUPER)));
});

test('super admin não grava papel fora de manager/scorer', async () => {
  await assertFails(setDoc(staffRef(superAdmin(), NOVATO), membro('owner', SUPER)));
});

test('super admin não grava membro pendente — acesso é imediato ou nada', async () => {
  await assertFails(
    setDoc(staffRef(superAdmin(), NOVATO), { ...membro('manager', SUPER), status: 'pending' }),
  );
});
