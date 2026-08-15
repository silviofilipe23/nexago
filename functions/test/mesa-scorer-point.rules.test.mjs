import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-mesa-scorer-test';
const APP_ID = PROJECT_ID;
const OWNER = 'owner-uid';
const GESTOR = 'gestor-uid';
const MESARIO = 'mesario-uid';
const ESTRANHO = 'estranho-uid';

const MATCH_PATH = `artifacts/${APP_ID}/public/data/matches/m1`;

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

/** Torneio com gestor e mesário ativos e uma partida em andamento no 1º set. */
before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', 't1'), { managerId: OWNER, name: 'Etapa Rio' });
    await setDoc(doc(db, 'tournaments', 't1', 'staff', GESTOR), { role: 'manager', status: 'active' });
    await setDoc(doc(db, 'tournaments', 't1', 'staff', MESARIO), { role: 'scorer', status: 'active' });
    await setDoc(doc(db, MATCH_PATH), {
      tournamentId: 't1',
      categoryId: 'c1',
      teamAId: 'time-a',
      teamBId: 'time-b',
      status: 'In Progress',
      sets: [{ a: 14, b: 12 }],
      currentSetIndex: 0,
      servingTeamId: 'time-b',
      resultA: '0',
      resultB: '0',
      pointEventSeq: 0,
      courtName: '2',
    });
  });
});

after(() => testEnv.cleanup());

/** Exatamente o que a mesa grava a cada ponto — mesmo payload nas três superfícies
 *  (portal do atleta, portal do organizador e app): o saque passa pra quem marcou. */
function pointUpdate() {
  return {
    sets: [{ a: 15, b: 12 }],
    currentSetIndex: 0,
    status: 'In Progress',
    servingTeamId: 'time-a',
    resultA: '0',
    resultB: '0',
    pointEventSeq: 1,
    updatedAt: serverTimestamp(),
  };
}

test('mesário marca ponto — a escrita da mesa, com o saque junto', async () => {
  const db = testEnv.authenticatedContext(MESARIO).firestore();
  await assertSucceeds(updateDoc(doc(db, MATCH_PATH), pointUpdate()));
});

test('gestor marca o mesmo ponto', async () => {
  const db = testEnv.authenticatedContext(GESTOR).firestore();
  await assertSucceeds(updateDoc(doc(db, MATCH_PATH), pointUpdate()));
});

test('mesário continua sem mexer no que não é placar (quadra, horário, duplas)', async () => {
  const db = testEnv.authenticatedContext(MESARIO).firestore();
  await assertFails(updateDoc(doc(db, MATCH_PATH), { courtName: '7', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, MATCH_PATH), { teamAId: 'outro-time', updatedAt: serverTimestamp() }));
});

/** Formato da partida (MD3 ↔ set único) não é placar: é do gestor/dono, nunca do mesário. */
test('formato da partida: gestor troca, mesário não', async () => {
  const mesario = testEnv.authenticatedContext(MESARIO).firestore();
  await assertFails(updateDoc(doc(mesario, MATCH_PATH), { bestOf: 1, updatedAt: serverTimestamp() }));

  const gestor = testEnv.authenticatedContext(GESTOR).firestore();
  await assertSucceeds(updateDoc(doc(gestor, MATCH_PATH), { bestOf: 1, updatedAt: serverTimestamp() }));
});

/** A regressão que fecha o buraco do `changedKeys()`: campo AUSENTE do documento também tem que
 *  bater na allowlist. Antes disso, qualquer chave nova passava — inclusive `liveScore`, que é
 *  escrita exclusiva da Cloud Function, e qualquer lixo arbitrário. */
test('campo que ainda NÃO existe no doc não escapa da allowlist', async () => {
  const mesario = testEnv.authenticatedContext(MESARIO).firestore();
  await assertFails(updateDoc(doc(mesario, MATCH_PATH), { liveScore: { setsA: 9, setsB: 0, currentGamesA: 0, currentGamesB: 0 } }));
  await assertFails(updateDoc(doc(mesario, MATCH_PATH), { campoInventado: 'x' }));

  const gestor = testEnv.authenticatedContext(GESTOR).firestore();
  await assertFails(updateDoc(doc(gestor, MATCH_PATH), { liveScore: { setsA: 9, setsB: 0, currentGamesA: 0, currentGamesB: 0 } }));
  await assertFails(updateDoc(doc(gestor, MATCH_PATH), { campoInventado: 'x' }));
});

/** Apagar campo também é escrita: `removedKeys` entra em `affectedKeys`. A mesa faz isso ao
 *  desfazer o ponto que encerrou a partida (`winnerId`/`matchEndedAt` viram deleteField). */
test('mesário apaga winnerId ao desfazer o ponto final, mas não apaga o que não é dele', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), MATCH_PATH), { winnerId: 'time-a', courtName: '2' }, { merge: true });
  });

  const db = testEnv.authenticatedContext(MESARIO).firestore();
  await assertSucceeds(updateDoc(doc(db, MATCH_PATH), { winnerId: deleteField(), status: 'In Progress', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, MATCH_PATH), { courtName: deleteField(), updatedAt: serverTimestamp() }));
});

test('quem não é da equipe não marca ponto nenhum', async () => {
  const db = testEnv.authenticatedContext(ESTRANHO).firestore();
  await assertFails(updateDoc(doc(db, MATCH_PATH), pointUpdate()));
});

test('mesário grava o evento da timeline com o seq seguinte', async () => {
  const db = testEnv.authenticatedContext(MESARIO).firestore();
  await assertSucceeds(
    setDoc(doc(db, `${MATCH_PATH}/pointEvents/e1`), {
      seq: 2,
      type: 'point',
      side: 'A',
      setIndex: 0,
      scoreA: 15,
      scoreB: 12,
      ts: serverTimestamp(),
    }),
  );
});
