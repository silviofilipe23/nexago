// substitutionHistory é trilha de auditoria escrita só pelas Cloud Functions —
// o atleta não pode forjar nem apagar. Rodar:
// firebase emulators:exec --only firestore "node --test functions/test/inscription-substitution-history.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, before, after} from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {doc, setDoc, updateDoc} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-rules-test-substitution';
const APP_ID = PROJECT_ID;
const UID = 'player1-uid';
const INSCRIPTION = `artifacts/${APP_ID}/public/data/inscriptions/reg-1`;
const TEAM = `artifacts/${APP_ID}/public/data/teams/team-1`;

let testEnv;
before(async () => {
  testEnv = await initializeTestEnvironment({projectId: PROJECT_ID, firestore: {rules}});
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, TEAM), {player1Id: UID, player2Id: 'player2-uid'});
    await setDoc(doc(db, INSCRIPTION), {
      tournamentId: 't1',
      categoryId: 'c1',
      teamId: 'team-1',
      participantUids: [UID, 'player2-uid'],
      isPaid: false,
      paidAmount: 0,
      substitutionHistory: [],
    });
  });
});
after(async () => testEnv.cleanup());

function athleteDb() {
  return testEnv.authenticatedContext(UID).firestore();
}

test('atleta ainda atualiza o próprio uniforme', async () => {
  await assertSucceeds(updateDoc(doc(athleteDb(), INSCRIPTION), {sizeTopPlayer1: 'M'}));
});

test('atleta não escreve substitutionHistory', async () => {
  await assertFails(
    updateDoc(doc(athleteDb(), INSCRIPTION), {
      substitutionHistory: [{outUid: 'player2-uid', inUid: 'forjado'}],
    }),
  );
});
