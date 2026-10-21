/**
 * Fiação das permissões do vínculo professor ↔ arena nas callables REAIS (`.run()`) contra o
 * emulador do Firestore: o carimbo chega na reserva, a chamada do professor passa pela
 * `saveArenaClassAttendance` e a turma nova recusa professor com vínculo suspenso.
 * Os casos de regra ficam nos testes com FakeFirestore (`arena-professor-permissions.test.ts`,
 * `arena-class-teacher.test.ts`); aqui é só o caminho de ponta a ponta.
 *
 * Uso: `npm run test:callables`.
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST ausente — rode via `npm run test:callables`.');
}
initializeApp({projectId: PROJECT_ID});
const db = getFirestore();

const {createArenaBooking, quoteArenaBooking} = await import('../lib/arena-booking-create.js');
const {saveArenaClassAttendance, upsertArenaClass, materializeClassSession} = await import('../lib/arena-class.js');
const {getMyClassSessionRoster} = await import('../lib/arena-class-teacher.js');
const {classSessionId} = await import('../lib/arena-class-constants.js');
const {dayKeyFromEventDate} = await import('../lib/event-timezone.js');

const TODAY = dayKeyFromEventDate(new Date());
const BOOKING_DATE = '2027-03-01';

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

async function seedArena() {
  await db.doc('arenas/a1').set({
    name: 'Arena CFC', managerUserId: 'uOwner', planTier: 'pro', planStatus: 'active',
  });
  await db.doc('arenas/a1/staff/uRecepcao').set({role: 'recepcao', status: 'active'});
  await db.doc('arenas/a1/courts/q1').set({name: 'Quadra 1', basePricePerHourReais: 100});
  for (const [uid, fullName] of [['uOwner', 'Ana Souza'], ['uProf', 'Thiago Mendes'], ['uAtleta', 'Marina Lopes']]) {
    await db.doc(`users/${uid}`).set({fullName});
  }
}

async function seedLink(status, permissions = {}, extra = {}) {
  await db.doc('arenaProfessors/a1_uProf').set({
    ...extra,
    arenaId: 'a1', professorUserId: 'uProf', relationshipType: 'INDEPENDENT', status, initiatedBy: 'PROFESSOR',
    permissions: {canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: false, ...permissions},
    arenaName: 'Arena CFC', professorName: 'Thiago Mendes',
  });
}

function booking(startTime, extra = {}) {
  const [h] = startTime.split(':');
  return {
    arenaId: 'a1', arenaName: 'Arena CFC', courtId: 'q1', courtName: 'Quadra 1', date: BOOKING_DATE,
    startTime, endTime: `${String(Number(h) + 1).padStart(2, '0')}:00`, paymentMode: 'onsite', ...extra,
  };
}

beforeEach(async () => {
  await clearFirestore();
  await seedArena();
});

describe('createArenaBooking — reservar como professor', () => {
  test('sem a flag nada muda; com a flag e a permissão, a reserva sai carimbada pelo mesmo preço', async () => {
    await seedLink('ACTIVE');
    const athlete = await call(createArenaBooking, 'uAtleta', booking('08:00'));
    const prof = await call(createArenaBooking, 'uProf', booking('09:00', {asProfessor: true}));

    assert.equal(athlete.bookedAs, 'athlete');
    assert.equal(prof.bookedAs, 'professor');
    assert.equal(prof.amountReais, athlete.amountReais);

    const athleteDoc = (await db.doc(`arenaBookings/${athlete.bookingId}`).get()).data();
    assert.equal('bookedAs' in athleteDoc, false);
    const profDoc = (await db.doc(`arenaBookings/${prof.bookingId}`).get()).data();
    assert.equal(profDoc.bookedAs, 'professor');
    assert.equal(profDoc.professorLinkId, 'a1_uProf');
    assert.equal(profDoc.professorRelationshipType, 'INDEPENDENT');
    assert.equal(profDoc.athleteId, 'uProf');
  });

  test('vínculo suspenso: "como professor" é recusado sem reservar nada; como atleta segue', async () => {
    await seedLink('SUSPENDED');
    await rejects(call(createArenaBooking, 'uProf', booking('10:00', {asProfessor: true})), /suspenso.*reservar como atleta/);
    const none = await db.collection('arenaBookings').where('athleteId', '==', 'uProf').get();
    assert.equal(none.size, 0);
    assert.equal((await db.doc('arenaSlotLocks/a1_q1_2027-03-01_h10').get()).exists, false);

    const asAthlete = await call(createArenaBooking, 'uProf', booking('10:00'));
    assert.equal(asAthlete.bookedAs, 'athlete');
  });
});

describe('desconto do professor no aluguel de quadra', () => {
  test('cotação e reserva como professor saem com o desconto; como atleta, preço cheio', async () => {
    await seedLink('ACTIVE', {}, {courtDiscountPercent: 20});
    const quoteProf = await call(quoteArenaBooking, 'uProf', booking('13:00', {asProfessor: true}));
    const quoteAthlete = await call(quoteArenaBooking, 'uProf', booking('13:00'));
    assert.deepEqual([quoteProf.amountReais, quoteProf.professorDiscountPercent, quoteProf.professorDiscountReais], [80, 20, 20]);
    assert.deepEqual([quoteAthlete.amountReais, quoteAthlete.professorDiscountPercent], [100, 0]);

    const res = await call(createArenaBooking, 'uProf', booking('13:00', {asProfessor: true}));
    assert.deepEqual([res.amountReais, res.professorDiscountPercent, res.professorDiscountReais], [80, 20, 20]);
    const doc = (await db.doc(`arenaBookings/${res.bookingId}`).get()).data();
    assert.deepEqual([doc.amountReais, doc.amountDueOnsiteReais, doc.professorDiscountPercent, doc.professorDiscountReais], [80, 80, 20, 20]);
    assert.equal((await db.doc(`arenaBookingPricing/${res.bookingId}`).get()).data().amountReais, 80);

    const asAthlete = await call(createArenaBooking, 'uProf', booking('14:00'));
    assert.equal(asAthlete.amountReais, 100);
    const athleteDoc = (await db.doc(`arenaBookings/${asAthlete.bookingId}`).get()).data();
    assert.equal('professorDiscountPercent' in athleteDoc, false);
  });

  test('faixa 08:00–17:00: 16h–18h paga desconto só na primeira hora; 18h fica cheio', async () => {
    await seedLink('ACTIVE', {}, {courtDiscountPercent: 20, courtDiscountStartTime: '08:00', courtDiscountEndTime: '17:00'});
    const crossing = await call(createArenaBooking, 'uProf', booking('16:00', {asProfessor: true, endTime: '18:00'}));
    assert.deepEqual([crossing.amountReais, crossing.professorDiscountReais], [180, 20]);
    const outside = await call(quoteArenaBooking, 'uProf', booking('18:00', {asProfessor: true}));
    assert.deepEqual([outside.amountReais, outside.professorDiscountPercent], [100, 0]);
  });

  test('vínculo suspenso: cotação "como professor" mostra preço cheio em vez de erro', async () => {
    await seedLink('SUSPENDED', {}, {courtDiscountPercent: 20});
    const quote = await call(quoteArenaBooking, 'uProf', booking('15:00', {asProfessor: true}));
    assert.deepEqual([quote.amountReais, quote.professorDiscountPercent], [100, 0]);
  });
});

describe('createArenaBooking — aula para aluno da carteira (independente)', () => {
  test('aluno ativo: a reserva sai como professor e a aula liga o aluno fora da reserva', async () => {
    await seedLink('ACTIVE');
    await db.doc('professors/uProf/students/uAtleta').set({athleteId: 'uAtleta', name: 'Marina Lopes', status: 'active'});
    const res = await call(createArenaBooking, 'uProf', booking('11:00', {asProfessor: true, professorStudentId: 'uAtleta'}));
    assert.equal(res.bookedAs, 'professor');
    const lesson = (await db.doc(`professorLessons/${res.bookingId}`).get()).data();
    assert.deepEqual([lesson.professorUid, lesson.athleteId, lesson.studentName, lesson.courtCostReais, lesson.startTime],
      ['uProf', 'uAtleta', 'Marina Lopes', res.amountReais, '11:00']);
    const bookingDoc = (await db.doc(`arenaBookings/${res.bookingId}`).get()).data();
    assert.ok(!JSON.stringify(bookingDoc).includes('Marina'), 'a arena não vê o aluno na reserva');
  });

  test('aluno convidado, de outro professor ou reserva de atleta: recusa sem reservar', async () => {
    await seedLink('ACTIVE');
    await db.doc('professors/uProf/students/uAtleta').set({athleteId: 'uAtleta', name: 'Marina', status: 'invited'});
    await rejects(call(createArenaBooking, 'uProf', booking('12:00', {asProfessor: true, professorStudentId: 'uAtleta'})), /não está ativo/);
    await rejects(call(createArenaBooking, 'uProf', booking('12:00', {professorStudentId: 'uAtleta'})), /como professor independente/);
    assert.equal((await db.collection('arenaBookings').where('athleteId', '==', 'uProf').get()).size, 0);
    assert.equal((await db.collection('professorLessons').get()).size, 0);
  });
});

describe('Aulas — chamada pelo professor e turma nova', () => {
  async function seedClassSession() {
    const cls = {
      arenaId: 'a1', arenaName: 'Arena CFC', name: 'Iniciante A', type: 'turma', sport: 'beachTennis',
      level: 'iniciante', teacherId: 't1', teacherUserId: 'uProf', teacherName: 'Thiago Mendes',
      teacherColor: '#FF6A1A', weekdays: [], startTime: '18:00', endTime: '19:00', courtId: 'q1',
      courtName: 'Quadra 1', capacity: 4, startDate: TODAY, endDate: null, status: 'active', notes: null,
    };
    await db.doc('arenaClasses/c1').set({...cls, studentCount: 1});
    await db.doc('arenaClasses/c1/classStudents/uAtleta').set({
      arenaId: 'a1', classId: 'c1', athleteId: 'uAtleta', name: 'Marina Lopes', phone: '+5562999990000', status: 'active',
    });
    await materializeClassSession(db, 'c1', cls, TODAY, 'manual');
    return classSessionId('c1', TODAY);
  }

  test('professor com a permissão lê a lista e fecha a chamada; suspenso não; a equipe sempre', async () => {
    await seedLink('ACTIVE');
    const sessionId = await seedClassSession();

    const roster = await call(getMyClassSessionRoster, 'uProf', {sessionId});
    assert.deepEqual(roster.students.map((s) => [s.studentId, s.name]), [['uAtleta', 'Marina Lopes']]);
    assert.equal('phone' in roster.students[0], false);

    const saved = await call(saveArenaClassAttendance, 'uProf', {sessionId, marks: {uAtleta: 'present'}, close: true});
    assert.equal(saved.status, 'completed');
    const session = (await db.doc(`arenaClassSessions/${sessionId}`).get()).data();
    assert.equal(session.closedByRole, 'teacher');
    assert.equal(session.attendance.uAtleta.mark, 'present');

    await seedLink('SUSPENDED');
    await rejects(call(getMyClassSessionRoster, 'uProf', {sessionId}), /suspenso/);
    await rejects(call(saveArenaClassAttendance, 'uProf', {sessionId, marks: {uAtleta: 'absent'}}), /suspenso/);
    await call(saveArenaClassAttendance, 'uRecepcao', {sessionId, marks: {uAtleta: 'absent'}});
    const after = (await db.doc(`arenaClassSessions/${sessionId}`).get()).data();
    assert.equal(after.attendance.uAtleta.mark, 'absent');
  });

  test('turma nova com professor de vínculo suspenso é recusada antes de gravar; reativado, cria', async () => {
    await db.doc('arenas/a1/classTeachers/t1').set({
      arenaId: 'a1', userId: 'uProf', name: 'Thiago Mendes', color: '#FF6A1A', status: 'active',
    });
    const input = {
      arenaId: 'a1', name: 'Turma nova', type: 'turma', sport: 'beachTennis', level: 'livre', teacherId: 't1',
      weekdays: [1], startTime: '20:00', endTime: '21:00', courtId: 'q1', capacity: 4, startDate: TODAY,
    };
    await seedLink('SUSPENDED');
    await rejects(call(upsertArenaClass, 'uOwner', input), /suspenso. Reative em Profissionais/);
    assert.equal((await db.collection('arenaClasses').get()).size, 0);

    await seedLink('ACTIVE', {canManageOwnLessons: false});
    const created = await call(upsertArenaClass, 'uOwner', input);
    assert.ok(created.classId);
  });
});
