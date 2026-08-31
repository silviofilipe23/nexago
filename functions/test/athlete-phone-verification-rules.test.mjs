// Telefone em users/{userId}: `phoneVerified` e `phoneVerifiedAt` só podem ser
// gravados pela Cloud Function `confirmPhoneVerification` (Admin SDK, que
// bypassa rules) — o dono da conta não pode se auto-declarar verificado direto
// pelo client.
//
// `phoneNumber` é diferente desde que o SMS deixou de ser obrigatório para
// inscrição: o dono declara o número livremente ENQUANTO não estiver
// verificado. Depois do selo, o número volta a ser imutável pelo client — senão
// dava para verificar um número e trocar por outro mantendo `phoneVerified`.
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

// --- Telefone declarado (sem SMS) ---------------------------------------

// Doc novo pode nascer com o número declarado, desde que sem o selo.
await testEnv.clearFirestore();
await expect(
  'pode criar users/{uid} com phoneNumber declarado (sem selo)',
  assertSucceeds(
    setDoc(doc(ownerDb(), 'users', UID), {
      ...baseDoc,
      phoneNumber: '(62) 99999-9999',
    }),
  ),
);

// Conta sem verificação: o dono declara o WhatsApp de contato.
await seed(baseDoc);
await expect(
  'dono declara phoneNumber sem verificação por SMS',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      phoneNumber: '(62) 99999-9999',
    }),
  ),
);

// E pode corrigir um número declarado errado, enquanto não verificou.
await seed({ ...baseDoc, phoneNumber: '(62) 99999-9999', phoneVerified: false });
await expect(
  'dono corrige o phoneNumber declarado enquanto não verificou',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      phoneNumber: '(62) 98888-8888',
    }),
  ),
);

// Declarar o número não pode vir junto com o selo.
await seed(baseDoc);
await expect(
  'declarar phoneNumber não autoriza phoneVerified junto',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      phoneNumber: '(62) 99999-9999',
      phoneVerified: true,
    }),
  ),
);

await testEnv.cleanup();

if (failures > 0) {
  console.error(`${failures} caso(s) falharam.`);
  process.exit(1);
}
console.log('Todos os casos passaram.');
