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

const baseUser = {
  fullName: 'Atleta Teste',
  email: 'atleta@test.dev',
  role: 'athlete',
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
  role: 'athlete',
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

await testEnv.cleanup();

if (failures > 0) {
  console.error(`${failures} caso(s) falharam.`);
  process.exit(1);
}
console.log('Todos os casos passaram.');
