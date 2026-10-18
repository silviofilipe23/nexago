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
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-squad-invites-test';
const CONVIDADO = 'convidado-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

const asAdmin = () => testEnv.authenticatedContext('admin-uid', { roles: ['admin'] }).firestore();
const asAthlete = (uid) => testEnv.authenticatedContext(uid, { roles: ['athlete'] }).firestore();

/** O doc bruto do convite guarda quem criou/reenviou/cancelou (`{uid, name}`), e o `name` pode
 *  ser o e-mail do operador do backoffice. O atleta lê o convite pela callable `viewSquadInvite`;
 *  o doc é só do backoffice. */
before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'squadInvites', 'inv1'), {
      athleteId: CONVIDADO,
      status: 'sent',
      createdBy: { uid: 'op-uid', name: 'operador@nexago.app' },
      resentBy: { uid: 'op-uid', name: 'operador@nexago.app' },
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('o próprio convidado não lê o doc bruto do convite', async () => {
  await assertFails(getDoc(doc(asAthlete(CONVIDADO), 'squadInvites', 'inv1')));
});

test('outro atleta e deslogado também não leem', async () => {
  await assertFails(getDoc(doc(asAthlete('outro-uid'), 'squadInvites', 'inv1')));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'squadInvites', 'inv1')));
});

test('o backoffice lê, mas ninguém grava pelo cliente', async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), 'squadInvites', 'inv1')));
  await assertFails(updateDoc(doc(asAdmin(), 'squadInvites', 'inv1'), { status: 'accepted' }));
  await assertFails(updateDoc(doc(asAthlete(CONVIDADO), 'squadInvites', 'inv1'), { status: 'accepted' }));
});
