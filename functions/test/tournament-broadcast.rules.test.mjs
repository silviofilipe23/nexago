import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-broadcast-test';
const DONO = 'dono-uid';
const GESTOR = 'gestor-uid';
const ADMIN_EVENTO = 'admin-evento-uid';
const MESARIO = 'mesario-uid';
const ESTRANHO = 'estranho-uid';
const TORNEIO = 'copa-live';
const TORNEIO_NOVO = 'copa-sem-controle';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const id of [TORNEIO, TORNEIO_NOVO]) {
      await setDoc(doc(db, 'tournaments', id), { managerId: DONO, name: id, listingStatus: 'open' });
    }
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', GESTOR), { role: 'manager', status: 'active' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', ADMIN_EVENTO), { role: 'eventAdmin', status: 'active' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', MESARIO), { role: 'scorer', status: 'active' });
  });
});

after(() => testEnv.cleanup());

const as = (uid) => testEnv.authenticatedContext(uid, { roles: ['organizer'] }).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();
const controle = (db, torneio = TORNEIO, id = 'control') => doc(db, 'tournaments', torneio, 'broadcast', id);

/** Mesmo formato que `saveBroadcastControl` grava (painel/data/broadcast-control-repository.ts). */
function patch(uid, extra = {}) {
  return { graphics: { scoreboard: false }, updatedAt: serverTimestamp(), updatedBy: uid, ...extra };
}

test('anônimo lê o controle ausente — o OBS abre antes de alguém mexer no painel', async () => {
  await assertSucceeds(getDoc(controle(anon(), TORNEIO_NOVO)));
});

test('dono cria o controle na primeira escrita', async () => {
  await assertSucceeds(setDoc(controle(as(DONO), TORNEIO_NOVO), patch(DONO), { merge: true }));
});

test('anônimo lê o controle existente', async () => {
  await assertSucceeds(getDoc(controle(anon(), TORNEIO_NOVO)));
});

for (const [papel, uid] of [['dono', DONO], ['gestor', GESTOR], ['administrador', ADMIN_EVENTO]]) {
  test(`${papel} grava o controle`, async () => {
    await assertSucceeds(setDoc(controle(as(uid)), patch(uid), { merge: true }));
  });
}

test('tarja, comandos e modos completos cabem no allowlist', async () => {
  await assertSucceeds(
    setDoc(
      controle(as(DONO)),
      patch(DONO, {
        courtId: 'q1',
        kocRoundEndScreen: 'classificadas',
        finalMode: 'on',
        interview: {
          name: 'Ana Souza',
          photoUrl: null,
          partnerName: 'Bia Lima',
          categoryName: 'Feminina B',
          durationSec: 20,
          shownAt: 1_700_000_000_000,
        },
        commands: { donationNowAt: 1_700_000_000_001 },
      }),
      { merge: true },
    ),
  );
});

test('"Tirar do ar" grava interview: null', async () => {
  await assertSucceeds(setDoc(controle(as(GESTOR)), patch(GESTOR, { interview: null }), { merge: true }));
});

test('mesário NÃO grava o controle', async () => {
  await assertFails(setDoc(controle(as(MESARIO)), patch(MESARIO), { merge: true }));
});

test('organizador sem vínculo com o torneio NÃO grava', async () => {
  await assertFails(setDoc(controle(as(ESTRANHO)), patch(ESTRANHO), { merge: true }));
});

test('anônimo NÃO grava', async () => {
  await assertFails(setDoc(controle(anon()), patch('ninguem'), { merge: true }));
});

test('outro doc na subcoleção broadcast é recusado', async () => {
  await assertFails(setDoc(controle(as(DONO), TORNEIO, 'outro'), patch(DONO), { merge: true }));
});

test('campo fora do allowlist é recusado', async () => {
  await assertFails(setDoc(controle(as(DONO)), patch(DONO, { managerId: DONO }), { merge: true }));
});

test('updatedBy de outra pessoa é recusado', async () => {
  await assertFails(setDoc(controle(as(DONO)), patch(GESTOR), { merge: true }));
});

test('ninguém apaga o controle', async () => {
  await assertFails(deleteDoc(controle(as(DONO))));
});
