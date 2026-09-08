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
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-spot-pass-test';
const COLLECTION = 'tournamentSpotPasses';
const TOURNAMENT = 'copa-teste';
const ORGANIZADOR = 'organizador-uid';
const CONVIDADO = 'convidado-uid';
const OUTRO_ATLETA = 'outro-atleta-uid';
const PASSE = 'passe-1';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', TOURNAMENT), {
      name: 'Copa Teste',
      managerId: ORGANIZADOR,
    });
    // Três passes no MESMO torneio: a listagem do painel precisa aguentar mais de um documento
    // sem estourar o orçamento de acessos da consulta.
    for (const [id, athleteUid] of [
      [PASSE, CONVIDADO],
      ['passe-2', OUTRO_ATLETA],
      ['passe-3', 'terceiro-uid'],
    ]) {
      await setDoc(doc(db, COLLECTION, id), {
        tournamentId: TOURNAMENT,
        categoryId: 'cat-1',
        categoryLabel: 'Feminina B',
        athleteUid,
        athleteName: 'Atleta',
        status: 'active',
        grantedByUid: ORGANIZADOR,
      });
    }
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('o convidado lê o próprio passe', async () => {
  const db = testEnv.authenticatedContext(CONVIDADO).firestore();
  await assertSucceeds(getDoc(doc(db, COLLECTION, PASSE)));
});

// O passe diz quem foi escolhido; quem não foi não tem o que fazer com isso.
test('outro atleta não lê o passe alheio', async () => {
  const db = testEnv.authenticatedContext(OUTRO_ATLETA).firestore();
  await assertFails(getDoc(doc(db, COLLECTION, PASSE)));
});

test('deslogado não lê', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, COLLECTION, PASSE)));
});

// A consulta que o app e o portal do atleta fazem para saber se a categoria lotada abre.
test('o atleta lista os passes dele', async () => {
  const db = testEnv.authenticatedContext(CONVIDADO).firestore();
  await assertSucceeds(
    getDocs(
      query(
        collection(db, COLLECTION),
        where('athleteUid', '==', CONVIDADO),
        where('tournamentId', '==', TOURNAMENT),
      ),
    ),
  );
});

test('o atleta não lista os passes de outro', async () => {
  const db = testEnv.authenticatedContext(CONVIDADO).firestore();
  await assertFails(
    getDocs(query(collection(db, COLLECTION), where('athleteUid', '==', OUTRO_ATLETA))),
  );
});

// A consulta do painel: todos os passes do torneio, com mais de um documento.
test('o organizador lista os passes do torneio', async () => {
  const db = testEnv.authenticatedContext(ORGANIZADOR).firestore();
  await assertSucceeds(
    getDocs(query(collection(db, COLLECTION), where('tournamentId', '==', TOURNAMENT))),
  );
});

test('estranho não varre a coleção', async () => {
  const db = testEnv.authenticatedContext('estranho-uid').firestore();
  await assertFails(getDocs(collection(db, COLLECTION)));
});

// Escrita é só das callables (Admin SDK, que não passa por estas regras): é a queima
// transacional junto com a inscrição que mantém o teto da categoria honesto. Cliente escrevendo
// aqui forjaria uma vaga em categoria lotada.
test('nem o convidado cria passe para si', async () => {
  const db = testEnv.authenticatedContext(CONVIDADO).firestore();
  await assertFails(
    setDoc(doc(db, COLLECTION, 'forjado'), {
      tournamentId: TOURNAMENT,
      categoryId: 'cat-1',
      athleteUid: CONVIDADO,
      status: 'active',
    }),
  );
});

test('nem o organizador escreve direto', async () => {
  const db = testEnv.authenticatedContext(ORGANIZADOR).firestore();
  await assertFails(updateDoc(doc(db, COLLECTION, PASSE), { status: 'revoked' }));
  await assertFails(deleteDoc(doc(db, COLLECTION, PASSE)));
});
