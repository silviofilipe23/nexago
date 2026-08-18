import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(
  path.join(__dirname, '../../firestore.rules'),
  'utf8',
);

const PROJECT_ID = 'nexago-public-profiles-public-read-test';
const ATHLETE_UID = 'athlete-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

function anonCtx() {
  return testEnv.unauthenticatedContext();
}

function athleteCtx() {
  return testEnv.authenticatedContext(ATHLETE_UID);
}

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Espelho sem PII mantido por Cloud Function.
    await setDoc(doc(db, 'public_profiles', ATHLETE_UID), {
      nickname: 'Duda',
      fullName: 'Maria Eduarda Silva',
      profilePhotoUrl: 'https://example.com/duda.jpg',
    });
    // Doc real do usuário — email/telefone/nascimento vivem aqui.
    await setDoc(doc(db, 'users', ATHLETE_UID), {
      roles: ['athlete'],
      hasAthleteRole: true,
      email: 'duda@example.com',
      phoneNumber: '+5562999990000',
      birthDate: '1998-04-12',
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('não autenticado lê public_profiles (nome/foto da dupla na página pública)', async () => {
  const db = anonCtx().firestore();
  await assertSucceeds(getDoc(doc(db, 'public_profiles', ATHLETE_UID)));
});

test('autenticado continua lendo public_profiles', async () => {
  const db = athleteCtx().firestore();
  await assertSucceeds(getDoc(doc(db, 'public_profiles', ATHLETE_UID)));
});

test('não autenticado não escreve em public_profiles — só a Cloud Function', async () => {
  const db = anonCtx().firestore();
  await assertFails(
    setDoc(doc(db, 'public_profiles', ATHLETE_UID), { nickname: 'Forjado' }),
  );
});

test('não autenticado continua sem ler users — é onde vive a PII de verdade', async () => {
  const db = anonCtx().firestore();
  await assertFails(getDoc(doc(db, 'users', ATHLETE_UID)));
});
