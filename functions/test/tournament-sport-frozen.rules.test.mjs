import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-sport-frozen-test';
const DONO = 'dono-uid';
const ADMIN = 'admin-uid';
const MESARIO = 'mesario-uid';
const TORNEIO_BT = 'copa-beach-tennis';
const TORNEIO_SEM_ESPORTE = 'copa-legada';
const LIGA = 'liga-beach-tennis';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', TORNEIO_BT), {
      managerId: DONO, name: 'Copa BT', listingStatus: 'open', sport: 'beachTennis',
    });
    await setDoc(doc(db, 'tournaments', TORNEIO_BT, 'staff', MESARIO), {
      role: 'scorer', status: 'active',
    });
    await setDoc(doc(db, 'tournaments', TORNEIO_SEM_ESPORTE), {
      managerId: DONO, name: 'Copa Legada', listingStatus: 'open',
    });
    await setDoc(doc(db, 'leagues', LIGA), {
      managerId: DONO, name: 'Liga BT', listingStatus: 'open', sport: 'beachTennis',
    });
  });
});

after(async () => { await testEnv.cleanup(); });

const asDono = () => testEnv.authenticatedContext(DONO).firestore();
const asAdmin = () => testEnv.authenticatedContext(ADMIN, { roles: ['admin'] }).firestore();
const asMesario = () => testEnv.authenticatedContext(MESARIO).firestore();

test('dono edita o nome sem mandar sport', async () => {
  await assertSucceeds(updateDoc(doc(asDono(), 'tournaments', TORNEIO_BT), { name: 'Copa BT 2026' }));
});

test('dono reenvia o MESMO sport', async () => {
  await assertSucceeds(
    updateDoc(doc(asDono(), 'tournaments', TORNEIO_BT), { name: 'Copa BT', sport: 'beachTennis' }),
  );
});

// O app da loja só conhece 3 esportes e, ao reeditar, regravava qualquer
// outro como beachVolleyball. A rule é o que segura isso enquanto o build
// mínimo não sobe.
test('dono NÃO troca o sport de um torneio já criado', async () => {
  await assertFails(
    updateDoc(doc(asDono(), 'tournaments', TORNEIO_BT), { sport: 'beachVolleyball' }),
  );
});

test('mesário atualiza liveMatchesNow sem tocar em sport', async () => {
  await assertSucceeds(
    updateDoc(doc(asMesario(), 'tournaments', TORNEIO_BT), { liveMatchesNow: 1 }),
  );
});

test('admin da plataforma pode corrigir o sport', async () => {
  await assertSucceeds(
    updateDoc(doc(asAdmin(), 'tournaments', TORNEIO_BT), { sport: 'padel' }),
  );
});

test('torneio legado sem sport pode receber sport pela primeira vez', async () => {
  await assertSucceeds(
    updateDoc(doc(asDono(), 'tournaments', TORNEIO_SEM_ESPORTE), { sport: 'beachVolleyball' }),
  );
});

test('dono NÃO troca o sport da liga', async () => {
  await assertFails(updateDoc(doc(asDono(), 'leagues', LIGA), { sport: 'beachVolleyball' }));
});

test('dono edita a liga reenviando o mesmo sport', async () => {
  await assertSucceeds(
    updateDoc(doc(asDono(), 'leagues', LIGA), { name: 'Liga BT 2026', sport: 'beachTennis' }),
  );
});
