/**
 * Índice WhatsApp → conta e a consulta do cadastro ("este número já está em
 * outra conta?") contra o Firestore REAL (emulador). Auth falso: só o que a
 * consulta lê do `UserRecord`. Uso: `npm run test:callables`.
 */
import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-callables-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('rode via `npm run test:callables`.');
if (!getApps().length) initializeApp({projectId: PROJECT_ID});
const db = getFirestore();
const lookup = await import('../lib/athlete-twin-account-lookup.js');

function fakeAuth(records) {
  return {
    getUser: async (uid) => {
      const record = records[uid];
      if (!record) throw new Error('auth/user-not-found');
      return {email: record.email, providerData: record.providers.map((providerId) => ({providerId}))};
    },
  };
}

async function seedUser(uid, data) {
  await db.doc(`users/${uid}`).set(data);
  await lookup.syncUserPhoneKey({db, uid, before: undefined, after: data});
}

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {method: 'DELETE'});
});

test('o índice guarda a chave normalizada e some quando o número sai', async () => {
  await lookup.syncUserPhoneKey({db, uid: 'u1', before: undefined, after: {phoneNumber: '(62) 98888-7777'}});
  assert.equal((await db.doc('userPhoneKeys/u1').get()).data().phoneKey, '62988887777');

  await lookup.syncUserPhoneKey({
    db, uid: 'u1', before: {phoneNumber: '(62) 98888-7777'}, after: {phoneNumber: ''},
  });
  assert.equal((await db.doc('userPhoneKeys/u1').get()).exists, false);
});

test('acha a conta antiga pelo WhatsApp e devolve só a dica mascarada', async () => {
  await seedUser('antiga', {phoneNumber: '62988887777', email: 'joana.silva@gmail.com', birthDate: '1990-05-17'});
  const auth = fakeAuth({antiga: {email: 'joana.silva@gmail.com', providers: ['google.com']}});

  const result = await lookup.findPhoneInOtherAccount({
    db, auth, uid: 'nova', phoneNumber: '+55 (62) 98888-7777', birthDate: '17/05/1990',
  });

  assert.deepEqual(result, {inOtherAccount: true, maskedEmail: 'jo•••@gmail.com', signInMethod: 'Google'});
});

test('não acusa a própria conta nem a família com outro nascimento', async () => {
  await seedUser('pai', {phoneNumber: '62988887777', birthDate: '1975-02-10'});
  const auth = fakeAuth({pai: {email: 'pai@x.com', providers: ['password']}});

  const self = await lookup.findPhoneInOtherAccount({
    db, auth, uid: 'pai', phoneNumber: '62988887777', birthDate: '1975-02-10',
  });
  const filho = await lookup.findPhoneInOtherAccount({
    db, auth, uid: 'filho', phoneNumber: '62988887777', birthDate: '2008-09-01',
  });

  assert.equal(self.inOtherAccount, false);
  assert.equal(filho.inOtherAccount, false);
});

test('conta apagada no Auth não é conta para onde voltar', async () => {
  await seedUser('apagada', {phoneNumber: '62988887777'});

  const result = await lookup.findPhoneInOtherAccount({
    db, auth: fakeAuth({}), uid: 'nova', phoneNumber: '62988887777', birthDate: '',
  });

  assert.equal(result.inOtherAccount, false);
});
