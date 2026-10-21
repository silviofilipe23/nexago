/**
 * Remarcação de particular pelo chat (D3) contra o Firestore REAL (emulador): só horário livre,
 * cartão na conversa, aceitar muda a aula, quem pediu não responde, contra-proposta substitui,
 * ex-aluno não reabre o chat. Push falso. Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('rode via `npm run test:callables`.');
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();
const rs = await import('../lib/professor-lesson-reschedule.js');
const av = await import('../lib/professor-availability.js');

const NOW = new Date('2026-10-20T15:00:00Z'); // terça 12:00 SP
function deps() { const pushes = []; return {pushes, now: () => NOW, notify: async (p) => { pushes.push(p); }}; }
const iso = (day, h) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00-03:00`).toISOString();

let lessonId;
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {method: 'DELETE'});
  await db.doc('users/uProf').set({fullName: 'Thiago Mendes', roles: ['professor']});
  await db.doc('users/u1').set({fullName: 'Paulo Viana'});
  await db.doc('users/u2').set({fullName: 'Carla Dias'});
  await db.doc('professors/uProf/students/u1').set({athleteId: 'u1', status: 'active'});
  await db.doc('professors/uProf/students/u2').set({athleteId: 'u2', status: 'active'});
  await av.saveProfessorAvailabilityCore(db, 'uProf', {weekly: {'4': [6, 7, 8, 9]}, minNoticeHours: 4});
  const r = await av.requestPrivateLessonCore(db, 'u1', {professorUid: 'uProf', startAt: iso('2026-10-22', 6)}, deps());
  lessonId = r.lessonId;
  await av.requestPrivateLessonCore(db, 'u2', {professorUid: 'uProf', startAt: iso('2026-10-22', 8)}, deps());
});

test('aluno pede horário livre; cartão na conversa; professor aceita e a aula muda', async () => {
  await assert.rejects(rs.requestLessonRescheduleCore(db, 'u1', {lessonId, startAt: iso('2026-10-22', 8)}, deps()), /não está livre/, '8h é da Carla');
  await assert.rejects(rs.requestLessonRescheduleCore(db, 'u2', {lessonId, startAt: iso('2026-10-22', 7)}, deps()), /não encontrada/);
  const d = deps();
  const r = await rs.requestLessonRescheduleCore(db, 'u1', {lessonId, startAt: iso('2026-10-22', 7)}, d);
  assert.equal(r.conversationId, 'd_uProf_u1');
  assert.equal(d.pushes[0].userId, 'uProf');
  const msg = (await db.doc(`conversations/${r.conversationId}/messages/${r.messageId}`).get()).data();
  assert.equal(msg.card.type, 'reschedule');
  assert.equal(msg.card.status, 'pending');
  assert.equal((await db.doc(`conversations/${r.conversationId}`).get()).data().unread.uProf, 1);
  await assert.rejects(rs.respondLessonRescheduleCore(db, 'u1', {lessonId, accept: true}, deps()), /Quem pediu/);
  const d2 = deps();
  assert.equal((await rs.respondLessonRescheduleCore(db, 'uProf', {lessonId, accept: true}, d2)).status, 'accepted');
  const lesson = (await db.doc(`professorPrivateLessons/${lessonId}`).get()).data();
  assert.equal(lesson.startAt.toDate().toISOString(), iso('2026-10-22', 7));
  assert.equal(lesson.reschedule.status, 'accepted');
  assert.equal((await db.doc(`conversations/${r.conversationId}/messages/${r.messageId}`).get()).data().card.status, 'accepted');
  assert.equal(d2.pushes[0].userId, 'u1');
  // 6h ficou livre de novo.
  const open = await av.getProfessorOpenSlotsCore(db, 'u2', {professorUid: 'uProf', days: 3}, NOW);
  assert.ok(open.slots.some((s) => s.startAt === iso('2026-10-22', 6)));
});

test('contra-proposta do professor substitui; recusar mantém o horário', async () => {
  const a = await rs.requestLessonRescheduleCore(db, 'u1', {lessonId, startAt: iso('2026-10-22', 7)}, deps());
  const b = await rs.requestLessonRescheduleCore(db, 'uProf', {lessonId, startAt: iso('2026-10-22', 9)}, deps());
  assert.equal((await db.doc(`conversations/d_uProf_u1/messages/${a.messageId}`).get()).data().card.status, 'replaced');
  await assert.rejects(rs.respondLessonRescheduleCore(db, 'uProf', {lessonId, accept: true}, deps()), /Quem pediu/);
  await rs.respondLessonRescheduleCore(db, 'u1', {lessonId, accept: false}, deps());
  const lesson = (await db.doc(`professorPrivateLessons/${lessonId}`).get()).data();
  assert.equal(lesson.startAt.toDate().toISOString(), iso('2026-10-22', 6));
  assert.equal((await db.doc(`conversations/d_uProf_u1/messages/${b.messageId}`).get()).data().card.status, 'declined');
  await assert.rejects(rs.respondLessonRescheduleCore(db, 'u1', {lessonId, accept: true}, deps()), /pendente/);
});

test('horário tomado entre o pedido e o aceite; ex-aluno não remarca', async () => {
  await rs.requestLessonRescheduleCore(db, 'u1', {lessonId, startAt: iso('2026-10-22', 7)}, deps());
  await av.requestPrivateLessonCore(db, 'u2', {professorUid: 'uProf', startAt: iso('2026-10-22', 7)}, deps());
  await assert.rejects(rs.respondLessonRescheduleCore(db, 'uProf', {lessonId, accept: true}, deps()), /não está mais livre/);
  await db.doc('professors/uProf/students/u1').update({status: 'archived'});
  await assert.rejects(rs.requestLessonRescheduleCore(db, 'u1', {lessonId, startAt: iso('2026-10-22', 9)}, deps()), /vínculo de aula acabou/);
});
