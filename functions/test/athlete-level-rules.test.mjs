// Regra "nível só sobe" (anti-sandbagging) em users/{uid}.
// Rodar com o emulador: firebase emulators:exec --only firestore \
//   "node functions/test/athlete-level-rules.test.mjs"
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

const PROJECT_ID = 'nexago-rules-test-levels';
const UID = 'athlete-uid-1';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

// Sem o campo legado `role`: desde a migração role→roles as rules exigem
// `!('role' in request.resource.data)` — um doc com `role` residual tem TODO
// update negado (comportamento intencional; app antigo pré-15/07).
const baseUser = {
  fullName: 'Atleta Teste',
  email: 'atleta@test.dev',
  roles: ['athlete'],
  city: 'Goiânia',
  level: 'Intermediário',
  sportProfile: { level: 'intermediario' },
  sportOnboarding: {
    version: 1,
    primarySportId: 'VOLEI_PRAIA',
    secondarySportIds: [],
    levelsBySport: { VOLEI_PRAIA: 'intermediario' },
  },
};

async function seed(data = baseUser) {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', UID), data);
  });
}

function ownerDb() {
  return testEnv.authenticatedContext(UID, { email: baseUser.email }).firestore();
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

// Campos não relacionados seguem editáveis.
await seed();
await expect(
  'atualizar bio sem tocar nível',
  assertSucceeds(updateDoc(doc(ownerDb(), 'users', UID), { bio: 'oi' })),
);

// Subir nível é permitido.
await seed();
await expect(
  'subir nível global (Intermediário → Open)',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      level: 'Open',
      'sportProfile.level': 'open',
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'open',
    }),
  ),
);

// Rebaixar nível global é bloqueado.
await seed();
await expect(
  'rebaixar nível global (Intermediário → Iniciante)',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), { level: 'Iniciante' }),
  ),
);

// Rebaixar sportProfile.level é bloqueado.
await seed();
await expect(
  'rebaixar sportProfile.level',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportProfile.level': 'iniciante',
    }),
  ),
);

// Rebaixar nível por esporte é bloqueado.
await seed();
await expect(
  'rebaixar levelsBySport.VOLEI_PRAIA',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'iniciante',
    }),
  ),
);

// Primeira definição de nível em esporte novo é livre.
await seed();
await expect(
  'primeira definição em esporte novo (BEACH_TENNIS)',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.BEACH_TENNIS': 'iniciante',
    }),
  ),
);

// Doc sem nível salvo (pós-cadastro, pré-onboarding): definir é livre.
await seed({
  fullName: 'Novato',
  email: 'atleta@test.dev',
  roles: ['athlete'],
});
await expect(
  'onboarding define nível pela primeira vez',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      level: 'Open',
      sportProfile: { level: 'open' },
      sportOnboarding: {
        version: 1,
        primarySportId: 'VOLEI_PRAIA',
        secondarySportIds: [],
        levelsBySport: { VOLEI_PRAIA: 'open' },
      },
    }),
  ),
);

// Sobrescrever nível conhecido por valor inválido é bloqueado.
await seed();
await expect(
  'nível conhecido → valor inválido é bloqueado',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), { level: 'xpto' }),
  ),
);

// ── Guarda estendida a TODOS os esportes do perfil ────────────────────────
const multiSportUser = {
  ...baseUser,
  sportOnboarding: {
    version: 1,
    primarySportId: 'VOLEI_PRAIA',
    secondarySportIds: ['FUTEVOLEI', 'FUTEBOL', 'TENIS', 'OUTROS'],
    levelsBySport: {
      VOLEI_PRAIA: 'intermediario_1',
      FUTEVOLEI: 'intermediario_2',
      FUTEBOL: 'open',
      TENIS: 'iniciante_2',
      OUTROS: 'intermediario_1',
    },
  },
};

for (const [sportId, lower] of [
  ['FUTEVOLEI', 'intermediario_1'],
  ['FUTEBOL', 'intermediario_2'],
  ['TENIS', 'iniciante_1'],
  ['OUTROS', 'iniciante_2'],
]) {
  await seed(multiSportUser);
  await expect(
    `rebaixar levelsBySport.${sportId} é bloqueado`,
    assertFails(
      updateDoc(doc(ownerDb(), 'users', UID), {
        [`sportOnboarding.levelsBySport.${sportId}`]: lower,
      }),
    ),
  );
}

await seed(multiSportUser);
await expect(
  'subir levelsBySport.FUTEVOLEI é permitido',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.FUTEVOLEI': 'open',
    }),
  ),
);

// Rewrite de MESMO rank é permitido (app antigo regravando código legado).
await seed(multiSportUser);
await expect(
  'rewrite de mesmo rank (intermediario_1 → intermediario) é permitido',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'intermediario',
    }),
  ),
);

// Super admin pode rebaixar (canal de suporte).
await seed(multiSportUser);
await expect(
  'super admin rebaixa nível (bypass)',
  assertSucceeds(
    updateDoc(
      doc(
        testEnv
          .authenticatedContext('support-admin', { superAdmin: true })
          .firestore(),
        'users',
        UID,
      ),
      { 'sportOnboarding.levelsBySport.FUTEVOLEI': 'iniciante_1' },
    ),
  ),
);

await testEnv.cleanup();

if (failures > 0) {
  console.error(`${failures} caso(s) falharam.`);
  process.exit(1);
}
console.log('Todos os casos passaram.');
