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
const rules = fs.readFileSync(
  path.join(__dirname, '../../firestore.rules'),
  'utf8',
);

const PROJECT_ID = 'nexago-plan-tier-gates-test';
const MANAGER_UID = 'manager-uid-1';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

function managerCtx() {
  return testEnv.authenticatedContext(MANAGER_UID);
}

/** Dono de arena recém-cadastrado (role `arena`), que é quem cria `arenas/{id}`. */
function arenaRoleCtx() {
  return testEnv.authenticatedContext('arena-owner-uid', { roles: ['arena'] });
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-elite'), {
      managerUserId: MANAGER_UID,
      planTier: 'elite',
      planStatus: 'active',
      courtsCount: 10,
    });
    await setDoc(doc(db, 'arenas', 'arena-parceiro'), {
      managerUserId: MANAGER_UID,
      planTier: 'parceiro',
      planStatus: 'active',
      courtsCount: 10,
    });
    await setDoc(doc(db, 'arenas', 'arena-pro'), {
      managerUserId: MANAGER_UID,
      planTier: 'pro',
      planStatus: 'active',
      courtsCount: 4,
    });
    await setDoc(doc(db, 'arenas', 'arena-pro-cheia'), {
      managerUserId: MANAGER_UID,
      planTier: 'pro',
      planStatus: 'active',
      courtsCount: 5,
    });
    await setDoc(doc(db, 'arenas', 'arena-starter'), {
      managerUserId: MANAGER_UID,
      planTier: 'starter',
      planStatus: 'active',
      courtsCount: 2,
    });
  });
}

before(seed);
after(() => testEnv.cleanup());

test('elite entra nos gates Pro+ (promotions create)', async () => {
  const db = managerCtx().firestore();
  await assertSucceeds(
    setDoc(doc(db, 'arenas', 'arena-elite', 'promotions', 'p1'), {
      createdAt: new Date(),
    }),
  );
});

test('parceiro (legado) segue nos gates Pro+ (promotions create)', async () => {
  const db = managerCtx().firestore();
  await assertSucceeds(
    setDoc(doc(db, 'arenas', 'arena-parceiro', 'promotions', 'p1'), {
      createdAt: new Date(),
    }),
  );
});

test('starter nao tem caps Pro (promotions create)', async () => {
  const db = managerCtx().firestore();
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-starter', 'promotions', 'p1'), {
      createdAt: new Date(),
    }),
  );
});

test('elite tem quadras ilimitadas, mesmo com 10', async () => {
  const db = managerCtx().firestore();
  await assertSucceeds(
    setDoc(doc(db, 'arenas', 'arena-elite', 'courts', 'c1'), {}),
  );
});

test('pro abaixo do teto (4 < 5) pode criar quadra', async () => {
  const db = managerCtx().firestore();
  await assertSucceeds(
    setDoc(doc(db, 'arenas', 'arena-pro', 'courts', 'c1'), {}),
  );
});

test('pro no teto de 5 nao pode criar quadra', async () => {
  const db = managerCtx().firestore();
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-pro-cheia', 'courts', 'c1'), {}),
  );
});

test('starter no teto de 2 nao pode criar quadra', async () => {
  const db = managerCtx().firestore();
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-starter', 'courts', 'c1'), {}),
  );
});

// Campos de plano definem preco (taxa 5% vs 8%, saque sem tarifa) e capabilities.
// Se o create aceitasse planTier do cliente, qualquer usuario com role `arena`
// nasceria Elite de graca — o update ja bloqueava, o create nao.
test('create de arena com planTier e negado (auto-promocao a Elite)', async () => {
  const db = arenaRoleCtx().firestore();
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-nova-elite'), {
      managerUserId: 'arena-owner-uid',
      name: 'Arena Nova',
      planTier: 'elite',
      planStatus: 'active',
    }),
  );
});

test('create de arena com planStatus e negado', async () => {
  const db = arenaRoleCtx().firestore();
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-nova-status'), {
      managerUserId: 'arena-owner-uid',
      name: 'Arena Nova',
      planStatus: 'active',
    }),
  );
});

test('create de arena com planActiveUntil e negado', async () => {
  const db = arenaRoleCtx().firestore();
  await assertFails(
    setDoc(doc(db, 'arenas', 'arena-nova-until'), {
      managerUserId: 'arena-owner-uid',
      name: 'Arena Nova',
      planActiveUntil: new Date(),
    }),
  );
});

test('create de arena sem campos de plano continua permitido', async () => {
  const db = arenaRoleCtx().firestore();
  await assertSucceeds(
    setDoc(doc(db, 'arenas', 'arena-nova-ok'), {
      managerUserId: 'arena-owner-uid',
      name: 'Arena Nova',
      courtsCount: 0,
    }),
  );
});
