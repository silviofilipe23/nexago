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
const {createArenaBooking, quoteArenaBooking} = await import('../lib/arena-booking-create.js');
const {spNow} = await import('../lib/arena-peak-rules.js');
const {addDaysToDateKey} = await import('../lib/arena-weather-model.js');

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
      refund: async (paymentId, value) => {
        if (failOn.includes(paymentId)) throw new Error('ASAAS_DOWN');
        refunded.push(value == null ? paymentId : `${paymentId}:${value}`);
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

    assert.deepEqual(res, {
      bookingId: 'b1', status: 'canceled', refundedReais: 70, creditedReais: 0, mode: 'refund', refundPercent: 100,
    });
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

  test('estorno parcial (50%): metade volta e sai metade do líquido da arena', async () => {
    await seedPaidBooking('b6', {cancelPolicy: {mode: 'refund', refundPercent: 50}});
    await seedWallet(100, [{gross: 70, net: 64.4, extra: {bookingId: 'b6'}}]);
    const asaas = fakeAsaas();

    const res = await cancelMyArenaBookingCore(db, 'uA', 'b6', asaas.deps);

    assert.deepEqual(asaas.refunded, ['pay_b6:35']);
    assert.equal(res.refundedReais, 35);
    assert.equal(res.refundPercent, 50);
    const booking = (await db.doc('arenaBookings/b6').get()).data();
    assert.equal(booking.status, 'canceled');
    assert.deepEqual(booking.athleteCancelOutcome, {mode: 'refund', refundPercent: 50});
    assert.equal((await db.doc('arenaWallets/a1').get()).data().availableReais, 67.8);
  });

  test('crédito na arena: nada no Asaas, carteira intacta, crédito usável na arena', async () => {
    await seedPaidBooking('b7', {cancelPolicy: {mode: 'credit'}});
    await db.doc('arenas/a1').set({name: 'Arena CFC', weatherPolicy: {creditValidityDays: 60}});
    await db.doc('users/uA').set({fullName: 'Atleta A'});
    await seedWallet(100, [{gross: 70, net: 64.4, extra: {bookingId: 'b7'}}]);
    const asaas = fakeAsaas();

    const res = await cancelMyArenaBookingCore(db, 'uA', 'b7', asaas.deps);

    assert.deepEqual(asaas.refunded, []);
    assert.equal(res.creditedReais, 70);
    assert.equal(res.mode, 'credit');
    const credit = (await db.doc('arenaWeatherCredits/wx_b7').get()).data();
    assert.equal(credit.athleteId, 'uA');
    assert.equal(credit.athleteName, 'Atleta A');
    assert.equal(credit.arenaId, 'a1');
    assert.equal(credit.balanceReais, 70);
    assert.equal(credit.status, 'open');
    assert.equal(credit.source, 'athlete_cancel');
    const days = (credit.expiresAt.toMillis() - DAY_BEFORE) / 86_400_000;
    assert.equal(days, 60);
    const booking = (await db.doc('arenaBookings/b7').get()).data();
    assert.equal(booking.status, 'canceled');
    assert.deepEqual(booking.athleteCancelCreditIds, ['wx_b7']);
    assert.equal((await db.doc('arenaWallets/a1').get()).data().availableReais, 100);

    // Repetir não credita em dobro.
    await assert.rejects(cancelMyArenaBookingCore(db, 'uA', 'b7', asaas.deps), /não pode mais ser cancelada/);
    assert.equal((await db.collection('arenaWeatherCredits').get()).size, 1);
  });

  test('crédito com reserva dividida: cada pagador ganha a sua parte', async () => {
    await seedPaidBooking('b8', {cancelPolicy: {mode: 'credit'}, hasSplitShares: true, paymentStatus: 'split_pending'});
    await db.doc('arenaBookings/b8/paymentShares/s1').set({status: 'paid', asaasPaymentId: 'p1', asaasPaidAmount: 35, payerAthleteId: 'uA'});
    await db.doc('arenaBookings/b8/paymentShares/s2').set({status: 'paid', asaasPaymentId: 'p2', asaasPaidAmount: 35, payerAthleteId: 'uB'});
    const res = await cancelMyArenaBookingCore(db, 'uA', 'b8', fakeAsaas().deps);
    assert.equal(res.creditedReais, 70);
    assert.equal((await db.doc('arenaWeatherCredits/wx_b8_s2').get()).data().athleteId, 'uB');
    assert.equal((await db.doc('arenaWeatherCredits/wx_b8_s1').get()).data().athleteId, 'uA');
  });
});

describe('política da arena na reserva real', () => {
  beforeEach(clearFirestore);

  const LATER = addDaysToDateKey(spNow(new Date()).dateKey, 5);
  const call = (fn, uid, data) => fn.run({auth: {uid, token: {}}, data, rawRequest: {headers: {}}, acceptsStreaming: false});
  const input = (extra = {}) => ({
    arenaId: 'a1', arenaName: 'Arena CFC', courtId: 'q1', courtName: 'Quadra 1', date: LATER,
    startTime: '21:00', endTime: '22:00', paymentMode: 'onsite', ...extra,
  });

  async function seedArena(policy) {
    await db.doc('arenas/a1').set({
      name: 'Arena CFC', managerUserId: 'uOwner', planTier: 'pro', planStatus: 'active',
      onlinePaymentEnabled: true, onsitePaymentEnabled: true, paymentReceiver: 'manager',
      ...(policy ? {athleteCancelPolicy: policy} : {}),
    });
    await db.doc('arenas/a1/courts/q1').set({name: 'Quadra 1', basePricePerHourReais: 70});
    await db.doc('users/uA').set({fullName: 'Atleta A'});
  }

  test('a reserva nasce com a política da arena; mudar depois não mexe nela', async () => {
    await seedArena({mode: 'refund', refundPercent: 50});
    const res = await call(createArenaBooking, 'uA', input());
    assert.deepEqual((await db.doc(`arenaBookings/${res.bookingId}`).get()).data().cancelPolicy,
      {mode: 'refund', refundPercent: 50});

    await db.doc('arenas/a1').update({athleteCancelPolicy: {mode: 'credit'}});
    assert.deepEqual((await db.doc(`arenaBookings/${res.bookingId}`).get()).data().cancelPolicy,
      {mode: 'refund', refundPercent: 50});
    const next = await call(createArenaBooking, 'uA', input({startTime: '19:00', endTime: '20:00'}));
    assert.deepEqual((await db.doc(`arenaBookings/${next.bookingId}`).get()).data().cancelPolicy,
      {mode: 'credit', refundPercent: 0});
  });

  test('arena sem política: integral', async () => {
    await seedArena(null);
    const res = await call(createArenaBooking, 'uA', input());
    assert.deepEqual((await db.doc(`arenaBookings/${res.bookingId}`).get()).data().cancelPolicy,
      {mode: 'refund', refundPercent: 100});
  });

  test('crédito do cancelamento aparece na cotação da próxima reserva', async () => {
    await seedArena({mode: 'credit'});
    // Data relativa a hoje: a cotação usa o relógio de verdade para a validade do crédito.
    await seedPaidBooking('b9', {date: LATER, cancelPolicy: {mode: 'credit'}});
    await cancelMyArenaBookingCore(db, 'uA', 'b9', {...fakeAsaas().deps, nowMs: () => Date.now()});
    const quote = await call(quoteArenaBooking, 'uA', input({useWeatherCredit: true}));
    assert.equal(quote.weatherCreditAvailableReais, 70);
  });
});
