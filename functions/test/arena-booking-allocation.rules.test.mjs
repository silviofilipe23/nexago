// "Como o atleta reserva" (reservas por capacidade): `arenas/{id}.bookingAllocation` só é gravado
// por `setArenaBookingAllocation` (Admin SDK). O dono segue salvando o resto do perfil com merge.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const OWNER_UID = 'arena-owner-uid';
const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-arena-booking-allocation-test',
  firestore: { rules },
});

const ALLOCATION = { mode: 'capacity', courtIds: ['c1'], priceBySport: { beachTennis: 120 } };

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'arenas', 'a1'), {
      managerUserId: OWNER_UID,
      name: 'Arena',
      bookingAllocation: ALLOCATION,
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('dono salva o perfil com merge sem mandar bookingAllocation', async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertSucceeds(setDoc(doc(db, 'arenas', 'a1'), { name: 'Arena Nova' }, { merge: true }));
});

test('dono não grava bookingAllocation pelo cliente', async () => {
  const db = testEnv.authenticatedContext(OWNER_UID).firestore();
  await assertFails(setDoc(doc(db, 'arenas', 'a1'), {
    bookingAllocation: { ...ALLOCATION, priceBySport: { beachTennis: 1 } },
  }, { merge: true }));
  await assertFails(setDoc(doc(db, 'arenas', 'a1'), { bookingAllocation: { mode: 'court' } }, { merge: true }));
});

test('arena nova não nasce com bookingAllocation', async () => {
  const db = testEnv.authenticatedContext('novo-dono', { roles: ['arena'] }).firestore();
  await assertFails(setDoc(doc(db, 'arenas', 'a2'), {
    managerUserId: 'novo-dono', name: 'Outra', bookingAllocation: ALLOCATION,
  }));
  await assertSucceeds(setDoc(doc(db, 'arenas', 'a3'), { managerUserId: 'novo-dono', name: 'Outra' }));
});
