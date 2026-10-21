/**
 * Mensagens contra o Firestore REAL (emulador): quem pode abrir conversa, grupo da turma, o trigger
 * (resumo, não lidas, push) e o horário de atendimento. Push falso. Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('rode via `npm run test:callables`.');
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();
const m = await import('../lib/professor-messages.js');

const NOON = new Date('2026-10-20T15:00:00Z'); // terça 12:00 SP
const NIGHT = new Date('2026-10-21T02:00:00Z'); // terça 23:00 SP
function deps(now) { const pushes = []; return {pushes, now: () => now, notify: async (p) => { pushes.push(p); }}; }

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {method: 'DELETE'});
  await db.doc('users/uProf').set({fullName: 'Thiago Mendes'});
  await db.doc('users/u1').set({fullName: 'Carla Dias'});
  await db.doc('users/u2').set({fullName: 'Paulo Viana'});
  await db.doc('arenaProfessors/cfc_uProf').set({
    arenaId: 'cfc', professorUserId: 'uProf', relationshipType: 'ARENA_STAFF', status: 'ACTIVE',
    permissions: {canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: true}, arenaName: 'Arena CFC',
  });
  await db.doc('arenaClasses/c1').set({arenaId: 'cfc', arenaName: 'Arena CFC', name: 'Intermediário B', teacherUserId: 'uProf', status: 'active', weekdays: [2]});
  await db.doc('arenaClasses/c1/classStudents/u1').set({name: 'Carla', status: 'active', athleteId: 'u1'});
  await db.doc('professors/uProf/students/u2').set({athleteId: 'u2', name: 'Paulo', status: 'active'});
});

test('professor abre com aluno da turma e da carteira; estranho é recusado', async () => {
  const a = await m.openProfessorConversationCore(db, 'uProf', 'u1', NOON);
  assert.equal(a.conversationId, 'd_uProf_u1');
  await m.openProfessorConversationCore(db, 'uProf', 'u2', NOON);
  await assert.rejects(m.openProfessorConversationCore(db, 'uProf', 'u9', NOON), /só conversa/);
  const s = await m.openStudentConversationCore(db, 'u1', 'uProf', NOON);
  assert.equal(s.conversationId, 'd_uProf_u1');
  await assert.rejects(m.openStudentConversationCore(db, 'u9', 'uProf', NOON), /só conversa/);
  const profs = await m.loadMyProfessorsCore(db, 'u1', NOON);
  assert.deepEqual(profs.map((p) => p.professorUid), ['uProf']);
  assert.deepEqual((await m.loadMyProfessorsCore(db, 'u2', NOON)).map((p) => p.professorUid), ['uProf']);
});

const later = (d, ms) => new Date(d.getTime() + ms);

test('grupo: só alunos com conta ativos nesta turma; envio põe o nome do servidor e soma não lidas', async () => {
  await db.doc('arenaClasses/c1/classStudents/u3').set({name: 'Pausado', status: 'paused', athleteId: 'u3'});
  const {conversationId, memberCount} = await m.openClassConversationCore(db, 'uProf', 'c1', NOON);
  assert.equal(memberCount, 1);
  const d = deps(NOON);
  await m.sendConversationMessageCore(db, 'uProf', conversationId, 'Treino de saque hoje', d);
  const conv = (await db.doc(`conversations/${conversationId}`).get()).data();
  assert.equal(conv.unread.u1, 1);
  assert.equal(conv.lastMessage.senderName, 'Thiago Mendes');
  assert.deepEqual(d.pushes.map((p) => [p.userId, p.data.url]), [['u1', `/mensagens/${conversationId}`]]);
  await m.markConversationReadCore(db, 'u1', conversationId);
  assert.equal((await db.doc(`conversations/${conversationId}`).get()).data().unread.u1, 0);
  await assert.rejects(m.markConversationReadCore(db, 'u9', conversationId), /não encontrada/);
  await assert.rejects(m.sendConversationMessageCore(db, 'u9', conversationId, 'oi', deps(NOON)), /não encontrada/);
});

test('limite de frequência: 1 por segundo', async () => {
  const {conversationId} = await m.openStudentConversationCore(db, 'u1', 'uProf', NOON);
  await m.sendConversationMessageCore(db, 'u1', conversationId, 'um', deps(NOON));
  await assert.rejects(m.sendConversationMessageCore(db, 'u1', conversationId, 'dois', deps(later(NOON, 200))), /rápido demais/);
  await m.sendConversationMessageCore(db, 'u1', conversationId, 'três', deps(later(NOON, 1500)));
  const msgs = (await db.collection(`conversations/${conversationId}/messages`).get()).docs.map((x) => x.data());
  assert.deepEqual(msgs.map((x) => x.senderName), ['Carla Dias', 'Carla Dias']);
});

test('aluno arquivado da carteira: conversa fecha e ele deixa de ser membro', async () => {
  const {conversationId} = await m.openProfessorConversationCore(db, 'uProf', 'u2', NOON);
  await db.doc('arenaProfessors/norte_uProf').set({professorUserId: 'uProf', relationshipType: 'INDEPENDENT', status: 'ACTIVE'});
  const {archiveProfessorStudentCore} = await import('../lib/professor-wallet.js');
  await archiveProfessorStudentCore(db, 'uProf', 'u2');
  const conv = (await db.doc(`conversations/${conversationId}`).get()).data();
  assert.equal(conv.closed, true);
  assert.deepEqual(conv.memberIds, ['uProf']);
  await assert.rejects(m.sendConversationMessageCore(db, 'u2', conversationId, 'oi', deps(NOON)), /não encontrada/);
});

test('aluno que saiu da turma: na revalidação o grupo o tira da lista', async () => {
  const {conversationId} = await m.openClassConversationCore(db, 'uProf', 'c1', NOON);
  await db.doc('arenaClasses/c1/classStudents/u1').set({status: 'removed'}, {merge: true});
  await m.sendConversationMessageCore(db, 'uProf', conversationId, 'oi turma', deps(NOON));
  assert.deepEqual((await db.doc(`conversations/${conversationId}`).get()).data().memberIds, ['uProf']);
});

test('fora do horário: sem push ao professor e resposta automática uma vez', async () => {
  await db.doc('users/uProf/messagingPrefs/settings').set({
    quietEnabled: true, from: '06:00', to: '21:30', days: [1, 2, 3, 4, 5, 6], autoReplyEnabled: true, autoReplyText: 'Respondo a partir das 06:00.',
  });
  const {conversationId} = await m.openStudentConversationCore(db, 'u1', 'uProf', NIGHT);
  const first = deps(NIGHT);
  await m.sendConversationMessageCore(db, 'u1', conversationId, 'Prof, posso trocar o horário?', first);
  assert.equal(first.pushes.length, 0, 'professor silenciado');
  await m.sendConversationMessageCore(db, 'u1', conversationId, 'Obrigada!', deps(later(NIGHT, 5000)));
  const msgs = (await db.collection(`conversations/${conversationId}/messages`).get()).docs.map((x) => x.data());
  assert.equal(msgs.filter((x) => x.auto === true).length, 1, 'uma resposta automática só');
  assert.equal(msgs.find((x) => x.auto).senderUid, 'uProf');
});
