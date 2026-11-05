// Campos da conferência de pagamento do organizador (fila "A conferir") e do
// canal do pagamento são escritos só pelas Cloud Functions. O jogador da dupla
// não grava, não troca e não APAGA nenhum deles — apagar `declaredPaidAt`
// tirava a inscrição da fila do organizador.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/inscription-organizer-payment-fields.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, before, after } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-rules-test-org-payment';
const APP_ID = PROJECT_ID;
const UID = 'player1-uid';
const PARTNER = 'player2-uid';
const ORGANIZER_ADMIN = 'organizer-admin-uid';
const INSCRIPTION = `artifacts/${APP_ID}/public/data/inscriptions/reg-1`;
const TEAM = `artifacts/${APP_ID}/public/data/teams/team-1`;
const DECLARED = new Date('2026-11-01T12:00:00Z');

let testEnv;
before(async () => {
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, TEAM), { player1Id: UID, player2Id: PARTNER });
    await setDoc(doc(db, INSCRIPTION), {
      tournamentId: 't1',
      categoryId: 'c1',
      teamId: 'team-1',
      participantUids: [UID, PARTNER],
      isPaid: false,
      paidAmount: 0,
      declaredPaidAt: DECLARED,
      paymentVerifiedByOrganizer: false,
      organizerConfirmedShareUids: [],
      paymentMethod: 'direct_pix',
      paymentChannel: 'direct',
    });
  });
});
after(async () => testEnv.cleanup());

function athleteDb(uid = UID) {
  return testEnv.authenticatedContext(uid).firestore();
}

// Controle positivo: uma regra quebrada (ou estourada no orçamento de
// expressões) reprovaria tudo e os testes de negação passariam por engano.
test('jogador ainda atualiza o próprio uniforme (update legítimo de hoje)', async () => {
  await assertSucceeds(updateDoc(doc(athleteDb(), INSCRIPTION), { sizeTopPlayer1: 'M' }));
  await assertSucceeds(updateDoc(doc(athleteDb(PARTNER), INSCRIPTION), { sizeTopPlayer2: 'G' }));
});

test('jogador não marca o próprio pagamento como conferido pelo organizador', async () => {
  await assertFails(
    updateDoc(doc(athleteDb(), INSCRIPTION), { paymentVerifiedByOrganizer: true }),
  );
});

test('jogador não apaga declaredPaidAt para sair da fila "A conferir"', async () => {
  await assertFails(updateDoc(doc(athleteDb(), INSCRIPTION), { declaredPaidAt: deleteField() }));
});

test('jogador não troca declaredPaidAt', async () => {
  await assertFails(
    updateDoc(doc(athleteDb(), INSCRIPTION), { declaredPaidAt: new Date('2026-12-01T00:00:00Z') }),
  );
});

test('jogador não se inclui em organizerConfirmedShareUids', async () => {
  await assertFails(
    updateDoc(doc(athleteDb(), INSCRIPTION), { organizerConfirmedShareUids: [UID] }),
  );
});

test('jogador não troca paymentMethod nem paymentChannel', async () => {
  await assertFails(updateDoc(doc(athleteDb(), INSCRIPTION), { paymentMethod: 'organizer_direct' }));
  await assertFails(updateDoc(doc(athleteDb(), INSCRIPTION), { paymentChannel: 'card' }));
  await assertFails(updateDoc(doc(athleteDb(), INSCRIPTION), { paymentChannel: deleteField() }));
});

test('jogador não cria os campos numa inscrição que não os tinha', async () => {
  const fresh = `artifacts/${APP_ID}/public/data/inscriptions/reg-2`;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), fresh), {
      tournamentId: 't1',
      categoryId: 'c1',
      teamId: 'team-1',
      participantUids: [UID, PARTNER],
      isPaid: false,
    });
  });
  await assertFails(updateDoc(doc(athleteDb(), fresh), { paymentVerifiedByOrganizer: true }));
  await assertFails(updateDoc(doc(athleteDb(), fresh), { declaredPaidAt: new Date() }));
  await assertSucceeds(updateDoc(doc(athleteDb(), fresh), { sizeTopPlayer1: 'P' }));
});

test('admin (ramo do organizador) segue gravando os campos', async () => {
  const adminDb = testEnv.authenticatedContext(ORGANIZER_ADMIN, { role: 'admin', roles: ['admin'] }).firestore();
  await assertSucceeds(
    updateDoc(doc(adminDb, INSCRIPTION), { paymentVerifiedByOrganizer: true }),
  );
});
