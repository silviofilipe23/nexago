/**
 * Turma própria com horário fixo de quadra (B10) contra o Firestore REAL (emulador): chave da arena,
 * prévia com preço e conflito, criação das séries carimbadas, alunos da carteira, encerrar e o
 * agendador derrubando a turma quando o vínculo cai. Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('rode via `npm run test:callables`.');
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();
const oc = await import('../lib/professor-own-classes.js');
const rec = await import('../lib/arena-recurring-booking.js');

const NOW = new Date();
const today = NOW.toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
const input = {arenaId: 'norte', courtId: 'q1', name: 'Manhã Intermediário', weekdays: [2, 4], startTime: '07:00', endTime: '08:00', capacity: 4, monthlyPriceReais: 260};

async function link(perms, type = 'INDEPENDENT', status = 'ACTIVE') {
  await db.doc('arenaProfessors/norte_uProf').set({arenaId: 'norte', professorUserId: 'uProf', relationshipType: type, status, arenaName: 'Arena Norte', permissions: perms});
}

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {method: 'DELETE'});
  await db.doc('users/uProf').set({fullName: 'Thiago Mendes'});
  await db.doc('arenas/norte').set({name: 'Arena Norte', managerUserId: 'uOwner', planTier: 'pro', planStatus: 'active', planActiveUntil: Timestamp.fromDate(new Date(Date.now() + 30 * 86_400_000))});
  await db.doc('arenas/norte/courts/q1').set({name: 'Quadra 1', basePricePerHourReais: 60});
  await db.doc('professors/uProf/students/a1').set({athleteId: 'a1', status: 'active'});
  await db.doc('professors/uProf/students/a2').set({athleteId: 'a2', status: 'archived'});
  await link({canBookCourts: true, canManageOwnLessons: true, canBookRecurring: true});
});

test('chave da arena: sem ela (ou equipe) não cria', async () => {
  await link({canBookCourts: true, canBookRecurring: false});
  await assert.rejects(oc.previewProfessorOwnClassCore(db, 'uProf', input, NOW), /não liberou reservar horário fixo/);
  await link({canBookRecurring: true}, 'ARENA_STAFF');
  await assert.rejects(oc.previewProfessorOwnClassCore(db, 'uProf', input, NOW), /Só professor independente/);
});

test('prévia: preço da arena, estimativa e datas já ocupadas', async () => {
  // Ocupa a próxima terça às 7h.
  let tue = today;
  for (let i = 1; i <= 7; i++) { tue = rec.addDaysToDateKey(today, i); if (rec.isoWeekdayOfDateKey(tue) === 2) break; }
  await db.doc(`arenaSlotLocks/norte_q1_${tue}_h07`).set({bookingId: 'x'});
  const p = await oc.previewProfessorOwnClassCore(db, 'uProf', input, NOW);
  assert.equal(p.pricePerOccurrenceReais, 60);
  assert.equal(p.occurrencesPerMonth, 8.7);
  assert.equal(p.revenueFullReais, 1040);
  assert.equal(p.courtMonthlyReais, 522);
  assert.ok(p.conflicts.includes(tue));
});

test('criar: uma série por dia, ocorrências carimbadas do professor; alunos só da carteira ativa; encerrar libera', async () => {
  const r = await oc.createProfessorOwnClassCore(db, 'uProf', input, NOW);
  const cls = (await db.doc(`professors/uProf/ownClasses/${r.classId}`).get()).data();
  assert.deepEqual(Object.keys(cls.seriesIds).sort(), ['2', '4']);
  assert.ok(r.createdDates.length >= 8);
  const series = (await db.doc(`arenaRecurringBookings/${cls.seriesIds['2']}`).get()).data();
  assert.equal(series.bookedAs, 'professor');
  assert.equal(series.athleteId, 'uProf');
  assert.equal(series.customerName, 'Thiago Mendes · Manhã Intermediário');
  assert.equal(series.professorStamp, undefined);
  const occ = (await db.collection('arenaBookings').where('recurringBookingId', '==', cls.seriesIds['2']).get()).docs[0].data();
  assert.equal(occ.bookedAs, 'professor');
  assert.equal(occ.professorClassId, r.classId);
  assert.equal(occ.amountReais, 60);

  await oc.setProfessorOwnClassStudentsCore(db, 'uProf', {classId: r.classId, athleteIds: ['a1']});
  await assert.rejects(oc.setProfessorOwnClassStudentsCore(db, 'uProf', {classId: r.classId, athleteIds: ['a1', 'a2']}), /ativos da sua carteira/);
  await assert.rejects(oc.setProfessorOwnClassStudentsCore(db, 'uProf', {classId: r.classId, athleteIds: ['a1', 'b', 'c', 'd', 'e']}), /vagas/);

  await oc.endProfessorOwnClassCore(db, 'uProf', {classId: r.classId});
  assert.equal((await db.doc(`professors/uProf/ownClasses/${r.classId}`).get()).data().status, 'ended');
  assert.equal((await db.doc(`arenaRecurringBookings/${cls.seriesIds['2']}`).get()).data().status, 'canceled');
  const active = (await db.collection('arenaBookings').where('recurringBookingId', '==', cls.seriesIds['2']).get()).docs
    .filter((d) => d.data().status === 'active');
  assert.ok(active.every((d) => d.data().date <= today), 'só ocorrência de hoje (já iniciada) pode restar');
});

test('agendador: vínculo caiu → a turma encerra; vínculo ok segue', async () => {
  const r = await oc.createProfessorOwnClassCore(db, 'uProf', input, NOW);
  const cls = (await db.doc(`professors/uProf/ownClasses/${r.classId}`).get()).data();
  const series = rec.parseRecurringSeriesData((await db.doc(`arenaRecurringBookings/${cls.seriesIds['4']}`).get()).data());
  assert.equal(series.professorStamp.professorClassId, r.classId);
  assert.equal(await oc.professorSeriesStillAllowed(db, series), true);
  await link({canBookRecurring: true}, 'INDEPENDENT', 'SUSPENDED');
  assert.equal(await oc.professorSeriesStillAllowed(db, series), false);
  assert.equal((await db.doc(`professors/uProf/ownClasses/${r.classId}`).get()).data().status, 'ended');
});

test('arena mexe na série: turma acompanha e o professor é avisado; encerrar pelo professor não avisa', async () => {
  const r = await oc.createProfessorOwnClassCore(db, 'uProf', input, NOW);
  const cls = (await db.doc(`professors/uProf/ownClasses/${r.classId}`).get()).data();
  const pushes = [];
  const notify = async (p) => { pushes.push(p); };
  const seriesTue = (await db.doc(`arenaRecurringBookings/${cls.seriesIds['2']}`).get()).data();
  // Arena pausa a terça.
  assert.equal(await oc.syncOwnClassWithSeriesCore(db, seriesTue, {...seriesTue, status: 'paused'}, notify), 'updated');
  let c = (await db.doc(`professors/uProf/ownClasses/${r.classId}`).get()).data();
  assert.equal(c.seriesStatus['2'], 'paused');
  assert.equal(c.status, 'active');
  assert.match(pushes[0].body, /pausou o horário fixo de ter/);
  // Arena cancela as duas: turma encerrada.
  await oc.syncOwnClassWithSeriesCore(db, seriesTue, {...seriesTue, status: 'canceled', cancelReason: 'manual'}, notify);
  const seriesThu = (await db.doc(`arenaRecurringBookings/${cls.seriesIds['4']}`).get()).data();
  assert.equal(await oc.syncOwnClassWithSeriesCore(db, seriesThu, {...seriesThu, status: 'canceled'}, notify), 'ended');
  c = (await db.doc(`professors/uProf/ownClasses/${r.classId}`).get()).data();
  assert.equal(c.status, 'ended');
  assert.equal(c.endedReason, 'arena_canceled');
  assert.equal(pushes.length, 3);

  // Professor encerra a dele: o gatilho pula.
  const r2 = await oc.createProfessorOwnClassCore(db, 'uProf', {...input, name: 'Noite', startTime: '20:00', endTime: '21:00'}, NOW);
  const c2 = (await db.doc(`professors/uProf/ownClasses/${r2.classId}`).get()).data();
  const s2 = (await db.doc(`arenaRecurringBookings/${c2.seriesIds['2']}`).get()).data();
  await oc.endProfessorOwnClassCore(db, 'uProf', {classId: r2.classId});
  const after2 = (await db.doc(`arenaRecurringBookings/${c2.seriesIds['2']}`).get()).data();
  assert.equal(await oc.syncOwnClassWithSeriesCore(db, s2, after2, notify), 'skip');
  assert.equal(pushes.length, 3);
});
