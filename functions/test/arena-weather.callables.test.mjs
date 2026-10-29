/**
 * Cancelamento por chuva de ponta a ponta nas callables REAIS (`.run()`) contra o emulador do
 * Firestore: Modo chuva (prévia, ativação, bloqueio de horários), escolha do atleta (crédito,
 * manter, remarcar), crédito usado numa reserva nova, pedido do atleta e a varredura.
 * As regras puras ficam em `src/arena-weather-model.test.ts`.
 *
 * Uso: `npm run test:callables`.
 */

import {beforeEach, describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST ausente — rode via `npm run test:callables`.');
}
initializeApp({projectId: PROJECT_ID});
const db = getFirestore();

const weather = await import('../lib/arena-weather.js');
const {createArenaBooking, quoteArenaBooking} = await import('../lib/arena-booking-create.js');
const {restoreWeatherCreditOnCancel} = await import('../lib/arena-weather-credits.js');
const {resolveAndSyncArenaBookingChargeAmounts} = await import('../lib/arena-booking-pricing.js');
const {spNow} = await import('../lib/arena-peak-rules.js');
const {addDaysToDateKey} = await import('../lib/arena-weather-model.js');

const TODAY = spNow(new Date()).dateKey;
const RAIN_DAY = addDaysToDateKey(TODAY, 3);
const LATER = addDaysToDateKey(TODAY, 5);

function call(fn, uid, data = {}) {
  return fn.run({auth: {uid, token: {}}, data, rawRequest: {headers: {}}, acceptsStreaming: false});
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (error) => {
    assert.match(String(error?.message ?? error), pattern);
    return true;
  });
}

async function clearFirestore() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, {method: 'DELETE'});
  if (!res.ok) throw new Error(`Falha ao limpar o emulador: ${res.status}`);
}

async function seedArena(policy = {}) {
  await db.doc('arenas/a1').set({
    name: 'Arena CFC', managerUserId: 'uOwner', planTier: 'pro', planStatus: 'active',
    onlinePaymentEnabled: true, onsitePaymentEnabled: true, paymentReceiver: 'manager',
    weatherPolicy: {enabled: true, trigger: 'arena', ...policy},
  });
  await db.doc('arenas/a1/staff/uFin').set({role: 'financeiro', status: 'active'});
  await db.doc('arenas/a1/courts/q1').set({name: 'Quadra 1', basePricePerHourReais: 70});
  await db.doc('arenas/a1/courts/q2').set({name: 'Quadra 2', basePricePerHourReais: 70});
  for (const uid of ['uA', 'uB', 'uC', 'uD', 'uE', 'uF', 'uG']) {
    await db.doc(`users/${uid}`).set({fullName: `Atleta ${uid}`});
  }
}

function lockId(courtId, date, hour) {
  return `a1_${courtId}_${date}_h${String(hour).padStart(2, '0')}`;
}

async function seedBooking(id, data, lockHours = []) {
  const booking = {
    arenaId: 'a1', arenaName: 'Arena CFC', courtId: 'q1', courtName: 'Quadra 1', date: RAIN_DAY,
    status: 'active', source: 'platform', paymentChannel: 'pix', paymentFraction: 1,
    amountReais: 70, amountPaidOnlineReais: 70, ...data,
  };
  await db.doc(`arenaBookings/${id}`).set(booking);
  for (const h of lockHours) {
    await db.doc(`arenaSlotLocks/${lockId(booking.courtId, booking.date, h)}`).set({bookingId: id});
  }
}

const rainInput = (extra = {}) => ({
  arenaId: 'a1', date: RAIN_DAY, startTime: '17:00', endTime: '20:00', courtIds: ['q1', 'q2'], ...extra,
});

beforeEach(async () => {
  await clearFirestore();
});

describe('Modo chuva', () => {
  async function seedRainDay() {
    await seedArena();
    await seedBooking('bPaid', {athleteId: 'uA', startTime: '18:00', endTime: '19:00'}, [18]);
    await seedBooking('bUnpaid', {athleteId: 'uB', courtId: 'q2', courtName: 'Quadra 2', startTime: '18:00',
      endTime: '19:00', paymentChannel: 'onsite', amountPaidOnlineReais: 0}, [18]);
    await seedBooking('bMid', {athleteId: 'uC', startTime: '16:30', endTime: '17:30', amountPaidOnlineReais: 90});
    await seedBooking('bClass', {athleteId: null, courtId: 'q2', startTime: '19:00', endTime: '20:00',
      classSessionId: 's1', source: 'class', amountPaidOnlineReais: 0});
    await seedBooking('bKeep', {athleteId: 'uF', courtId: 'q2', startTime: '17:00', endTime: '18:00',
      paymentChannel: 'card', amountPaidOnlineReais: 60});
  }

  test('prévia classifica e a ativação libera, credita, cancela e bloqueia', async () => {
    await seedRainDay();
    const preview = await call(weather.previewArenaRainMode, 'uOwner', rainInput());
    assert.deepEqual(preview.totals, {release: 2, partial: 1, cancel: 1, manual: 1, creditableReais: 175});
    const byId = Object.fromEntries(preview.bookings.map((b) => [b.bookingId, b]));
    assert.equal(byId.bMid.creditableReais, 45);
    assert.equal(byId.bClass.manualReason, 'class');
    assert.equal(byId.bPaid.athleteName, 'Atleta uA');

    await rejects(call(weather.activateArenaRainMode, 'uFin', rainInput()), /não tem acesso/);

    const result = await call(weather.activateArenaRainMode, 'uOwner', rainInput({blockNewBookings: true}));
    assert.deepEqual({r: result.released, p: result.partial, c: result.canceled, m: result.manual},
      {r: 2, p: 1, c: 1, m: 1});
    const blockId = `wx_${result.eventId}`;

    const paid = (await db.doc('arenaBookings/bPaid').get()).data();
    assert.equal(paid.status, 'active');
    assert.equal(paid.weatherRelease.status, 'pending_choice');
    assert.equal(paid.weatherRelease.creditableReais, 70);
    assert.equal(paid.weatherRelease.canReschedule, true);
    assert.equal(paid.weatherRelease.rescheduleUntil, addDaysToDateKey(RAIN_DAY, 30));

    const mid = (await db.doc('arenaBookings/bMid').get()).data();
    assert.equal(mid.status, 'active', 'jogo interrompido não é cancelado');
    assert.equal(mid.weatherRelease.status, 'credited');
    const midCredit = (await db.doc('arenaWeatherCredits/wx_bMid').get()).data();
    assert.equal(midCredit.amountReais, 45);
    assert.equal(midCredit.source, 'mid_game');
    assert.equal(midCredit.status, 'open');

    const unpaid = (await db.doc('arenaBookings/bUnpaid').get()).data();
    assert.equal(unpaid.status, 'canceled');
    assert.equal(unpaid.cancelReason, 'weather');
    assert.equal(unpaid.weatherRelease.status, 'canceled_unpaid');
    assert.equal((await db.doc(`arenaSlotLocks/${lockId('q2', RAIN_DAY, 18)}`).get()).data().bookingId, blockId,
      'o horário do cancelado passa para o bloqueio');

    assert.equal((await db.doc(`arenaSlotLocks/${lockId('q1', RAIN_DAY, 19)}`).get()).data().bookingId, blockId,
      'hora livre do período fica bloqueada');
    assert.equal((await db.doc(`arenaSlotLocks/${lockId('q1', RAIN_DAY, 18)}`).get()).data().bookingId, 'bPaid',
      'reserva aguardando escolha segura o horário');
    assert.equal((await db.doc('arenaBookings/bClass').get()).data().weatherRelease, undefined);

    const event = (await db.doc(`arenaWeatherEvents/${result.eventId}`).get()).data();
    assert.deepEqual(event.counts, {release: 2, partial: 1, cancel: 1, manual: 1});

    // Crédito: cancela por chuva, cria o saldo e o horário entra no bloqueio.
    await rejects(call(weather.chooseArenaWeatherOption, 'uB', {bookingId: 'bPaid', choice: 'credit'}), /não é sua/);
    const credit = await call(weather.chooseArenaWeatherOption, 'uA', {bookingId: 'bPaid', choice: 'credit'});
    assert.equal(credit.creditReais, 70);
    assert.ok(credit.expiresAt);
    const after = (await db.doc('arenaBookings/bPaid').get()).data();
    assert.equal(after.status, 'canceled');
    assert.equal(after.weatherRelease.status, 'credited');
    assert.equal((await db.doc(`arenaSlotLocks/${lockId('q1', RAIN_DAY, 18)}`).get()).data().bookingId, blockId);
    await rejects(call(weather.chooseArenaWeatherOption, 'uA', {bookingId: 'bPaid', choice: 'credit'}),
      /não está liberada/);

    // Manter: a reserva segue de pé.
    await call(weather.chooseArenaWeatherOption, 'uF', {bookingId: 'bKeep', choice: 'keep'});
    const kept = (await db.doc('arenaBookings/bKeep').get()).data();
    assert.equal(kept.status, 'active');
    assert.equal(kept.weatherRelease.status, 'kept');

    // Encerrar o bloqueio solta só o que é do bloqueio.
    const ended = await call(weather.endArenaRainMode, 'uOwner', {arenaId: 'a1', eventId: result.eventId});
    assert.ok(ended.unblocked >= 2);
    assert.equal((await db.doc(`arenaSlotLocks/${lockId('q1', RAIN_DAY, 19)}`).get()).exists, false);
    assert.equal((await db.collection('arenaSlots').where('bookingId', '==', blockId).get()).size, 0);
  });

  test('política desligada não deixa ativar', async () => {
    await seedArena({enabled: false});
    await rejects(call(weather.activateArenaRainMode, 'uOwner', rainInput()), /Ligue a política/);
  });
});

describe('remarcar', () => {
  test('mais caro: crédito cobre o pago e a diferença fica para a arena', async () => {
    await seedArena();
    await db.doc('arenas/a1/courts/q2').set({name: 'Quadra 2', basePricePerHourReais: 80});
    await seedBooking('bE', {athleteId: 'uE', startTime: '18:00', endTime: '19:00', paymentChannel: 'card',
      amountPaidOnlineReais: 60}, [18]);
    await call(weather.activateArenaRainMode, 'uOwner', rainInput());

    await rejects(call(weather.chooseArenaWeatherOption, 'uE', {bookingId: 'bE', choice: 'reschedule',
      reschedule: {courtId: 'q2', date: addDaysToDateKey(RAIN_DAY, 31), startTime: '10:00', endTime: '11:00'}}),
    /Escolha um dia até/);

    const res = await call(weather.chooseArenaWeatherOption, 'uE', {bookingId: 'bE', choice: 'reschedule',
      reschedule: {courtId: 'q2', date: LATER, startTime: '10:00', endTime: '11:00'}});
    assert.equal(res.newAmountReais, 80);
    assert.equal(res.coveredByCreditReais, 60);
    assert.equal(res.dueOnsiteReais, 20);
    assert.equal(res.leftoverCreditReais, 0);

    const fresh = (await db.doc(`arenaBookings/${res.newBookingId}`).get()).data();
    assert.equal(fresh.status, 'active');
    assert.equal(fresh.paymentChannel, 'weather_credit');
    assert.equal(fresh.paymentStatus, 'partial');
    assert.equal(fresh.amountDueOnsiteReais, 20);
    assert.equal(fresh.rescheduledFromBookingId, 'bE');
    assert.equal((await db.doc(`arenaSlotLocks/${lockId('q2', LATER, 10)}`).get()).data().bookingId,
      res.newBookingId);
    const old = (await db.doc('arenaBookings/bE').get()).data();
    assert.equal(old.status, 'canceled');
    assert.equal(old.weatherRelease.rescheduledToBookingId, res.newBookingId);
    const credit = (await db.doc('arenaWeatherCredits/wx_bE').get()).data();
    assert.equal(credit.source, 'reschedule');
    assert.equal(credit.status, 'used');

    // Horário tomado: recusa sem mexer em nada.
    await seedBooking('bE2', {athleteId: 'uE', startTime: '19:00', endTime: '20:00', amountPaidOnlineReais: 70}, [19]);
    await call(weather.activateArenaRainMode, 'uOwner', rainInput({startTime: '19:00', endTime: '20:00'}));
    await rejects(call(weather.chooseArenaWeatherOption, 'uE', {bookingId: 'bE2', choice: 'reschedule',
      reschedule: {courtId: 'q2', date: LATER, startTime: '10:00', endTime: '11:00'}}), /acabou de ser reservado/);
    assert.equal((await db.doc('arenaBookings/bE2').get()).data().weatherRelease.status, 'pending_choice');
  });
});

describe('crédito na próxima reserva', () => {
  async function seedCredit(id, athleteId, balance, extra = {}) {
    await db.doc(`arenaWeatherCredits/${id}`).set({
      arenaId: 'a1', athleteId, amountReais: balance, balanceReais: balance, status: 'open', source: 'choice',
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000), uses: [], ...extra,
    });
  }

  const bookingInput = (extra = {}) => ({
    arenaId: 'a1', arenaName: 'Arena CFC', courtId: 'q1', courtName: 'Quadra 1', date: LATER,
    startTime: '21:00', endTime: '22:00', useWeatherCredit: true, ...extra,
  });

  test('cobre tudo: reserva já nasce paga; cancelada antes do jogo, o crédito volta', async () => {
    await seedArena();
    await seedCredit('wx_old', 'uA', 90);
    const quote = await call(quoteArenaBooking, 'uA', bookingInput());
    assert.equal(quote.weatherCreditAvailableReais, 90);
    assert.equal(quote.weatherCreditAppliedReais, 70);
    assert.equal(quote.amountAfterCreditReais, 0);

    const res = await call(createArenaBooking, 'uA', bookingInput({paymentMode: 'onsite'}));
    assert.equal(res.paymentMode, 'weather_credit');
    assert.equal(res.weatherCreditAppliedReais, 70);
    assert.equal(res.amountToPayNowReais, 0);
    const booking = (await db.doc(`arenaBookings/${res.bookingId}`).get()).data();
    assert.equal(booking.status, 'active');
    assert.equal(booking.paymentStatus, 'paid');
    assert.equal(booking.amountReais, 70, 'a reserva guarda o preço cheio');
    assert.deepEqual(booking.weatherCreditUses, [{creditId: 'wx_old', amountReais: 70}]);
    const credit = (await db.doc('arenaWeatherCredits/wx_old').get()).data();
    assert.equal(credit.balanceReais, 20);
    assert.equal(credit.status, 'open');

    const canceled = {...booking, status: 'canceled'};
    await db.doc(`arenaBookings/${res.bookingId}`).update({status: 'canceled'});
    const restored = await restoreWeatherCreditOnCancel(db, res.bookingId, booking, canceled, Date.now());
    assert.equal(restored, 70);
    assert.equal((await db.doc('arenaWeatherCredits/wx_old').get()).data().balanceReais, 90);
    assert.equal(await restoreWeatherCreditOnCancel(db, res.bookingId, booking, canceled, Date.now()), 0,
      'idempotente');
  });

  test('cobre parte: o Pix cobra só o resto e o servidor sabe disso', async () => {
    await seedArena();
    await seedCredit('wx_d', 'uD', 40);
    // Pedindo sinal: com crédito o resto vai integral (metade cairia abaixo do mínimo do Pix).
    const res = await call(createArenaBooking, 'uD', bookingInput({paymentMode: 'pix', paymentFraction: 0.5}));
    assert.equal(res.paymentMode, 'pix');
    assert.equal(res.paymentFraction, 1);
    assert.equal(res.amountToPayNowReais, 30);
    const booking = (await db.doc(`arenaBookings/${res.bookingId}`).get()).data();
    assert.equal(booking.status, 'pending_payment');
    assert.equal((await db.doc(`arenaBookingPricing/${res.bookingId}`).get()).data().weatherCreditReais, 40);
    const amounts = await resolveAndSyncArenaBookingChargeAmounts(db, res.bookingId, booking, 0.5);
    assert.equal(amounts.amountToPayNowReais, 30);
    assert.equal((await db.doc(`arenaBookings/${res.bookingId}`).get()).data().amountReais, 70,
      'sincronizar não reescreve o preço cheio');
  });

  test('sem pedir o crédito, nada muda', async () => {
    await seedArena();
    await seedCredit('wx_g', 'uG', 40);
    const res = await call(createArenaBooking, 'uG', bookingInput({useWeatherCredit: false, paymentMode: 'onsite'}));
    assert.equal(res.paymentMode, 'onsite');
    assert.equal(res.weatherCreditAppliedReais, 0);
    assert.equal((await db.doc('arenaWeatherCredits/wx_g').get()).data().balanceReais, 40);
  });
});

describe('pedido do atleta', () => {
  /** Reserva que começa daqui a ~2h (a janela do pedido abre 24h antes). */
  function soon() {
    const later = spNow(new Date(Date.now() + 2 * 3600000));
    const h = Math.min(23, Math.floor(later.minutes / 60));
    return {
      date: later.dateKey,
      startTime: `${String(h).padStart(2, '0')}:00`,
      endTime: h >= 23 ? '24:00' : `${String(h + 1).padStart(2, '0')}:00`,
    };
  }

  test('pede, a arena aprova, o atleta escolhe; recusa e desistência', async () => {
    await seedArena({trigger: 'request'});
    const when = soon();
    await seedBooking('bR1', {athleteId: 'uA', ...when});
    await seedBooking('bR2', {athleteId: 'uB', courtId: 'q2', ...when});
    await seedBooking('bR3', {athleteId: 'uC', courtId: 'q2', ...when, startTime: when.startTime});

    const r1 = await call(weather.requestArenaWeatherRelease, 'uA', {bookingId: 'bR1', note: 'Quadra alagada'});
    assert.equal(r1.status, 'pending');
    const req = (await db.doc('arenaWeatherRequests/bR1').get()).data();
    assert.equal(req.note, 'Quadra alagada');
    assert.equal(req.athleteName, 'Atleta uA');
    assert.equal(req.paidReais, 70);

    await rejects(call(weather.decideArenaWeatherRequest, 'uFin', {arenaId: 'a1', bookingId: 'bR1', approve: true}),
      /não tem acesso/);
    await call(weather.decideArenaWeatherRequest, 'uOwner', {arenaId: 'a1', bookingId: 'bR1', approve: true});
    const released = (await db.doc('arenaBookings/bR1').get()).data();
    assert.equal(released.weatherRelease.status, 'pending_choice');
    assert.equal(released.weatherRelease.source, 'request');
    assert.equal((await db.doc('arenaWeatherRequests/bR1').get()).data().status, 'approved');

    await call(weather.requestArenaWeatherRelease, 'uB', {bookingId: 'bR2'});
    await call(weather.decideArenaWeatherRequest, 'uOwner',
      {arenaId: 'a1', bookingId: 'bR2', approve: false, reason: 'Não choveu'});
    const rejected = (await db.doc('arenaWeatherRequests/bR2').get()).data();
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.rejectReason, 'Não choveu');
    assert.equal((await db.doc('arenaBookings/bR2').get()).data().weatherRelease, undefined);
    await rejects(call(weather.requestArenaWeatherRelease, 'uB', {bookingId: 'bR2'}), /Já existe um pedido/);

    await call(weather.requestArenaWeatherRelease, 'uC', {bookingId: 'bR3'});
    await call(weather.withdrawArenaWeatherRequest, 'uC', {bookingId: 'bR3'});
    assert.equal((await db.doc('arenaWeatherRequests/bR3').get()).data().status, 'withdrawn');
  });

  test('pedido pendente atendido pelo Modo chuva vira aprovado', async () => {
    await seedArena({trigger: 'request'});
    const when = soon();
    await seedBooking('bR', {athleteId: 'uA', ...when});
    await call(weather.requestArenaWeatherRelease, 'uA', {bookingId: 'bR'});
    await call(weather.activateArenaRainMode, 'uOwner', rainInput({date: when.date, startTime: when.startTime,
      endTime: when.endTime}));
    const req = (await db.doc('arenaWeatherRequests/bR').get()).data();
    assert.equal(req.status, 'approved');
    assert.equal(req.viaRainMode, true);
    assert.equal((await db.doc('arenaBookings/bR').get()).data().weatherRelease.source, 'rain_mode');
    // Aprovar depois não recusa nem quebra.
    await rejects(call(weather.decideArenaWeatherRequest, 'uOwner', {arenaId: 'a1', bookingId: 'bR', approve: true}),
      /já foi respondido/);
  });

  test('modo arena não recebe pedido; reserva não paga é cancelada direto', async () => {
    await seedArena({trigger: 'arena'});
    await seedBooking('bR', {athleteId: 'uA', ...soon()});
    await rejects(call(weather.requestArenaWeatherRelease, 'uA', {bookingId: 'bR'}), /não recebe pedidos/);

    await db.doc('arenas/a1').update({'weatherPolicy.trigger': 'request'});
    await db.doc('arenaBookings/bR').update({amountPaidOnlineReais: 0, paymentChannel: 'onsite'});
    await rejects(call(weather.requestArenaWeatherRelease, 'uA', {bookingId: 'bR'}), /cancele direto/);
  });
});

describe('previsão da reserva', () => {
  /** Open-Meteo falso (dia inteiro, chance = hora); o resto vai para a rede de verdade (emulador). */
  function fakeOpenMeteo() {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes('weatherapi.com')) return new Response('{}', {status: 500});
      if (!u.includes('open-meteo.com')) return realFetch(url, init);
      const date = new URL(u).searchParams.get('start_date');
      const time = Array.from({length: 24}, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
      return new Response(JSON.stringify({hourly: {
        time, precipitation_probability: time.map((_, h) => h), precipitation: time.map(() => 0),
        temperature_2m: time.map(() => 27.4),
      }}), {status: 200});
    };
    return () => {
      globalThis.fetch = realFetch;
    };
  }

  test('dono e convidado veem de 2h antes a 2h depois; quem não joga, não', async () => {
    await seedArena();
    await db.doc('arenas/a1').set({latitude: -16.82, longitude: -49.24}, {merge: true});
    await seedBooking('bF', {athleteId: 'uA', participantUids: ['uB'], startTime: '18:00', endTime: '19:00'});
    const restore = fakeOpenMeteo();
    try {
      const own = await call(weather.getBookingWeatherForecast, 'uA', {bookingId: 'bF'});
      assert.equal(own.forecast.source, 'open-meteo');
      assert.deepEqual(own.forecast.hours.map((h) => h.time), ['16:00', '17:00', '18:00', '19:00', '20:00']);
      assert.deepEqual(own.forecast.hours[2], {time: '18:00', probability: 18, precipitationMm: 0, temperatureC: 27.4});
      const guest = await call(weather.getBookingWeatherForecast, 'uB', {bookingId: 'bF'});
      assert.equal(guest.forecast.hours.length, 5);
      await rejects(call(weather.getBookingWeatherForecast, 'uC', {bookingId: 'bF'}), /não é sua/);
    } finally {
      restore();
    }
  });

  test('mais de 14 dias antes: só a data em que a previsão chega', async () => {
    await seedArena();
    await db.doc('arenas/a1').set({latitude: -16.82, longitude: -49.24}, {merge: true});
    await seedBooking('bFar', {athleteId: 'uA', date: addDaysToDateKey(TODAY, 20), startTime: '18:00',
      endTime: '19:00'});
    const res = await call(weather.getBookingWeatherForecast, 'uA', {bookingId: 'bFar'});
    assert.equal(res.forecast, null);
    assert.equal(res.availableFrom, addDaysToDateKey(TODAY, 6));
  });
});

describe('varredura', () => {
  test('24h sem escolha vira crédito; vencido expira; aviso 7 dias antes', async () => {
    await seedArena();
    await seedBooking('bLate', {athleteId: 'uA', startTime: '18:00', endTime: '19:00'});
    await call(weather.activateArenaRainMode, 'uOwner', rainInput());
    await db.doc('arenaBookings/bLate').update({
      'weatherRelease.decisionDeadline': Timestamp.fromMillis(Date.now() - 1000),
    });
    await db.doc('arenaWeatherCredits/wx_expired').set({
      arenaId: 'a1', athleteId: 'uB', amountReais: 50, balanceReais: 30, status: 'open',
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });
    await db.doc('arenaWeatherCredits/wx_soon').set({
      arenaId: 'a1', arenaName: 'Arena CFC', athleteId: 'uC', amountReais: 50, balanceReais: 50, status: 'open',
      expiresAt: Timestamp.fromMillis(Date.now() + 3 * 86400000),
    });

    const result = await weather.runWeatherSweep(db, Date.now());
    assert.deepEqual(result, {autoCredited: 1, expired: 1, reminded: 1});

    const late = (await db.doc('arenaBookings/bLate').get()).data();
    assert.equal(late.status, 'canceled');
    assert.equal(late.weatherRelease.autoCredited, true);
    assert.equal((await db.doc('arenaWeatherCredits/wx_bLate').get()).data().source, 'auto');
    const expired = (await db.doc('arenaWeatherCredits/wx_expired').get()).data();
    assert.equal(expired.status, 'expired');
    assert.equal(expired.expiredReais, 30);
    assert.equal(expired.balanceReais, 0);
    assert.ok((await db.doc('arenaWeatherCredits/wx_soon').get()).data().reminderSentAt);

    assert.deepEqual(await weather.runWeatherSweep(db, Date.now()), {autoCredited: 0, expired: 0, reminded: 0});
  });
});
