import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-arena-classes-test';
const OWNER = 'owner-uid';
const RECEPCAO = 'recepcao-uid';
const MANUTENCAO = 'manutencao-uid';
const FINANCEIRO = 'financeiro-uid';
const ALUNO = 'aluno-uid';
const OUTRO_DONO = 'outro-dono-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

const SESSION = 'class_c1_2026-10-26';

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-pro'), {
      managerUserId: OWNER, name: 'Arena Pro', planTier: 'pro', planStatus: 'active',
    });
    await setDoc(doc(db, 'arenas', 'arena-outra'), {
      managerUserId: OUTRO_DONO, name: 'Outra', planTier: 'pro', planStatus: 'active',
    });
    for (const [uid, role] of [[RECEPCAO, 'recepcao'], [MANUTENCAO, 'manutencao'], [FINANCEIRO, 'financeiro']]) {
      await setDoc(doc(db, 'arenas', 'arena-pro', 'staff', uid), { role, status: 'active' });
    }
    await setDoc(doc(db, 'arenas', 'arena-pro', 'classTeachers', 't1'), {
      arenaId: 'arena-pro', name: 'Thiago', status: 'active',
    });
    await setDoc(doc(db, 'arenaClasses', 'c1'), {
      arenaId: 'arena-pro', name: 'Iniciante A', status: 'active', studentCount: 1,
    });
    await setDoc(doc(db, 'arenaClasses', 'c1', 'classStudents', ALUNO), {
      arenaId: 'arena-pro', classId: 'c1', athleteId: ALUNO, name: 'Carla', status: 'active',
    });
    await setDoc(doc(db, 'arenaClassSessions', SESSION), {
      arenaId: 'arena-pro', classId: 'c1', date: '2026-10-26', status: 'scheduled',
    });
    // Bloqueio da aula na agenda de reservas + uma reserva comum de comparação.
    await setDoc(doc(db, 'arenaBookings', SESSION), {
      arenaId: 'arena-pro', athleteId: null, status: 'active', attendanceStatus: 'pending',
      source: 'class', isClassSession: true, classSessionId: SESSION,
    });
    await setDoc(doc(db, 'arenaBookings', 'reserva-comum'), {
      arenaId: 'arena-pro', athleteId: 'atleta-x', status: 'active', attendanceStatus: 'pending',
    });
  });
}

before(async () => {
  await seed();
});

after(async () => {
  await testEnv.cleanup();
});

const as = (uid) => testEnv.authenticatedContext(uid).firestore();

test('dono e equipe que vê a agenda leem turma, alunos, aulas e professores', async () => {
  for (const uid of [OWNER, RECEPCAO, MANUTENCAO]) {
    const db = as(uid);
    await assertSucceeds(getDoc(doc(db, 'arenaClasses', 'c1')));
    await assertSucceeds(getDoc(doc(db, 'arenaClasses', 'c1', 'classStudents', ALUNO)));
    await assertSucceeds(getDoc(doc(db, 'arenaClassSessions', SESSION)));
    await assertSucceeds(getDoc(doc(db, 'arenas', 'arena-pro', 'classTeachers', 't1')));
    await assertSucceeds(getDocs(query(collection(db, 'arenaClasses'), where('arenaId', '==', 'arena-pro'))));
    await assertSucceeds(getDocs(query(collection(db, 'arenaClassSessions'), where('arenaId', '==', 'arena-pro'))));
    await assertSucceeds(getDocs(query(
      collection(db, 'arenaClasses', 'c1', 'classStudents'),
      where('arenaId', '==', 'arena-pro'),
    )));
  }
});

test('financeiro (sem agenda), dono de outra arena e o próprio aluno não leem', async () => {
  for (const uid of [FINANCEIRO, OUTRO_DONO, ALUNO]) {
    const db = as(uid);
    await assertFails(getDoc(doc(db, 'arenaClasses', 'c1')));
    await assertFails(getDoc(doc(db, 'arenaClasses', 'c1', 'classStudents', ALUNO)));
    await assertFails(getDoc(doc(db, 'arenaClassSessions', SESSION)));
    await assertFails(getDoc(doc(db, 'arenas', 'arena-pro', 'classTeachers', 't1')));
  }
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'arenaClasses', 'c1')));
});

test('query sem filtro de arena é recusada', async () => {
  await assertFails(getDocs(collection(as(OWNER), 'arenaClassSessions')));
});

test('ninguém escreve direto — só as Cloud Functions', async () => {
  const db = as(OWNER);
  await assertFails(setDoc(doc(db, 'arenaClasses', 'c2'), { arenaId: 'arena-pro', name: 'X' }));
  await assertFails(setDoc(doc(db, 'arenaClasses', 'c1'), { capacity: 99 }, { merge: true }));
  await assertFails(setDoc(doc(db, 'arenaClasses', 'c1', 'classStudents', 'novo'), { arenaId: 'arena-pro' }));
  await assertFails(setDoc(doc(db, 'arenaClassSessions', SESSION), { status: 'completed' }, { merge: true }));
  await assertFails(setDoc(doc(db, 'arenas', 'arena-pro', 'classTeachers', 't2'), { name: 'Y' }));
});

test('equipe não cancela o bloqueio de aula pela reserva (só pela aula); reserva comum segue', async () => {
  for (const uid of [OWNER, RECEPCAO]) {
    const db = as(uid);
    await assertFails(updateDoc(doc(db, 'arenaBookings', SESSION), { status: 'canceled', canceledByRole: 'arena_manager' }));
  }
  await assertSucceeds(updateDoc(doc(as(RECEPCAO), 'arenaBookings', 'reserva-comum'), { status: 'canceled', canceledByRole: 'arena_manager' }));
});

test('fase 2: planos, regras, crédito e lista de espera — só quem vê a agenda', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-pro', 'classPlans', 'm2'), { name: 'Mensal 2x', kind: 'monthly', status: 'active' });
    await setDoc(doc(db, 'arenas', 'arena-pro', 'classSettings', 'rules'), { makeupValidityDays: 30 });
    await setDoc(doc(db, 'arenaClassCredits', 'cr1'), { arenaId: 'arena-pro', studentId: ALUNO, status: 'available' });
    await setDoc(doc(db, 'arenaClasses', 'c1', 'classWaitlist', 'w1'), { arenaId: 'arena-pro', classId: 'c1', status: 'waiting' });
  });
  const paths = [
    ['arenas', 'arena-pro', 'classPlans', 'm2'],
    ['arenas', 'arena-pro', 'classSettings', 'rules'],
    ['arenaClassCredits', 'cr1'],
    ['arenaClasses', 'c1', 'classWaitlist', 'w1'],
  ];
  for (const p of paths) {
    await assertSucceeds(getDoc(doc(as(RECEPCAO), ...p)));
    await assertSucceeds(getDoc(doc(as(MANUTENCAO), ...p)));
    await assertFails(getDoc(doc(as(FINANCEIRO), ...p)));
    await assertFails(getDoc(doc(as(ALUNO), ...p)));
    await assertFails(setDoc(doc(as(OWNER), ...p), { x: 1 }, { merge: true }));
  }
});

test('fase 2: matrícula e mensalidade — agenda ou financeiro leem; ninguém escreve', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenaClassEnrollments', 'e1'), { arenaId: 'arena-pro', studentId: ALUNO, status: 'active' });
    await setDoc(doc(db, 'arenaClassCharges', 'e1_2026-11'), { arenaId: 'arena-pro', enrollmentId: 'e1', status: 'open' });
  });
  for (const p of [['arenaClassEnrollments', 'e1'], ['arenaClassCharges', 'e1_2026-11']]) {
    for (const uid of [OWNER, RECEPCAO, FINANCEIRO]) await assertSucceeds(getDoc(doc(as(uid), ...p)));
    await assertFails(getDoc(doc(as(ALUNO), ...p)));
    await assertFails(getDoc(doc(as(OUTRO_DONO), ...p)));
    await assertFails(setDoc(doc(as(OWNER), ...p), { status: 'paid' }, { merge: true }));
  }
  await assertSucceeds(getDocs(query(collection(as(FINANCEIRO), 'arenaClassCharges'), where('arenaId', '==', 'arena-pro'))));
});

test('fase 2b: repasse do professor — só quem lê o financeiro; ninguém escreve', async () => {
  const GESTOR = 'gestor-uid';
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-pro', 'staff', GESTOR), { role: 'gestor', status: 'active' });
    await setDoc(doc(db, 'arenaClassPayouts', 'arena-pro_t1_2026-10'), {
      arenaId: 'arena-pro', teacherId: 't1', month: '2026-10', amountReais: 80, status: 'closed',
    });
  });
  const p = ['arenaClassPayouts', 'arena-pro_t1_2026-10'];
  for (const uid of [OWNER, GESTOR, FINANCEIRO]) {
    await assertSucceeds(getDoc(doc(as(uid), ...p)));
    await assertSucceeds(getDocs(query(
      collection(as(uid), 'arenaClassPayouts'),
      where('arenaId', '==', 'arena-pro'),
      where('month', '==', '2026-10'),
    )));
  }
  // Fechamento que ainda não existe: `get` do doc é negado (a rule lê `resource.data.arenaId`),
  // então o portal escuta por query com `arenaId` — que passa mesmo vazia.
  await assertFails(getDoc(doc(as(OWNER), 'arenaClassPayouts', 'arena-pro_t1_2026-09')));
  await assertSucceeds(getDocs(query(
    collection(as(GESTOR), 'arenaClassPayouts'),
    where('arenaId', '==', 'arena-pro'),
    where('teacherId', '==', 't1'),
    where('month', '==', '2026-09'),
  )));
  // Recepção e manutenção veem a agenda, não quanto o professor ganha.
  for (const uid of [RECEPCAO, MANUTENCAO, ALUNO, OUTRO_DONO]) await assertFails(getDoc(doc(as(uid), ...p)));
  await assertFails(getDocs(collection(as(OWNER), 'arenaClassPayouts')));
  for (const uid of [OWNER, GESTOR]) {
    await assertFails(setDoc(doc(as(uid), ...p), { status: 'paid' }, { merge: true }));
    await assertFails(setDoc(doc(as(uid), 'arenaClassPayouts', 'arena-pro_t1_2026-11'), { arenaId: 'arena-pro', status: 'closed' }));
  }
});
