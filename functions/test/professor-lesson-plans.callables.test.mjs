/**
 * Plano de aula (H1–H5, H8) contra o Firestore REAL (emulador): só aula do professor, visões por
 * aluno sem dado privado, despublicar e ex-aluno apagam a visão, push só no 1º publicar.
 * Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('rode via `npm run test:callables`.');
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();
const lp = await import('../lib/professor-lesson-plans.js');

const NOW = new Date('2026-10-20T15:00:00Z');
function deps() { const pushes = []; return {pushes, now: () => NOW, notify: async (p) => { pushes.push(p); }}; }
const plan = (over = {}) => ({
  kind: 'session', refId: 's1', objective: 'Saque com direção', tags: ['saque'],
  blocks: [{name: 'Aquecimento', minutes: 8, category: 'fisico', note: 'segredo do prof', notePublic: false},
    {name: 'Saque em zonas', minutes: 15, category: 'saque', note: 'Ênfase na zona', notePublic: true}],
  focus: [{athleteId: 'a1', text: 'Flexionar o joelho', public: true}, {athleteId: 'a2', text: 'Dor no ombro', public: false},
    {athleteId: 'intruso', text: 'x', public: true}],
  published: true, status: 'ready', ...over,
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {method: 'DELETE'});
  await db.doc('users/uProf').set({fullName: 'Thiago Mendes'});
  await db.doc('arenaClasses/c1').set({name: 'Intermediário B', arenaName: 'Arena CFC', teacherUserId: 'uProf', courtName: 'Quadra 2'});
  await db.doc('arenaClasses/c1/classStudents/x1').set({athleteId: 'a1', name: 'Marina', status: 'active'});
  await db.doc('arenaClasses/c1/classStudents/x2').set({athleteId: 'a2', name: 'Caio', status: 'active'});
  await db.doc('arenaClassSessions/s1').set({classId: 'c1', className: 'Intermediário B', date: '2026-10-22', startTime: '19:00', endTime: '20:00'});
  await db.doc('arenaClassSessions/s9').set({classId: 'c1', date: '2026-10-22', startTime: '19:00', teacherUserId: 'outro'});
});

test('só aula do professor; foco de quem não é aluno é descartado', async () => {
  await assert.rejects(lp.saveLessonPlanCore(db, 'uOutro', plan(), deps()), /não encontrada/);
  await assert.rejects(lp.saveLessonPlanCore(db, 'uProf', plan({refId: 's9'}), deps()), /não encontrada/, 'sessão com outro professor');
  const r = await lp.saveLessonPlanCore(db, 'uProf', plan(), deps());
  assert.equal(r.planId, 'uProf_session_s1');
  assert.equal(r.viewCount, 2);
  const full = (await db.doc('lessonPlans/uProf_session_s1').get()).data();
  assert.deepEqual(full.focus.map((f) => f.athleteId), ['a1', 'a2']);
  assert.equal(full.title, 'Intermediário B');
  assert.equal(full.durationMin, 23);
});

test('visão por aluno sem nota privada nem foco alheio; push só no 1º publicar', async () => {
  const d = deps();
  await lp.saveLessonPlanCore(db, 'uProf', plan(), d);
  assert.deepEqual(d.pushes.map((p) => p.userId).sort(), ['a1', 'a2']);
  assert.equal(d.pushes[0].data.url, `/aula/plano/${d.pushes[0].data.viewId}`);
  const v1 = (await db.doc('lessonPlanViews/uProf_session_s1_a1').get()).data();
  const v2 = (await db.doc('lessonPlanViews/uProf_session_s1_a2').get()).data();
  assert.equal(v1.myFocus, 'Flexionar o joelho');
  assert.equal(v2.myFocus, null);
  for (const v of [v1, v2]) {
    const json = JSON.stringify(v);
    assert.ok(!json.includes('segredo do prof'));
    assert.ok(!json.includes('ombro'));
  }
  assert.equal(v1.professorName, 'Thiago Mendes');
  const d2 = deps();
  await lp.saveLessonPlanCore(db, 'uProf', plan({objective: 'Novo objetivo'}), d2);
  assert.equal(d2.pushes.length, 0, 'republicar não avisa de novo');
  assert.equal((await db.doc('lessonPlanViews/uProf_session_s1_a1').get()).data().objective, 'Novo objetivo');
});

test('ex-aluno perde a visão; despublicar e apagar limpam tudo', async () => {
  await lp.saveLessonPlanCore(db, 'uProf', plan(), deps());
  await db.doc('arenaClasses/c1/classStudents/x2').update({status: 'paused'});
  await lp.saveLessonPlanCore(db, 'uProf', plan(), deps());
  assert.equal((await db.doc('lessonPlanViews/uProf_session_s1_a2').get()).exists, false);
  await lp.saveLessonPlanCore(db, 'uProf', plan({published: false}), deps());
  assert.equal((await db.collection('lessonPlanViews').where('planId', '==', 'uProf_session_s1').get()).size, 0);
  await lp.saveLessonPlanCore(db, 'uProf', plan(), deps());
  await assert.rejects(lp.deleteLessonPlanCore(db, 'uOutro', {planId: 'uProf_session_s1'}), /não encontrado/);
  await lp.deleteLessonPlanCore(db, 'uProf', {planId: 'uProf_session_s1'});
  assert.equal((await db.doc('lessonPlans/uProf_session_s1').get()).exists, false);
  assert.equal((await db.collection('lessonPlanViews').where('planId', '==', 'uProf_session_s1').get()).size, 0);
});

test('particular e turma própria resolvem os alunos', async () => {
  await db.doc('professorPrivateLessons/p1').set({professorUid: 'uProf', athleteId: 'a3', athleteName: 'Diego', date: '2026-10-21'});
  const p = await lp.getLessonStudentsCore(db, 'uProf', {kind: 'private', refId: 'p1'});
  assert.deepEqual(p.students, [{athleteId: 'a3', name: 'Diego'}]);
  await db.doc('professors/uProf/ownClasses/oc1').set({name: 'Manhã', studentIds: ['a4']});
  await db.doc('users/a4').set({fullName: 'Lucas Prado'});
  await db.doc('arenaBookings/bk1').set({athleteId: 'uProf', bookedAs: 'professor', professorClassId: 'oc1', date: '2026-10-23', startTime: '07:00', endTime: '08:00'});
  const o = await lp.getLessonStudentsCore(db, 'uProf', {kind: 'booking', refId: 'bk1'});
  assert.equal(o.title, 'Manhã');
  assert.deepEqual(o.students, [{athleteId: 'a4', name: 'Lucas Prado'}]);
  await assert.rejects(lp.getLessonStudentsCore(db, 'uOutro', {kind: 'booking', refId: 'bk1'}), /não encontrada/);
});
