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

test('grupo da turma tem o professor e os alunos com conta; mensagem soma não lidas e avisa', async () => {
  const {conversationId, memberCount} = await m.openClassConversationCore(db, 'uProf', 'c1', NOON);
  assert.equal(memberCount, 1);
  const d = deps(NOON);
  const ref = await db.collection(`conversations/${conversationId}/messages`).add({senderUid: 'uProf', senderName: 'Thiago', text: 'Treino de saque hoje', createdAt: Timestamp.fromDate(NOON)});
  await m.handleConversationMessageCore(db, conversationId, ref.id, (await ref.get()).data(), d);
  const conv = (await db.doc(`conversations/${conversationId}`).get()).data();
  assert.equal(conv.unread.u1, 1);
  assert.equal(conv.lastMessage.text, 'Treino de saque hoje');
  assert.deepEqual(d.pushes.map((p) => [p.userId, p.data.url]), [['u1', `/mensagens/${conversationId}`]]);
  await m.markConversationReadCore(db, 'u1', conversationId);
  assert.equal((await db.doc(`conversations/${conversationId}`).get()).data().unread.u1, 0);
  await assert.rejects(m.markConversationReadCore(db, 'u9', conversationId), /não encontrada/);
});

test('fora do horário: sem push ao professor e resposta automática uma vez', async () => {
  await db.doc('users/uProf/messagingPrefs/settings').set({
    quietEnabled: true, from: '06:00', to: '21:30', days: [1, 2, 3, 4, 5, 6], autoReplyEnabled: true, autoReplyText: 'Respondo a partir das 06:00.',
  });
  const {conversationId} = await m.openStudentConversationCore(db, 'u1', 'uProf', NIGHT);
  const send = async (text) => {
    const r = await db.collection(`conversations/${conversationId}/messages`).add({senderUid: 'u1', senderName: 'Carla', text, createdAt: Timestamp.fromDate(NIGHT)});
    const d = deps(NIGHT);
    await m.handleConversationMessageCore(db, conversationId, r.id, (await r.get()).data(), d);
    return d;
  };
  const first = await send('Prof, posso trocar o horário?');
  assert.equal(first.pushes.length, 0, 'professor silenciado');
  await send('Obrigada!');
  const msgs = (await db.collection(`conversations/${conversationId}/messages`).get()).docs.map((x) => x.data());
  assert.equal(msgs.filter((x) => x.auto === true).length, 1, 'uma resposta automática só');
  assert.equal(msgs.find((x) => x.auto).senderUid, 'uProf');
});
