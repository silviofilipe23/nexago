// holdExpiresAt é o prazo de garantia da vaga, escrito só pelas Cloud
// Functions. O atleta não pode empurrar o próprio prazo — nem APAGAR o campo,
// que equivaleria a prazo infinito. Rodar:
// firebase emulators:exec --only firestore "node --test functions/test/inscription-hold-expires-at.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, before, after} from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {deleteField, doc, setDoc, updateDoc} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-rules-test-hold';
const APP_ID = PROJECT_ID;
const UID = 'player1-uid';
const INSCRIPTION = `artifacts/${APP_ID}/public/data/inscriptions/reg-1`;
const TEAM = `artifacts/${APP_ID}/public/data/teams/team-1`;
const HOLD = new Date('2026-09-01T12:00:00Z');

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
      holdExpiresAt: HOLD,
    });
  });
});
after(async () => testEnv.cleanup());

function athleteDb() {
  return testEnv.authenticatedContext(UID).firestore();
}

// Controle positivo: sem ele, uma regra quebrada (ou estourada no orçamento de
// expressões) reprovaria TUDO e os testes de negação passariam por engano.
test('atleta ainda atualiza o próprio uniforme', async () => {
  await assertSucceeds(updateDoc(doc(athleteDb(), INSCRIPTION), {sizeTopPlayer1: 'M'}));
});

test('atleta não empurra o próprio prazo de garantia', async () => {
  await assertFails(
    updateDoc(doc(athleteDb(), INSCRIPTION), {
      holdExpiresAt: new Date('2027-01-01T00:00:00Z'),
    }),
  );
});

test('atleta não apaga o prazo para virar imune à varredura', async () => {
  await assertFails(
    updateDoc(doc(athleteDb(), INSCRIPTION), {holdExpiresAt: deleteField()}),
  );
});
