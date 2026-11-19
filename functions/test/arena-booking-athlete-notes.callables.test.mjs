/**
 * `createArenaBooking` (callable REAL, `.run()`, contra o emulador do Firestore):
 * o recado do atleta para a arena chega à reserva (`athleteNotes`), aparado; sem recado o campo
 * não existe; acima de 280 caracteres recusa sem criar reserva nem trava.
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

const {createArenaBooking} = await import('../lib/arena-booking-create.js');

const BOOKING_DATE = '2030-11-10';

function call(data) {
  return createArenaBooking.run({
    auth: {uid: 'uAtleta', token: {}}, data, rawRequest: {headers: {}}, acceptsStreaming: false,
  });
}

async function clearFirestore() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, {method: 'DELETE'});
  if (!res.ok) throw new Error(`Falha ao limpar o emulador: ${res.status}`);
}

function booking(extra = {}) {
  return {
    arenaId: 'a1', arenaName: 'Arena Vegeton', courtId: 'q1', courtName: 'Quadra 1', date: BOOKING_DATE,
    startTime: '19:00', endTime: '20:00', paymentMode: 'onsite', ...extra,
  };
}

async function savedBooking(bookingId) {
  return (await db.doc(`arenaBookings/${bookingId}`).get()).data();
}

beforeEach(async () => {
  await clearFirestore();
  await db.doc('arenas/a1').set({
    name: 'Arena Vegeton', managerUserId: 'uOwner', planTier: 'pro', planStatus: 'active',
  });
  await db.doc('arenas/a1/courts/q1').set({name: 'Quadra 1', basePricePerHourReais: 100});
  await db.doc('users/uAtleta').set({fullName: 'Marina Lopes'});
});

describe('createArenaBooking — recado do atleta', () => {
  test('grava o recado aparado na reserva', async () => {
    const res = await call(booking({athleteNotes: '  Vamos chegar 10 min antes.\nTraz bola?  '}));
    const saved = await savedBooking(res.bookingId);
    assert.equal(saved.athleteNotes, 'Vamos chegar 10 min antes.\nTraz bola?');
  });

  test('sem recado (app antigo) ou só espaços → reserva sem o campo', async () => {
    const semRecado = await call(booking());
    assert.equal('athleteNotes' in (await savedBooking(semRecado.bookingId)), false);

    const soEspacos = await call(booking({startTime: '20:00', endTime: '21:00', athleteNotes: '   '}));
    assert.equal('athleteNotes' in (await savedBooking(soEspacos.bookingId)), false);
  });

  test('acima de 280 caracteres → invalid-argument, sem reserva nem trava', async () => {
    await assert.rejects(call(booking({athleteNotes: 'a'.repeat(281)})), (error) => {
      assert.equal(error?.code, 'invalid-argument');
      assert.match(String(error?.message), /280 caracteres/);
      return true;
    });
    assert.equal((await db.collection('arenaBookings').get()).size, 0);
    assert.equal((await db.collection('arenaSlotLocks').get()).size, 0);
  });
});
