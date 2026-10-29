// Cancelamento por chuva: créditos, pedidos e eventos do Modo chuva são só
// leitura para clientes. O atleta lê o que é dele; a arena lê pela área
// (agenda para eventos/pedidos; financeiro ou agenda para créditos). Toda
// escrita é das Cloud Functions (functions/src/arena-weather.ts).
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/arena-weather.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {after, beforeEach, test} from 'node:test';
import {assertFails, assertSucceeds, initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const ATLETA = 'atleta-uid';
const OUTRO = 'outro-uid';
const DONO = 'dono-uid';
const RECEPCAO = 'recepcao-uid';
const FINANCEIRO = 'financeiro-uid';
const MANUTENCAO = 'manutencao-uid';
const GESTOR_OUTRA = 'gestor-outra-uid';

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-arena-weather-rules-test',
  firestore: {rules},
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas/a1'), {managerUserId: DONO, name: 'Arena', planTier: 'pro', planStatus: 'active'});
    await setDoc(doc(db, 'arenas/a2'), {managerUserId: GESTOR_OUTRA, planTier: 'pro', planStatus: 'active'});
    for (const [uid, role] of [[RECEPCAO, 'recepcao'], [FINANCEIRO, 'financeiro'], [MANUTENCAO, 'manutencao']]) {
      await setDoc(doc(db, `arenas/a1/staff/${uid}`), {role, status: 'active'});
    }
    await setDoc(doc(db, 'arenaWeatherCredits/wx_b1'), {arenaId: 'a1', athleteId: ATLETA, balanceReais: 70,
      status: 'open'});
    await setDoc(doc(db, 'arenaWeatherRequests/b1'), {arenaId: 'a1', athleteId: ATLETA, status: 'pending'});
    await setDoc(doc(db, 'arenaWeatherEvents/e1'), {arenaId: 'a1', date: '2026-10-29', status: 'active'});
  });
});

after(async () => {
  await testEnv.cleanup();
});

const as = (uid) => testEnv.authenticatedContext(uid).firestore();

test('crédito: o atleta lê o seu; financeiro e agenda leem; outros não', async () => {
  await assertSucceeds(getDoc(doc(as(ATLETA), 'arenaWeatherCredits/wx_b1')));
  await assertSucceeds(getDocs(query(collection(as(ATLETA), 'arenaWeatherCredits'), where('athleteId', '==', ATLETA))));
  await assertSucceeds(getDoc(doc(as(DONO), 'arenaWeatherCredits/wx_b1')));
  await assertSucceeds(getDoc(doc(as(FINANCEIRO), 'arenaWeatherCredits/wx_b1')));
  await assertSucceeds(getDoc(doc(as(RECEPCAO), 'arenaWeatherCredits/wx_b1')));
  await assertSucceeds(getDocs(query(collection(as(FINANCEIRO), 'arenaWeatherCredits'), where('arenaId', '==', 'a1'))));
  await assertFails(getDoc(doc(as(OUTRO), 'arenaWeatherCredits/wx_b1')));
  await assertFails(getDoc(doc(as(GESTOR_OUTRA), 'arenaWeatherCredits/wx_b1')));
  await assertFails(getDocs(query(collection(as(OUTRO), 'arenaWeatherCredits'), where('arenaId', '==', 'a1'))));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'arenaWeatherCredits/wx_b1')));
});

test('crédito: ninguém escreve saldo pelo cliente', async () => {
  await assertFails(updateDoc(doc(as(ATLETA), 'arenaWeatherCredits/wx_b1'), {balanceReais: 9999}));
  await assertFails(updateDoc(doc(as(DONO), 'arenaWeatherCredits/wx_b1'), {balanceReais: 0}));
  await assertFails(setDoc(doc(as(ATLETA), 'arenaWeatherCredits/wx_novo'), {arenaId: 'a1', athleteId: ATLETA,
    balanceReais: 100, status: 'open'}));
});

test('pedido: o atleta lê o seu e a agenda lê; financeiro não; escrita só servidor', async () => {
  await assertSucceeds(getDoc(doc(as(ATLETA), 'arenaWeatherRequests/b1')));
  await assertSucceeds(getDoc(doc(as(ATLETA), 'arenaWeatherRequests/sem-pedido')));
  await assertSucceeds(getDoc(doc(as(RECEPCAO), 'arenaWeatherRequests/b1')));
  await assertSucceeds(getDocs(query(collection(as(DONO), 'arenaWeatherRequests'), where('arenaId', '==', 'a1'))));
  await assertFails(getDoc(doc(as(FINANCEIRO), 'arenaWeatherRequests/b1')));
  await assertFails(getDoc(doc(as(OUTRO), 'arenaWeatherRequests/b1')));
  await assertFails(updateDoc(doc(as(ATLETA), 'arenaWeatherRequests/b1'), {status: 'approved'}));
  await assertFails(updateDoc(doc(as(DONO), 'arenaWeatherRequests/b1'), {status: 'approved'}));
});

test('evento do Modo chuva: só quem lê a agenda', async () => {
  await assertSucceeds(getDoc(doc(as(DONO), 'arenaWeatherEvents/e1')));
  await assertSucceeds(getDoc(doc(as(MANUTENCAO), 'arenaWeatherEvents/e1')));
  await assertSucceeds(getDocs(query(collection(as(RECEPCAO), 'arenaWeatherEvents'), where('arenaId', '==', 'a1'),
    where('date', '==', '2026-10-29'))));
  await assertFails(getDoc(doc(as(FINANCEIRO), 'arenaWeatherEvents/e1')));
  await assertFails(getDoc(doc(as(ATLETA), 'arenaWeatherEvents/e1')));
  await assertFails(setDoc(doc(as(DONO), 'arenaWeatherEvents/e2'), {arenaId: 'a1', status: 'active'}));
});
