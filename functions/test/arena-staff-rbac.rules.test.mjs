import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-arena-staff-rbac-test';
const OWNER = 'owner-uid';
const GESTOR = 'gestor-uid';
const RECEPCAO = 'recepcao-uid';
const FINANCEIRO = 'financeiro-uid';
const MANUTENCAO = 'manutencao-uid';
const ESTRANHO = 'estranho-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

/** Arena Pro ativa, com um membro de cada cargo. */
async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-pro'), {
      managerUserId: OWNER,
      name: 'Arena Pro',
      planTier: 'pro',
      planStatus: 'active',
      courtsCount: 3,
    });
    // Arena sem plano: os mesmos membros existem, mas o gate de titularidade derruba.
    await setDoc(doc(db, 'arenas', 'arena-sem-plano'), {
      managerUserId: OWNER,
      name: 'Arena Sem Plano',
      courtsCount: 1,
    });
    const membros = [
      [GESTOR, 'gestor'],
      [RECEPCAO, 'recepcao'],
      [FINANCEIRO, 'financeiro'],
      [MANUTENCAO, 'manutencao'],
    ];
    for (const [uid, role] of membros) {
      for (const arenaId of ['arena-pro', 'arena-sem-plano']) {
        await setDoc(doc(db, 'arenas', arenaId, 'staff', uid), {
          role,
          status: 'active',
          email: `${role}@arena.com`,
          displayName: role,
          addedBy: OWNER,
        });
      }
    }
    await setDoc(doc(db, 'arenaStaffInvites', 'convite-1'), {
      arenaId: 'arena-pro',
      arenaName: 'Arena Pro',
      emailLower: 'novo@arena.com',
      role: 'recepcao',
      status: 'pending',
      invitedBy: OWNER,
    });
    await setDoc(doc(db, 'users', GESTOR, 'arenaStaff', 'arena-pro'), {
      role: 'gestor',
      status: 'active',
      arenaName: 'Arena Pro',
    });
    // Convite malformado (sem emailLower) — nao pode ser legivel por ninguem
    // alem do dono/admin, nem por sessao sem e-mail.
    await setDoc(doc(db, 'arenaStaffInvites', 'convite-sem-email'), {
      arenaId: 'arena-pro',
      arenaName: 'Arena Pro',
      role: 'recepcao',
      status: 'pending',
      invitedBy: OWNER,
    });
  });
}

before(async () => {
  await seed();
});

after(async () => {
  await testEnv.cleanup();
});

function ctx(uid, extra = {}) {
  return testEnv.authenticatedContext(uid, { roles: ['arena'], ...extra }).firestore();
}

test('dono le a subcolecao staff', async () => {
  await assertSucceeds(getDoc(doc(ctx(OWNER), 'arenas/arena-pro/staff/' + GESTOR)));
});

test('membro le o proprio doc de staff', async () => {
  await assertSucceeds(getDoc(doc(ctx(GESTOR), 'arenas/arena-pro/staff/' + GESTOR)));
});

test('membro nao le o doc de staff de outro', async () => {
  await assertFails(getDoc(doc(ctx(RECEPCAO), 'arenas/arena-pro/staff/' + GESTOR)));
});

test('ninguem escreve direto na subcolecao staff, nem o dono', async () => {
  await assertFails(
    setDoc(doc(ctx(OWNER), 'arenas/arena-pro/staff/' + ESTRANHO), {
      role: 'gestor',
      status: 'active',
    }),
  );
});

test('gestor nao se promove trocando o proprio cargo', async () => {
  await assertFails(
    setDoc(doc(ctx(GESTOR), 'arenas/arena-pro/staff/' + GESTOR), {
      role: 'gestor',
      status: 'active',
    }),
  );
});

test('dono le convites da propria arena', async () => {
  await assertSucceeds(getDoc(doc(ctx(OWNER), 'arenaStaffInvites/convite-1')));
});

test('convidado le o convite pelo proprio email', async () => {
  const db = testEnv
    .authenticatedContext('novo-uid', { email: 'novo@arena.com' })
    .firestore();
  await assertSucceeds(getDoc(doc(db, 'arenaStaffInvites/convite-1')));
});

test('terceiro nao le convite alheio', async () => {
  const db = testEnv
    .authenticatedContext(ESTRANHO, { email: 'outro@arena.com' })
    .firestore();
  await assertFails(getDoc(doc(db, 'arenaStaffInvites/convite-1')));
});

test('cliente nao escreve convite', async () => {
  await assertFails(
    setDoc(doc(ctx(OWNER), 'arenaStaffInvites/convite-2'), {
      arenaId: 'arena-pro',
      emailLower: 'x@y.com',
      role: 'gestor',
      status: 'pending',
    }),
  );
});

test('sessao sem e-mail nao le convite malformado sem emailLower', async () => {
  const db = testEnv.authenticatedContext('phone-uid').firestore();
  await assertFails(getDoc(doc(db, 'arenaStaffInvites/convite-sem-email')));
});

test('sessao sem e-mail nao le convite normal', async () => {
  const db = testEnv.authenticatedContext('phone-uid-2').firestore();
  await assertFails(getDoc(doc(db, 'arenaStaffInvites/convite-1')));
});

test('sessao com e-mail vazio nao le convite malformado', async () => {
  const db = testEnv.authenticatedContext('empty-email-uid', { email: '' }).firestore();
  await assertFails(getDoc(doc(db, 'arenaStaffInvites/convite-sem-email')));
});

test('dono ainda le o convite malformado da propria arena', async () => {
  await assertSucceeds(getDoc(doc(ctx(OWNER), 'arenaStaffInvites/convite-sem-email')));
});

test('usuario le o proprio espelho de arenaStaff', async () => {
  await assertSucceeds(getDoc(doc(ctx(GESTOR), `users/${GESTOR}/arenaStaff/arena-pro`)));
});

test('usuario nao le o espelho de outro', async () => {
  await assertFails(getDoc(doc(ctx(RECEPCAO), `users/${GESTOR}/arenaStaff/arena-pro`)));
});

test('cliente nao escreve no espelho', async () => {
  await assertFails(
    setDoc(doc(ctx(GESTOR), `users/${GESTOR}/arenaStaff/arena-pro`), { role: 'gestor' }),
  );
});

// ---- matriz cargo x area -------------------------------------------------

// `isValidArenaComandaCreate` (firestore.rules:468) exige 15 campos e
// `type == 'individual'`; este helper monta um payload que passa em tudo,
// para que o único fator sob teste seja a identidade de quem escreve.
function comandaPayload(uid, arenaId, displayNumber) {
  const agora = new Date();
  return {
    arenaId,
    displayNumber,
    type: 'individual',
    status: 'open',
    customerName: 'Cliente Teste',
    allowAppOrders: false,
    rentalCents: 0,
    itemsTotalCents: 0,
    totalCents: 0,
    itemsCount: 0,
    openedByUid: uid,
    openedAt: agora,
    createdAt: agora,
    updatedAt: agora,
  };
}

test('recepcao cria comanda; manutencao nao', async () => {
  await assertSucceeds(
    setDoc(
      doc(ctx(RECEPCAO), 'arenaComandas/comanda-recepcao'),
      comandaPayload(RECEPCAO, 'arena-pro', 101),
    ),
  );
  await assertFails(
    setDoc(
      doc(ctx(MANUTENCAO), 'arenaComandas/comanda-manutencao'),
      comandaPayload(MANUTENCAO, 'arena-pro', 102),
    ),
  );
});

test('manutencao edita quadra; recepcao nao', async () => {
  await assertSucceeds(
    setDoc(doc(ctx(MANUTENCAO), 'arenas/arena-pro/courts/quadra-1'), { name: 'Quadra 1' }),
  );
  await assertFails(
    setDoc(doc(ctx(RECEPCAO), 'arenas/arena-pro/courts/quadra-2'), { name: 'Quadra 2' }),
  );
});

test('financeiro le a carteira; recepcao nao', async () => {
  await assertSucceeds(getDoc(doc(ctx(FINANCEIRO), 'arenaWallets/arena-pro')));
  await assertFails(getDoc(doc(ctx(RECEPCAO), 'arenaWallets/arena-pro')));
});

test('gestor le a carteira mas nao saca', async () => {
  await assertSucceeds(getDoc(doc(ctx(GESTOR), 'arenaWallets/arena-pro')));
  await assertFails(
    setDoc(doc(ctx(GESTOR), 'arenaWithdrawals/saque-1'), {
      arenaId: 'arena-pro',
      amountCents: 1000,
      status: 'pending',
    }),
  );
});

test('nenhum cargo cria saque; so o dono', async () => {
  for (const uid of [GESTOR, RECEPCAO, FINANCEIRO, MANUTENCAO]) {
    await assertFails(
      setDoc(doc(ctx(uid), 'arenaWithdrawals/saque-' + uid), {
        arenaId: 'arena-pro',
        amountCents: 1000,
        status: 'pending',
      }),
    );
  }
});

test('gestor edita o perfil da arena; financeiro nao', async () => {
  await assertSucceeds(
    setDoc(
      doc(ctx(GESTOR), 'arenas/arena-pro'),
      { managerUserId: OWNER, name: 'Arena Pro Editada', courtsCount: 3 },
      { merge: true },
    ),
  );
  await assertFails(
    setDoc(
      doc(ctx(FINANCEIRO), 'arenas/arena-pro'),
      { managerUserId: OWNER, name: 'Nao Deveria', courtsCount: 3 },
      { merge: true },
    ),
  );
});

test('nenhum cargo se auto-promove mexendo em planTier', async () => {
  await assertFails(
    setDoc(
      doc(ctx(GESTOR), 'arenas/arena-pro'),
      { managerUserId: OWNER, planTier: 'elite', courtsCount: 3 },
      { merge: true },
    ),
  );
});

test('membro de arena sem plano perde tudo', async () => {
  await assertFails(
    setDoc(
      doc(ctx(RECEPCAO), 'arenaComandas/comanda-sem-plano'),
      comandaPayload(RECEPCAO, 'arena-sem-plano', 103),
    ),
  );
  await assertFails(
    setDoc(doc(ctx(MANUTENCAO), 'arenas/arena-sem-plano/courts/q1'), { name: 'Q1' }),
  );
});

test('dono de arena sem plano continua podendo tudo que ja podia', async () => {
  await assertSucceeds(
    setDoc(doc(ctx(OWNER), 'arenas/arena-sem-plano/courts/q1'), { name: 'Q1' }),
  );
});

test('membro de uma arena nao alcanca outra arena', async () => {
  await testEnv.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'arenas', 'arena-alheia'), {
      managerUserId: 'outro-dono',
      name: 'Alheia',
      planTier: 'pro',
      planStatus: 'active',
      courtsCount: 1,
    });
  });
  await assertFails(
    setDoc(doc(ctx(GESTOR), 'arenas/arena-alheia/courts/q1'), { name: 'Q1' }),
  );
});

test('recepcao bumpa o contador de comandas; manutencao nao', async () => {
  await assertSucceeds(
    setDoc(doc(ctx(RECEPCAO), 'arenas/arena-pro/metadata/comandaCounter'), {
      lastNumber: 1,
      updatedAt: new Date(),
    }),
  );
  await assertFails(
    setDoc(doc(ctx(MANUTENCAO), 'arenas/arena-pro/metadata/comandaCounter'), {
      lastNumber: 2,
      updatedAt: new Date(),
    }),
  );
});

test('financeiro le o contador mas nao escreve', async () => {
  await assertSucceeds(getDoc(doc(ctx(FINANCEIRO), 'arenas/arena-pro/metadata/comandaCounter')));
  await assertFails(
    setDoc(doc(ctx(FINANCEIRO), 'arenas/arena-pro/metadata/comandaCounter'), {
      lastNumber: 99,
      updatedAt: new Date(),
    }),
  );
});

test('membro removido perde o acesso na hora', async () => {
  await testEnv.withSecurityRulesDisabled(async (c) => {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(c.firestore(), 'arenas/arena-pro/staff/' + MANUTENCAO));
  });
  await assertFails(
    setDoc(doc(ctx(MANUTENCAO), 'arenas/arena-pro/courts/quadra-3'), { name: 'Quadra 3' }),
  );
});
