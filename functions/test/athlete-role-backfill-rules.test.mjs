// `role`/`roles` em users/{uid} são congelados para o dono a partir da
// migração role -> roles[] (ver docs/superpowers/plans/2026-07-15-role-to-
// roles-migration.md, Task 8): o client NUNCA escreve `role`, e `roles` só
// pode aparecer no payload de update se for IDÊNTICO ao já salvo. Contas
// legadas sem `roles[]` são promovidas exclusivamente pela Cloud Function
// `grantAthleteRole` (Admin SDK, fora destas regras) — ver
// nexago_app/.../athlete_profile_repository.dart e
// functions/src/athlete-signup.ts. Este arquivo antes cobria um caminho de
// auto-backfill client-side que foi removido de propósito nessa migração;
// os casos abaixo cobrem o contrato atual.
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

// Doc legado: nunca teve `role`/`roles` gravado (pré-migração, ainda não
// passou pela Cloud Function `grantAthleteRole` nem pelo script de backfill).
const legacyDoc = {
  fullName: 'Atleta Legado',
  email: EMAIL,
  city: 'Goiânia',
};

await seed(legacyDoc);
await expect(
  'doc sem roles salvo: dono não pode setar roles direto (só grantAthleteRole via CF)',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      bio: 'novo bio',
      roles: ['athlete'],
    }),
  ),
);

await seed(legacyDoc);
await expect(
  'doc sem role salvo: dono não pode incluir role no payload',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), { bio: 'novo bio', role: 'athlete' }),
  ),
);

// Doc já no formato pós-migração (só `roles`, sem `role`): editar outro campo
// sem tocar roles continua funcionando — roles permanece idêntico após o merge.
await seed({ ...legacyDoc, roles: ['athlete'] });
await expect(
  'editar perfil sem tocar roles quando já existente (roles inalterado)',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), { bio: 'novo bio' }),
  ),
);

await seed({ ...legacyDoc, roles: ['athlete'] });
await expect(
  'roles já salvo não pode ser alterado pelo dono',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), { roles: ['admin'] }),
  ),
);

await seed({ ...legacyDoc, roles: ['athlete'] });
await expect(
  'dono não pode incluir role mesmo quando roles já existe',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), { role: 'athlete' }),
  ),
);

await testEnv.cleanup();

if (failures > 0) {
  console.error(`${failures} caso(s) falharam.`);
  process.exit(1);
}
console.log('Todos os casos passaram.');
