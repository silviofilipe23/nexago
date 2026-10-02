// Update de `arenaBookings` por papel: o dono da reserva só cancela / confirma
// presença / faz check-in; a equipe da arena só cancela, desfaz e faz check-in;
// o convidado só entra na participação. Valores, pagamento, ids do Asaas,
// arena, atleta e data/horário ficam com as Cloud Functions.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/arena-bookings-update.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, test } from 'node:test';
import {
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  deleteField,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-arena-bookings-update-test';
const ATLETA = 'atleta-uid';
const OUTRO_ATLETA = 'outro-atleta-uid';
const CONVIDADO = 'convidado-uid';
const DONO_ARENA = 'dono-arena-uid';
const RECEPCAO = 'recepcao-uid';
const FINANCEIRO = 'financeiro-uid';
const GESTOR_OUTRA = 'gestor-outra-arena-uid';
const SUPER = 'super-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

/** Reserva PIX recém-criada por createArenaBooking, aguardando pagamento. */
const pendingPix = {
  athleteId: ATLETA,
  arenaId: 'arena-pro',
  arenaName: 'Arena Pro',
  courtId: 'quadra-1',
  courtName: 'Quadra 1',
  date: '2026-10-10',
  startTime: '18:00',
  endTime: '19:00',
  amountReais: 120,
  amountToPayNowReais: 120,
  amountPaidOnlineReais: 0,
  amountDueOnsiteReais: 0,
  paymentChannel: 'pix',
  paymentFraction: 1,
  paymentStatus: 'pending',
  status: 'pending_payment',
  attendanceConfirmed: false,
  attendanceStatus: 'pending',
  asaasPaymentId: 'pay_original',
  source: 'platform',
};

/** Reserva paga e confirmada (webhook já rodou). */
const confirmed = {
  ...pendingPix,
  status: 'confirmed',
  paymentStatus: 'paid',
  amountPaidOnlineReais: 120,
};

const BOOKING = 'reserva-1';
const bookingPath = `arenaBookings/${BOOKING}`;

async function seedBooking(data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), bookingPath), data);
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'arenas', 'arena-pro'), {
      managerUserId: DONO_ARENA,
      name: 'Arena Pro',
      planTier: 'pro',
      planStatus: 'active',
    });
    await setDoc(doc(db, 'arenas', 'arena-outra'), {
      managerUserId: GESTOR_OUTRA,
      name: 'Arena Outra',
      planTier: 'pro',
      planStatus: 'active',
    });
    for (const [uid, role] of [[RECEPCAO, 'recepcao'], [FINANCEIRO, 'financeiro']]) {
      await setDoc(doc(db, 'arenas', 'arena-pro', 'staff', uid), {
        role,
        status: 'active',
      });
    }
  });
});

after(async () => {
  await testEnv.cleanup();
});

function dbOf(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

function bookingAs(uid, claims) {
  return doc(dbOf(uid, claims), bookingPath);
}

async function stored() {
  let data;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), bookingPath))).data();
  });
  return data;
}

// `assertFails` não distingue "a regra disse não" de "acabou o orçamento de
// expressões no meio da avaliação" — os dois chegam como PERMISSION_DENIED.
// Toda negação esperada passa por aqui (ver athlete-level-rules.test.mjs).
async function assertDeniedByRule(promise) {
  try {
    await promise;
  } catch (e) {
    const message = String(e.message || e);
    if (/maximum of \d+ expressions/i.test(message)) {
      throw new Error('negado por estouro do teto de expressões, não pela regra');
    }
    if (e.code === 'permission-denied' || /PERMISSION_DENIED/.test(message)) {
      return;
    }
    throw new Error(`negado, mas por erro inesperado: ${message}`);
  }
  throw new Error('esperava negação, mas o write passou');
}

// ---- Dono da reserva: o furo ------------------------------------------------

test('dono NÃO baixa o valor da reserva pendente (o PIX de R$ 1)', async () => {
  await seedBooking(pendingPix);
  const ref = bookingAs(ATLETA);
  await assertDeniedByRule(updateDoc(ref, { amountReais: 1 }));
  await assertDeniedByRule(updateDoc(ref, { amountToPayNowReais: 1 }));
  await assertDeniedByRule(updateDoc(ref, { amountDueOnsiteReais: 119 }));
  await assertDeniedByRule(updateDoc(ref, { paymentFraction: 0.5 }));
});

test('dono NÃO confirma a própria reserva nem mexe no status de pagamento', async () => {
  await seedBooking(pendingPix);
  const ref = bookingAs(ATLETA);
  await assertDeniedByRule(updateDoc(ref, { status: 'confirmed' }));
  await assertDeniedByRule(updateDoc(ref, { status: 'active' }));
  await assertDeniedByRule(updateDoc(ref, { paymentStatus: 'paid' }));
  await assertDeniedByRule(updateDoc(ref, { amountPaidOnlineReais: 120 }));
  // Campo ausente também é barrado (affectedKeys, não changedKeys).
  await assertDeniedByRule(updateDoc(ref, { hasSplitShares: true }));
});

test('dono NÃO troca ids do Asaas, arena, titular nem data/horário/quadra', async () => {
  await seedBooking(pendingPix);
  const ref = bookingAs(ATLETA);
  await assertDeniedByRule(updateDoc(ref, { asaasPaymentId: 'pay_forjado' }));
  await assertDeniedByRule(updateDoc(ref, { asaasPaymentId: deleteField() }));
  await assertDeniedByRule(updateDoc(ref, { arenaId: 'arena-outra' }));
  await assertDeniedByRule(updateDoc(ref, { athleteId: OUTRO_ATLETA }));
  await assertDeniedByRule(updateDoc(ref, { date: '2026-12-24' }));
  await assertDeniedByRule(updateDoc(ref, { startTime: '06:00' }));
  await assertDeniedByRule(updateDoc(ref, { courtId: 'quadra-vip' }));
});

test('dono NÃO contrabandeia valor junto do cancelamento', async () => {
  await seedBooking(pendingPix);
  await assertDeniedByRule(
    updateDoc(bookingAs(ATLETA), {
      status: 'canceled',
      attendanceStatus: 'canceled',
      canceledAt: serverTimestamp(),
      amountReais: 1,
    }),
  );
});

test('dono NÃO "descancela" a reserva', async () => {
  await seedBooking({ ...confirmed, status: 'canceled', attendanceStatus: 'canceled' });
  await assertDeniedByRule(updateDoc(bookingAs(ATLETA), { status: 'confirmed' }));
  await assertDeniedByRule(updateDoc(bookingAs(ATLETA), { status: 'pending_payment' }));
});

test('dono NÃO antedata o cancelamento nem inventa status de presença', async () => {
  await seedBooking(confirmed);
  const ref = bookingAs(ATLETA);
  await assertDeniedByRule(
    updateDoc(ref, {
      status: 'canceled',
      attendanceStatus: 'canceled',
      canceledAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')),
    }),
  );
  await assertDeniedByRule(updateDoc(ref, { attendanceStatus: 'no_show' }));
  await seedBooking({ ...confirmed, attendanceConfirmed: true, attendanceStatus: 'confirmed' });
  await assertDeniedByRule(updateDoc(ref, { attendanceConfirmed: false }));
});

test('terceiro NÃO cancela reserva alheia', async () => {
  await seedBooking(confirmed);
  await assertDeniedByRule(
    updateDoc(bookingAs(OUTRO_ATLETA), {
      status: 'canceled',
      attendanceStatus: 'canceled',
      canceledAt: serverTimestamp(),
    }),
  );
});

// ---- Dono da reserva: o que os clientes fazem continua passando ------------

/** Payload de `cancelBooking` — app (BookingService) e portal do atleta, idênticos. */
const ownerCancel = () => ({
  status: 'canceled',
  attendanceStatus: 'canceled',
  canceledAt: serverTimestamp(),
});

test('dono cancela reserva pendente de pagamento (app grava direto)', async () => {
  await seedBooking(pendingPix);
  await assertSucceeds(updateDoc(bookingAs(ATLETA), ownerCancel()));
  const data = await stored();
  assert(data.status === 'canceled' && data.amountReais === 120);
});

test('dono cancela reserva confirmada', async () => {
  await seedBooking(confirmed);
  await assertSucceeds(updateDoc(bookingAs(ATLETA), ownerCancel()));
});

test('dono cancela de novo uma reserva já cancelada (mesmos valores reenviados)', async () => {
  await seedBooking({ ...confirmed, status: 'canceled', attendanceStatus: 'canceled' });
  await assertSucceeds(updateDoc(bookingAs(ATLETA), ownerCancel()));
});

test('reenviar campo congelado com o MESMO valor não derruba o save', async () => {
  await seedBooking(confirmed);
  await assertSucceeds(
    updateDoc(bookingAs(ATLETA), { ...ownerCancel(), amountReais: 120, arenaId: 'arena-pro' }),
  );
});

test('dono confirma presença (payload do BookingService.confirmAttendance)', async () => {
  await seedBooking(confirmed);
  await assertSucceeds(
    updateDoc(bookingAs(ATLETA), {
      attendanceConfirmed: true,
      attendanceStatus: 'confirmed',
      attendanceConfirmedAt: serverTimestamp(),
    }),
  );
});

test('dono faz check-in (payload do BookingService.checkIn)', async () => {
  await seedBooking({ ...confirmed, attendanceStatus: 'confirmed', attendanceConfirmed: true });
  await assertSucceeds(
    updateDoc(bookingAs(ATLETA), {
      attendanceStatus: 'checked_in',
      checkedInAt: serverTimestamp(),
      locationVerified: true,
    }),
  );
});

// ---- Equipe da arena (área `agenda`) ----------------------------------------

/** Payload de `cancelBookingByManager` (portal) / `cancelBookingByArenaManager` (app). */
const staffCancel = (statusBefore, attendanceBefore, reason) => ({
  status: 'canceled',
  attendanceStatus: 'canceled',
  canceledAt: serverTimestamp(),
  canceledByRole: 'arena_manager',
  statusBeforeCancel: statusBefore,
  attendanceStatusBeforeCancel: attendanceBefore,
  ...(reason ? { cancelReason: reason } : {}),
});

/** Payload de `restoreBookingByManager` (portal) / `restoreBookingByArenaManager` (app). */
const staffRestore = (status, attendance) => ({
  status,
  attendanceStatus: attendance,
  canceledAt: deleteField(),
  canceledByRole: deleteField(),
  cancelReason: deleteField(),
  statusBeforeCancel: deleteField(),
  attendanceStatusBeforeCancel: deleteField(),
});

const staffCanceledPending = {
  ...pendingPix,
  status: 'canceled',
  attendanceStatus: 'canceled',
  canceledAt: Timestamp.now(),
  canceledByRole: 'arena_manager',
  cancelReason: 'chuva',
  statusBeforeCancel: 'pending_payment',
  attendanceStatusBeforeCancel: 'pending',
};

test('recepção cancela com motivo e desfaz em seguida', async () => {
  await seedBooking(confirmed);
  const ref = bookingAs(RECEPCAO);
  await assertSucceeds(updateDoc(ref, staffCancel('confirmed', 'pending', 'chuva')));
  await assertSucceeds(updateDoc(ref, staffRestore('confirmed', 'pending')));
  const data = await stored();
  assert(data.status === 'confirmed' && !('statusBeforeCancel' in data));
});

test('dono da arena cancela (sem motivo) e desfaz uma reserva pendente de PIX', async () => {
  await seedBooking(pendingPix);
  const ref = bookingAs(DONO_ARENA);
  await assertSucceeds(updateDoc(ref, staffCancel('pending_payment', 'pending')));
  await assertSucceeds(updateDoc(ref, staffRestore('pending_payment', 'pending')));
});

test('equipe desfaz cancelamento feito pelo atleta (sem snapshot → active)', async () => {
  await seedBooking({ ...confirmed, status: 'canceled', attendanceStatus: 'canceled', canceledAt: Timestamp.now() });
  await assertSucceeds(updateDoc(bookingAs(RECEPCAO), staffRestore('active', 'pending')));
});

test('equipe faz check-in no balcão (portal: locationVerified false; app: true)', async () => {
  await seedBooking(confirmed);
  await assertSucceeds(
    updateDoc(bookingAs(RECEPCAO), {
      attendanceStatus: 'checked_in',
      checkedInAt: serverTimestamp(),
      locationVerified: false,
    }),
  );
  await seedBooking(confirmed);
  await assertSucceeds(
    updateDoc(bookingAs(DONO_ARENA), {
      attendanceStatus: 'checked_in',
      checkedInAt: serverTimestamp(),
      locationVerified: true,
    }),
  );
});

test('equipe NÃO mexe em valor, pagamento, Asaas, arena, titular nem horário', async () => {
  await seedBooking(pendingPix);
  const ref = bookingAs(RECEPCAO);
  await assertDeniedByRule(updateDoc(ref, { amountReais: 1 }));
  await assertDeniedByRule(updateDoc(ref, { amountToPayNowReais: 1 }));
  await assertDeniedByRule(updateDoc(ref, { paymentStatus: 'paid' }));
  await assertDeniedByRule(updateDoc(ref, { asaasPaymentId: 'pay_forjado' }));
  await assertDeniedByRule(updateDoc(ref, { arenaId: 'arena-outra' }));
  await assertDeniedByRule(updateDoc(ref, { athleteId: OUTRO_ATLETA }));
  await assertDeniedByRule(updateDoc(ref, { startTime: '06:00' }));
});

test('equipe NÃO confirma reserva que ainda espera o PIX', async () => {
  await seedBooking(pendingPix);
  await assertDeniedByRule(updateDoc(bookingAs(RECEPCAO), { status: 'confirmed' }));
});

test('equipe NÃO desfaz para um status diferente do guardado', async () => {
  await seedBooking(staffCanceledPending);
  await assertDeniedByRule(updateDoc(bookingAs(RECEPCAO), staffRestore('confirmed', 'pending')));
  await assertDeniedByRule(updateDoc(bookingAs(RECEPCAO), staffRestore('active', 'pending')));
});

test('equipe NÃO grava snapshot falso nem apaga o snapshot para lavar o status', async () => {
  await seedBooking(pendingPix);
  await assertDeniedByRule(
    updateDoc(bookingAs(RECEPCAO), staffCancel('confirmed', 'pending')),
  );
  await seedBooking(staffCanceledPending);
  await assertDeniedByRule(
    updateDoc(bookingAs(RECEPCAO), { statusBeforeCancel: deleteField() }),
  );
});

test('financeiro (sem agenda) e gestor de outra arena NÃO cancelam', async () => {
  await seedBooking(confirmed);
  await assertDeniedByRule(updateDoc(bookingAs(FINANCEIRO), staffCancel('confirmed', 'pending')));
  await assertDeniedByRule(updateDoc(bookingAs(GESTOR_OUTRA), staffCancel('confirmed', 'pending')));
});

// ---- Convidado aceitando convite ---------------------------------------------

test('convidado entra na participação (payload do acceptInvite, set merge)', async () => {
  await seedBooking(confirmed);
  await assertSucceeds(
    setDoc(
      bookingAs(CONVIDADO),
      {
        confirmedParticipants: increment(1),
        guestAthleteId: CONVIDADO,
        guestAthleteName: 'Convidado',
      },
      { merge: true },
    ),
  );
  const data = await stored();
  assert(data.confirmedParticipants === 1 && data.guestAthleteId === CONVIDADO);
});

test('segundo convidado só incrementa quando o par já é de outro', async () => {
  await seedBooking({ ...confirmed, confirmedParticipants: 2, guestAthleteId: CONVIDADO });
  await assertSucceeds(
    setDoc(bookingAs(OUTRO_ATLETA), { confirmedParticipants: increment(1) }, { merge: true }),
  );
});

test('convidado NÃO infla participantes, NÃO aponta o par pra outro, NÃO toca status', async () => {
  await seedBooking(confirmed);
  const ref = bookingAs(CONVIDADO);
  await assertDeniedByRule(updateDoc(ref, { confirmedParticipants: 9 }));
  await assertDeniedByRule(updateDoc(ref, { guestAthleteId: OUTRO_ATLETA }));
  await assertDeniedByRule(updateDoc(ref, { guestAthleteName: 'Outro nome' }));
  await assertDeniedByRule(updateDoc(ref, { status: 'canceled' }));
  await assertDeniedByRule(updateDoc(ref, { amountReais: 1 }));
});

// ---- Admin da plataforma e preço do servidor ----------------------------------

test('superAdmin segue sem allow-list (correção manual)', async () => {
  await seedBooking(pendingPix);
  await assertSucceeds(
    updateDoc(bookingAs(SUPER, { superAdmin: true }), { amountReais: 100, status: 'confirmed' }),
  );
});

test('arenaBookingPricing é invisível e imutável para clientes', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'arenaBookingPricing', BOOKING), {
      amountReais: 120,
      arenaId: 'arena-pro',
      athleteId: ATLETA,
    });
  });
  for (const uid of [ATLETA, DONO_ARENA, RECEPCAO]) {
    const ref = doc(dbOf(uid), 'arenaBookingPricing', BOOKING);
    await assertDeniedByRule(getDoc(ref));
    await assertDeniedByRule(setDoc(ref, { amountReais: 1 }));
  }
});

function assert(condition, message = 'asserção falhou') {
  if (!condition) throw new Error(message);
}
