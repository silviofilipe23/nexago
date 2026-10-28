// "Enviar para o celular" do Compartilhar no Stories: o painel sobe as artes em
// `storyShares/{uid}/{tournamentId}/{shareId}/{n}.png` e a callable sendStoriesToPhone grava
// `users/{uid}/storyShares/{shareId}`, que a tela do app lê. Sobe quem opera o torneio (dono,
// staff gestor ativo, admin) e só na própria pasta; lê só o dono. As rules do Storage leem
// torneio e staff no Firestore, então o teste sobe os dois emuladores.
// Rodar: cd functions && npm run test:rules
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
const storageRules = fs.readFileSync(path.join(__dirname, '../../storage.rules'), 'utf8');
const firestoreRules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const DONO = 'dono-uid';
const GESTOR = 'gestor-uid';
const EX_GESTOR = 'ex-gestor-uid';
const OPERADOR = 'operador-uid';
const ESTRANHO = 'estranho-uid';
const ADMIN = 'admin-uid';
const T = 't1';

const testEnv = await initializeTestEnvironment({
  projectId: process.env.GCLOUD_PROJECT ?? 'nexago-rules-test',
  firestore: { rules: firestoreRules },
  storage: { rules: storageRules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', T), { managerId: DONO, name: 'Copa Verão' });
    await setDoc(doc(db, 'tournaments', T, 'staff', GESTOR), { role: 'manager', status: 'active' });
    await setDoc(doc(db, 'tournaments', T, 'staff', EX_GESTOR), { role: 'manager', status: 'removed' });
    await setDoc(doc(db, 'tournaments', T, 'staff', OPERADOR), { role: 'operator', status: 'active' });
    await setDoc(doc(db, 'users', DONO, 'storyShares', 's1'), { tournamentId: T, pageCount: 1 });
  });
});

after(async () => {
  await testEnv.cleanup();
});

const storageAs = (uid, claims) => testEnv.authenticatedContext(uid, claims).storage();
const pagePath = (uid, page = 1, tournamentId = T, shareId = 'share_abc12345') =>
  `storyShares/${uid}/${tournamentId}/${shareId}/${page}.png`;

function put(storage, filePath, { bytes = 1024, contentType = 'image/png' } = {}) {
  return storage.ref(filePath).put(new Uint8Array(bytes), { contentType });
}

test('dono do torneio e staff gestor ativo sobem as artes na própria pasta', async () => {
  await assertSucceeds(put(storageAs(DONO), pagePath(DONO, 1)));
  await assertSucceeds(put(storageAs(DONO), pagePath(DONO, 12)));
  await assertSucceeds(put(storageAs(GESTOR), pagePath(GESTOR, 1)));
  await assertSucceeds(put(storageAs(ADMIN, { roles: ['admin'] }), pagePath(ADMIN, 1)));
});

test('quem não opera o torneio não sobe', async () => {
  for (const uid of [EX_GESTOR, OPERADOR, ESTRANHO]) {
    await assertFails(put(storageAs(uid), pagePath(uid, 1)));
  }
  await assertFails(put(storageAs(DONO), pagePath(DONO, 1, 'torneio-inexistente')));
  await assertFails(put(testEnv.unauthenticatedContext().storage(), pagePath(DONO, 1)));
});

test('ninguém sobe na pasta de outro usuário', async () => {
  await assertFails(put(storageAs(GESTOR), pagePath(DONO, 1, T, 'share_outro_123')));
});

test('só PNG numerado de até 10 MB, e o cliente não apaga', async () => {
  const s = storageAs(DONO);
  await assertFails(put(s, pagePath(DONO, 1), { contentType: 'image/jpeg' }));
  await assertFails(put(s, pagePath(DONO, 1), { bytes: 10 * 1024 * 1024 + 1 }));
  await assertFails(put(s, `storyShares/${DONO}/${T}/share_abc12345/0.png`));
  await assertFails(put(s, `storyShares/${DONO}/${T}/share_abc12345/capa.png`));
  await assertFails(put(s, `storyShares/${DONO}/${T}/share_abc12345/100.png`));

  const page = pagePath(DONO, 3, T, 'share_unico_123');
  await assertSucceeds(put(s, page));
  await assertFails(s.ref(page).delete());
});

test('só o dono baixa as artes', async () => {
  const file = pagePath(DONO, 1, T, 'share_leitura_1');
  await assertSucceeds(put(storageAs(DONO), file));
  await assertSucceeds(storageAs(DONO).ref(file).getMetadata());
  await assertFails(storageAs(GESTOR).ref(file).getMetadata());
  await assertFails(testEnv.unauthenticatedContext().storage().ref(file).getMetadata());
});

test('users/{uid}/storyShares: só o dono lê; ninguém grava pelo cliente', async () => {
  const mine = testEnv.authenticatedContext(DONO).firestore();
  await assertSucceeds(getDoc(doc(mine, 'users', DONO, 'storyShares', 's1')));
  await assertFails(setDoc(doc(mine, 'users', DONO, 'storyShares', 's2'), { pageCount: 1 }));

  const other = testEnv.authenticatedContext(ESTRANHO).firestore();
  await assertFails(getDoc(doc(other, 'users', DONO, 'storyShares', 's1')));
});
