/**
 * Carteira do professor independente: o dono lê conta, alunos e planos; professor e aluno leem a
 * cobrança deles; ninguém lê a apiKey da subconta; ninguém escreve pelo cliente.
 * Uso: `npm run test:rules`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROF = 'prof-uid';
const ALUNO = 'aluno-uid';
const OUTRO = 'outro-uid';

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-professor-wallet-test',
  firestore: { rules },
});

after(() => testEnv.cleanup());

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `professorPayoutAccounts/${PROF}`), { status: 'approved', walletId: 'w1' });
    await setDoc(doc(db, `professorAsaasSecrets/${PROF}`), { apiKey: 'segredo' });
    await setDoc(doc(db, `professors/${PROF}/students/${ALUNO}`), { name: 'Paulo', status: 'active' });
    await setDoc(doc(db, `professors/${PROF}/plans/p1`), { name: 'Mensal', priceReais: 880 });
    await setDoc(doc(db, 'professorCharges/c1'), { professorUid: PROF, athleteId: ALUNO, status: 'open', amountReais: 880 });
    await setDoc(doc(db, 'professorCharges/c2'), { professorUid: OUTRO, athleteId: OUTRO, status: 'open', amountReais: 10 });
  });
});

const as = (uid) => testEnv.authenticatedContext(uid).firestore();

test('o professor lê a própria conta, alunos e planos', async () => {
  const db = as(PROF);
  await assertSucceeds(getDoc(doc(db, `professorPayoutAccounts/${PROF}`)));
  await assertSucceeds(getDoc(doc(db, `professors/${PROF}/students/${ALUNO}`)));
  await assertSucceeds(getDocs(collection(db, `professors/${PROF}/plans`)));
});

test('ninguém lê a apiKey da subconta, nem o próprio professor', async () => {
  await assertFails(getDoc(doc(as(PROF), `professorAsaasSecrets/${PROF}`)));
});

test('aluno e arena não leem a carteira do professor (o aluno só o próprio convite)', async () => {
  for (const uid of [ALUNO, OUTRO]) {
    const db = as(uid);
    await assertFails(getDoc(doc(db, `professorPayoutAccounts/${PROF}`)));
    await assertFails(getDocs(collection(db, `professors/${PROF}/plans`)));
    await assertFails(getDocs(collection(db, `professors/${PROF}/students`)));
  }
  await assertSucceeds(getDoc(doc(as(ALUNO), `professors/${PROF}/students/${ALUNO}`)));
  await assertFails(getDoc(doc(as(OUTRO), `professors/${PROF}/students/${ALUNO}`)));
});

test('cobrança: professor e aluno leem a deles, filtrando pelo campo; terceiro não', async () => {
  await assertSucceeds(getDocs(query(collection(as(PROF), 'professorCharges'), where('professorUid', '==', PROF))));
  await assertSucceeds(getDocs(query(collection(as(ALUNO), 'professorCharges'), where('athleteId', '==', ALUNO))));
  await assertFails(getDoc(doc(as(OUTRO), 'professorCharges/c1')));
  await assertFails(getDocs(collection(as(PROF), 'professorCharges')));
});

test('cliente não escreve em nada da carteira', async () => {
  const db = as(PROF);
  await assertFails(setDoc(doc(db, `professorPayoutAccounts/${PROF}`), { status: 'approved' }));
  await assertFails(setDoc(doc(db, `professors/${PROF}/plans/p2`), { name: 'x', priceReais: 1 }));
  await assertFails(setDoc(doc(db, `professors/${PROF}/students/${OUTRO}`), { name: 'x' }));
  await assertFails(setDoc(doc(db, 'professorCharges/c9'), { professorUid: PROF, athleteId: ALUNO, status: 'paid' }));
});

test('aula da carteira: professor e aluno leem; arena e terceiros não; ninguém escreve', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'professorLessons/b1'), { professorUid: PROF, athleteId: ALUNO, arenaId: 'a1' });
  });
  await assertSucceeds(getDoc(doc(as(PROF), 'professorLessons/b1')));
  await assertSucceeds(getDocs(query(collection(as(ALUNO), 'professorLessons'), where('athleteId', '==', ALUNO))));
  await assertFails(getDoc(doc(as(OUTRO), 'professorLessons/b1')));
  await assertFails(setDoc(doc(as(PROF), 'professorLessons/b2'), { professorUid: PROF, athleteId: ALUNO }));
});

test('bloqueio de período: só o dono grava e lê, com campos validados', async () => {
  const { Timestamp, serverTimestamp } = await import('firebase/firestore');
  const block = (extra = {}) => ({
    reason: 'torneio', reasonLabel: 'Torneio',
    startAt: Timestamp.fromDate(new Date('2026-10-23T17:00:00Z')),
    endAt: Timestamp.fromDate(new Date('2026-10-23T21:00:00Z')),
    updatedAt: serverTimestamp(), ...extra,
  });
  await assertSucceeds(setDoc(doc(as(PROF), `users/${PROF}/professorBlocks/b1`), block()));
  await assertSucceeds(getDoc(doc(as(PROF), `users/${PROF}/professorBlocks/b1`)));
  await assertFails(getDoc(doc(as(OUTRO), `users/${PROF}/professorBlocks/b1`)));
  await assertFails(setDoc(doc(as(OUTRO), `users/${PROF}/professorBlocks/b2`), block()));
  await assertFails(setDoc(doc(as(PROF), `users/${PROF}/professorBlocks/b3`), block({ reason: 'festa' })));
  await assertFails(setDoc(doc(as(PROF), `users/${PROF}/professorBlocks/b4`), block({ endAt: Timestamp.fromDate(new Date('2026-10-23T16:00:00Z')) })));
  await assertFails(setDoc(doc(as(PROF), `users/${PROF}/professorBlocks/b5`), block({ endAt: Timestamp.fromDate(new Date('2027-01-30T16:00:00Z')) })));
  await assertFails(getDoc(doc(as(PROF), `professorCalendarFeeds/${PROF}`)));
});

test('comunicado: professor lê os dele; aluno só o enviado em que está; ninguém escreve', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'professorNotices/n1'), { professorUid: PROF, status: 'sent', recipientIds: [ALUNO] });
    await setDoc(doc(db, 'professorNotices/n2'), { professorUid: PROF, status: 'draft', recipientIds: [ALUNO] });
    await setDoc(doc(db, `professorNotices/n1/recipients/${ALUNO}`), { readAt: new Date() });
  });
  await assertSucceeds(getDocs(query(collection(as(PROF), 'professorNotices'), where('professorUid', '==', PROF))));
  await assertSucceeds(getDoc(doc(as(ALUNO), 'professorNotices/n1')));
  await assertFails(getDoc(doc(as(ALUNO), 'professorNotices/n2')));
  await assertFails(getDoc(doc(as(OUTRO), 'professorNotices/n1')));
  await assertSucceeds(getDoc(doc(as(PROF), `professorNotices/n1/recipients/${ALUNO}`)));
  await assertSucceeds(getDoc(doc(as(ALUNO), `professorNotices/n1/recipients/${ALUNO}`)));
  await assertFails(getDoc(doc(as(OUTRO), `professorNotices/n1/recipients/${ALUNO}`)));
  await assertFails(setDoc(doc(as(PROF), 'professorNotices/n3'), { professorUid: PROF, status: 'sent' }));
});

test('ganhos do professor: só o dono lê saldo, extrato e saques; ninguém escreve', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `professorEarningsWallets/${PROF}`), { availableReais: 100 });
    await setDoc(doc(db, `professorEarningsWallets/${PROF}/ledger/l1`), { type: 'repasse' });
    await setDoc(doc(db, 'professorWithdrawals/w1'), { professorUid: PROF, amountReais: 50 });
  });
  await assertSucceeds(getDoc(doc(as(PROF), `professorEarningsWallets/${PROF}`)));
  await assertSucceeds(getDocs(collection(as(PROF), `professorEarningsWallets/${PROF}/ledger`)));
  await assertSucceeds(getDocs(query(collection(as(PROF), 'professorWithdrawals'), where('professorUid', '==', PROF))));
  await assertFails(getDoc(doc(as(OUTRO), `professorEarningsWallets/${PROF}`)));
  await assertFails(getDoc(doc(as(OUTRO), 'professorWithdrawals/w1')));
  await assertFails(setDoc(doc(as(PROF), `professorEarningsWallets/${PROF}`), { availableReais: 9999 }));
  await assertFails(setDoc(doc(as(PROF), 'professorWithdrawals/w2'), { professorUid: PROF, amountReais: 1 }));
});

test('mensagens: só membros leem e mandam a PRÓPRIA mensagem validada', async () => {
  const { serverTimestamp, addDoc } = await import('firebase/firestore');
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'conversations/d_p_a'), { kind: 'direct', memberIds: [PROF, ALUNO], professorUid: PROF });
  });
  const msg = (uid, extra = {}) => ({ senderUid: uid, senderName: 'X', text: 'Oi', createdAt: serverTimestamp(), ...extra });
  await assertSucceeds(getDoc(doc(as(ALUNO), 'conversations/d_p_a')));
  await assertFails(addDoc(collection(as(ALUNO), 'conversations/d_p_a/messages'), msg(ALUNO)), 'envio só por callable');
  await assertSucceeds(getDocs(collection(as(PROF), 'conversations/d_p_a/messages')));
  await assertFails(getDoc(doc(as(OUTRO), 'conversations/d_p_a')));
  await assertFails(getDocs(collection(as(OUTRO), 'conversations/d_p_a/messages')));
  await assertFails(addDoc(collection(as(OUTRO), 'conversations/d_p_a/messages'), msg(OUTRO)));
  await assertFails(addDoc(collection(as(ALUNO), 'conversations/d_p_a/messages'), msg(PROF)), 'não fala em nome do professor');
  await assertFails(addDoc(collection(as(ALUNO), 'conversations/d_p_a/messages'), msg(ALUNO, { auto: true })));
  await assertFails(addDoc(collection(as(ALUNO), 'conversations/d_p_a/messages'), msg(ALUNO, { text: '' })));
  await assertFails(setDoc(doc(as(PROF), 'conversations/d_p_a'), { memberIds: [PROF, ALUNO, OUTRO] }));
  await assertSucceeds(setDoc(doc(as(PROF), `users/${PROF}/messagingPrefs/settings`), { quietEnabled: true, from: '06:00', to: '21:30', days: [1, 2], autoReplyEnabled: false, autoReplyText: '' }));
  await assertFails(setDoc(doc(as(OUTRO), `users/${PROF}/messagingPrefs/settings`), { quietEnabled: true, from: '06:00', to: '21:30', days: [1], autoReplyEnabled: false, autoReplyText: '' }));
  await assertFails(setDoc(doc(as(PROF), `users/${PROF}/messagingPrefs/settings`), { quietEnabled: true, from: '06:00', to: '21:30', days: [], autoReplyEnabled: false, autoReplyText: '' }));
  await assertSucceeds(setDoc(doc(as(PROF), `users/${PROF}/messageTemplates/t1`), { title: 'Chuva', body: 'Aula de {data} cancelada', uses: 0 }));
});

test('avaliação: professor lê as dele; aluno só a enviada dele; ninguém escreve', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'professorEvaluations/e1'), { professorUid: PROF, athleteId: ALUNO, status: 'sent' });
    await setDoc(doc(ctx.firestore(), 'professorEvaluations/e2'), { professorUid: PROF, athleteId: ALUNO, status: 'draft' });
  });
  await assertSucceeds(getDoc(doc(as(PROF), 'professorEvaluations/e2')));
  await assertSucceeds(getDoc(doc(as(ALUNO), 'professorEvaluations/e1')));
  await assertSucceeds(getDocs(query(collection(as(ALUNO), 'professorEvaluations'), where('athleteId', '==', ALUNO), where('status', '==', 'sent'))));
  await assertFails(getDoc(doc(as(ALUNO), 'professorEvaluations/e2')));
  await assertFails(getDoc(doc(as(OUTRO), 'professorEvaluations/e1')));
  await assertFails(setDoc(doc(as(PROF), 'professorEvaluations/e3'), { professorUid: PROF, athleteId: ALUNO, status: 'sent' }));
});

test('disponibilidade: publicada qualquer logado lê; rascunho só o dono; particulares só os dois lados', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `professorAvailability/${PROF}`), { published: true, weekly: {} });
    await setDoc(doc(ctx.firestore(), `professorAvailability/${OUTRO}`), { published: false, weekly: {} });
    await setDoc(doc(ctx.firestore(), 'professorPrivateLessons/l1'), { professorUid: PROF, athleteId: ALUNO, status: 'confirmed' });
  });
  await assertSucceeds(getDoc(doc(as(ALUNO), `professorAvailability/${PROF}`)));
  await assertSucceeds(getDoc(doc(as(OUTRO), `professorAvailability/${OUTRO}`)));
  await assertFails(getDoc(doc(as(ALUNO), `professorAvailability/${OUTRO}`)));
  await assertFails(setDoc(doc(as(PROF), `professorAvailability/${PROF}`), { published: true }));
  await assertSucceeds(getDoc(doc(as(PROF), 'professorPrivateLessons/l1')));
  await assertSucceeds(getDocs(query(collection(as(ALUNO), 'professorPrivateLessons'), where('athleteId', '==', ALUNO))));
  await assertFails(getDoc(doc(as(OUTRO), 'professorPrivateLessons/l1')));
  await assertFails(setDoc(doc(as(ALUNO), 'professorPrivateLessons/l2'), { professorUid: PROF, athleteId: ALUNO, status: 'confirmed' }));
});
