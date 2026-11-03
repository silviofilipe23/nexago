// Planos de horário: o catálogo publicado é lido por qualquer atleta logado; rascunho só pela
// equipe. Assinatura, mensalidade, crédito e fila: o atleta lê o que é dele (com as mesmas
// consultas do app), a equipe lê pela agenda (e o financeiro lê assinatura e mensalidade).
// Toda escrita é das Cloud Functions (functions/src/arena-schedule-*.ts).
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/arena-schedule-plans.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {after, beforeEach, test} from 'node:test';
import {assertFails, assertSucceeds, initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const TITULAR = 'titular-uid';
const MEMBRO = 'membro-uid';
const OUTRO = 'outro-uid';
const DONO = 'dono-uid';
const RECEPCAO = 'recepcao-uid';
const FINANCEIRO = 'financeiro-uid';
const GESTOR_OUTRA = 'gestor-outra-uid';

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-arena-schedule-rules-test',
  firestore: {rules},
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas/a1'), {managerUserId: DONO, name: 'Arena', planTier: 'pro', planStatus: 'active'});
    await setDoc(doc(db, 'arenas/a2'), {managerUserId: GESTOR_OUTRA, planTier: 'pro', planStatus: 'active'});
    for (const [uid, role] of [[RECEPCAO, 'recepcao'], [FINANCEIRO, 'financeiro']]) {
      await setDoc(doc(db, `arenas/a1/staff/${uid}`), {role, status: 'active'});
    }
    await setDoc(doc(db, 'arenas/a1/schedulePlans/p1'), {name: 'Fixo Noite', status: 'active'});
    await setDoc(doc(db, 'arenas/a1/schedulePlans/p2'), {name: 'Almoço', status: 'draft'});
    await setDoc(doc(db, 'arenas/a1/scheduleSettings/rules'), {primeCapPercent: 75});
    await setDoc(doc(db, 'arenaScheduleSubscriptions/s1'), {arenaId: 'a1', planId: 'p1', status: 'active',
      holderAthleteId: TITULAR, memberAthleteIds: [TITULAR, MEMBRO]});
    await setDoc(doc(db, 'arenaScheduleCharges/s1_2026-11_1'), {arenaId: 'a1', subscriptionId: 's1',
      payerAthleteId: MEMBRO, visibleTo: [MEMBRO, TITULAR], status: 'open', amountReais: 120});
    await setDoc(doc(db, 'arenaScheduleCredits/b1'), {arenaId: 'a1', subscriptionId: 's1',
      athleteIds: [TITULAR, MEMBRO], status: 'available'});
    await setDoc(doc(db, 'arenaScheduleWaitlist/w1'), {arenaId: 'a1', planId: 'p1', athleteId: OUTRO,
      status: 'offered'});
  });
});

after(async () => {
  await testEnv.cleanup();
});

const as = (uid) => testEnv.authenticatedContext(uid).firestore();

test('plano: publicado é de qualquer logado; rascunho só da equipe; ninguém escreve', async () => {
  await assertSucceeds(getDocs(query(collection(as(OUTRO), 'arenas/a1/schedulePlans'),
    where('status', '==', 'active'))));
  await assertSucceeds(getDoc(doc(as(OUTRO), 'arenas/a1/schedulePlans/p1')));
  await assertFails(getDoc(doc(as(OUTRO), 'arenas/a1/schedulePlans/p2')));
  await assertFails(getDocs(collection(as(OUTRO), 'arenas/a1/schedulePlans')));
  await assertSucceeds(getDocs(collection(as(RECEPCAO), 'arenas/a1/schedulePlans')));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'arenas/a1/schedulePlans/p1')));
  await assertFails(updateDoc(doc(as(DONO), 'arenas/a1/schedulePlans/p1'), {monthlyPriceReais: 1}));
  await assertSucceeds(getDoc(doc(as(DONO), 'arenas/a1/scheduleSettings/rules')));
  await assertFails(getDoc(doc(as(OUTRO), 'arenas/a1/scheduleSettings/rules')));
});

test('assinatura: titular e membro consultam pelo array; equipe pela arena; outros não', async () => {
  for (const uid of [TITULAR, MEMBRO]) {
    await assertSucceeds(getDocs(query(collection(as(uid), 'arenaScheduleSubscriptions'),
      where('memberAthleteIds', 'array-contains', uid))));
  }
  await assertSucceeds(getDocs(query(collection(as(RECEPCAO), 'arenaScheduleSubscriptions'),
    where('arenaId', '==', 'a1'))));
  await assertSucceeds(getDocs(query(collection(as(FINANCEIRO), 'arenaScheduleSubscriptions'),
    where('arenaId', '==', 'a1'))));
  await assertFails(getDoc(doc(as(OUTRO), 'arenaScheduleSubscriptions/s1')));
  await assertFails(getDocs(query(collection(as(GESTOR_OUTRA), 'arenaScheduleSubscriptions'),
    where('arenaId', '==', 'a1'))));
  await assertFails(updateDoc(doc(as(TITULAR), 'arenaScheduleSubscriptions/s1'), {status: 'active',
    monthlyPriceReais: 1}));
});

test('mensalidade e crédito: só quem está na lista e a equipe; escrita só servidor', async () => {
  await assertSucceeds(getDoc(doc(as(MEMBRO), 'arenaScheduleCharges/s1_2026-11_1')));
  await assertSucceeds(getDoc(doc(as(TITULAR), 'arenaScheduleCharges/s1_2026-11_1')));
  await assertSucceeds(getDocs(query(collection(as(FINANCEIRO), 'arenaScheduleCharges'),
    where('arenaId', '==', 'a1'))));
  await assertFails(getDoc(doc(as(OUTRO), 'arenaScheduleCharges/s1_2026-11_1')));
  await assertFails(updateDoc(doc(as(MEMBRO), 'arenaScheduleCharges/s1_2026-11_1'), {status: 'paid'}));
  await assertFails(updateDoc(doc(as(DONO), 'arenaScheduleCharges/s1_2026-11_1'), {status: 'paid'}));

  await assertSucceeds(getDoc(doc(as(MEMBRO), 'arenaScheduleCredits/b1')));
  await assertSucceeds(getDocs(query(collection(as(RECEPCAO), 'arenaScheduleCredits'),
    where('arenaId', '==', 'a1'))));
  await assertFails(getDoc(doc(as(OUTRO), 'arenaScheduleCredits/b1')));
  await assertFails(updateDoc(doc(as(TITULAR), 'arenaScheduleCredits/b1'), {status: 'available'}));
});

test('fila: o atleta consulta as próprias entradas; equipe pela arena', async () => {
  await assertSucceeds(getDocs(query(collection(as(OUTRO), 'arenaScheduleWaitlist'),
    where('athleteId', '==', OUTRO))));
  await assertSucceeds(getDocs(query(collection(as(DONO), 'arenaScheduleWaitlist'),
    where('arenaId', '==', 'a1'))));
  await assertFails(getDoc(doc(as(TITULAR), 'arenaScheduleWaitlist/w1')));
  await assertFails(updateDoc(doc(as(OUTRO), 'arenaScheduleWaitlist/w1'), {status: 'accepted'}));
});
