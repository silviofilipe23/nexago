import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-external-invite-test';
const COLLECTION = 'tournamentExternalPartnerInvites';
const TOKEN = 'token-do-convite';
const QUEM_CONVIDOU = 'inviter-uid';
const CONVIDADO = 'invitee-uid';
const ESTRANHO = 'estranho-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), COLLECTION, TOKEN), {
      tournamentId: 'copa-teste',
      categoryId: 'cat-1',
      inviterUid: QUEM_CONVIDOU,
      inviterName: 'Bia',
      status: 'pending',
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

// O id do doc É o token: quem tem o link precisa ler para a tela dizer quem
// chamou e para qual torneio, antes mesmo de resgatar.
test('autenticado com o link consegue ler o convite', async () => {
  const db = testEnv.authenticatedContext(CONVIDADO).firestore();
  await assertSucceeds(getDoc(doc(db, COLLECTION, TOKEN)));
});

test('deslogado não lê', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, COLLECTION, TOKEN)));
});

// Varrer a coleção mostraria os convites de todo mundo — e ninguém precisa
// disso: quem tem o link já tem o id.
test('ninguém varre a coleção', async () => {
  const db = testEnv.authenticatedContext(ESTRANHO).firestore();
  await assertFails(getDocs(collection(db, COLLECTION)));
});

// Escrita é só das callables (Admin SDK, que não passa por estas regras).
// Cliente escrevendo aqui poderia forjar convite em nome de outro atleta ou
// reabrir um token já gasto.
test('cliente não cria convite', async () => {
  const db = testEnv.authenticatedContext(ESTRANHO).firestore();
  await assertFails(
    setDoc(doc(db, COLLECTION, 'forjado'), {
      tournamentId: 'copa-teste',
      categoryId: 'cat-1',
      inviterUid: ESTRANHO,
      status: 'pending',
    }),
  );
});

test('nem quem convidou reabre o token', async () => {
  const db = testEnv.authenticatedContext(QUEM_CONVIDOU).firestore();
  await assertFails(updateDoc(doc(db, COLLECTION, TOKEN), { status: 'pending' }));
});

test('cliente não apaga convite', async () => {
  const db = testEnv.authenticatedContext(QUEM_CONVIDOU).firestore();
  await assertFails(deleteDoc(doc(db, COLLECTION, TOKEN)));
});
