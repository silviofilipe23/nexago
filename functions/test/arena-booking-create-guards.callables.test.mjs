/**
 * `createArenaBooking` (callable REAL, `.run()`, contra o emulador do Firestore):
 * - respeita o bloqueio de quadra feito pelo gestor (`arenaSlots` com status
 *   `blocked`), como a reserva manual já fazia;
 * - recusa data anterior a hoje no fuso de São Paulo;
 * - monta o início da reserva na parede de São Paulo (o prazo de confirmação
 *   ficava 3 h adiantado com o fuso UTC do runtime).
 *
 * Uso: `npm run test:callables`.
 */

// O runtime das Functions roda em UTC; numa máquina em São Paulo o bug do fuso
// não aparece. Cada arquivo do `node --test` é um processo, então não vaza.
process.env.TZ = 'UTC';

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

const {createArenaBooking} = await import('../lib/arena-booking-create.js');
const {dayKeyFromEventDate} = await import('../lib/event-timezone.js');
const {addDaysToDateKey} = await import('../lib/arena-weather-model.js');

const TODAY = dayKeyFromEventDate(new Date());
const BOOKING_DATE = '2030-11-10';

function call(fn, uid, data = {}) {
  return fn.run({auth: {uid, token: {}}, data, rawRequest: {headers: {}}, acceptsStreaming: false});
}

async function rejectsWith(promise, code, pattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.code, code);
    assert.match(String(error?.message ?? error), pattern);
    return true;
  });
}

async function clearFirestore() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, {method: 'DELETE'});
  if (!res.ok) throw new Error(`Falha ao limpar o emulador: ${res.status}`);
}

async function seedArena() {
  await db.doc('arenas/a1').set({
    name: 'Arena Vegeton', managerUserId: 'uOwner', planTier: 'pro', planStatus: 'active',
  });
  await db.doc('arenas/a1/courts/q1').set({name: 'Quadra 1', basePricePerHourReais: 100});
  await db.doc('arenas/a1/courts/q2').set({name: 'Quadra 2', basePricePerHourReais: 100});
  await db.doc('users/uAtleta').set({fullName: 'Marina Lopes'});
}

async function seedBlockedSlot(courtId, date, startTime, endTime) {
  await db.collection('arenaSlots').add({
    arenaId: 'a1', courtId, date, startTime, endTime, status: 'blocked', blockReason: 'manutencao',
  });
}

function booking(startTime, extra = {}) {
  const [h] = startTime.split(':');
  return {
    arenaId: 'a1', arenaName: 'Arena Vegeton', courtId: 'q1', courtName: 'Quadra 1', date: BOOKING_DATE,
    startTime, endTime: `${String(Number(h) + 1).padStart(2, '0')}:00`, paymentMode: 'onsite', ...extra,
  };
}

beforeEach(async () => {
  await clearFirestore();
  await seedArena();
});

describe('createArenaBooking — bloqueio de quadra do gestor', () => {
  test('horário bloqueado pela arena → failed-precondition, sem reserva nem trava', async () => {
    await seedBlockedSlot('q1', BOOKING_DATE, '19:00', '20:00');
    await rejectsWith(
      call(createArenaBooking, 'uAtleta', booking('19:00')),
      'failed-precondition',
      /bloqueado pela arena/,
    );
    assert.equal((await db.collection('arenaBookings').get()).size, 0);
    assert.equal((await db.collection('arenaSlotLocks').get()).size, 0);
  });

  test('bloqueio que só pega parte da reserva de 2 h também recusa', async () => {
    await seedBlockedSlot('q1', BOOKING_DATE, '20:00', '21:00');
    await rejectsWith(
      call(createArenaBooking, 'uAtleta', booking('19:00', {endTime: '21:00'})),
      'failed-precondition',
      /bloqueado pela arena/,
    );
  });

  test('bloqueio em outra quadra ou outro horário não atrapalha', async () => {
    await seedBlockedSlot('q2', BOOKING_DATE, '19:00', '20:00');
    await seedBlockedSlot('q1', BOOKING_DATE, '07:00', '08:00');
    const res = await call(createArenaBooking, 'uAtleta', booking('19:00'));
    assert.ok(res.bookingId);
  });
});

describe('createArenaBooking — data no passado', () => {
  test('ontem (fuso de São Paulo) → invalid-argument', async () => {
    await rejectsWith(
      call(createArenaBooking, 'uAtleta', booking('19:00', {date: addDaysToDateKey(TODAY, -1)})),
      'invalid-argument',
      /data passada/,
    );
    assert.equal((await db.collection('arenaBookings').get()).size, 0);
  });

  test('hoje segue aceito', async () => {
    const res = await call(createArenaBooking, 'uAtleta', booking('21:00', {date: TODAY}));
    assert.ok(res.bookingId);
  });
});

describe('createArenaBooking — fuso do início', () => {
  test('19:00 em São Paulo: prazo de confirmação 2 h antes = 20:00Z', async () => {
    const res = await call(createArenaBooking, 'uAtleta', booking('19:00'));
    const saved = (await db.doc(`arenaBookings/${res.bookingId}`).get()).data();
    assert.equal(saved.confirmationDeadline.toDate().toISOString(), `${BOOKING_DATE}T20:00:00.000Z`);
  });
});
