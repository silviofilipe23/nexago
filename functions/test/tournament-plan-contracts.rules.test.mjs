// Contrato de plano por evento e cotas: o organizador lê só os próprios, ninguém grava pelo
// cliente (as callables de `tournament-plan-contracts.ts` são a porta), e o catálogo cru
// (`tournamentPlans`, com custo e margem) continua fechado para ele.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/tournament-plan-contracts.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-plan-contracts-test';
const ORG = 'org-uid';
const OUTRO = 'outro-org-uid';
const ADMIN = 'admin-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournamentPlanContracts', 't1'), {
      organizerId: ORG,
      tournamentId: 't1',
      planId: 'plano-4',
      status: 'requested',
      priceCents: 350000,
    });
    await setDoc(doc(db, 'tournamentPlanContracts', 't1', 'sponsors', 's1'), {
      name: 'Açaí da Praia',
      tierId: 'ouro',
      source: 'organizer',
      logoStatus: 'missing',
    });
    await setDoc(doc(db, 'tournamentPlans', 'plano-4'), { version: 2, current: { priceCents: 350000 } });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('organizador lê o próprio contrato, as cotas e a lista dele', async () => {
  const db = testEnv.authenticatedContext(ORG).firestore();
  await assertSucceeds(getDoc(doc(db, 'tournamentPlanContracts', 't1')));
  await assertSucceeds(getDoc(doc(db, 'tournamentPlanContracts', 't1', 'sponsors', 's1')));
  await assertSucceeds(getDocs(collection(db, 'tournamentPlanContracts', 't1', 'sponsors')));
  await assertSucceeds(getDocs(query(collection(db, 'tournamentPlanContracts'), where('organizerId', '==', ORG))));
});

test('evento sem contrato: ler o id vazio é permitido (a tela mostra "sem plano")', async () => {
  const db = testEnv.authenticatedContext(ORG).firestore();
  await assertSucceeds(getDoc(doc(db, 'tournamentPlanContracts', 'sem-contrato')));
});

test('outro organizador não lê contrato nem cotas alheias, nem lista sem filtro', async () => {
  const db = testEnv.authenticatedContext(OUTRO).firestore();
  await assertFails(getDoc(doc(db, 'tournamentPlanContracts', 't1')));
  await assertFails(getDoc(doc(db, 'tournamentPlanContracts', 't1', 'sponsors', 's1')));
  await assertFails(getDocs(collection(db, 'tournamentPlanContracts')));
});

test('ninguém grava pelo cliente — nem o dono', async () => {
  const db = testEnv.authenticatedContext(ORG).firestore();
  await assertFails(updateDoc(doc(db, 'tournamentPlanContracts', 't1'), { status: 'paid' }));
  await assertFails(setDoc(doc(db, 'tournamentPlanContracts', 't2'), { organizerId: ORG, status: 'requested' }));
  await assertFails(updateDoc(doc(db, 'tournamentPlanContracts', 't1', 'sponsors', 's1'), { logoStatus: 'approved' }));
});

test('catálogo cru (custo e margem) segue fechado para o organizador', async () => {
  const db = testEnv.authenticatedContext(ORG).firestore();
  await assertFails(getDoc(doc(db, 'tournamentPlans', 'plano-4')));
});

test('admin lê tudo', async () => {
  const db = testEnv.authenticatedContext(ADMIN, { roles: ['admin'] }).firestore();
  await assertSucceeds(getDoc(doc(db, 'tournamentPlanContracts', 't1')));
  await assertSucceeds(getDocs(collection(db, 'tournamentPlanContracts', 't1', 'sponsors')));
});
