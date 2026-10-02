import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-media-role-test';
const DONO = 'dono-uid';
const MIDIA = 'midia-uid';
const NOVA_MIDIA = 'nova-midia-uid';
const TORNEIO = 'copa-midia';
const APP = 'app-id';

const testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', TORNEIO), { managerId: DONO, name: 'Copa Mídia', listingStatus: 'open' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', MIDIA), { role: 'media', status: 'active' });
    await setDoc(doc(db, 'tournamentWallets', TORNEIO), { availableCents: 1000 });
    await setDoc(doc(db, 'artifacts', APP, 'public', 'data', 'inscriptions', 'i1'), {
      tournamentId: TORNEIO,
      teamId: 'time-x',
      status: 'confirmed',
    });
    await setDoc(doc(db, 'artifacts', APP, 'public', 'data', 'matches', 'm1'), {
      tournamentId: TORNEIO,
      status: 'scheduled',
    });
  });
});

after(() => testEnv.cleanup());

const as = (uid) => testEnv.authenticatedContext(uid, { roles: ['organizer'] }).firestore();
const controle = (db) => doc(db, 'tournaments', TORNEIO, 'broadcast', 'control');

test('dono adiciona alguém como mídia', async () => {
  await assertSucceeds(
    setDoc(doc(as(DONO), 'tournaments', TORNEIO, 'staff', NOVA_MIDIA), {
      role: 'media',
      status: 'active',
      displayName: 'Fulano',
      nickname: '',
      photoUrl: null,
      addedBy: DONO,
    }),
  );
});

test('mídia grava o controle da transmissão', async () => {
  await assertSucceeds(
    setDoc(controle(as(MIDIA)), { graphics: { scoreboard: false }, updatedAt: serverTimestamp(), updatedBy: MIDIA }, { merge: true }),
  );
});

test('mídia grava e lê a fila de entrevistas', async () => {
  const fila = doc(as(MIDIA), 'tournaments', TORNEIO, 'broadcast', 'interviewQueue');
  await assertSucceeds(
    setDoc(fila, {
      items: [],
      current: 0,
      questionIndex: 0,
      reporter: { role: 'Repórter', name: '' },
      show: { question: true, reporter: true, campaign: true },
      updatedAt: serverTimestamp(),
      updatedBy: MIDIA,
    }),
  );
  await assertSucceeds(getDoc(fila));
});

test('mídia lê o próprio doc de equipe', async () => {
  await assertSucceeds(getDoc(doc(as(MIDIA), 'tournaments', TORNEIO, 'staff', MIDIA)));
});

test('mídia NÃO edita o torneio', async () => {
  await assertFails(updateDoc(doc(as(MIDIA), 'tournaments', TORNEIO), { name: 'Outro nome' }));
});

test('mídia NÃO mexe na equipe', async () => {
  await assertFails(
    setDoc(doc(as(MIDIA), 'tournaments', TORNEIO, 'staff', 'alguem'), { role: 'media', status: 'active' }),
  );
});

test('mídia NÃO lança placar', async () => {
  await assertFails(
    updateDoc(doc(as(MIDIA), 'artifacts', APP, 'public', 'data', 'matches', 'm1'), { status: 'in_progress' }),
  );
});

test('mídia NÃO lê o caixa do torneio', async () => {
  await assertFails(getDoc(doc(as(MIDIA), 'tournamentWallets', TORNEIO)));
});

test('mídia NÃO altera inscrição', async () => {
  await assertFails(
    updateDoc(doc(as(MIDIA), 'artifacts', APP, 'public', 'data', 'inscriptions', 'i1'), { status: 'cancelled' }),
  );
});
