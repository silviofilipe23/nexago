import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(
  path.join(__dirname, '../../firestore.rules'),
  'utf8',
);

const PROJECT_ID = 'nexago-arena-contact-leads-test';
const OWNER_UID = 'arena-owner-uid';
const ATHLETE_UID = 'athlete-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

function ownerCtx() {
  return testEnv.authenticatedContext(OWNER_UID);
}

function athleteCtx() {
  return testEnv.authenticatedContext(ATHLETE_UID);
}

function arenaRoleCtx() {
  return testEnv.authenticatedContext('novo-dono-uid', { roles: ['arena'] });
}

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Arena de pré-cadastro semeada pelo script (Admin SDK).
    await setDoc(doc(db, 'arenas', 'pre-arena-beach-t3'), {
      unclaimed: true,
      name: 'Arena Beach T3',
      city: 'Goiânia',
      whatsapp: '5562982406456',
      contactClicksTotal: 4,
      contactAthletesCount: 3,
    });
    // Arena já convertida, com dono.
    await setDoc(doc(db, 'arenas', 'arena-parceira'), {
      managerUserId: OWNER_UID,
      name: 'Arena Parceira',
      contactClicksTotal: 9,
      contactAthletesCount: 7,
    });
    await setDoc(
      doc(db, 'arenas', 'arena-parceira', 'contactLeads', ATHLETE_UID),
      { athleteUid: ATHLETE_UID, clickCount: 2 },
    );
    await setDoc(
      doc(db, 'arenas', 'pre-arena-beach-t3', 'contactLeads', ATHLETE_UID),
      { athleteUid: ATHLETE_UID, clickCount: 1 },
    );
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('atleta não lê os leads de contato de ninguém, nem os próprios', async () => {
  // O uid do atleta é dado de prospecção da nexaGO; a listagem é do backoffice.
  const db = athleteCtx().firestore();
  await assertFails(
    getDoc(doc(db, 'arenas', 'pre-arena-beach-t3', 'contactLeads', ATHLETE_UID)),
  );
});

test('dono lê os leads da própria arena depois de converter', async () => {
  const db = ownerCtx().firestore();
  await assertSucceeds(
    getDoc(doc(db, 'arenas', 'arena-parceira', 'contactLeads', ATHLETE_UID)),
  );
});

test('ninguém escreve lead pelo cliente — só a Cloud Function', async () => {
  const athleteDb = athleteCtx().firestore();
  await assertFails(
    setDoc(
      doc(athleteDb, 'arenas', 'pre-arena-beach-t3', 'contactLeads', ATHLETE_UID),
      { athleteUid: ATHLETE_UID, clickCount: 999 },
    ),
  );

  const ownerDb = ownerCtx().firestore();
  await assertFails(
    setDoc(
      doc(ownerDb, 'arenas', 'arena-parceira', 'contactLeads', ATHLETE_UID),
      { athleteUid: ATHLETE_UID, clickCount: 999 },
    ),
  );
});

test('dono não infla o contador de contatos da própria arena', async () => {
  const db = ownerCtx().firestore();
  await assertFails(
    updateDoc(doc(db, 'arenas', 'arena-parceira'), { contactClicksTotal: 500 }),
  );
  await assertFails(
    updateDoc(doc(db, 'arenas', 'arena-parceira'), { contactAthletesCount: 500 }),
  );
});

test('dono não se marca como pré-cadastro nem sai dele sozinho', async () => {
  const db = ownerCtx().firestore();
  await assertFails(
    updateDoc(doc(db, 'arenas', 'arena-parceira'), { unclaimed: true }),
  );
});

test('arena nova não nasce como pré-cadastro nem com contador preenchido', async () => {
  const db = arenaRoleCtx().firestore();
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-fraudulenta'), {
      name: 'Arena Fraudulenta',
      managerUserId: 'novo-dono-uid',
      unclaimed: true,
    }),
  );
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-fraudulenta-2'), {
      name: 'Arena Fraudulenta 2',
      managerUserId: 'novo-dono-uid',
      contactAthletesCount: 300,
    }),
  );
});

test('atleta continua lendo a arena pré-cadastrada (é o que a busca faz)', async () => {
  const db = athleteCtx().firestore();
  await assertSucceeds(getDoc(doc(db, 'arenas', 'pre-arena-beach-t3')));
});
