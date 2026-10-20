/**
 * Comunicados do professor contra o Firestore REAL (emulador): destinatários pela régua do
 * professor, entrega única, leitura/resposta com contagem por índice e lembrete. Push falso.
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

const {
  sendProfessorNoticeCore, respondProfessorNoticeCore, remindProfessorNoticeCore, runProfessorNoticeSchedulerCore,
} = await import('../lib/professor-notices.js');

const NOW = new Date('2026-10-20T15:00:00Z');
function deps(now = NOW) {
  const pushes = [];
  return {pushes, now: () => now, notify: async (p) => { pushes.push(p); }};
}

async function clear() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  await fetch(url, {method: 'DELETE'});
}

beforeEach(async () => {
  await clear();
  await db.doc('users/uProf').set({fullName: 'Thiago Mendes'});
  await db.doc('arenaProfessors/cfc_uProf').set({
    arenaId: 'cfc', professorUserId: 'uProf', relationshipType: 'ARENA_STAFF', status: 'ACTIVE',
    permissions: {canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: true}, arenaName: 'Arena CFC',
  });
  await db.doc('arenaClasses/c1').set({arenaId: 'cfc', arenaName: 'Arena CFC', name: 'Iniciante A', teacherUserId: 'uProf', status: 'active', weekdays: [1]});
  await db.doc('arenaClasses/c1/classStudents/u1').set({name: 'Carla', status: 'active', athleteId: 'u1'});
  await db.doc('arenaClasses/c1/classStudents/g1').set({name: 'Sem conta', status: 'active', athleteId: null});
  await db.doc('arenaClasses/c2').set({arenaId: 'cfc', arenaName: 'Arena CFC', name: 'Outra', teacherUserId: 'uProf', status: 'active'});
  await db.doc('arenaClasses/c2/classStudents/u9').set({name: 'Fora', status: 'active', athleteId: 'u9'});
  await db.doc('professors/uProf/students/u2').set({athleteId: 'u2', name: 'Paulo', status: 'active'});
  await db.doc('professors/uProf/students/u3').set({athleteId: 'u3', name: 'Convidado', status: 'invited'});
});

const enquete = (extra = {}) => ({
  kind: 'enquete', title: 'Aulão de sábado', body: 'Quem vem?', pollOptions: ['Vou', 'Não vou', 'Talvez.'],
  audience: {classIds: ['c1'], wallet: true}, ...extra,
});

test('envia só para quem tem conta na turma escolhida e na carteira ativa, uma vez', async () => {
  const d = deps();
  const res = await sendProfessorNoticeCore(db, 'uProf', enquete(), d);
  assert.equal(res.status, 'sent');
  const notice = (await db.doc(`professorNotices/${res.noticeId}`).get()).data();
  assert.deepEqual([...notice.recipientIds].sort(), ['u1', 'u2']);
  assert.deepEqual(d.pushes.map((p) => p.userId).sort(), ['u1', 'u2']);
  assert.equal(d.pushes[0].data.url, `/aviso-professor/${res.noticeId}`);
});

test('leitura e resposta: conta por índice (opção com ponto), troca de resposta move o voto', async () => {
  const {noticeId} = await sendProfessorNoticeCore(db, 'uProf', enquete(), deps());
  await respondProfessorNoticeCore(db, 'u1', noticeId, null);
  await respondProfessorNoticeCore(db, 'u1', noticeId, 'Talvez.');
  await respondProfessorNoticeCore(db, 'u1', noticeId, 'Vou');
  await respondProfessorNoticeCore(db, 'u2', noticeId, 'Vou');
  const notice = (await db.doc(`professorNotices/${noticeId}`).get()).data();
  assert.equal(notice.readCount, 2);
  assert.deepEqual(notice.answers, {0: 2, 2: 0});
  await assert.rejects(respondProfessorNoticeCore(db, 'u9', noticeId, 'Vou'), /não encontrado/);
  await assert.rejects(respondProfessorNoticeCore(db, 'u1', noticeId, 'Outra'), /inválida/);
});

test('agendado: o agendador entrega na hora e lembra quem não respondeu', async () => {
  const scheduledAt = new Date(NOW.getTime() + 3600_000).toISOString();
  const remindAt = new Date(NOW.getTime() + 2 * 3600_000).toISOString();
  const {noticeId, status} = await sendProfessorNoticeCore(db, 'uProf', enquete({scheduledAt, remindAt}), deps());
  assert.equal(status, 'scheduled');
  assert.deepEqual(await runProfessorNoticeSchedulerCore(db, deps()), {sent: 0, reminded: 0});
  const later = deps(new Date(NOW.getTime() + 3700_000));
  assert.equal((await runProfessorNoticeSchedulerCore(db, later)).sent, 1);
  assert.equal(later.pushes.length, 2);
  await respondProfessorNoticeCore(db, 'u1', noticeId, 'Vou');
  const remind = deps(new Date(NOW.getTime() + 7300_000));
  assert.deepEqual(await runProfessorNoticeSchedulerCore(db, remind), {sent: 0, reminded: 1});
  assert.deepEqual(remind.pushes.map((p) => p.userId), ['u2']);
  assert.equal((await runProfessorNoticeSchedulerCore(db, remind)).reminded, 0, 'lembra uma vez só');
  await assert.rejects(remindProfessorNoticeCore(db, noticeId, deps(), 'uOutro'), /não encontrado/);
});
