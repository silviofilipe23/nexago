// Capa e logo da arena no Storage (`arenas/{arenaId}/cover|logo`): além do dono, o gestor ativo
// da equipe sobe a foto, com a mesma titularidade de plano que o Firestore exige pra editar o
// perfil (`arenaCanWrite(arenaId, 'perfil')`). Foto de produto (`arenas/{arenaId}/products/*`):
// gestor e manutenção, os cargos que gravam o produto (`arenaCanWrite(arenaId, 'estoque')`).
// Outro cargo, vínculo inativo e arena sem plano seguem recusados. As rules do Storage leem
// staff e arena no Firestore, então o teste sobe os dois emuladores e semeia no projeto do
// `emulators:exec` (é nele que o Storage procura).
// Rodar: cd functions && npm run test:rules
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageRules = fs.readFileSync(path.join(__dirname, '../../storage.rules'), 'utf8');
const firestoreRules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const OWNER = 'owner-uid';
const GESTOR = 'gestor-uid';
const RECEPCAO = 'recepcao-uid';
const FINANCEIRO = 'financeiro-uid';
const MANUTENCAO = 'manutencao-uid';
const EX_GESTOR = 'ex-gestor-uid';
const ESTRANHO = 'estranho-uid';

const testEnv = await initializeTestEnvironment({
  projectId: process.env.GCLOUD_PROJECT ?? 'nexago-rules-test',
  firestore: { rules: firestoreRules },
  storage: { rules: storageRules },
});

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n) => Timestamp.fromDate(new Date(Date.now() + n * DAY));

const ARENAS = {
  'arena-pro': { planTier: 'pro', planStatus: 'active' },
  'arena-sem-plano': {},
  'arena-starter': { planTier: 'starter', planStatus: 'active' },
  // Vencida há 3 dias: dentro da carência de 7.
  'arena-carencia': { planTier: 'pro', planStatus: 'overdue', planActiveUntil: daysFromNow(-3) },
  'arena-vencida': { planTier: 'pro', planStatus: 'overdue', planActiveUntil: daysFromNow(-10) },
  'arena-cancelando': { planTier: 'elite', planStatus: 'canceling', planActiveUntil: daysFromNow(5) },
};

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [arenaId, plan] of Object.entries(ARENAS)) {
      await setDoc(doc(db, 'arenas', arenaId), { managerUserId: OWNER, name: arenaId, ...plan });
      const membros = [
        [GESTOR, 'gestor', 'active'],
        [RECEPCAO, 'recepcao', 'active'],
        [FINANCEIRO, 'financeiro', 'active'],
        [MANUTENCAO, 'manutencao', 'active'],
        [EX_GESTOR, 'gestor', 'removed'],
      ];
      for (const [uid, role, status] of membros) {
        await setDoc(doc(db, 'arenas', arenaId, 'staff', uid), { role, status, addedBy: OWNER });
      }
    }
  });
});

after(async () => {
  await testEnv.cleanup();
});

const storageAs = (uid) => testEnv.authenticatedContext(uid).storage();

function put(storage, filePath, { bytes = 1024, contentType = 'image/jpeg' } = {}) {
  return storage.ref(filePath).put(new Uint8Array(bytes), { contentType });
}

test('gestor ativo de arena com plano sobe capa e logo (jpeg, png, webp)', async () => {
  const s = storageAs(GESTOR);
  await assertSucceeds(put(s, 'arenas/arena-pro/cover'));
  await assertSucceeds(put(s, 'arenas/arena-pro/logo', { contentType: 'image/png' }));
  await assertSucceeds(put(s, 'arenas/arena-pro/cover', { contentType: 'image/webp' }));
});

test('gestor: só imagem jpeg/png/webp de até 5 MB', async () => {
  const s = storageAs(GESTOR);
  await assertFails(put(s, 'arenas/arena-pro/cover', { bytes: 5 * 1024 * 1024 + 1 }));
  await assertFails(put(s, 'arenas/arena-pro/cover', { contentType: 'image/gif' }));
  await assertFails(put(s, 'arenas/arena-pro/cover', { contentType: 'application/pdf' }));
});

test('gestor: só capa, logo e foto de produto; o resto da pasta da arena segue com o dono', async () => {
  const s = storageAs(GESTOR);
  await assertFails(put(s, 'arenas/arena-pro/qualquer'));
  await assertFails(put(s, 'arenas/arena-pro/products/sub/p1.jpg'));
});

test('gestor apaga a capa', async () => {
  await assertSucceeds(put(storageAs(OWNER), 'arenas/arena-pro/logo'));
  await assertSucceeds(storageAs(GESTOR).ref('arenas/arena-pro/logo').delete());
});

test('cargo sem a área perfil não sobe capa nem logo', async () => {
  for (const uid of [RECEPCAO, FINANCEIRO, MANUTENCAO]) {
    await assertFails(put(storageAs(uid), 'arenas/arena-pro/cover'));
    await assertFails(put(storageAs(uid), 'arenas/arena-pro/logo'));
  }
});

test('vínculo inativo, estranho e visitante não sobem', async () => {
  await assertFails(put(storageAs(EX_GESTOR), 'arenas/arena-pro/cover'));
  await assertFails(put(storageAs(ESTRANHO), 'arenas/arena-pro/cover'));
  await assertFails(put(testEnv.unauthenticatedContext().storage(), 'arenas/arena-pro/cover'));
});

test('titularidade: sem plano, Starter e vencida fora da carência recusam o gestor', async () => {
  const s = storageAs(GESTOR);
  await assertFails(put(s, 'arenas/arena-sem-plano/cover'));
  await assertFails(put(s, 'arenas/arena-starter/cover'));
  await assertFails(put(s, 'arenas/arena-vencida/cover'));
  await assertSucceeds(put(s, 'arenas/arena-carencia/cover'));
  await assertSucceeds(put(s, 'arenas/arena-cancelando/cover'));
});

test('o dono segue como antes: sobe em qualquer arena dele, com ou sem plano', async () => {
  const s = storageAs(OWNER);
  await assertSucceeds(put(s, 'arenas/arena-sem-plano/cover'));
  await assertSucceeds(put(s, 'arenas/arena-pro/products/p1.jpg'));
  await assertSucceeds(put(s, 'arenas/arena-sem-plano/products/p1.jpg'));
});

test('a capa é pública', async () => {
  await assertSucceeds(put(storageAs(OWNER), 'arenas/arena-pro/cover'));
  await assertSucceeds(testEnv.unauthenticatedContext().storage().ref('arenas/arena-pro/cover').getMetadata());
});

test('gestor e manutenção ativos de arena com plano sobem foto de produto (jpeg, png, webp)', async () => {
  for (const uid of [GESTOR, MANUTENCAO]) {
    const s = storageAs(uid);
    await assertSucceeds(put(s, 'arenas/arena-pro/products/p1.jpg'));
    await assertSucceeds(put(s, 'arenas/arena-pro/products/p2.jpg', { contentType: 'image/png' }));
    await assertSucceeds(put(s, 'arenas/arena-pro/products/p3.jpg', { contentType: 'image/webp' }));
  }
});

test('foto de produto: só imagem jpeg/png/webp de até 5 MB', async () => {
  const s = storageAs(MANUTENCAO);
  await assertFails(put(s, 'arenas/arena-pro/products/p1.jpg', { bytes: 5 * 1024 * 1024 + 1 }));
  await assertFails(put(s, 'arenas/arena-pro/products/p1.jpg', { contentType: 'image/gif' }));
  await assertFails(put(s, 'arenas/arena-pro/products/p1.jpg', { contentType: 'application/pdf' }));
});

test('manutenção apaga a foto de produto', async () => {
  await assertSucceeds(put(storageAs(OWNER), 'arenas/arena-pro/products/p9.jpg'));
  await assertSucceeds(storageAs(MANUTENCAO).ref('arenas/arena-pro/products/p9.jpg').delete());
});

test('cargo sem escrita em estoque não sobe foto de produto (recepção só lê o estoque)', async () => {
  for (const uid of [RECEPCAO, FINANCEIRO]) {
    await assertFails(put(storageAs(uid), 'arenas/arena-pro/products/p1.jpg'));
  }
});

test('foto de produto: vínculo inativo, estranho e visitante não sobem', async () => {
  await assertFails(put(storageAs(EX_GESTOR), 'arenas/arena-pro/products/p1.jpg'));
  await assertFails(put(storageAs(ESTRANHO), 'arenas/arena-pro/products/p1.jpg'));
  await assertFails(put(testEnv.unauthenticatedContext().storage(), 'arenas/arena-pro/products/p1.jpg'));
});

test('foto de produto, titularidade: sem plano, Starter e vencida fora da carência recusam a equipe', async () => {
  for (const uid of [GESTOR, MANUTENCAO]) {
    const s = storageAs(uid);
    await assertFails(put(s, 'arenas/arena-sem-plano/products/p1.jpg'));
    await assertFails(put(s, 'arenas/arena-starter/products/p1.jpg'));
    await assertFails(put(s, 'arenas/arena-vencida/products/p1.jpg'));
    await assertSucceeds(put(s, 'arenas/arena-carencia/products/p1.jpg'));
    await assertSucceeds(put(s, 'arenas/arena-cancelando/products/p1.jpg'));
  }
});

test('a foto de produto é pública', async () => {
  await assertSucceeds(put(storageAs(MANUTENCAO), 'arenas/arena-pro/products/p1.jpg'));
  await assertSucceeds(
    testEnv.unauthenticatedContext().storage().ref('arenas/arena-pro/products/p1.jpg').getMetadata(),
  );
});

// Paridade das listas de cargos que storage.rules copia do `arenaWriteAreas` do firestore.rules.
function storageRolesOf(fn) {
  const roles = storageRules.match(new RegExp(`function ${fn}\\(\\) \\{\\s*return \\[([^\\]]*)\\];`));
  assert.ok(roles, `${fn}() não encontrada em storage.rules`);
  return [...roles[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

function firestoreRolesWriting(area) {
  const writeAreas = firestoreRules.match(/function arenaWriteAreas\(role\) \{\s*return \{([\s\S]*?)\}\.get\(role/);
  assert.ok(writeAreas, 'arenaWriteAreas(role) não encontrada em firestore.rules');
  return [...writeAreas[1].matchAll(/'([^']+)':\s*\[([^\]]*)\]/g)]
    .filter((m) => m[2].includes(`'${area}'`))
    .map((m) => m[1])
    .sort();
}

test('paridade: os cargos de `arenaPerfilRoles` são os que escrevem `perfil` no firestore.rules', () => {
  assert.deepEqual(storageRolesOf('arenaPerfilRoles'), firestoreRolesWriting('perfil'));
});

test('paridade: os cargos de `arenaEstoqueRoles` são os que escrevem `estoque` no firestore.rules', () => {
  assert.deepEqual(storageRolesOf('arenaEstoqueRoles'), firestoreRolesWriting('estoque'));
});
