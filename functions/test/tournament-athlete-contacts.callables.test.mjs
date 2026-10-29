/**
 * Contatos dos inscritos + aviso de "possível duplicado" contra o Firestore
 * REAL (emulador): a mesma pessoa com duas contas na mesma categoria aparece
 * como par de inscrições, sem o WhatsApp que liga as duas.
 * Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('rode via `npm run test:callables`.');
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();
const {getTournamentAthleteContactsCore} = await import('../lib/tournament-contacts.js');

const INSCRIPTIONS = `artifacts/${PROJECT_ID}/public/data/inscriptions`;

async function inscription(id, data) {
  await db.doc(`${INSCRIPTIONS}/${id}`).set({tournamentId: 't1', ...data});
}

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {method: 'DELETE'});
  await db.doc('tournaments/t1').set({
    managerId: 'org',
    categories: [
      {id: 'fem-b', name: 'Feminina B'},
      // Categoria legada: parte das inscrições a referencia pelo nome.
      {categoryName: 'Mista Livre'},
    ],
  });
  await db.doc('users/joanaGoogle').set({fullName: 'Joana Silva', phoneNumber: '(62) 99876-5432', birthDate: '1990-05-17'});
  await db.doc('users/joanaEmail').set({fullName: 'Joana Silva', phoneNumber: '+55 62 99876-5432'});
  await db.doc('users/bia').set({fullName: 'Bia Costa', phoneNumber: '62911112222', birthDate: '1992-01-01'});
  await db.doc('users/carla').set({fullName: 'Carla Dias', phoneNumber: '62933334444'});
});

test('aponta as duas inscrições da mesma pessoa na mesma categoria', async () => {
  await inscription('r1', {categoryId: 'fem-b', participantUids: ['joanaGoogle', 'bia']});
  await inscription('r2', {categoryId: 'fem-b', participantUids: ['joanaEmail', 'carla']});

  const result = await getTournamentAthleteContactsCore(db, 'org', {tournamentId: 't1'});

  assert.deepEqual(result.twinPairs, [
    {categoryId: 'fem-b', registrationIds: ['r1', 'r2'], uids: ['joanaGoogle', 'joanaEmail']},
  ]);
  // O contato segue como era: a gaveta continua tendo o telefone de cada um.
  assert.equal(result.contacts.joanaEmail.phoneNumber, '+55 62 99876-5432');
  assert.doesNotMatch(JSON.stringify(result.twinPairs), /9876|5432/);
});

test('categoria legada pelo nome e pelo id é a mesma categoria', async () => {
  await inscription('r1', {categoryId: 'Mista Livre', participantUids: ['joanaGoogle']});
  await inscription('r2', {categoryId: 'Mista Livre', participantUids: ['joanaEmail']});
  await inscription('r3', {categoryId: 'fem-b', participantUids: ['bia']});

  const result = await getTournamentAthleteContactsCore(db, 'org', {tournamentId: 't1'});

  assert.deepEqual(result.twinPairs.map((p) => p.registrationIds), [['r1', 'r2']]);
});

test('mesma pessoa em categorias diferentes não é aviso', async () => {
  await inscription('r1', {categoryId: 'fem-b', participantUids: ['joanaGoogle', 'bia']});
  await inscription('r2', {categoryId: 'Mista Livre', participantUids: ['joanaEmail', 'carla']});

  const result = await getTournamentAthleteContactsCore(db, 'org', {tournamentId: 't1'});

  assert.deepEqual(result.twinPairs, []);
  assert.equal(Object.keys(result.contacts).length, 4);
});

test('inscrição de outro torneio não entra na conta', async () => {
  await inscription('r1', {categoryId: 'fem-b', participantUids: ['joanaGoogle']});
  await db.doc(`${INSCRIPTIONS}/rx`).set({tournamentId: 't2', categoryId: 'fem-b', participantUids: ['joanaEmail']});

  const result = await getTournamentAthleteContactsCore(db, 'org', {tournamentId: 't1'});

  assert.deepEqual(result.twinPairs, []);
  assert.deepEqual(Object.keys(result.contacts), ['joanaGoogle']);
});

test('sem tournamentId é erro de argumento', async () => {
  await assert.rejects(
    getTournamentAthleteContactsCore(db, 'org', {}),
    (err) => err.code === 'invalid-argument',
  );
});
