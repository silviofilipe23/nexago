/**
 * Lembrete de 15 min nas ocorrências de horário fixo, contra o emulador do Firestore.
 *
 * O `reminder15mAt` era gravado só pelo gatilho de criação (`prepareArenaBookingReminder15m`).
 * Editar a série cancela e rematerializa as ocorrências no MESMO id (`rec_<série>_<data>`) com
 * `tx.set` sem merge: o campo sumia e, como o doc já existia, o gatilho não rodava de novo — as
 * ocorrências da janela de 35 dias ficavam sem o lembrete. A materialização agora grava o campo.
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

const {
  materializeSeriesOccurrences,
  cancelFutureOccurrences,
  occurrenceBookingId,
  addDaysToDateKey,
  isoWeekdayOfDateKey,
} = await import('../lib/arena-recurring-booking.js');
const {dayKeyFromEventDate} = await import('../lib/event-timezone.js');

const SERIES_ID = 'serie-1';
const TODAY = dayKeyFromEventDate(new Date());
const FIRST = addDaysToDateKey(TODAY, 7);
const SECOND = addDaysToDateKey(FIRST, 7);
const HORIZON = addDaysToDateKey(TODAY, 35);

async function clearFirestore() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, {method: 'DELETE'});
  if (!res.ok) throw new Error(`Falha ao limpar o emulador: ${res.status}`);
}

/** Série avulsa (sem atleta), duas quintas/… a partir de uma semana à frente. */
function series(overrides = {}) {
  return {
    arenaId: 'a1', arenaName: 'Arena CFC', courtId: 'q1', courtName: 'Quadra 1',
    weekday: isoWeekdayOfDateKey(FIRST), startTime: '19:00', endTime: '20:00',
    athleteId: null, customerName: 'João', amountReais: 100, status: 'active',
    startDate: FIRST, endDate: SECOND, skippedDates: [],
    ...overrides,
  };
}

/** Mesmo relógio da materialização: horário de Brasília, 15 min antes do início. */
function reminderAt(dateKey, startTime) {
  return new Date(`${dateKey}T${startTime}:00-03:00`).getTime() - 15 * 60 * 1000;
}

async function occurrence(dateKey) {
  const snap = await db.doc(`arenaBookings/${occurrenceBookingId(SERIES_ID, dateKey)}`).get();
  assert.ok(snap.exists, `ocorrência de ${dateKey} não existe`);
  return snap.data();
}

describe('horário fixo · lembrete de 15 min nas ocorrências', () => {
  beforeEach(clearFirestore);

  test('ocorrência materializada já sai com reminder15mAt (15 min antes do início)', async () => {
    const res = await materializeSeriesOccurrences(db, SERIES_ID, series(), TODAY, HORIZON);
    assert.deepEqual(res.createdDates, [FIRST, SECOND]);

    for (const dateKey of [FIRST, SECOND]) {
      const data = await occurrence(dateKey);
      assert.ok(data.reminder15mAt, `sem reminder15mAt em ${dateKey}`);
      assert.equal(data.reminder15mAt.toMillis(), reminderAt(dateKey, '19:00'));
    }
  });

  test('editar para atleta cadastrado: a ocorrência recriada no mesmo id mantém o lembrete, no horário novo', async () => {
    await materializeSeriesOccurrences(db, SERIES_ID, series(), TODAY, HORIZON);

    // O fluxo de updateArenaRecurringBooking: cancela o futuro e rematerializa com a config nova.
    const canceled = await cancelFutureOccurrences(db, SERIES_ID, 'recurring_series_updated');
    assert.deepEqual(canceled.sort(), [FIRST, SECOND]);
    const edited = series({athleteId: 'uA', customerName: null, startTime: '20:00', endTime: '21:00'});
    const res = await materializeSeriesOccurrences(db, SERIES_ID, edited, TODAY, HORIZON);
    assert.deepEqual(res.createdDates, [FIRST, SECOND]);

    for (const dateKey of [FIRST, SECOND]) {
      const data = await occurrence(dateKey);
      assert.equal(data.status, 'active');
      assert.equal(data.athleteId, 'uA');
      assert.ok(data.reminder15mAt, `sem reminder15mAt em ${dateKey} depois da edição`);
      assert.equal(data.reminder15mAt.toMillis(), reminderAt(dateKey, '20:00'));
    }
  });
});
