// Verificação de telefone (Firebase Phone Auth): `phoneNumber`, `phoneVerified`
// e `phoneVerifiedAt` em users/{userId} só podem ser gravados pela Cloud
// Function `confirmPhoneVerification` (Admin SDK, que bypassa rules) — o
// dono da conta não pode se auto-declarar verificado direto pelo client.
// Rodar com o emulador: firebase emulators:exec --only firestore \
//   "node functions/test/athlete-phone-verification-rules.test.mjs"
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

const PROJECT_ID = 'nexago-rules-test-phone-verification';
const UID = 'athlete-uid-phone';
const EMAIL = 'phone@test.dev';

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

const baseDoc = {
  fullName: 'Atleta Telefone',
  email: EMAIL,
  roles: ['athlete'],
};

// Criar um doc novo já "nascendo" verificado deve ser bloqueado.
await expect(
  'não pode criar users/{uid} já com phoneVerified true',
  assertFails(
    setDoc(doc(ownerDb(), 'users', UID), {
      ...baseDoc,
      phoneNumber: '+5562999999999',
      phoneVerified: true,
    }),
  ),
);

// Criar um doc sem esses campos continua permitido.
await expect(
  'pode criar users/{uid} sem campos de telefone verificado',
  assertSucceeds(setDoc(doc(ownerDb(), 'users', UID), baseDoc)),
);

// Dono não pode se auto-declarar verificado num doc existente.
await seed(baseDoc);
await expect(
  'dono não pode setar phoneVerified:true por conta própria',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      phoneNumber: '+5562999999999',
      phoneVerified: true,
    }),
  ),
);

// Dono também não pode gravar phoneVerifiedAt sozinho.
await seed(baseDoc);
await expect(
  'dono não pode gravar phoneVerifiedAt por conta própria',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      phoneVerifiedAt: new Date(),
    }),
  ),
);

// Depois que a Cloud Function já verificou (seed direto, simulando Admin SDK),
// o dono pode continuar editando o resto do perfil sem tocar nesses campos.
await seed({
  ...baseDoc,
  phoneNumber: '+5562999999999',
  phoneVerified: true,
});
await expect(
  'dono edita outros campos do perfil sem mexer no telefone verificado',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), { bio: 'jogo de zaga' }),
  ),
);

// Reafirmar exatamente o mesmo valor (merge idempotente) continua permitido.
await seed({
  ...baseDoc,
  phoneNumber: '+5562999999999',
  phoneVerified: true,
});
await expect(
  'dono pode reafirmar o mesmo valor de phoneNumber/phoneVerified (merge)',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      phoneNumber: '+5562999999999',
      phoneVerified: true,
    }),
  ),
);

// Mas não pode alterar um telefone já verificado pra outro valor.
await seed({
  ...baseDoc,
  phoneNumber: '+5562999999999',
  phoneVerified: true,
});
await expect(
  'dono não pode trocar phoneNumber já verificado por conta própria',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      phoneNumber: '+5562988888888',
    }),
  ),
);

await testEnv.cleanup();

if (failures > 0) {
  console.error(`${failures} caso(s) falharam.`);
  process.exit(1);
}
console.log('Todos os casos passaram.');
