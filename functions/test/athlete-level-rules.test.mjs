// Regra "nível só sobe" (anti-sandbagging) em users/{uid}.
// Rodar com o emulador: firebase emulators:exec --only firestore \
//   "node functions/test/athlete-level-rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
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

// O `assertFails` da lib não distingue "a regra disse não" de "o orçamento de
// 1000 expressões por request acabou no meio da avaliação" — os dois chegam
// como PERMISSION_DENIED. Um teste de ratchet que passa por exaustão de
// orçamento não prova nada: passaria igual com a guarda inteira apagada. Foi
// exatamente assim que o estouro se escondeu até 17/08/2026, com o suite
// verde. Toda negação esperada aqui passa por este helper, que exige a
// negação PELA REGRA — é ele que transforma o teto de expressões em teste
// vermelho em vez de falso verde.
async function assertDeniedByRule(promise) {
  try {
    await promise;
  } catch (e) {
    const message = String(e.message || e);
    if (/maximum of \d+ expressions/i.test(message)) {
      throw new Error(
        'negado por estouro do teto de expressões, não pela regra de nível',
      );
    }
    if (e.code === 'permission-denied' || /PERMISSION_DENIED/.test(message)) {
      return;
    }
    throw new Error(`negado, mas por erro inesperado: ${message}`);
  }
  throw new Error('esperava negação, mas o write passou');
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
  assertDeniedByRule(
    updateDoc(doc(ownerDb(), 'users', UID), { level: 'Iniciante' }),
  ),
);

// Rebaixar sportProfile.level é bloqueado.
await seed();
await expect(
  'rebaixar sportProfile.level',
  assertDeniedByRule(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportProfile.level': 'iniciante',
    }),
  ),
);

// Rebaixar nível por esporte é bloqueado.
await seed();
await expect(
  'rebaixar levelsBySport.VOLEI_PRAIA',
  assertDeniedByRule(
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
  assertDeniedByRule(
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
    assertDeniedByRule(
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

// ── Escada de 7: Avançado 1/2 (4/5) e Open (rank 6) ────────────────────────
const avancado2User = {
  ...baseUser,
  level: 'Avançado 2',
  sportProfile: { level: 'avancado_2' },
  sportOnboarding: {
    version: 1,
    primarySportId: 'VOLEI_PRAIA',
    secondarySportIds: [],
    levelsBySport: { VOLEI_PRAIA: 'avancado_2' },
  },
};

const openUser = {
  ...baseUser,
  level: 'Open',
  sportProfile: { level: 'open' },
  sportOnboarding: {
    version: 1,
    primarySportId: 'VOLEI_PRAIA',
    secondarySportIds: [],
    levelsBySport: { VOLEI_PRAIA: 'open' },
  },
};

await seed();
await expect(
  'subir para Avançado 1 (avancado_1) é permitido',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'avancado_1',
    }),
  ),
);

await seed(avancado2User);
await expect(
  'descer de Avançado 2 para Avançado 1 é bloqueado',
  assertDeniedByRule(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'avancado_1',
    }),
  ),
);

await seed(openUser);
await expect(
  'descer de Open para Avançado 2 é bloqueado',
  assertDeniedByRule(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'avancado_2',
    }),
  ),
);

await seed(avancado2User);
await expect(
  'subir de Avançado 2 para Open é permitido',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'open',
    }),
  ),
);

// ── Orçamento de expressões (teto de 1000 por request) ────────────────────
// A guarda enumera os 9 esportes; cada esporte que MUDA paga dois lookups de
// rank. Um perfil completo editado de uma vez ("editar todos os meus
// esportes") tem que caber no teto, e a negação de um rebaixamento tem que
// vir da REGRA — não do orçamento estourado no meio do caminho.
const ALL_SPORTS = [
  'VOLEI_PRAIA', 'VOLEI_QUADRA', 'BEACH_TENNIS', 'FUTEVOLEI', 'FUTEBOL',
  'BASQUETE', 'TENIS', 'CORRIDA', 'OUTROS',
];

const allSportsUser = {
  ...baseUser,
  sportOnboarding: {
    version: 1,
    primarySportId: 'VOLEI_PRAIA',
    secondarySportIds: ALL_SPORTS.slice(1),
    levelsBySport: Object.fromEntries(
      ALL_SPORTS.map((s) => [s, 'intermediario_1']),
    ),
  },
};

function raisePatch(sportIds, level = 'intermediario_2') {
  return Object.fromEntries(
    sportIds.map((s) => [`sportOnboarding.levelsBySport.${s}`, level]),
  );
}

for (const n of [5, 9]) {
  await seed(allSportsUser);
  await expect(
    `subir ${n} esportes numa tacada só é permitido`,
    assertSucceeds(
      updateDoc(doc(ownerDb(), 'users', UID), raisePatch(ALL_SPORTS.slice(0, n))),
    ),
  );
}

await seed(allSportsUser);
await expect(
  'rebaixar 1 esporte é negado pela REGRA, não pelo teto de expressões',
  assertDeniedByRule(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'iniciante_1',
    }),
  ),
);

await seed(allSportsUser);
await expect(
  'entre 5 esportes alterados, 1 rebaixado é negado pela REGRA',
  assertDeniedByRule(
    updateDoc(doc(ownerDb(), 'users', UID), {
      ...raisePatch(ALL_SPORTS.slice(0, 4)),
      'sportOnboarding.levelsBySport.FUTEBOL': 'iniciante_1',
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
