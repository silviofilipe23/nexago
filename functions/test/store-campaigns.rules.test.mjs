// Banners de campanha da Loja: a fonte (storeConfig/campaigns) é só do admin e só a callable
// grava; o atleta lê o espelho publicado pelo gatilho (storePublic/showcase).
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/store-campaigns.rules.test.mjs"
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
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-store-campaigns-test',
  firestore: { rules },
});

const asAdmin = () => testEnv.authenticatedContext('admin-uid', { roles: ['admin'] }).firestore();
const asAthlete = () => testEnv.authenticatedContext('athlete-uid', { roles: ['athlete'] }).firestore();
const BANNER = { id: 'verao-26', title: 'Equipamento de quem joga na areia', active: true };

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'storeConfig', 'campaigns'), { banners: [BANNER], version: 1 });
    await setDoc(doc(db, 'storePublic', 'showcase'), { banners: [BANNER] });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('admin lê a fonte dos banners; atleta e visitante, não', async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), 'storeConfig', 'campaigns')));
  await assertFails(getDoc(doc(asAthlete(), 'storeConfig', 'campaigns')));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'storeConfig', 'campaigns')));
});

test('nem o admin grava a fonte direto: só a callable saveStoreCampaigns', async () => {
  await assertFails(setDoc(doc(asAdmin(), 'storeConfig', 'campaigns'), { banners: [], version: 2 }));
});

test('o espelho publicado é público e ninguém grava', async () => {
  await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'storePublic', 'showcase')));
  await assertFails(setDoc(doc(asAdmin(), 'storePublic', 'showcase'), { banners: [] }));
});
