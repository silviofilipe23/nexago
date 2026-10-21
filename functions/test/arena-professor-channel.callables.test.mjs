/**
 * Canal professor ↔ gestão da arena (D4) e comunicados da arena para os professores (F6) contra o
 * Firestore REAL (emulador). Push falso. Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('rode via `npm run test:callables`.');
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();
const ch = await import('../lib/arena-professor-channel.js');
const m = await import('../lib/professor-messages.js');

const NOON = new Date('2026-10-20T15:00:00Z');
function deps(now) { const pushes = []; return {pushes, now: () => now, notify: async (p) => { pushes.push(p); }}; }
const later = (d, ms) => new Date(d.getTime() + ms);

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {method: 'DELETE'});
  await db.doc('users/uProf').set({fullName: 'Thiago Mendes'});
  await db.doc('users/uProf2').set({fullName: 'Rita Lopes'});
  await db.doc('users/uOwner').set({fullName: 'Marcos Dono'});
  await db.doc('users/uAna').set({fullName: 'Ana Souza'});
  await db.doc('users/uRecep').set({fullName: 'Rui Recepção'});
  await db.doc('arenas/cfc').set({
    name: 'Arena CFC', managerUserId: 'uOwner', planStatus: 'active', planTier: 'pro',
    planActiveUntil: Timestamp.fromDate(new Date(Date.now() + 30 * 86_400_000)),
  });
  await db.doc('arenas/cfc/staff/uAna').set({status: 'active', role: 'gestor'});
  await db.doc('arenas/cfc/staff/uRecep').set({status: 'active', role: 'recepcao'});
  await db.doc('arenaProfessors/cfc_uProf').set({arenaId: 'cfc', professorUserId: 'uProf', status: 'ACTIVE', relationshipType: 'ARENA_STAFF'});
  await db.doc('arenaProfessors/cfc_uProf2').set({arenaId: 'cfc', professorUserId: 'uProf2', status: 'ACTIVE', relationshipType: 'INDEPENDENT'});
  await db.doc('arenaProfessors/cfc_uOld').set({arenaId: 'cfc', professorUserId: 'uOld', status: 'ENDED', relationshipType: 'ARENA_STAFF'});
});

test('canal: professor abre o dele; gestão = dono + gestor (recepção fica de fora)', async () => {
  const {conversationId, linkId} = await ch.openArenaChannelCore(db, 'uProf', {arenaId: 'cfc'}, NOON);
  assert.equal(conversationId, 'a_cfc_uProf');
  assert.equal(linkId, 'cfc_uProf');
  const conv = (await db.doc(`conversations/${conversationId}`).get()).data();
  assert.equal(conv.kind, 'arena');
  assert.equal(conv.title, 'Gestão Arena CFC');
  assert.deepEqual([...conv.memberIds].sort(), ['uAna', 'uOwner', 'uProf']);
  assert.equal(conv.memberNames.uAna, 'Ana Souza · gestão');
  assert.equal(conv.memberNames.uProf, 'Thiago Mendes');
  // A gestão abre com o professorUid; recepção e estranho são recusados.
  await ch.openArenaChannelCore(db, 'uAna', {arenaId: 'cfc', professorUid: 'uProf'}, NOON);
  await assert.rejects(ch.openArenaChannelCore(db, 'uRecep', {arenaId: 'cfc', professorUid: 'uProf'}, NOON), /não tem acesso/);
  await assert.rejects(ch.openArenaChannelCore(db, 'uX', {arenaId: 'cfc', professorUid: 'uProf'}, NOON), /não tem acesso/);
  // Sem vínculo ativo não há canal.
  await assert.rejects(ch.openArenaChannelCore(db, 'uOld', {arenaId: 'cfc'}, NOON), /vínculo ativo/);
  await assert.rejects(ch.openArenaChannelCore(db, 'uAna', {arenaId: 'cfc', professorUid: 'uOld'}, NOON), /vínculo ativo/);
});

test('canal: envio pelos dois lados com push para o lugar certo; vínculo encerrado fecha', async () => {
  const {conversationId} = await ch.openArenaChannelCore(db, 'uProf', {arenaId: 'cfc'}, NOON);
  const d1 = deps(NOON);
  await m.sendConversationMessageCore(db, 'uAna', conversationId, 'Quadra 2 em manutenção amanhã', d1);
  const toProf = d1.pushes.find((p) => p.userId === 'uProf');
  assert.equal(toProf.title, 'Gestão Arena CFC · Ana Souza · gestão');
  assert.equal(toProf.data.url, `/professor/mensagens/${conversationId}`);
  const toOwner = d1.pushes.find((p) => p.userId === 'uOwner');
  assert.equal(toOwner.data.url, '/arena/professionals/cfc_uProf/conversa');
  assert.equal(toOwner.data.webUrl, '/painel/profissionais/cfc_uProf?aba=mensagens');

  const d2 = deps(later(NOON, 2000));
  await m.sendConversationMessageCore(db, 'uProf', conversationId, 'Fechado, obrigado!', d2);
  assert.deepEqual(d2.pushes.map((p) => p.userId).sort(), ['uAna', 'uOwner']);
  const conv = (await db.doc(`conversations/${conversationId}`).get()).data();
  assert.equal(conv.unread.uAna, 1);
  assert.equal(conv.unread.uProf, 1);

  // Ana saiu da equipe: a revalidação (passadas 6 h) tira ela do canal.
  await db.doc('arenas/cfc/staff/uAna').update({status: 'removed'});
  await assert.rejects(m.sendConversationMessageCore(db, 'uAna', conversationId, 'oi', deps(later(NOON, 7 * 3600_000))), /não faz mais parte/);
  assert.ok(!(await db.doc(`conversations/${conversationId}`).get()).data().memberIds.includes('uAna'));

  // Vínculo encerrado: o canal fecha para todos.
  await db.doc('arenaProfessors/cfc_uProf').update({status: 'ENDED'});
  await assert.rejects(m.sendConversationMessageCore(db, 'uProf', conversationId, 'oi', deps(later(NOON, 8 * 3600_000))), /vínculo com a arena acabou/);
  assert.equal((await db.doc(`conversations/${conversationId}`).get()).data().closed, true);
});

test('comunicado da arena: só professores ATIVOS recebem; leitura conta uma vez', async () => {
  const d = deps(NOON);
  const r = await ch.sendArenaProfessorNoticeCore(db, 'uAna', {arenaId: 'cfc', kind: 'evento', title: 'Torneio interno 15/11', body: 'Inscrições abertas.'}, d);
  assert.equal(r.recipientCount, 2);
  assert.deepEqual(d.pushes.map((p) => p.userId).sort(), ['uProf', 'uProf2']);
  assert.equal(d.pushes[0].data.url, `/professor/mais/comunicados/arena/${r.noticeId}`);
  const notice = (await db.doc(`arenaProfessorNotices/${r.noticeId}`).get()).data();
  assert.equal(notice.authorName, 'Ana Souza');
  assert.equal(notice.arenaName, 'Arena CFC');

  await ch.markArenaProfessorNoticeReadCore(db, 'uProf', r.noticeId, NOON);
  await ch.markArenaProfessorNoticeReadCore(db, 'uProf', r.noticeId, NOON);
  assert.equal((await db.doc(`arenaProfessorNotices/${r.noticeId}`).get()).data().readCount, 1);
  await assert.rejects(ch.markArenaProfessorNoticeReadCore(db, 'uOld', r.noticeId, NOON), /não encontrado/);

  // Subconjunto escolhido; recepção não manda; ninguém ativo no filtro = erro.
  const only = await ch.sendArenaProfessorNoticeCore(db, 'uOwner', {arenaId: 'cfc', title: 'Só Rita', body: 'Oi', professorUids: ['uProf2', 'uOld']}, deps(NOON));
  assert.equal(only.recipientCount, 1);
  await assert.rejects(ch.sendArenaProfessorNoticeCore(db, 'uRecep', {arenaId: 'cfc', title: 'x', body: 'y'}, deps(NOON)), /não tem acesso/);
  await assert.rejects(ch.sendArenaProfessorNoticeCore(db, 'uOwner', {arenaId: 'cfc', title: 'x', body: 'y', professorUids: ['uOld']}, deps(NOON)), /Nenhum professor/);
});
