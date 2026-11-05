// Agenda do gestor sem `limit(256)` cego. A consulta antiga do portal e do app
// (`where arenaId == X` + `limit(256)`, sem data) devolve as 256 primeiras por
// ID: com mais de 256 reservas antigas, a de hoje some. A consulta nova
// (`arenaId ==` + `date >=` + `date <=`, índice arenaId ASC / date ASC) é a de
// `watchBookingsForArenaInRange` (frontend arena e app), aqui com o mesmo SDK
// cliente e as rules reais — prova também que a equipe pode rodá-la.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/arena-bookings-date-range.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, limit, query, setDoc, where, writeBatch } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-arena-bookings-date-range-test';
const DONO = 'dono-uid';
const RECEPCAO = 'recepcao-uid';
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-v'), {
      managerUserId: DONO, name: 'Arena Vegeton', planTier: 'pro', planStatus: 'active',
    });
    await setDoc(doc(db, 'arenas', 'arena-v', 'staff', RECEPCAO), { role: 'recepcao', status: 'active' });
    // 300 ocorrências de mensalista de um ano atrás, com IDs antes do de hoje.
    const batch = writeBatch(db);
    for (let i = 0; i < 300; i++) {
      batch.set(doc(db, 'arenaBookings', `a${String(i).padStart(3, '0')}`), {
        arenaId: 'arena-v', courtId: 'c1', date: `2025-0${1 + (i % 9)}-10`,
        startTime: '19:00', endTime: '20:00', status: 'confirmed', source: 'recurring',
      });
    }
    batch.set(doc(db, 'arenaBookings', 'zz-hoje'), {
      arenaId: 'arena-v', courtId: 'c1', date: TODAY,
      startTime: '19:00', endTime: '20:00', status: 'confirmed', source: 'platform',
    });
    // Outra arena no mesmo dia não entra.
    batch.set(doc(db, 'arenaBookings', 'zz-outra'), {
      arenaId: 'arena-outra', courtId: 'c1', date: TODAY, startTime: '19:00', endTime: '20:00', status: 'confirmed',
    });
    await batch.commit();
  });
});

after(async () => {
  await testEnv.cleanup();
});

function rangeQuery(db, fromKey, toKey) {
  return query(
    collection(db, 'arenaBookings'),
    where('arenaId', '==', 'arena-v'),
    where('date', '>=', fromKey),
    where('date', '<=', toKey),
  );
}

test('consulta antiga (limit 256 sem data) perde a reserva de hoje', async () => {
  const db = testEnv.authenticatedContext(DONO).firestore();
  const snap = await getDocs(query(collection(db, 'arenaBookings'), where('arenaId', '==', 'arena-v'), limit(256)));
  assert.equal(snap.size, 256);
  assert.equal(snap.docs.some((d) => d.id === 'zz-hoje'), false);
});

test('consulta por intervalo traz a reserva de hoje e nada fora da janela', async () => {
  const db = testEnv.authenticatedContext(DONO).firestore();
  const snap = await assertSucceeds(getDocs(rangeQuery(db, TODAY, TODAY)));
  assert.deepEqual(snap.docs.map((d) => d.id), ['zz-hoje']);
});

test('janela da tela de Reservas (um mês para trás) não puxa as do ano passado', async () => {
  const db = testEnv.authenticatedContext(RECEPCAO).firestore();
  const back = new Date(`${TODAY}T12:00:00Z`);
  back.setUTCDate(back.getUTCDate() - 30);
  const snap = await assertSucceeds(getDocs(rangeQuery(db, back.toISOString().slice(0, 10), '9999-12-31')));
  assert.deepEqual(snap.docs.map((d) => d.id), ['zz-hoje']);
});
