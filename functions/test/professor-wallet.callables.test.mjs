/**
 * Carteira do professor contra o Firestore REAL (emulador): `collectionGroup('students')` do
 * agendador, `create` idempotente da recorrente e o caminho cobrança → webhook → lista do aluno.
 * O Asaas entra por deps falsas (a rede nunca é tocada). Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST ausente — rode via `npm run test:callables`.');
}
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();

const {
  createProfessorChargeCore,
  generateProfessorMonthlyChargesCore,
  processProfessorChargeAsaasNotification,
} = await import('../lib/professor-wallet.js');
const {loadMyClassCharges} = await import('../lib/arena-class-athlete-charges.js');

async function clearFirestore() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, {method: 'DELETE'});
  if (!res.ok) throw new Error(`Falha ao limpar o emulador: ${res.status}`);
}

function deps(now) {
  const payments = [];
  return {
    payments,
    now: () => now,
    env: () => 'sandbox',
    createAccount: async () => ({accountId: 'a', walletId: 'w', apiKey: 'k'}),
    findAccountByCpf: async () => null,
    sealKey: (k) => k,
    openKey: (k) => k,
    findPayment: async () => null,
    accountStatus: async () => ({general: 'APPROVED', documentation: null}),
    customerFor: async () => 'cus_1',
    createPayment: async (input) => {
      payments.push(input);
      return {paymentId: `pay_${payments.length}`, invoiceUrl: `https://asaas.test/${payments.length}`, status: 'PENDING'};
    },
    deletePayment: async () => {},
    notify: async () => {},
  };
}

beforeEach(async () => {
  await clearFirestore();
  await db.doc('professorPayoutAccounts/uProf').set({status: 'approved', walletId: 'wal_1', asaasEnv: 'sandbox', name: 'Thiago'});
  await db.doc('users/uProf').set({fullName: 'Thiago Mendes'});
  await db.doc('arenaProfessors/norte_uProf').set({professorUserId: 'uProf', relationshipType: 'INDEPENDENT', status: 'ACTIVE'});
  await db.doc('professors/uProf/students/uAluno').set({athleteId: 'uAluno', name: 'Paulo', status: 'active', recurring: null});
  // `students` de outra coleção não pode entrar no agendador.
  await db.doc('coaches/uCoach/students/uX').set({status: 'active', recurring: {dueDay: 25, amountReais: 1}});
});

test('recorrente: cria o mês, o agendador gera o próximo uma vez só', async () => {
  const oct = deps(new Date('2026-10-20T15:00:00Z'));
  await createProfessorChargeCore(db, 'uProf', {
    athleteId: 'uAluno', amountReais: 880, description: 'Mensal', dueDate: '2026-10-25', repeatMonthly: true,
  }, oct);
  assert.equal((await db.collection('professorCharges').get()).size, 1);

  const nov = deps(new Date('2026-11-20T15:00:00Z'));
  assert.deepEqual(await generateProfessorMonthlyChargesCore(db, nov), {created: 1, skipped: 0});
  assert.equal((await generateProfessorMonthlyChargesCore(db, nov)).created, 0);
  assert.equal(nov.payments.length, 1);
  assert.equal(nov.payments[0].walletId, 'wal_1');
  const charge = (await db.doc('professorCharges/uProf_uAluno_2026-11').get()).data();
  assert.equal(charge.status, 'open');
  assert.equal(charge.dueDate, '2026-11-25');
});

test('cobrança paga pelo webhook sai da lista do aluno', async () => {
  const d = deps(new Date('2026-10-20T15:00:00Z'));
  const {chargeId} = await createProfessorChargeCore(db, 'uProf', {athleteId: 'uAluno', amountReais: 140, dueDate: '2026-10-22'}, d);
  assert.equal((await loadMyClassCharges(db, 'uAluno', '2026-10-20')).length, 1);
  await processProfessorChargeAsaasNotification(db, 'pay_1',
    {status: 'RECEIVED', billingType: 'PIX', netValue: 139.01, externalReference: `professorCharge:${chargeId}`},
    db.doc('processed/pay_1'));
  const charge = (await db.doc(`professorCharges/${chargeId}`).get()).data();
  assert.equal(charge.status, 'paid');
  assert.equal(charge.netReais, 132.06);
  assert.deepEqual(await loadMyClassCharges(db, 'uAluno', '2026-10-20'), []);
});
