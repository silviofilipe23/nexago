/**
 * Fase 2 do App do Professor nas callables REAIS (`.run()`) contra o emulador do Firestore: o
 * professor da equipe, com a chave ligada pela arena, matricula, encaixa, cancela, move de turma,
 * agenda aula avulsa (quadra escolhida pelo servidor) e avisa os alunos — e sem a chave, ou em
 * turma de outro professor, não. Os casos de regra ficam em `src/arena-class-professor-actions.test.ts`.
 *
 * Uso: `npm run test:callables`.
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST ausente — rode via `npm run test:callables`.');
}
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();

const {cancelArenaClassSession, materializeClassSession} = await import('../lib/arena-class.js');
const {createArenaClassEnrollment, previewArenaClassEnrollment} = await import('../lib/arena-class-billing.js');
const {addArenaClassExtra, addArenaClassWaitlist} = await import('../lib/arena-class-makeup.js');
const {
  createArenaClassLesson, getProfessorClassActions, moveArenaClassStudent, sendArenaClassNotice,
} = await import('../lib/arena-class-professor-actions.js');
const {getMyProfessorStudents} = await import('../lib/professor-students.js');
const {classSessionId} = await import('../lib/arena-class-constants.js');
const {dayKeyFromEventDate} = await import('../lib/event-timezone.js');
const {addDaysToDateKey, isoWeekdayOfDateKey} = await import('../lib/arena-recurring-booking.js');

const TODAY = dayKeyFromEventDate(new Date());
const LESSON_DATE = addDaysToDateKey(TODAY, 3);

function call(fn, uid, data = {}) {
  return fn.run({auth: {uid, token: {}}, data, rawRequest: {headers: {}}, acceptsStreaming: false});
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (error) => {
    assert.match(String(error?.message ?? error), pattern);
    return true;
  });
}

async function clearFirestore() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, {method: 'DELETE'});
  if (!res.ok) throw new Error(`Falha ao limpar o emulador: ${res.status}`);
}

const WEEKDAY = isoWeekdayOfDateKey(TODAY);

function classData(extra = {}) {
  return {
    arenaId: 'a1', arenaName: 'Arena CFC', name: 'Iniciante A', type: 'turma', sport: 'beachTennis',
    level: 'iniciante', teacherId: 't1', teacherUserId: 'uProf', teacherName: 'Thiago Mendes',
    teacherColor: '#FF6A1A', weekdays: [WEEKDAY], startTime: '21:00', endTime: '22:00', courtId: 'q1',
    courtName: 'Quadra 1', capacity: 4, startDate: TODAY, endDate: null, status: 'active', notes: null,
    studentCount: 1, ...extra,
  };
}

async function seedLink(permissions = {}, type = 'ARENA_STAFF') {
  await db.doc('arenaProfessors/a1_uProf').set({
    arenaId: 'a1', professorUserId: 'uProf', relationshipType: type, status: 'ACTIVE', initiatedBy: 'ARENA',
    permissions: {canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: type === 'ARENA_STAFF', ...permissions},
    arenaName: 'Arena CFC', professorName: 'Thiago Mendes',
  });
}

beforeEach(async () => {
  await clearFirestore();
  await db.doc('arenas/a1').set({name: 'Arena CFC', managerUserId: 'uOwner', planTier: 'pro', planStatus: 'active'});
  await db.doc('arenas/a1/courts/q1').set({name: 'Quadra 1', order: 1});
  await db.doc('arenas/a1/courts/q2').set({name: 'Quadra 2', order: 2});
  await db.doc('arenas/a1/classTeachers/t1').set({arenaId: 'a1', userId: 'uProf', name: 'Thiago Mendes', color: '#FF6A1A', status: 'active'});
  await db.doc('arenas/a1/classPlans/p1').set({name: 'Mensal 1x', kind: 'monthly', priceReais: 180, classesPerWeek: 1, status: 'active'});
  await db.doc('arenas/a1/classPlans/p4').set({name: 'Pacote 4', kind: 'package', priceReais: 440, credits: 4, validityDays: 60, status: 'active'});
  for (const [uid, fullName] of [['uOwner', 'Ana Souza'], ['uProf', 'Thiago Mendes'], ['u1', 'Carla Dias'], ['u2', 'Bruno Alves']]) {
    await db.doc(`users/${uid}`).set({fullName});
  }
  await db.doc('arenaClasses/c1').set(classData());
  await db.doc('arenaClasses/c2').set(classData({name: 'Avançado Noite', startTime: '20:00', endTime: '21:00', courtId: 'q2', courtName: 'Quadra 2', studentCount: 0}));
  await db.doc('arenaClasses/cOutro').set(classData({name: 'Outra turma', teacherUserId: 'uOutro', teacherId: 't9', studentCount: 0}));
  await db.doc('arenaClasses/c1/classStudents/u1').set({
    arenaId: 'a1', classId: 'c1', athleteId: 'u1', name: 'Carla Dias', status: 'active', enrollmentId: 'e1', weekdays: [WEEKDAY],
  });
  await db.doc('arenaClassEnrollments/e1').set({
    arenaId: 'a1', studentId: 'u1', athleteId: 'u1', name: 'Carla Dias', status: 'active',
    plan: {planId: 'p1', name: 'Mensal 1x', kind: 'monthly', priceReais: 180, classesPerWeek: 1},
    slots: [{classId: 'c1', weekday: WEEKDAY}],
  });
});

describe('sem a chave nada muda para o professor; a equipe segue podendo', () => {
  test('vínculo padrão (chaves desligadas): matricular, esperar e cancelar são recusados', async () => {
    await seedLink();
    const enroll = {arenaId: 'a1', planId: 'p1', slots: [{classId: 'c2', weekday: WEEKDAY}], dueDay: 5, athleteId: 'u2'};
    await rejects(call(createArenaClassEnrollment, 'uProf', enroll), /não liberou matricular/);
    await rejects(call(addArenaClassWaitlist, 'uProf', {classId: 'c1', athleteId: 'u2'}), /não liberou matricular/);
    await materializeClassSession(db, 'c1', classData(), TODAY, 'manual');
    await rejects(call(cancelArenaClassSession, 'uProf', {sessionId: classSessionId('c1', TODAY), reason: 'rain'}), /não liberou cancelar/);
    const students = await call(getMyProfessorStudents, 'uProf');
    assert.deepEqual(students.arenas[0].actions, {canEnrollStudents: false, canScheduleLessons: false, canCancelLessons: false});
  });
});

describe('com as chaves ligadas', () => {
  beforeEach(async () => {
    await seedLink({canEnrollStudents: true, canScheduleLessons: true, canCancelLessons: true});
  });

  test('matrícula pelo professor: preço da tabela, taxa não dispensada, carimbo de quem fez', async () => {
    await db.doc('arenas/a1/classSettings/rules').set({enrollmentFeeReais: 50, defaultDueDay: 12});
    const input = {
      arenaId: 'a1', planId: 'p1', slots: [{classId: 'c2', weekday: WEEKDAY}], dueDay: 28, athleteId: 'u2', waiveFee: true,
    };
    const preview = await call(previewArenaClassEnrollment, 'uProf', input);
    assert.ok(preview.charges.some((c) => c.description === 'Taxa de matrícula'));
    const result = await call(createArenaClassEnrollment, 'uProf', input);
    const enrollment = (await db.doc(`arenaClassEnrollments/${result.enrollmentId}`).get()).data();
    assert.deepEqual([enrollment.createdByRole, enrollment.dueDay, enrollment.plan.priceReais], ['teacher', 12, 180]);
    assert.ok(result.chargeIds.some((id) => id.endsWith('_fee')));
    await rejects(call(createArenaClassEnrollment, 'uProf', {...input, slots: [{classId: 'cOutro', weekday: WEEKDAY}]}), /acesso/);
  });

  test('encaixe, espera, mover de turma, aviso e cancelamento nas turmas dele', async () => {
    await materializeClassSession(db, 'c1', classData(), TODAY, 'manual');
    const sessionId = classSessionId('c1', TODAY);

    await call(addArenaClassExtra, 'uProf', {sessionId, kind: 'trial', athleteId: 'u2'});
    assert.equal((await db.doc(`arenaClassSessions/${sessionId}`).get()).data().extras.u2.kind, 'trial');

    const wait = await call(addArenaClassWaitlist, 'uProf', {classId: 'c1', name: 'Pedro Costa'});
    assert.ok(wait.entryId);

    const ctx = await call(getProfessorClassActions, 'uProf', {arenaId: 'a1'});
    assert.deepEqual(ctx.permissions, {canEnrollStudents: true, canScheduleLessons: true, canCancelLessons: true});
    assert.deepEqual(ctx.classes.map((c) => c.classId).sort(), ['c1', 'c2']);
    assert.deepEqual(ctx.waitlist.map((w) => w.name), ['Pedro Costa']);
    assert.deepEqual(ctx.plans.map((p) => p.planId).sort(), ['p1', 'p4']);
    assert.equal(ctx.sessions.find((s) => s.sessionId === sessionId).taken, 2);

    const notice = await call(sendArenaClassNotice, 'uProf', {sessionIds: [sessionId], message: 'Vou atrasar 10 min.'});
    assert.equal(notice.notified, 2);

    const moved = await call(moveArenaClassStudent, 'uProf', {fromClassId: 'c1', toClassId: 'c2', studentId: 'u1'});
    assert.deepEqual(moved.weekdays, [WEEKDAY]);
    const slots = (await db.doc('arenaClassEnrollments/e1').get()).data().slots;
    assert.deepEqual(slots.map((s) => s.classId), ['c2']);
    await rejects(call(moveArenaClassStudent, 'uProf', {fromClassId: 'c2', toClassId: 'cOutro', studentId: 'u1'}), /acesso/);

    const canceled = await call(cancelArenaClassSession, 'uProf', {sessionId, reason: 'rain', message: 'Chuva forte.'});
    assert.equal(canceled.sessionId, sessionId);
    assert.equal((await db.doc(`arenaClassSessions/${sessionId}`).get()).data().status, 'canceled');
  });

  test('aula avulsa: usa o pacote, servidor escolhe a quadra livre; sem pacote recusa', async () => {
    await rejects(
      call(createArenaClassLesson, 'uProf', {arenaId: 'a1', type: 'particular', date: LESSON_DATE, startTime: '10:00', endTime: '11:00', students: [{studentId: 'u1'}]}),
      /não tem pacote/,
    );
    await db.doc('arenaClassEnrollments/e2').set({
      arenaId: 'a1', studentId: 'u1', athleteId: 'u1', status: 'active', creditsLeft: 2,
      expiresOn: addDaysToDateKey(TODAY, 30), plan: {planId: 'p4', name: 'Pacote 4', kind: 'package', priceReais: 440, credits: 4},
    });
    // Quadra 1 ocupada no horário: a aula cai na Quadra 2.
    await db.doc(`arenaSlotLocks/a1_q1_${LESSON_DATE}_h10`).set({bookingId: 'outra'});
    const lesson = await call(createArenaClassLesson, 'uProf', {
      arenaId: 'a1', type: 'particular', date: LESSON_DATE, startTime: '10:00', endTime: '11:00', students: [{studentId: 'u1'}],
    });
    assert.equal(lesson.courtId, 'q2');
    assert.deepEqual(lesson.packages, {u1: 'e2'});
    const student = (await db.doc(`arenaClasses/${lesson.classId}/classStudents/u1`).get()).data();
    assert.equal(student.enrollmentId, 'e2');
    assert.ok((await db.doc(`arenaClassSessions/${lesson.sessionId}`).get()).exists);
    // Aluno de outro professor não entra.
    await rejects(
      call(createArenaClassLesson, 'uProf', {arenaId: 'a1', type: 'particular', date: LESSON_DATE, startTime: '12:00', endTime: '13:00', students: [{studentId: 'u2'}]}),
      /não está em nenhuma turma sua/,
    );
  });
});

describe('professor independente', () => {
  test('mesmo com a chave gravada por fora, não age nas Aulas da arena', async () => {
    await seedLink({canEnrollStudents: true}, 'INDEPENDENT');
    await rejects(call(addArenaClassWaitlist, 'uProf', {classId: 'c1', athleteId: 'u2'}), /Só professor da equipe/);
  });
});
