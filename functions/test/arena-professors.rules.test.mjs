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
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-arena-professors-test';
const OWNER = 'owner-uid';
const GESTOR = 'gestor-uid';
const RECEPCAO = 'recepcao-uid';
const OUTRO_DONO = 'outro-dono-uid';
const PROF = 'prof-uid';
const OUTRO_PROF = 'outro-prof-uid';

const LINK = `arena-pro_${PROF}`;
const LINK_OUTRO_PROF = `arena-pro_${OUTRO_PROF}`;
const LINK_OUTRA_ARENA = `arena-outra_${PROF}`;

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

function linkDoc(arenaId, professorUserId, status = 'ACTIVE') {
  return {
    arenaId,
    professorUserId,
    status,
    relationshipType: 'INDEPENDENT',
    initiatedBy: 'PROFESSOR',
    permissions: { canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: false },
    rejectionReason: null,
  };
}

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-pro'), {
      managerUserId: OWNER, name: 'Arena Pro', planTier: 'pro', planStatus: 'active',
    });
    await setDoc(doc(db, 'arenas', 'arena-outra'), {
      managerUserId: OUTRO_DONO, name: 'Outra', planTier: 'pro', planStatus: 'active',
    });
    await setDoc(doc(db, 'arenas', 'arena-pro', 'staff', GESTOR), { role: 'gestor', status: 'active' });
    await setDoc(doc(db, 'arenas', 'arena-pro', 'staff', RECEPCAO), { role: 'recepcao', status: 'active' });
    await setDoc(doc(db, 'arenaProfessors', LINK), linkDoc('arena-pro', PROF));
    await setDoc(doc(db, 'arenaProfessors', LINK_OUTRO_PROF), linkDoc('arena-pro', OUTRO_PROF, 'PENDING'));
    await setDoc(doc(db, 'arenaProfessors', LINK_OUTRA_ARENA), linkDoc('arena-outra', PROF, 'SUSPENDED'));
    await setDoc(doc(db, 'arenaProfessors', LINK, 'events', 'e1'), {
      eventType: 'APPROVED', arenaId: 'arena-pro', professorUserId: PROF,
    });
    await setDoc(doc(db, 'arenaProfessors', LINK_OUTRA_ARENA, 'events', 'e1'), {
      eventType: 'SUSPENDED', arenaId: 'arena-outra', professorUserId: PROF,
    });
    await setDoc(doc(db, 'arenas', 'arena-pro', 'publicProfessors', PROF), {
      name: 'Thiago', relationshipType: 'ARENA_STAFF',
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

const as = (uid) => testEnv.authenticatedContext(uid).firestore();

test('professor lê os próprios vínculos (todas as arenas) e o histórico deles', async () => {
  const db = as(PROF);
  await assertSucceeds(getDoc(doc(db, 'arenaProfessors', LINK)));
  await assertSucceeds(getDoc(doc(db, 'arenaProfessors', LINK_OUTRA_ARENA)));
  const mine = await assertSucceeds(getDocs(query(collection(db, 'arenaProfessors'), where('professorUserId', '==', PROF))));
  if (mine.size !== 2) throw new Error(`esperava 2 vínculos, veio ${mine.size}`);
  await assertSucceeds(getDocs(collection(db, 'arenaProfessors', LINK, 'events')));
  await assertSucceeds(getDocs(collection(db, 'arenaProfessors', LINK_OUTRA_ARENA, 'events')));
});

test('professor lê o próprio par ainda sem vínculo (página da arena); o par alheio não', async () => {
  const snap = await assertSucceeds(getDoc(doc(as(PROF), 'arenaProfessors', `arena-nova_${PROF}`)));
  if (snap.exists()) throw new Error('par inexistente deveria vir vazio');
  await assertFails(getDoc(doc(as(OUTRO_PROF), 'arenaProfessors', `arena-nova_${PROF}`)));
});

test('professor não lê vínculo de outro professor nem lista a arena', async () => {
  const db = as(PROF);
  await assertFails(getDoc(doc(db, 'arenaProfessors', LINK_OUTRO_PROF)));
  await assertFails(getDocs(query(collection(db, 'arenaProfessors'), where('arenaId', '==', 'arena-pro'))));
  await assertFails(getDocs(collection(db, 'arenaProfessors', LINK_OUTRO_PROF, 'events')));
});

test('dono e gestor listam os vínculos da própria arena', async () => {
  for (const uid of [OWNER, GESTOR]) {
    const db = as(uid);
    const list = await assertSucceeds(getDocs(query(collection(db, 'arenaProfessors'), where('arenaId', '==', 'arena-pro'))));
    if (list.size !== 2) throw new Error(`${uid}: esperava 2, veio ${list.size}`);
    await assertSucceeds(getDocs(collection(db, 'arenaProfessors', LINK, 'events')));
  }
});

test('recepção e dono de outra arena não veem os vínculos da arena', async () => {
  for (const uid of [RECEPCAO, OUTRO_DONO]) {
    const db = as(uid);
    await assertFails(getDocs(query(collection(db, 'arenaProfessors'), where('arenaId', '==', 'arena-pro'))));
    await assertFails(getDoc(doc(db, 'arenaProfessors', LINK)));
    await assertFails(getDocs(collection(db, 'arenaProfessors', LINK, 'events')));
  }
  // O dono da outra arena vê só o vínculo dele.
  await assertSucceeds(getDoc(doc(as(OUTRO_DONO), 'arenaProfessors', LINK_OUTRA_ARENA)));
});

test('ninguém grava vínculo ou histórico direto — nem o professor, nem o dono', async () => {
  for (const uid of [PROF, OWNER, GESTOR]) {
    const db = as(uid);
    await assertFails(updateDoc(doc(db, 'arenaProfessors', LINK), { status: 'ACTIVE' }));
    await assertFails(updateDoc(doc(db, 'arenaProfessors', LINK), { 'permissions.canAppearInArenaProfile': true }));
    await assertFails(setDoc(doc(db, 'arenaProfessors', `arena-pro_${uid}x`), linkDoc('arena-pro', uid, 'ACTIVE')));
    await assertFails(deleteDoc(doc(db, 'arenaProfessors', LINK)));
    await assertFails(setDoc(doc(db, 'arenaProfessors', LINK, 'events', 'fake'), { eventType: 'APPROVED' }));
    await assertFails(setDoc(doc(db, 'arenas', 'arena-pro', 'publicProfessors', uid), { name: 'x' }));
  }
});

test('página pública lê os professores da arena sem login', async () => {
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(collection(anon, 'arenas', 'arena-pro', 'publicProfessors')));
  await assertFails(getDoc(doc(anon, 'arenaProfessors', LINK)));
});

test('comunicados da arena aos professores: destinatário e gestão leem; recepção/estranho não; ninguém grava', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenaProfessorNotices', 'n1'), {arenaId: 'arena-pro', recipientIds: [PROF], title: 'Aviso'});
    await setDoc(doc(db, 'arenaProfessorNotices', 'n1', 'recipients', PROF), {professorUid: PROF});
  });
  const as = (uid) => testEnv.authenticatedContext(uid).firestore();
  await assertSucceeds(getDoc(doc(as(PROF), 'arenaProfessorNotices', 'n1')));
  await assertSucceeds(getDocs(query(collection(as(PROF), 'arenaProfessorNotices'), where('recipientIds', 'array-contains', PROF))));
  await assertSucceeds(getDoc(doc(as(GESTOR), 'arenaProfessorNotices', 'n1')));
  await assertSucceeds(getDocs(query(collection(as(OWNER), 'arenaProfessorNotices'), where('arenaId', '==', 'arena-pro'))));
  await assertSucceeds(getDocs(collection(as(OWNER), 'arenaProfessorNotices', 'n1', 'recipients')));
  await assertSucceeds(getDoc(doc(as(PROF), 'arenaProfessorNotices', 'n1', 'recipients', PROF)));
  await assertFails(getDoc(doc(as(OUTRO_PROF), 'arenaProfessorNotices', 'n1')));
  await assertFails(getDoc(doc(as(RECEPCAO), 'arenaProfessorNotices', 'n1')));
  await assertFails(getDoc(doc(as(OUTRO_DONO), 'arenaProfessorNotices', 'n1')));
  await assertFails(getDocs(collection(as(OUTRO_PROF), 'arenaProfessorNotices', 'n1', 'recipients')));
  await assertFails(setDoc(doc(as(OWNER), 'arenaProfessorNotices', 'n2'), {arenaId: 'arena-pro', recipientIds: [PROF]}));
  await assertFails(setDoc(doc(as(PROF), 'arenaProfessorNotices', 'n1', 'recipients', PROF), {professorUid: PROF}));
});
