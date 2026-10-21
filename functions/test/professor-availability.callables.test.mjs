/**
 * Disponibilidade e particulares (A10) contra o Firestore REAL (emulador): quem vê os horários,
 * choque com turma/bloqueio/outra particular, confirmação automática x pedido, resposta e
 * cancelamento. Push falso. Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('rode via `npm run test:callables`.');
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();
const av = await import('../lib/professor-availability.js');

const NOW = new Date('2026-10-20T15:00:00Z'); // terça 12:00 SP
function deps(now = NOW) { const pushes = []; return {pushes, now: () => now, notify: async (p) => { pushes.push(p); }}; }
const iso = (day, h) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00-03:00`).toISOString();

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {method: 'DELETE'});
  await db.doc('users/uProf').set({fullName: 'Thiago Mendes', roles: ['athlete', 'professor']});
  await db.doc('users/u1').set({fullName: 'Carla Dias'});
  await db.doc('users/u2').set({fullName: 'Paulo Viana'});
  await db.doc('users/u9').set({fullName: 'Estranho', roles: ['athlete']});
  await db.doc('professors/uProf/students/u1').set({athleteId: 'u1', name: 'Carla', status: 'active'});
  await db.doc('professors/uProf/students/u2').set({athleteId: 'u2', name: 'Paulo', status: 'active'});
  // Turma quarta 19h–20h.
  await db.doc('arenaClasses/c1').set({arenaId: 'cfc', name: 'Turma', teacherUserId: 'uProf', status: 'active', weekdays: [3], startTime: '19:00', endTime: '20:00'});
  // Bloqueio quarta 9h–10h.
  await db.doc('users/uProf/professorBlocks/b1').set({reason: 'folga', reasonLabel: 'Folga', startAt: Timestamp.fromDate(new Date(iso('2026-10-21', 9))), endAt: Timestamp.fromDate(new Date(iso('2026-10-21', 10)))});
});

test('publicar exige papel de professor; aluno vê só os horários livres; estranho não', async () => {
  await assert.rejects(av.saveProfessorAvailabilityCore(db, 'u9', {weekly: {'3': [8]}}), /Só professores/);
  await av.saveProfessorAvailabilityCore(db, 'uProf', {weekly: {'3': [8, 9, 10, 19]}, minNoticeHours: 4});
  const r = await av.getProfessorOpenSlotsCore(db, 'u1', {professorUid: 'uProf', days: 7}, NOW);
  assert.deepEqual(r.slots.map((s) => s.startAt), [iso('2026-10-21', 8), iso('2026-10-21', 10)], '9h bloqueado, 19h turma');
  // Turma própria (B10) na quarta 10h também ocupa.
  await db.doc('professors/uProf/ownClasses/oc1').set({status: 'active', weekdays: [3], startTime: '10:00', endTime: '11:00'});
  const r2 = await av.getProfessorOpenSlotsCore(db, 'u1', {professorUid: 'uProf', days: 7}, NOW);
  assert.deepEqual(r2.slots.map((s) => s.startAt), [iso('2026-10-21', 8)]);
  await assert.rejects(av.getProfessorOpenSlotsCore(db, 'u9', {professorUid: 'uProf'}, NOW), /Só alunos/);
});

test('agenda direto confirma; o mesmo horário não passa duas vezes; cancelamento tardio marcado', async () => {
  await av.saveProfessorAvailabilityCore(db, 'uProf', {weekly: {'3': [8, 10]}, freeCancelHours: 24});
  const d = deps();
  const a = await av.requestPrivateLessonCore(db, 'u1', {professorUid: 'uProf', startAt: iso('2026-10-21', 8)}, d);
  assert.equal(a.status, 'confirmed');
  assert.equal(d.pushes[0].userId, 'uProf');
  assert.match(d.pushes[0].title, /Particular agendada · Carla Dias/);
  await assert.rejects(av.requestPrivateLessonCore(db, 'u2', {professorUid: 'uProf', startAt: iso('2026-10-21', 8)}, deps()), /não está mais livre/);
  await assert.rejects(av.requestPrivateLessonCore(db, 'u2', {professorUid: 'uProf', startAt: iso('2026-10-21', 8), pair: true}, deps()), /dupla/);
  await assert.rejects(av.requestPrivateLessonCore(db, 'u9', {professorUid: 'uProf', startAt: iso('2026-10-21', 10)}, deps()), /Só alunos/);
  // Cancelar a 20h do início com prazo de 24h = tardio.
  const c = await av.cancelPrivateLessonCore(db, 'u1', {lessonId: a.lessonId}, deps());
  assert.equal(c.lateCancel, true);
  // Horário volta a ficar livre.
  const r = await av.getProfessorOpenSlotsCore(db, 'u2', {professorUid: 'uProf', days: 2}, NOW);
  assert.ok(r.slots.some((s) => s.startAt === iso('2026-10-21', 8)));
});

test('sem agenda direto: pedido pendente, professor responde uma vez', async () => {
  await av.saveProfessorAvailabilityCore(db, 'uProf', {weekly: {'3': [10]}, autoConfirm: false, acceptPairs: true});
  const a = await av.requestPrivateLessonCore(db, 'u1', {professorUid: 'uProf', startAt: iso('2026-10-21', 10), pair: true, note: 'Foco no saque'}, deps());
  assert.equal(a.status, 'pending');
  // Pendente já segura o horário.
  await assert.rejects(av.requestPrivateLessonCore(db, 'u2', {professorUid: 'uProf', startAt: iso('2026-10-21', 10)}, deps()), /não está mais livre/);
  await assert.rejects(av.respondPrivateLessonCore(db, 'u1', {lessonId: a.lessonId, accept: true}, deps()), /não encontrado/);
  const d = deps();
  assert.equal((await av.respondPrivateLessonCore(db, 'uProf', {lessonId: a.lessonId, accept: true}, d)).status, 'confirmed');
  assert.deepEqual([d.pushes[0].userId, d.pushes[0].data.url], ['u1', '/particulares']);
  await assert.rejects(av.respondPrivateLessonCore(db, 'uProf', {lessonId: a.lessonId, accept: false}, deps()), /já foi respondido/);
  const lesson = (await db.doc(`professorPrivateLessons/${a.lessonId}`).get()).data();
  assert.equal(lesson.pair, true);
  assert.equal(lesson.athleteName, 'Carla Dias');
});
