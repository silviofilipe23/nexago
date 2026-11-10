import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const ATLETA = 'atleta-uid';
const OUTRO = 'outro-uid';

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-rules-test',
  firestore: { rules },
});

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ATLETA, 'asaas', 'savedCard'), {
      token: 'tok_x', brand: 'VISA', last4: '1234',
    });
    await setDoc(doc(db, 'users', ATLETA, 'asaas', 'savedCardAttempts'), { count: 1 });
    await setDoc(doc(db, 'arenaScheduleSubscriptions', 'sub1'), {
      arenaId: 'arena-1', memberAthleteIds: [ATLETA], status: 'active',
      autopay: { enabled: true }, autopayAthleteIds: [ATLETA],
    });
    await setDoc(doc(db, 'arenaScheduleCharges', 'ch1'), {
      arenaId: 'arena-1', visibleTo: [ATLETA], status: 'pending',
      autopay: { state: 'scheduled' },
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('dono não lê nem grava o cartão salvo', async () => {
  const db = testEnv.authenticatedContext(ATLETA).firestore();
  for (const id of ['savedCard', 'savedCardAttempts']) {
    const ref = doc(db, 'users', ATLETA, 'asaas', id);
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { token: 'tok_y' }));
    await assertFails(updateDoc(ref, { last4: '9999' }));
  }
});

test('outro usuário também não lê o cartão', async () => {
  const db = testEnv.authenticatedContext(OUTRO).firestore();
  await assertFails(getDoc(doc(db, 'users', ATLETA, 'asaas', 'savedCard')));
});

test('atleta lê a própria assinatura com o campo autopay', async () => {
  const db = testEnv.authenticatedContext(ATLETA).firestore();
  const snap = await assertSucceeds(getDoc(doc(db, 'arenaScheduleSubscriptions', 'sub1')));
  if (snap.data().autopay?.enabled !== true) throw new Error('autopay ausente na leitura');
});

test('atleta lê a própria mensalidade com autopay', async () => {
  const db = testEnv.authenticatedContext(ATLETA).firestore();
  await assertSucceeds(getDoc(doc(db, 'arenaScheduleCharges', 'ch1')));
});

test('atleta não grava autopay na mensalidade nem na assinatura', async () => {
  const db = testEnv.authenticatedContext(ATLETA).firestore();
  await assertFails(updateDoc(doc(db, 'arenaScheduleCharges', 'ch1'), { autopay: { state: 'paid' } }));
  await assertFails(updateDoc(doc(db, 'arenaScheduleSubscriptions', 'sub1'), { autopay: { enabled: false } }));
  await assertFails(updateDoc(doc(db, 'arenaScheduleSubscriptions', 'sub1'), { autopayAthleteIds: [] }));
});
