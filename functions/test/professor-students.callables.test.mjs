/**
 * Fiação da `getMyProfessorStudents` REAL (`.run()`) contra o emulador do Firestore: Admin SDK de
 * verdade (getAll, Timestamp, queries) do pedido até a resposta. Os casos de regra ficam em
 * `src/professor-students.test.ts` (FakeFirestore).
 *
 * Uso: `npm run test:callables`.
 */

import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST ausente — rode via `npm run test:callables`.');
}
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();

const {getMyProfessorStudents} = await import('../lib/professor-students.js');
const {dayKeyFromEventDate} = await import('../lib/event-timezone.js');
const {addDaysToDateKey} = await import('../lib/arena-recurring-booking.js');

const TODAY = dayKeyFromEventDate(new Date());
const YESTERDAY = addDaysToDateKey(TODAY, -1);

function call(fn, uid, data = {}) {
  return fn.run({auth: uid ? {uid, token: {}} : undefined, data, rawRequest: {headers: {}}, acceptsStreaming: false});
}

async function clearFirestore() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, {method: 'DELETE'});
  if (!res.ok) throw new Error(`Falha ao limpar o emulador: ${res.status}`);
}

beforeEach(async () => {
  await clearFirestore();
  await db.doc('arenaProfessors/a1_uProf').set({
    arenaId: 'a1', professorUserId: 'uProf', relationshipType: 'ARENA_STAFF', status: 'ACTIVE', initiatedBy: 'ARENA',
    permissions: {canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: true},
    arenaName: 'Arena CFC', professorName: 'Thiago Mendes',
  });
  await db.doc('arenaClasses/c1').set({
    arenaId: 'a1', arenaName: 'Arena CFC', name: 'Iniciante A', type: 'turma', level: 'iniciante',
    teacherId: 't1', teacherUserId: 'uProf', weekdays: [1, 3], startTime: '07:00', endTime: '08:00',
    courtName: 'Quadra 1', capacity: 6, status: 'active',
  });
  await db.doc('arenaClasses/c1/classStudents/u1').set({
    arenaId: 'a1', classId: 'c1', name: 'Carla Dias', status: 'active', athleteId: 'u1', enrollmentId: 'e1',
    phone: '62999990000', enrolledAt: Timestamp.fromDate(new Date('2025-03-10T15:00:00Z')),
  });
  await db.doc('arenaClasses/c1/classWaitlist/w1').set({arenaId: 'a1', classId: 'c1', status: 'waiting'});
  await db.doc(`arenaClassSessions/class_c1_${YESTERDAY}`).set({
    classId: 'c1', arenaId: 'a1', className: 'Iniciante A', date: YESTERDAY, startTime: '07:00', endTime: '08:00',
    status: 'completed', teacherUserId: 'uProf', attendance: {u1: {mark: 'present', name: 'Carla Dias'}}, extras: {},
  });
  await db.doc('arenaClassEnrollments/e1').set({
    arenaId: 'a1', studentId: 'u1', status: 'active', phone: '62999990000',
    plan: {planId: 'p1', name: 'Mensal 2x', kind: 'monthly', priceReais: 320},
  });
  await db.doc('arenaClassCharges/e1_x').set({
    arenaId: 'a1', enrollmentId: 'e1', studentId: 'u1', status: 'open', dueDate: YESTERDAY, amountReais: 320,
  });
  await db.doc('arenaClassCredits/s_u1').set({
    arenaId: 'a1', studentId: 'u1', status: 'available', expiresOn: addDaysToDateKey(TODAY, 20),
  });
});

test('professor recebe os alunos da turma com marcas, plano e situação', async () => {
  const result = await call(getMyProfessorStudents, 'uProf');
  assert.equal(result.todayKey, TODAY);
  assert.deepEqual(result.arenas.map((a) => [a.arenaId, a.canSeeStudents, a.studentCount]), [['a1', true, 1]]);
  const [carla] = result.students;
  assert.equal(carla.name, 'Carla Dias');
  assert.equal(carla.since, '2025-03-10');
  assert.deepEqual(carla.marks, [{date: YESTERDAY, mark: 'present', makeup: false}]);
  assert.equal(carla.credits, 1);
  assert.deepEqual(carla.plans.map((p) => [p.enrollmentId, p.name, p.priceReais]), [['e1', 'Mensal 2x', 320]]);
  assert.deepEqual(carla.billing, {standing: 'overdue', nextDueDate: YESTERDAY});
  assert.ok(!JSON.stringify(result).includes('62999990000'), 'telefone nunca sai');
  assert.equal(result.classes[0].waitlistCount, 1);
});

test('outra conta não vê os alunos do professor', async () => {
  const result = await call(getMyProfessorStudents, 'uOutro');
  assert.deepEqual(result.students, []);
  assert.deepEqual(result.arenas, []);
});

test('sem login recusa', async () => {
  await assert.rejects(call(getMyProfessorStudents, null), /login/);
});
