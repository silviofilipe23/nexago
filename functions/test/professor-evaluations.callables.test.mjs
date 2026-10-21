/**
 * Avaliação do professor contra o Firestore REAL (emulador): só aluno dele, uma por mês, nota geral,
 * comparação com o mês anterior, envio com push. Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('rode via `npm run test:callables`.');
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();
const e = await import('../lib/professor-evaluations.js');

const NOW = new Date('2026-10-20T15:00:00Z');
function deps() { const pushes = []; return {pushes, now: () => NOW, notify: async (p) => { pushes.push(p); }}; }
const scores = (v) => ({saque: v, forehand: v, backhand: v, voleio: v, smash: v, posicionamento: v});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {method: 'DELETE'});
  await db.doc('users/uProf').set({fullName: 'Thiago Mendes'});
  await db.doc('users/u2').set({fullName: 'Paulo Viana'});
  await db.doc('professors/uProf/students/u2').set({athleteId: 'u2', name: 'Paulo', status: 'active'});
});

test('rascunho não avisa; enviar avisa uma vez e compara com o mês anterior', async () => {
  const sep = deps();
  await e.saveProfessorEvaluationCore(db, 'uProf', {athleteId: 'u2', period: '2026-09', sport: 'beachTennis', scores: scores(6), send: true}, sep);
  const d = deps();
  const draft = await e.saveProfessorEvaluationCore(db, 'uProf', {athleteId: 'u2', period: '2026-10', sport: 'beachTennis', scores: {...scores(7), smash: 8.2}, comment: 'Evoluiu', focus: ['Smash', 'Saque', 'Rede', 'Extra']}, d);
  assert.equal(draft.status, 'draft');
  assert.equal(d.pushes.length, 0);
  assert.equal((await db.doc('professorEvaluations/uProf_u2_2026-10').get()).data().focus.length, 3, 'no máximo 3 focos');
  const sent = await e.saveProfessorEvaluationCore(db, 'uProf', {athleteId: 'u2', period: '2026-10', sport: 'beachTennis', scores: {...scores(7), smash: 8.2}, send: true}, d);
  assert.deepEqual([sent.status, sent.overall, sent.previousOverall], ['sent', 7.2, 6]);
  assert.equal(d.pushes.length, 1);
  assert.equal(d.pushes[0].data.url, '/avaliacao/uProf_u2_2026-10');
  const doc = (await db.doc('professorEvaluations/uProf_u2_2026-10').get()).data();
  assert.equal(doc.scores.smash, 8, 'meio ponto');
  await e.saveProfessorEvaluationCore(db, 'uProf', {athleteId: 'u2', period: '2026-10', sport: 'beachTennis', scores: scores(8), send: true}, d);
  assert.equal(d.pushes.length, 1, 'editar a enviada não avisa de novo');
  await assert.rejects(e.deleteProfessorEvaluationCore(db, 'uProf', 'uProf_u2_2026-10'), /não pode ser apagada/);
});

test('recusa quem não é aluno, mês futuro, fundamento faltando ou estranho', async () => {
  await assert.rejects(e.saveProfessorEvaluationCore(db, 'uProf', {athleteId: 'u9', sport: 'beachTennis', scores: scores(5)}, deps()), /só avalia/);
  await assert.rejects(e.saveProfessorEvaluationCore(db, 'uProf', {athleteId: 'u2', period: '2026-12', sport: 'beachTennis', scores: scores(5)}, deps()), /Mês/);
  await assert.rejects(e.saveProfessorEvaluationCore(db, 'uProf', {athleteId: 'u2', sport: 'beachTennis', scores: {saque: 5}}, deps()), /cada fundamento/);
  await assert.rejects(e.saveProfessorEvaluationCore(db, 'uProf', {athleteId: 'u2', sport: 'beachTennis', scores: {...scores(5), mergulho: 3}}, deps()), /desconhecido/);
  await assert.rejects(e.deleteProfessorEvaluationCore(db, 'uOutro', 'uProf_u2_2026-10'), /não encontrada/);
});
