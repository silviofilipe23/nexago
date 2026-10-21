/**
 * Ganhos do professor contra o Firestore REAL (emulador), com o PIX falso: o repasse pago pelo
 * nexaGO move o dinheiro do caixa da arena para o saldo do professor, e o saque reserva, consome
 * ou devolve — inclusive pelo webhook de falha. Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('rode via `npm run test:callables`.');
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();

const {payArenaClassPayoutViaNexagoCore, requestProfessorWithdrawalCore, reviewProfessorWithdrawalCore} =
  await import('../lib/professor-earnings.js');
const {setTeacherPayoutStatusCore} = await import('../lib/arena-class-payout.js');
const {processArenaWithdrawalTransferWebhook} = await import('../lib/asaas-withdrawal-webhook.js');

const NOW = new Date('2026-11-05T15:00:00Z');
async function clear() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  await fetch(url, {method: 'DELETE'});
}
const wallet = async (path) => (await db.doc(path).get()).data() ?? {};

/** PIX falso: grava o que o envio real grava (marca de envio + id da transferência). */
function fakePix(sent) {
  return async (ref, withdrawal, prefix) => {
    sent.push({id: ref.id, prefix, value: withdrawal.netReais});
    await ref.update({payoutStatus: 'sent', asaasTransferId: `tra_${ref.id}`, transferRequestedAt: FieldValue.serverTimestamp()});
    return {payoutId: `tra_${ref.id}`, payoutStatus: 'sent'};
  };
}

beforeEach(async () => {
  await clear();
  await db.doc('arenas/cfc').set({name: 'Arena CFC', managerUserId: 'uOwner', planTier: 'pro', planStatus: 'active'});
  await db.doc('arenaWallets/cfc').set({arenaId: 'cfc', availableReais: 5000, pendingReais: 0});
  await db.doc('arenaClassPayouts/cfc_t1_2026-10').set({
    arenaId: 'cfc', teacherId: 't1', teacherUserId: 'uProf', teacherName: 'Thiago', month: '2026-10',
    amountReais: 1680, status: 'closed',
  });
  await db.doc('organizerPayoutProfiles/uProf').set({payoutPixKey: '52998224725', payoutPixKeyType: 'CPF'});
  await db.doc('arenaProfessors/cfc_uProf').set({arenaId: 'cfc', professorUserId: 'uProf', relationshipType: 'ARENA_STAFF', status: 'ACTIVE'});
  await db.doc('arenas/cfc/staff/uGestor').set({role: 'gestor', status: 'active'});
});

test('só o dono paga pelo nexaGO; sem vínculo ativo ou para si mesmo, recusa', async () => {
  await assert.rejects(payArenaClassPayoutViaNexagoCore(db, 'uGestor', 'cfc_t1_2026-10', NOW), /dono da arena|permiss|acesso/i);
  await db.doc('arenaProfessors/cfc_uProf').set({status: 'SUSPENDED'}, {merge: true});
  await assert.rejects(payArenaClassPayoutViaNexagoCore(db, 'uOwner', 'cfc_t1_2026-10', NOW), /vínculo ativo/);
  await db.doc('arenaClassPayouts/cfc_t1_2026-10').set({teacherUserId: 'uOwner'}, {merge: true});
  await assert.rejects(payArenaClassPayoutViaNexagoCore(db, 'uOwner', 'cfc_t1_2026-10', NOW), /própria conta/);
  assert.equal((await wallet('arenaWallets/cfc')).availableReais, 5000, 'nada saiu do caixa');
});

test('dois pedidos de saque ao mesmo tempo: um passa, o outro é recusado', async () => {
  await payArenaClassPayoutViaNexagoCore(db, 'uOwner', 'cfc_t1_2026-10', NOW);
  const results = await Promise.allSettled([
    requestProfessorWithdrawalCore(db, 'uProf', 1000, fakePix([])),
    requestProfessorWithdrawalCore(db, 'uProf', 600, fakePix([])),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const w = await wallet('professorEarningsWallets/uProf');
  assert.equal(roundTwo(w.availableReais + w.pendingReais), 1680, 'o total nunca muda');
});

function roundTwo(n) { return Math.round(n * 100) / 100; }

test('recusar com PIX em voo é bloqueado (não devolve dinheiro que está saindo)', async () => {
  await payArenaClassPayoutViaNexagoCore(db, 'uOwner', 'cfc_t1_2026-10', NOW);
  const big = await requestProfessorWithdrawalCore(db, 'uProf', 1000, fakePix([]));
  await db.doc(`professorWithdrawals/${big.withdrawalId}`).update({payoutStatus: 'pending', transferRequestedAt: FieldValue.serverTimestamp()});
  await assert.rejects(reviewProfessorWithdrawalCore(db, 'uAdmin', {withdrawalId: big.withdrawalId, decision: 'rejected'}), /em andamento/);
  await assert.rejects(reviewProfessorWithdrawalCore(db, 'uAdmin', {withdrawalId: 'a/b', decision: 'rejected'}), /inválido/);
  const w = await wallet('professorEarningsWallets/uProf');
  assert.deepEqual([w.availableReais, w.pendingReais], [680, 1000]);
});

test('arena paga pelo nexaGO: caixa desce, saldo do professor sobe, repasse pago e travado', async () => {
  const res = await payArenaClassPayoutViaNexagoCore(db, 'uOwner', 'cfc_t1_2026-10', NOW);
  assert.equal(res.amountReais, 1680);
  assert.equal((await wallet('arenaWallets/cfc')).availableReais, 3320);
  assert.equal((await wallet('professorEarningsWallets/uProf')).availableReais, 1680);
  const payout = await wallet('arenaClassPayouts/cfc_t1_2026-10');
  assert.deepEqual([payout.status, payout.paymentMethod], ['paid', 'nexago']);
  assert.equal((await db.collection('professorEarningsWallets/uProf/ledger').get()).size, 1);
  assert.equal((await db.collection('arenaWallets/cfc/ledger').get()).docs[0].data().netReais, -1680);
  await assert.rejects(payArenaClassPayoutViaNexagoCore(db, 'uOwner', 'cfc_t1_2026-10', NOW), /já foi pago/);
  await assert.rejects(setTeacherPayoutStatusCore(db, 'cfc_t1_2026-10', {status: 'closed'}, 'uOwner', '2026-11-05'), /não pode ser desfeito/);
  await assert.rejects(payArenaClassPayoutViaNexagoCore(db, 'uOutro', 'cfc_t1_2026-10', NOW));
});

test('caixa sem saldo suficiente: recusa sem mexer em nada', async () => {
  await db.doc('arenaWallets/cfc').set({availableReais: 100}, {merge: true});
  await assert.rejects(payArenaClassPayoutViaNexagoCore(db, 'uOwner', 'cfc_t1_2026-10', NOW), /não cobre/);
  assert.equal((await wallet('arenaClassPayouts/cfc_t1_2026-10')).status, 'closed');
  assert.equal((await db.doc('professorEarningsWallets/uProf').get()).exists, false);
});

test('saque ≤ R$ 500 sai automático e consome o reservado; um por vez', async () => {
  await payArenaClassPayoutViaNexagoCore(db, 'uOwner', 'cfc_t1_2026-10', NOW);
  const sent = [];
  const res = await requestProfessorWithdrawalCore(db, 'uProf', 400, fakePix(sent));
  assert.equal(res.status, 'approved');
  assert.deepEqual(sent.map((s) => [s.prefix, s.value]), [['professorWithdrawal:', 400]]);
  const w = await wallet('professorEarningsWallets/uProf');
  assert.deepEqual([w.availableReais, w.pendingReais], [1280, 0]);
  await assert.rejects(requestProfessorWithdrawalCore(db, 'uProf', 5000, fakePix(sent)), /insuficiente/);
});

test('saque > R$ 500 espera revisão; recusar devolve; PIX que falha no webhook devolve', async () => {
  await payArenaClassPayoutViaNexagoCore(db, 'uOwner', 'cfc_t1_2026-10', NOW);
  const sent = [];
  const big = await requestProfessorWithdrawalCore(db, 'uProf', 1000, fakePix(sent));
  assert.equal(big.status, 'pending');
  assert.equal(sent.length, 0);
  assert.deepEqual([(await wallet('professorEarningsWallets/uProf')).availableReais, (await wallet('professorEarningsWallets/uProf')).pendingReais], [680, 1000]);
  await assert.rejects(requestProfessorWithdrawalCore(db, 'uProf', 100, fakePix(sent)), /em andamento/);
  await reviewProfessorWithdrawalCore(db, 'uAdmin', {withdrawalId: big.withdrawalId, decision: 'rejected'}, fakePix(sent));
  assert.deepEqual([(await wallet('professorEarningsWallets/uProf')).availableReais, (await wallet('professorEarningsWallets/uProf')).pendingReais], [1680, 0]);

  const small = await requestProfessorWithdrawalCore(db, 'uProf', 300, fakePix(sent));
  assert.equal(small.status, 'approved');
  const notified = [];
  await processArenaWithdrawalTransferWebhook(db, 'TRANSFER_FAILED', {
    id: `tra_${small.withdrawalId}`, externalReference: `professorWithdrawal:${small.withdrawalId}`, failReason: 'Conta encerrada',
  }, async (f) => { notified.push(f.kind); });
  assert.equal((await wallet('professorEarningsWallets/uProf')).availableReais, 1680, 'falha devolve ao saldo');
  assert.deepEqual(notified, ['professor']);
  assert.equal((await wallet(`professorWithdrawals/${small.withdrawalId}`)).status, 'rejected');
});
