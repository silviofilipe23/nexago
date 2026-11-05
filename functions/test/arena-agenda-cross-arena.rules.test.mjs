// Isolamento entre arenas na agenda: o autocadastro de arena é aberto, então
// qualquer gestor é um "estranho" para as outras arenas.
// - arenaSlotLocks: só Cloud Functions escrevem (o ID é previsível e uma arena
//   travava o horário da outra);
// - arena_blocks: o ID `{arenaId}_{athleteId}` precisa bater com os campos, e o
//   update congela arena e atleta;
// - arenaBookings: criação só pelas Cloud Functions;
// - arenaSlots: `arenaId` congelado no update.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/arena-agenda-cross-arena.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-arena-agenda-cross-arena-test';
const DONO_X = 'dono-x-uid';
const DONO_Y = 'dono-y-uid';
const RECEPCAO_Y = 'recepcao-y-uid';
const ATLETA = 'atleta-uid';
const SUPER = 'super-uid';

const LOCK_Y = 'arena-y_c1_2026-11-10_h19';
const SLOT_Y = 'slot-y-1';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-x'), {
      managerUserId: DONO_X,
      name: 'Arena X',
      planTier: 'pro',
      planStatus: 'active',
    });
    await setDoc(doc(db, 'arenas', 'arena-y'), {
      managerUserId: DONO_Y,
      name: 'Arena Y',
      planTier: 'pro',
      planStatus: 'active',
    });
    await setDoc(doc(db, 'arenas', 'arena-y', 'staff', RECEPCAO_Y), {
      role: 'recepcao',
      status: 'active',
    });
    await setDoc(doc(db, 'arenaSlotLocks', LOCK_Y), {
      arenaId: 'arena-y',
      courtId: 'c1',
      bookingId: 'reserva-y',
    });
    await setDoc(doc(db, 'arena_blocks', `arena-y_${ATLETA}`), {
      arenaId: 'arena-y',
      athleteId: ATLETA,
      reason: 'Não compareceu',
    });
    await setDoc(doc(db, 'arenaSlots', SLOT_Y), {
      arenaId: 'arena-y',
      courtId: 'c1',
      date: '2026-11-10',
      startTime: '19:00',
      endTime: '20:00',
      status: 'available',
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

function dbOf(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

const superDb = () => dbOf(SUPER, { superAdmin: true });

// ── A1. arenaSlotLocks ───────────────────────────────────────────────────────

test('A1: dono da arena X não cria trava com o ID de um horário da arena Y', async () => {
  await assertFails(
    setDoc(doc(dbOf(DONO_X), 'arenaSlotLocks', 'arena-y_c1_2026-11-10_h20'), {
      arenaId: 'arena-x',
      courtId: 'c1',
    }),
  );
});

test('A1: nem a própria arena grava trava pelo cliente (só Cloud Function)', async () => {
  await assertFails(
    setDoc(doc(dbOf(DONO_Y), 'arenaSlotLocks', 'arena-y_c1_2026-11-10_h20'), {
      arenaId: 'arena-y',
      courtId: 'c1',
    }),
  );
  await assertFails(updateDoc(doc(dbOf(DONO_Y), 'arenaSlotLocks', LOCK_Y), { bookingId: 'outra' }));
  await assertFails(deleteDoc(doc(dbOf(DONO_Y), 'arenaSlotLocks', LOCK_Y)));
});

test('A1: leitura pública das travas continua passando', async () => {
  await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'arenaSlotLocks', LOCK_Y)));
  await assertSucceeds(getDoc(doc(dbOf(ATLETA), 'arenaSlotLocks', LOCK_Y)));
});

test('A1: superadmin ainda apaga trava presa', async () => {
  await assertSucceeds(deleteDoc(doc(superDb(), 'arenaSlotLocks', LOCK_Y)));
});

// ── A2. arena_blocks ─────────────────────────────────────────────────────────

test('A2: arena X não cria bloqueio com o ID da arena Y', async () => {
  await assertFails(
    setDoc(doc(dbOf(DONO_X), 'arena_blocks', `arena-y_outro-atleta`), {
      arenaId: 'arena-x',
      athleteId: 'outro-atleta',
      reason: 'Spam',
    }),
  );
});

test('A2: ID precisa bater com arenaId + athleteId mesmo na própria arena', async () => {
  await assertFails(
    setDoc(doc(dbOf(DONO_X), 'arena_blocks', 'qualquer-id'), {
      arenaId: 'arena-x',
      athleteId: 'outro-atleta',
      reason: 'Spam',
    }),
  );
});

test('A2: arena cria bloqueio no formato do app ({arenaId}_{athleteId})', async () => {
  await assertSucceeds(
    setDoc(doc(dbOf(DONO_X), 'arena_blocks', 'arena-x_outro-atleta'), {
      arenaId: 'arena-x',
      athleteId: 'outro-atleta',
      reason: 'Não compareceu',
    }),
  );
});

test('A2: arena Y faz set(merge) no próprio bloqueio (fluxo do app)', async () => {
  await assertSucceeds(
    setDoc(
      doc(dbOf(DONO_Y), 'arena_blocks', `arena-y_${ATLETA}`),
      { arenaId: 'arena-y', athleteId: ATLETA, reason: 'Reincidente' },
      { merge: true },
    ),
  );
  await assertSucceeds(
    setDoc(
      doc(dbOf(RECEPCAO_Y), 'arena_blocks', `arena-y_${ATLETA}`),
      { arenaId: 'arena-y', athleteId: ATLETA, reason: 'Reincidente 2' },
      { merge: true },
    ),
  );
});

test('A2: arena X não troca o arenaId de um bloqueio da arena Y', async () => {
  await assertFails(
    updateDoc(doc(dbOf(DONO_X), 'arena_blocks', `arena-y_${ATLETA}`), { arenaId: 'arena-x' }),
  );
  await assertFails(
    setDoc(doc(dbOf(DONO_X), 'arena_blocks', `arena-y_${ATLETA}`), {
      arenaId: 'arena-x',
      athleteId: ATLETA,
      reason: 'Tomado',
    }),
  );
});

test('A2: nem a própria arena troca arena ou atleta do bloqueio', async () => {
  await assertFails(
    updateDoc(doc(dbOf(DONO_Y), 'arena_blocks', `arena-y_${ATLETA}`), { arenaId: 'arena-x' }),
  );
  await assertFails(
    updateDoc(doc(dbOf(DONO_Y), 'arena_blocks', `arena-y_${ATLETA}`), { athleteId: 'outro-atleta' }),
  );
  await assertFails(
    updateDoc(doc(dbOf(DONO_Y), 'arena_blocks', `arena-y_${ATLETA}`), { reason: '' }),
  );
});

test('A2: desbloquear continua passando para a dona do bloqueio', async () => {
  await assertFails(deleteDoc(doc(dbOf(DONO_X), 'arena_blocks', `arena-y_${ATLETA}`)));
  await assertSucceeds(deleteDoc(doc(dbOf(DONO_Y), 'arena_blocks', `arena-y_${ATLETA}`)));
});

// ── A3. arenaBookings create ─────────────────────────────────────────────────

const novaReserva = {
  arenaId: 'arena-y',
  courtId: 'c1',
  date: '2026-11-10',
  startTime: '19:00',
  endTime: '20:00',
  athleteId: ATLETA,
  status: 'confirmed',
  source: 'manual',
};

test('A3: recepção e dono não criam arenaBookings direto pelo cliente', async () => {
  await assertFails(setDoc(doc(dbOf(RECEPCAO_Y), 'arenaBookings', 'reserva-direta'), novaReserva));
  await assertFails(setDoc(doc(dbOf(DONO_Y), 'arenaBookings', 'reserva-direta'), novaReserva));
  await assertFails(
    setDoc(doc(dbOf(ATLETA), 'arenaBookings', 'reserva-direta'), { ...novaReserva, status: 'pending_payment' }),
  );
});

test('A3: superadmin ainda cria reserva (suporte)', async () => {
  await assertSucceeds(setDoc(doc(superDb(), 'arenaBookings', 'reserva-suporte'), novaReserva));
});

// ── A4. arenaSlots update ────────────────────────────────────────────────────

test('A4: equipe não troca o arenaId de um slot', async () => {
  await assertFails(updateDoc(doc(dbOf(DONO_Y), 'arenaSlots', SLOT_Y), { arenaId: 'arena-x' }));
  await assertFails(updateDoc(doc(dbOf(RECEPCAO_Y), 'arenaSlots', SLOT_Y), { arenaId: 'arena-x' }));
  await assertFails(
    updateDoc(doc(dbOf(DONO_Y), 'arenaSlots', SLOT_Y), { arenaId: deleteField(), status: 'blocked' }),
  );
});

test('A4: bloquear e desbloquear sem trocar o arenaId continua passando', async () => {
  const ref = doc(dbOf(RECEPCAO_Y), 'arenaSlots', SLOT_Y);
  await assertSucceeds(
    updateDoc(ref, { status: 'blocked', blockReason: 'manutencao', blockNote: 'Rede rasgada' }),
  );
  await assertSucceeds(
    updateDoc(ref, {
      status: 'available',
      blockReason: deleteField(),
      blockNote: deleteField(),
    }),
  );
});

test('A4: arena X não mexe no slot da arena Y', async () => {
  await assertFails(updateDoc(doc(dbOf(DONO_X), 'arenaSlots', SLOT_Y), { status: 'blocked' }));
});
