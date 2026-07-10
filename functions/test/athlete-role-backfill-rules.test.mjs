// Backfill de `role`/`roles` em contas antigas (pré 2026-07-06) que nunca
// tiveram esses campos gravados. Reproduz o bug relatado: `saveProfile`
// passou a enviar `role`/`roles` em todo save (não só na criação, ver
// nexago_app/.../athlete_profile_repository.dart) e a regra de update
// comparava direto com `resource.data.role`, que não existe nesses docs —
// evaluation error → permission-denied em qualquer edição de perfil.
// Rodar com o emulador: firebase emulators:exec --only firestore \
//   "node functions/test/athlete-role-backfill-rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(
  path.join(__dirname, '../../firestore.rules'),
  'utf8',
);

const PROJECT_ID = 'nexago-rules-test-role-backfill';
const UID = 'athlete-uid-legacy';
const EMAIL = 'legado@test.dev';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

async function seed(data) {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', UID), data);
  });
}

function ownerDb() {
  return testEnv.authenticatedContext(UID, { email: EMAIL }).firestore();
}

let failures = 0;
async function expect(label, assertion) {
  try {
    await assertion;
    console.log(`PASS ${label}`);
  } catch (e) {
    failures += 1;
    console.log(`FAIL ${label}: ${e.message}`);
  }
}

// Doc legado: nunca teve `role`/`roles` gravado (cenário do bug real).
const legacyDoc = {
  fullName: 'Atleta Legado',
  email: EMAIL,
  city: 'Goiânia',
};

// O backfill do app (saveProfile) grava role='athlete' + roles=['athlete']
// junto de um campo qualquer (ex.: bio) em toda edição de perfil.
await seed(legacyDoc);
await expect(
  'editar perfil com backfill de role/roles em doc legado (sem role salvo)',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      bio: 'novo bio',
      role: 'athlete',
      roles: ['athlete'],
    }),
  ),
);

// Doc já tem role/roles: comportamento de congelamento existente continua.
await seed({ ...legacyDoc, role: 'athlete', roles: ['athlete'] });
await expect(
  'editar perfil sem tocar role/roles quando já existentes',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), { bio: 'novo bio' }),
  ),
);

await seed({ ...legacyDoc, role: 'athlete', roles: ['athlete'] });
await expect(
  'role já salvo não pode ser alterado pelo dono',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), { role: 'admin' }),
  ),
);

// Backfill não pode ser usado para auto-promoção quando role nunca existiu.
await seed(legacyDoc);
await expect(
  'doc sem role salvo: backfill só pode gravar athlete (não admin)',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), { role: 'admin' }),
  ),
);

await seed(legacyDoc);
await expect(
  'doc sem roles salvo: backfill não pode incluir admin/arena/organizer',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), { roles: ['athlete', 'admin'] }),
  ),
);

await testEnv.cleanup();

if (failures > 0) {
  console.error(`${failures} caso(s) falharam.`);
  process.exit(1);
}
console.log('Todos os casos passaram.');
