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

// Mesmo atleta, mas com a 1ª inscrição ativa em VOLEI_PRAIA já disparada:
// o trigger do backend (Task 1) gravou o lock e a janela de correção
// fechou para esse esporte — volta a valer o ratchet de sempre.
const lockedUser = {
  ...baseUser,
  sportOnboarding: {
    ...baseUser.sportOnboarding,
    levelLocked: { VOLEI_PRAIA: true },
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

// Rebaixar nível global é bloqueado SEMPRE — campos legados não têm
// granularidade por esporte, então não acompanham a janela de correção
// (mesmo sem nenhum levelLocked gravado, como aqui).
await seed();
await expect(
  'rebaixar nível global (Intermediário → Iniciante), mesmo sem lock',
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

// Com o esporte locked (janela fechada), rebaixar continua bloqueado.
await seed(lockedUser);
await expect(
  'janela fechada (lock): rebaixar levelsBySport.VOLEI_PRAIA é bloqueado',
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
// Todos os esportes já locked (cenário comum: perfil ativo há tempo, cada
// um com sua 1ª inscrição já disparada) — testa o ratchet, não a janela.
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
    levelLocked: {
      VOLEI_PRAIA: true,
      FUTEVOLEI: true,
      FUTEBOL: true,
      TENIS: true,
      OUTROS: true,
    },
  },
};

// Com lock, rebaixar qualquer esporte do perfil continua bloqueado.
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
    levelLocked: { VOLEI_PRAIA: true },
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
    levelLocked: { VOLEI_PRAIA: true },
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

// Variante TRAVADA: com a janela de correção (levelLocked), rebaixar um
// esporte destravado passou a ser PERMITIDO — então os casos de negação
// deste bloco precisam de um perfil com todos os esportes já travados,
// senão testariam o oposto do que afirmam.
const allSportsLockedUser = {
  ...allSportsUser,
  sportOnboarding: {
    ...allSportsUser.sportOnboarding,
    levelLocked: Object.fromEntries(ALL_SPORTS.map((s) => [s, true])),
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

await seed(allSportsLockedUser);
await expect(
  'rebaixar 1 esporte travado é negado pela REGRA, não pelo teto de expressões',
  assertDeniedByRule(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'iniciante_1',
    }),
  ),
);

// ── Janela de correção (levelLocked) ──────────────────────────────────────
// Task 1 grava o lock só no backend, no gatilho da 1ª inscrição ativa.
// Enquanto o esporte não tem o lock, o dono pode descer (autocorreção da
// calibração inicial); uma vez locked, volta o ratchet de sempre. O dono
// nunca escreve o lock em si — só o backend.

await seed(baseUser); // sem lock: janela aberta para VOLEI_PRAIA
await expect(
  'janela aberta: descer levelsBySport.VOLEI_PRAIA sem lock é permitido',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'iniciante_1',
    }),
  ),
);

await seed(allSportsLockedUser);
await expect(
  'entre 5 esportes alterados, 1 rebaixado travado é negado pela REGRA',
  assertDeniedByRule(
    updateDoc(doc(ownerDb(), 'users', UID), {
      ...raisePatch(ALL_SPORTS.slice(0, 4)),
      'sportOnboarding.levelsBySport.FUTEBOL': 'iniciante_1',
    }),
  ),
);

await seed(lockedUser);
await expect(
  'janela fechada (lock): subir levelsBySport.VOLEI_PRAIA continua permitido',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'open',
    }),
  ),
);

await seed(baseUser);
await expect(
  'dono não pode gravar sportOnboarding.levelLocked (só o backend escreve)',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelLocked.VOLEI_PRAIA': true,
    }),
  ),
);

// A propriedade de segurança crítica é o inverso do caso acima: um esporte
// JÁ TRAVADO em que o dono tenta se destravar (direto no valor, ou por
// baixo — reescrevendo `sportOnboarding` inteiro sem a chave `levelLocked`,
// caminho de um app antigo/merge que "esquece" o mapa). As duas formas têm
// de continuar negadas mesmo se `athleteLevelsNotDowngraded()` ou
// `levelLockedUnchanged()` forem refatoradas no futuro.
await seed(lockedUser);
await expect(
  'dono não pode destravar sportOnboarding.levelLocked.VOLEI_PRAIA (true → false)',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelLocked.VOLEI_PRAIA': false,
    }),
  ),
);

await seed(lockedUser);
await expect(
  'dono não pode apagar o mapa levelLocked reescrevendo sportOnboarding sem a chave',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      sportOnboarding: {
        version: 1,
        primarySportId: 'VOLEI_PRAIA',
        secondarySportIds: [],
        levelsBySport: { VOLEI_PRAIA: 'intermediario' },
        // Sem `levelLocked`: simula um client que reenvia o objeto inteiro
        // sem conhecer a flag e derruba o mapa no merge implícito do
        // updateDoc (o campo top-level `sportOnboarding` é substituído).
      },
    }),
  ),
);

await seed(lockedUser);
await expect(
  'dono pode regravar levelLocked idêntico ao mexer noutro campo',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      bio: 'atualizando outra coisa',
      'sportOnboarding.levelLocked': { VOLEI_PRAIA: true },
    }),
  ),
);

// ── Marcador de escrita privilegiada (levelChangeBy) ──────────────────────
// F4 (review pós-calibração de nível, 2ª volta): `setAthleteLevel` (admin/organizador) grava
// `sportOnboarding.levelChangeBy` na MESMA escrita que muda `levelsBySport`, pra o trigger
// `onUserWrittenTrackLevelChanges` (rating-triggers.ts) distinguir essa escrita de uma
// autocorreção do próprio atleta — e depois o backend apaga o marcador. Mesmo padrão de
// `levelLockedUnchanged()` acima: o dono nunca grava, altera nem apaga esse campo.

await seed(baseUser); // sem marcador
await expect(
  'dono não pode gravar sportOnboarding.levelChangeBy (só o backend escreve)',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelChangeBy': 'admin',
    }),
  ),
);

// Doc com o marcador já presente (janela entre a escrita privilegiada e o backend limpar) — o
// dono não pode alterar o VALOR nem "limpar" por conta própria enquanto ele existe.
const privilegedMarkerUser = {
  ...baseUser,
  sportOnboarding: { ...baseUser.sportOnboarding, levelChangeBy: 'admin' },
};

await seed(privilegedMarkerUser);
await expect(
  'dono não pode trocar o valor de sportOnboarding.levelChangeBy já presente',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      'sportOnboarding.levelChangeBy': 'organizer',
    }),
  ),
);

await seed(privilegedMarkerUser);
await expect(
  'dono não pode apagar sportOnboarding.levelChangeBy reescrevendo sportOnboarding sem a chave',
  assertFails(
    updateDoc(doc(ownerDb(), 'users', UID), {
      sportOnboarding: {
        version: 1,
        primarySportId: 'VOLEI_PRAIA',
        secondarySportIds: [],
        levelsBySport: { VOLEI_PRAIA: 'intermediario' },
        // Sem `levelChangeBy`: mesmo golpe testado acima para `levelLocked` —
        // reescrever o objeto inteiro sem a chave derruba o campo no merge implícito.
      },
    }),
  ),
);

// Propriedade central: uma escrita legítima do dono que NÃO toca levelChangeBy continua
// passando mesmo com o marcador presente no doc — "deixar como está" nunca é bloqueado, só
// "mudar o valor" é.
await seed(privilegedMarkerUser);
await expect(
  'dono pode salvar o próprio perfil sem tocar levelChangeBy, mesmo com o marcador presente',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), { bio: 'atualizando outra coisa' }),
  ),
);

await seed(privilegedMarkerUser);
await expect(
  'dono pode regravar levelChangeBy idêntico ao mexer noutro campo',
  assertSucceeds(
    updateDoc(doc(ownerDb(), 'users', UID), {
      bio: 'atualizando outra coisa',
      'sportOnboarding.levelChangeBy': 'admin',
    }),
  ),
);

// Super admin pode rebaixar mesmo com o esporte locked E mexer no próprio
// levelLocked (canal de suporte) — o payload toca os dois campos que o
// dono nunca poderia tocar juntos, provando o bypass de
// athleteLevelsNotDowngraded() E de levelLockedUnchanged() de verdade (não
// só o primeiro — um payload que só mexesse em levelsBySport não
// exercitaria levelLockedUnchanged() nenhuma vez).
await seed(multiSportUser);
await expect(
  'super admin rebaixa nível e destrava o esporte no mesmo update (bypass)',
  assertSucceeds(
    updateDoc(
      doc(
        testEnv
          .authenticatedContext('support-admin', { superAdmin: true })
          .firestore(),
        'users',
        UID,
      ),
      {
        'sportOnboarding.levelsBySport.FUTEVOLEI': 'iniciante_1',
        'sportOnboarding.levelLocked.FUTEVOLEI': false,
      },
    ),
  ),
);

// F10 (review): `isPartnerPreRegistrationUpdateByInviter` é um `||` ALTERNATIVO ao branch do
// dono — sem `levelLockedUnchanged()` nele, o convidador de um pré-cadastro de parceiro (doc
// stub, sem conta própria ainda) podia alterar `sportOnboarding.levelLocked` da vítima na
// mesma tacada, campo que é backend-only em QUALQUER outro branch desta regra. Nenhum teste
// deste arquivo cobria este branch antes.
const STUB_UID = 'partner-stub-uid';
const INVITER_UID = 'inviter-uid-1';
const partnerStubUser = {
  roles: ['athlete'],
  fullName: 'Convidado Pendente',
  email: 'convidado@test.dev',
  partnerInviteStatus: 'pending',
  invitedByUid: INVITER_UID,
};

async function seedPartnerStub() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', STUB_UID), partnerStubUser);
  });
}

function inviterDb() {
  return testEnv.authenticatedContext(INVITER_UID, {}).firestore();
}

await seedPartnerStub();
await expect(
  'convidador atualiza o pré-cadastro do parceiro sem tocar levelLocked: permitido',
  assertSucceeds(
    updateDoc(doc(inviterDb(), 'users', STUB_UID), { city: 'Goiânia' }),
  ),
);

await seedPartnerStub();
await expect(
  'convidador NÃO pode alterar sportOnboarding.levelLocked do pré-cadastro do parceiro',
  assertFails(
    updateDoc(doc(inviterDb(), 'users', STUB_UID), {
      'sportOnboarding.levelLocked.VOLEI_PRAIA': true,
    }),
  ),
);

// Mesmo raciocínio do F10 acima, agora para o marcador (F4, 2ª volta): o convidador não é o
// backend — não pode estampar `levelChangeBy` no pré-cadastro da vítima.
await seedPartnerStub();
await expect(
  'convidador NÃO pode alterar sportOnboarding.levelChangeBy do pré-cadastro do parceiro',
  assertFails(
    updateDoc(doc(inviterDb(), 'users', STUB_UID), {
      'sportOnboarding.levelChangeBy': 'admin',
    }),
  ),
);

await testEnv.cleanup();

if (failures > 0) {
  console.error(`${failures} caso(s) falharam.`);
  process.exit(1);
}
console.log('Todos os casos passaram.');
