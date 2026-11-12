/**
 * Cancelamento pelo atleta com estorno, de ponta a ponta contra o emulador do Firestore:
 * estorno no Asaas (falso, injetado) → reserva cancelada → carteira da arena debitada.
 * A regra pura fica em `src/arena-booking-athlete-cancel.test.ts`.
 *
 * Uso: `npm run test:callables`.
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST ausente — rode via `npm run test:callables`.');
}
initializeApp({projectId: PROJECT_ID});
const db = getFirestore();

const {cancelMyArenaBookingCore} = await import('../lib/arena-booking-athlete-cancel.js');
const {arenaBookingStartAt} = await import('../lib/arena-booking-start-at.js');

const DATE = '2026-12-10';
const START_MS = arenaBookingStartAt(DATE, '19:00').getTime();
const DAY_BEFORE = START_MS - 24 * 60 * 60 * 1000;

async function clearFirestore() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, {method: 'DELETE'});
  if (!res.ok) throw new Error(`Falha ao limpar o emulador: ${res.status}`);
}

function fakeAsaas({failOn = []} = {}) {
  const refunded = [];
  return {
    refunded,
    deps: {
      nowMs: () => DAY_BEFORE,
      refund: async (paymentId) => {
        if (failOn.includes(paymentId)) throw new Error('ASAAS_DOWN');
        refunded.push(paymentId);
      },
    },
  };
}

async function seedPaidBooking(id, extra = {}) {
  await db.doc(`arenaBookings/${id}`).set({
    athleteId: 'uA', arenaId: 'a1', arenaName: 'Arena CFC', courtId: 'q1',
    date: DATE, startTime: '19:00', endTime: '20:00', status: 'confirmed',
    paymentStatus: 'paid', asaasPaymentId: `pay_${id}`, asaasPaidAmount: 70,
    amountReais: 70, amountPaidOnlineReais: 70, ...extra,
  });
}

async function seedWallet(available, credits) {
  await db.doc('arenaWallets/a1').set({arenaId: 'a1', availableReais: available, pendingReais: 0});
  for (const [i, c] of credits.entries()) {
    await db.doc(`arenaWallets/a1/ledger/c${i}`).set({type: 'credit', grossReais: c.gross, netReais: c.net, ...c.extra});
  }
}

describe('cancelMyArenaBooking', () => {
  beforeEach(clearFirestore);

  test('Pix pago: estorna, cancela e tira o líquido da carteira da arena', async () => {
    await seedPaidBooking('b1');
    await seedWallet(200, [
      {gross: 70, net: 64.4, extra: {bookingId: 'b1', asaasPaymentId: 'pay_b1'}},
      {gross: 50, net: 46, extra: {bookingId: 'outra'}},
      {gross: 30, net: 30, extra: {bookingId: 'b1', source: 'club'}},
    ]);
    const asaas = fakeAsaas();

    const res = await cancelMyArenaBookingCore(db, 'uA', 'b1', asaas.deps);

    assert.deepEqual(res, {bookingId: 'b1', status: 'canceled', refundedReais: 70});
    assert.deepEqual(asaas.refunded, ['pay_b1']);
    const booking = (await db.doc('arenaBookings/b1').get()).data();
    assert.equal(booking.status, 'canceled');
    assert.equal(booking.canceledByRole, 'athlete');
    assert.equal(booking.athleteCancelRefunds.pay_b1.status, 'done');
    const wallet = (await db.doc('arenaWallets/a1').get()).data();
    assert.equal(wallet.availableReais, 135.6);
    const debit = (await db.doc('arenaWallets/a1/ledger/athleteCancel_b1').get()).data();
    assert.equal(debit.netReais, -64.4);
    assert.equal(debit.type, 'refund');
  });

  test('chamada repetida não estorna nem debita de novo', async () => {
    await seedPaidBooking('b2');
    await seedWallet(100, [{gross: 70, net: 64.4, extra: {bookingId: 'b2'}}]);
    const asaas = fakeAsaas();
    await cancelMyArenaBookingCore(db, 'uA', 'b2', asaas.deps);
    await assert.rejects(cancelMyArenaBookingCore(db, 'uA', 'b2', asaas.deps), /não pode mais ser cancelada/);
    assert.deepEqual(asaas.refunded, ['pay_b2']);
    assert.equal((await db.doc('arenaWallets/a1').get()).data().availableReais, 35.6);
  });

  test('Asaas falhou: reserva continua ativa, carteira intacta, retry termina', async () => {
    await seedPaidBooking('b3', {hasSplitShares: true, paymentStatus: 'split_pending', asaasPaymentId: 'pay_old'});
    await db.doc('arenaBookings/b3/paymentShares/s1').set({status: 'paid', asaasPaymentId: 'pay_s1', asaasPaidAmount: 35});
    await db.doc('arenaBookings/b3/paymentShares/s2').set({status: 'paid', asaasPaymentId: 'pay_s2', asaasPaidAmount: 35});
    await seedWallet(100, [
      {gross: 35, net: 32.2, extra: {bookingId: 'b3'}},
      {gross: 35, net: 32.2, extra: {bookingId: 'b3'}},
    ]);

    const down = fakeAsaas({failOn: ['pay_s2']});
    await assert.rejects(cancelMyArenaBookingCore(db, 'uA', 'b3', down.deps), /continua ativa/);
    let booking = (await db.doc('arenaBookings/b3').get()).data();
    assert.equal(booking.status, 'confirmed');
    assert.equal(booking.athleteCancelRefunds.pay_s1.status, 'done');
    assert.equal(booking.athleteCancelRefunds.pay_s2.status, 'failed');
    assert.equal((await db.doc('arenaWallets/a1').get()).data().availableReais, 100);

    const up = fakeAsaas();
    const res = await cancelMyArenaBookingCore(db, 'uA', 'b3', up.deps);
    assert.deepEqual(up.refunded, ['pay_s2']);
    assert.equal(res.refundedReais, 70);
    booking = (await db.doc('arenaBookings/b3').get()).data();
    assert.equal(booking.status, 'canceled');
    assert.equal((await db.doc('arenaWallets/a1').get()).data().availableReais, 35.6);
  });

  test('pagar na arena: cancela sem estorno e sem mexer na carteira', async () => {
    await seedPaidBooking('b4', {paymentStatus: 'none', asaasPaymentId: null, asaasPaidAmount: null, amountPaidOnlineReais: 0});
    await seedWallet(100, []);
    const asaas = fakeAsaas();
    const res = await cancelMyArenaBookingCore(db, 'uA', 'b4', asaas.deps);
    assert.equal(res.refundedReais, 0);
    assert.deepEqual(asaas.refunded, []);
    assert.equal((await db.doc('arenaBookings/b4').get()).data().status, 'canceled');
    assert.equal((await db.doc('arenaWallets/a1').get()).data().availableReais, 100);
  });

  test('outro atleta e fora do prazo: recusa sem estornar', async () => {
    await seedPaidBooking('b5');
    const asaas = fakeAsaas();
    await assert.rejects(cancelMyArenaBookingCore(db, 'uB', 'b5', asaas.deps), /não pode cancelar/);
    const late = {...asaas.deps, nowMs: () => START_MS - 60 * 60 * 1000};
    await assert.rejects(cancelMyArenaBookingCore(db, 'uA', 'b5', late), /6h antes/);
    assert.deepEqual(asaas.refunded, []);
    assert.equal((await db.doc('arenaBookings/b5').get()).data().status, 'confirmed');
  });
});
