import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
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

// Placar do pós-jogo do aluguel (pelada): lê quem está no placar; os outros
// atletas só o confirmado (perfil público). Ninguém grava pelo cliente
// (status, versão e confirmações só pelas callables e pela varredura).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const DONA = 'maria';
const ADVERSARIO = 'rafael';
const COMPANHEIRO = 'enzo';
const ESTRANHO = 'bia';
const RESULT_PATH = 'bookingResults/bk1';
const CONFIRMED_PATH = 'bookingResults/bk-ok';

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-booking-results-test',
  firestore: { rules },
});

after(() => testEnv.cleanup());

function resultDoc(over = {}) {
  return {
    bookingId: 'bk1',
    arenaName: 'Arena CFC',
    createdBy: DONA,
    playerUids: [DONA, COMPANHEIRO, ADVERSARIO],
    opponentUids: [ADVERSARIO],
    status: 'pending',
    version: 1,
    teams: [],
    games: [],
    ...over,
  };
}

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), RESULT_PATH), resultDoc());
    await setDoc(doc(ctx.firestore(), CONFIRMED_PATH), resultDoc({ bookingId: 'bk-ok', status: 'confirmed' }));
  });
});

// `assertFails` não distingue "a regra disse não" de "acabou o orçamento de
// expressões" — os dois chegam como PERMISSION_DENIED (ver
// athlete-level-rules.test.mjs).
async function assertDeniedByRule(promise) {
  try {
    await promise;
  } catch (e) {
    const message = String(e.message || e);
    if (/maximum of \d+ expressions/i.test(message)) {
      throw new Error('negado por estouro do teto de expressões, não pela regra');
    }
    if (e.code === 'permission-denied' || /PERMISSION_DENIED/.test(message)) return;
    throw new Error(`negado, mas por erro inesperado: ${message}`);
  }
  throw new Error('esperava negação, mas passou');
}

const db = (uid) => testEnv.authenticatedContext(uid).firestore();

for (const uid of [DONA, ADVERSARIO, COMPANHEIRO]) {
  test(`${uid} (no placar) lê o placar`, async () => {
    await assertSucceeds(getDoc(doc(db(uid), RESULT_PATH)));
  });
}

test('quem não está no placar não lê o pendente', async () => {
  await assertDeniedByRule(getDoc(doc(db(ESTRANHO), RESULT_PATH)));
});

test('quem não está no placar lê o confirmado (perfil público, link)', async () => {
  await assertSucceeds(getDoc(doc(db(ESTRANHO), CONFIRMED_PATH)));
});

test('a query do perfil público (playerUids + status confirmado) passa para qualquer atleta', async () => {
  const q = query(
    collection(db(ESTRANHO), 'bookingResults'),
    where('playerUids', 'array-contains', DONA),
    where('status', '==', 'confirmed'),
  );
  const snap = await assertSucceeds(getDocs(q));
  if (snap.size !== 1) throw new Error(`esperava 1 placar confirmado, veio ${snap.size}`);
});

test('a mesma query sem o filtro de confirmado é negada para quem não está no placar', async () => {
  await assertDeniedByRule(getDocs(query(
    collection(db(ESTRANHO), 'bookingResults'),
    where('playerUids', 'array-contains', DONA),
  )));
});

test('sem login não lê', async () => {
  await assertDeniedByRule(getDoc(doc(testEnv.unauthenticatedContext().firestore(), RESULT_PATH)));
});

test('a query do app (playerUids array-contains uid) passa', async () => {
  const q = query(collection(db(ADVERSARIO), 'bookingResults'), where('playerUids', 'array-contains', ADVERSARIO));
  const snap = await assertSucceeds(getDocs(q));
  if (snap.size !== 2) throw new Error(`esperava 2 placares, veio ${snap.size}`);
});

test('a mesma query de quem não tem placar nenhum volta vazia (não é negada)', async () => {
  const q = query(collection(db(ESTRANHO), 'bookingResults'), where('playerUids', 'array-contains', ESTRANHO));
  const snap = await assertSucceeds(getDocs(q));
  if (snap.size !== 0) throw new Error(`esperava 0, veio ${snap.size}`);
});

test('listar a coleção sem a constraint do próprio uid é negado', async () => {
  await assertDeniedByRule(getDocs(collection(db(DONA), 'bookingResults')));
});

test('adversário não confirma gravando direto', async () => {
  await assertDeniedByRule(updateDoc(doc(db(ADVERSARIO), RESULT_PATH), {
    status: 'confirmed',
    respondedBy: ADVERSARIO,
  }));
});

test('dona não edita nem apaga o placar direto', async () => {
  await assertDeniedByRule(updateDoc(doc(db(DONA), RESULT_PATH), { status: 'confirmed' }));
  await assertDeniedByRule(updateDoc(doc(db(DONA), RESULT_PATH), { games: [] }));
  await assertDeniedByRule(deleteDoc(doc(db(DONA), RESULT_PATH)));
});

test('ninguém cria placar pelo cliente, nem para a própria reserva', async () => {
  await assertDeniedByRule(setDoc(doc(db(DONA), 'bookingResults/bk2'), resultDoc({
    bookingId: 'bk2',
    status: 'confirmed',
  })));
});
