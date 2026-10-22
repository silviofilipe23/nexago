import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const OWNER = 'owner-uid';
const ADMIN = 'admin-uid';
const COACH = 'coach-uid';
const RECEP = 'recep-uid';
const REVOKED = 'revoked-uid';
const OTHER_OWNER = 'other-owner-uid';
const STRANGER = 'stranger-uid';
const INVITEE = 'invitee-uid';

const C = 'mare';
const OTHER = 'norte';
const SUSP = 'lagoa';

const testEnv = await initializeTestEnvironment({
  projectId: 'nexago-training-center-test',
  firestore: { rules },
});

const as = (uid, token = {}) => testEnv.authenticatedContext(uid, token).firestore();

/** Negação tem de vir da regra — estouro do teto de expressões também chega como PERMISSION_DENIED. */
async function denied(promise) {
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
    throw e;
  }
  throw new Error('esperava negação, mas a escrita/leitura passou');
}

function member(uid, role, status = 'active', extra = {}) {
  return { uid, role, status, displayName: uid, email: `${uid}@x.com`, extraPerms: [], programIds: [], inviteId: null, ...extra };
}

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'trainingCenters', C), { name: 'CT Maré Alta', ownerUid: OWNER, status: 'active', policies: {}, receivingConnected: true, subscription: null });
    await setDoc(doc(db, 'trainingCenters', C, 'centerMembers', OWNER), member(OWNER, 'center_owner'));
    await setDoc(doc(db, 'trainingCenters', C, 'centerMembers', ADMIN), member(ADMIN, 'center_admin'));
    await setDoc(doc(db, 'trainingCenters', C, 'centerMembers', COACH), member(COACH, 'coach'));
    await setDoc(doc(db, 'trainingCenters', C, 'centerMembers', RECEP), member(RECEP, 'receptionist'));
    await setDoc(doc(db, 'trainingCenters', C, 'centerMembers', REVOKED), member(REVOKED, 'center_admin', 'revoked'));
    await setDoc(doc(db, 'trainingCenters', C, 'classes', 'c1'), { name: 'BT Iniciante A', capacity: 2, seatsTaken: 1, status: 'active', coachUid: COACH });
    await setDoc(doc(db, 'trainingCenters', C, 'sessions', 'c1_2026-10-22'), { classId: 'c1', date: '2026-10-22', coachUid: COACH, status: 'scheduled', attendance: {} });
    await setDoc(doc(db, 'trainingCenters', C, 'students', 's1'), { name: 'Carla', makeupCredits: 0, status: 'active', uid: null });
    await setDoc(doc(db, 'trainingCenters', C, 'enrollments', 'e1'), { studentId: 's1', classId: 'c1', status: 'pending', contract: { priceCents: 32000 }, createdAt: null, createdByName: 'x' });
    await setDoc(doc(db, 'trainingCenters', C, 'invoices', 'i1'), { payerName: 'Carla', amountCents: 32000, status: 'pending', refundedCents: 0, approvedAt: null, enrollmentId: 'e1', studentId: 's1', dueDate: '2026-10-22' });
    await setDoc(doc(db, 'trainingCenters', C, 'auditLogs', 'a1'), { actorUid: OWNER, action: 'x', at: new Date() });
    await setDoc(doc(db, 'trainingCenters', C, 'centerInvites', 'inv1'), { email: 'convidado@x.com', role: 'coach', programIds: ['bt'], status: 'pending', centerId: C });
    await setDoc(doc(db, 'trainingCenters', C, 'centerInvites', 'inv2'), { email: 'convidado@x.com', role: 'receptionist', programIds: [], status: 'pending', centerId: C });

    await setDoc(doc(db, 'trainingCenters', OTHER), { name: 'Norte', ownerUid: OTHER_OWNER, status: 'active' });
    await setDoc(doc(db, 'trainingCenters', OTHER, 'centerMembers', OTHER_OWNER), member(OTHER_OWNER, 'center_owner'));
    await setDoc(doc(db, 'trainingCenters', OTHER, 'centerMembers', OWNER), member(OWNER, 'coach'));
    await setDoc(doc(db, 'trainingCenters', C, 'invoices', 'i3'), { payerName: 'Duda', amountCents: 32000, status: 'pending', refundedCents: 0, approvedAt: null, enrollmentId: null, studentId: 's1', dueDate: '2026-10-22', providerRef: 'pay_9', providerUrl: 'https://asaas/i/pay_9', providerStatus: 'PENDING' });
    await setDoc(doc(db, 'trainingCenters', OTHER, 'invoices', 'n1'), { payerName: 'X', amountCents: 100, status: 'pending' });

    await setDoc(doc(db, 'trainingCenters', SUSP), { name: 'Lagoa', ownerUid: OWNER, status: 'suspended' });
    await setDoc(doc(db, 'trainingCenters', SUSP, 'centerMembers', OWNER), member(OWNER, 'center_owner'));
    await setDoc(doc(db, 'trainingCenters', SUSP, 'classes', 'l1'), { name: 'Fut', capacity: 4, seatsTaken: 0, status: 'active' });
  });
});

after(() => testEnv.cleanup());

test('isolamento: owner de um centro é só professor no outro e não lê o financeiro dele', async () => {
  await assertSucceeds(getDoc(doc(as(OWNER), 'trainingCenters', C, 'invoices', 'i1')));
  await denied(getDoc(doc(as(OWNER), 'trainingCenters', OTHER, 'invoices', 'n1')));
  await denied(getDoc(doc(as(STRANGER), 'trainingCenters', C)));
});

test('vínculo revogado perde o acesso na hora', async () => {
  await denied(getDoc(doc(as(REVOKED), 'trainingCenters', C)));
  await denied(getDoc(doc(as(REVOKED), 'trainingCenters', C, 'students', 's1')));
});

test('"meus centros" por collection group só devolve o próprio vínculo', async () => {
  await assertSucceeds(getDocs(query(collectionGroup(as(OWNER), 'centerMembers'), where('uid', '==', OWNER))));
  await denied(getDocs(query(collectionGroup(as(OWNER), 'centerMembers'), where('uid', '==', COACH))));
});

test('criar centro: nasce pendente com o criador owner, no mesmo batch', async () => {
  const db = as('novo-uid');
  const b = writeBatch(db);
  b.set(doc(db, 'trainingCenters', 'novo'), { name: 'Novo', ownerUid: 'novo-uid', status: 'pending', receivingConnected: false, subscription: null });
  b.set(doc(db, 'trainingCenters', 'novo', 'centerMembers', 'novo-uid'), member('novo-uid', 'center_owner'));
  await assertSucceeds(b.commit());

  const db2 = as('esperto-uid');
  const b2 = writeBatch(db2);
  b2.set(doc(db2, 'trainingCenters', 'esperto'), { name: 'Esperto', ownerUid: 'esperto-uid', status: 'active', receivingConnected: false, subscription: null });
  b2.set(doc(db2, 'trainingCenters', 'esperto', 'centerMembers', 'esperto-uid'), member('esperto-uid', 'center_owner'));
  await denied(b2.commit());
});

test('ninguém se torna owner de centro alheio pelo bootstrap', async () => {
  await denied(setDoc(doc(as(STRANGER), 'trainingCenters', C, 'centerMembers', STRANGER), member(STRANGER, 'center_owner')));
});

test('owner/admin não mudam status, recebimento nem assinatura do centro', async () => {
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'trainingCenters', C), { name: 'CT Maré Alta 2' }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C), { status: 'pending' }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C), { receivingConnected: false, name: 'x' }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C), { ownerUid: ADMIN }));
  await denied(updateDoc(doc(as(COACH), 'trainingCenters', C), { name: 'x' }));
});

test('convite: aceite exige e-mail verificado e papel igual ao do convite', async () => {
  const token = { email: 'Convidado@x.com', email_verified: false };
  const accept = (db, inviteId, role) => {
    const b = writeBatch(db);
    b.set(doc(db, 'trainingCenters', C, 'centerMembers', INVITEE), member(INVITEE, role, 'active', { programIds: inviteId === 'inv1' ? ['bt'] : [], inviteId }));
    b.update(doc(db, 'trainingCenters', C, 'centerInvites', inviteId), { status: 'accepted', acceptedUid: INVITEE, acceptedAt: serverTimestamp() });
    return b.commit();
  };
  await denied(accept(as(INVITEE, token), 'inv1', 'coach'));
  const verified = as(INVITEE, { ...token, email_verified: true });
  await denied(accept(verified, 'inv1', 'center_admin'));
  await assertSucceeds(getDocs(query(collectionGroup(verified, 'centerInvites'), where('email', '==', 'convidado@x.com'))));
  await assertSucceeds(accept(verified, 'inv1', 'coach'));
});

test('convite de outro e-mail não serve', async () => {
  const db = as('intruso-uid', { email: 'intruso@x.com', email_verified: true });
  await denied(
    setDoc(doc(db, 'trainingCenters', C, 'centerMembers', 'intruso-uid'), member('intruso-uid', 'receptionist', 'active', { inviteId: 'inv2' })),
  );
});

test('admin convida professor mas não cria admin; professor não convida', async () => {
  const inv = (role, by) => ({ email: 'a@b.com', role, status: 'pending', invitedByUid: by, programIds: [], classIds: [] });
  await assertSucceeds(setDoc(doc(as(ADMIN), 'trainingCenters', C, 'centerInvites', 'x1'), inv('coach', ADMIN)));
  await denied(setDoc(doc(as(ADMIN), 'trainingCenters', C, 'centerInvites', 'x2'), inv('center_admin', ADMIN)));
  await assertSucceeds(setDoc(doc(as(OWNER), 'trainingCenters', C, 'centerInvites', 'x3'), inv('center_admin', OWNER)));
  await denied(setDoc(doc(as(COACH), 'trainingCenters', C, 'centerInvites', 'x4'), inv('coach', COACH)));
});

test('equipe: admin revoga professor, mas não o owner nem outro admin; ninguém se promove', async () => {
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'trainingCenters', C, 'centerMembers', RECEP), { extraPerms: ['view_finance'] }));
  await denied(updateDoc(doc(as(ADMIN), 'trainingCenters', C, 'centerMembers', OWNER), { status: 'revoked' }));
  await denied(updateDoc(doc(as(ADMIN), 'trainingCenters', C, 'centerMembers', ADMIN), { role: 'center_owner' }));
  await denied(updateDoc(doc(as(ADMIN), 'trainingCenters', C, 'centerMembers', COACH), { role: 'center_admin' }));
  await denied(updateDoc(doc(as(COACH), 'trainingCenters', C, 'centerMembers', COACH), { extraPerms: ['view_finance'] }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'centerMembers', COACH), { uid: 'outro' }));
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'trainingCenters', C, 'centerMembers', RECEP), { extraPerms: [] }));
});

test('vagas: recepção só move seatsTaken e nunca acima da capacidade', async () => {
  const recep = as(RECEP);
  await assertSucceeds(updateDoc(doc(recep, 'trainingCenters', C, 'classes', 'c1'), { seatsTaken: 2, rosterStudentIds: ['s1', 's2'] }));
  await denied(updateDoc(doc(recep, 'trainingCenters', C, 'classes', 'c1'), { seatsTaken: 3 }));
  await denied(updateDoc(doc(recep, 'trainingCenters', C, 'classes', 'c1'), { capacity: 10 }));
  await denied(updateDoc(doc(as(COACH), 'trainingCenters', C, 'classes', 'c1'), { seatsTaken: 1 }));
});

test('chamada: o professor da aula marca presença e nada mais', async () => {
  const s = doc(as(COACH), 'trainingCenters', C, 'sessions', 'c1_2026-10-22');
  await assertSucceeds(updateDoc(s, { attendance: { s1: 'present' } }));
  await denied(updateDoc(s, { startTime: '22:00' }));
  await denied(updateDoc(doc(as(RECEP), 'trainingCenters', C, 'sessions', 'c1_2026-10-22'), { attendance: {} }));
});

test('chamada: professor finaliza e corrige; ninguém grava os créditos aplicados', async () => {
  const s = doc(as(COACH), 'trainingCenters', C, 'sessions', 'c1_2026-10-22');
  await assertSucceeds(updateDoc(s, { status: 'done', finalizedAt: serverTimestamp(), finalizedByName: 'Coach' }));
  await assertSucceeds(updateDoc(s, { attendance: { s1: 'excused' }, attendanceLog: [{ studentId: 's1', from: 'present', to: 'excused', reason: 'avisou' }] }));
  await denied(updateDoc(s, { status: 'cancelled' }));
  await denied(updateDoc(s, { effectsApplied: { s1: { credit: 5 } } }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'sessions', 'c1_2026-10-22'), { effectsApplied: {} }));
  await assertSucceeds(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'sessions', 'c1_2026-10-22'), { status: 'scheduled' }));
});

test('créditos de reposição: só o gestor mexe', async () => {
  await denied(updateDoc(doc(as(RECEP), 'trainingCenters', C, 'students', 's1'), { makeupCredits: 5 }));
  await assertSucceeds(updateDoc(doc(as(RECEP), 'trainingCenters', C, 'students', 's1'), { phone: '21999' }));
  await assertSucceeds(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'students', 's1'), { makeupCredits: 1 }));
});

test('matrícula: professor não lê sem permissão extra; contrato congelado', async () => {
  await denied(getDoc(doc(as(COACH), 'trainingCenters', C, 'enrollments', 'e1')));
  await assertSucceeds(getDoc(doc(as(RECEP), 'trainingCenters', C, 'enrollments', 'e1')));
  await denied(updateDoc(doc(as(RECEP), 'trainingCenters', C, 'enrollments', 'e1'), { contract: { priceCents: 1 } }));
  await denied(updateDoc(doc(as(RECEP), 'trainingCenters', C, 'enrollments', 'e1'), { classId: 'c2' }));
});

test('cobrança: recepção não lê nem aprova; gestor aprova mas não muda valor', async () => {
  await denied(getDoc(doc(as(RECEP), 'trainingCenters', C, 'invoices', 'i1')));
  await denied(updateDoc(doc(as(RECEP), 'trainingCenters', C, 'invoices', 'i1'), { status: 'approved' }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'invoices', 'i1'), { amountCents: 1 }));
  await denied(
    setDoc(doc(as(RECEP), 'trainingCenters', C, 'invoices', 'i2'), { payerName: 'X', amountCents: 100, status: 'approved', refundedCents: 0, approvedAt: null }),
  );
  await assertSucceeds(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'invoices', 'i1'), { status: 'approved' }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'invoices', 'i1'), { status: 'pending' }));
});

test('cobrança: campos do provedor só o servidor grava', async () => {
  const ref = doc(as(OWNER), 'trainingCenters', C, 'invoices', 'i3');
  await denied(updateDoc(ref, { providerRef: 'pay_x' }));
  await denied(updateDoc(ref, { providerUrl: 'https://golpe' }));
  await denied(updateDoc(ref, { status: 'approved', providerApprovedAt: serverTimestamp() }));
  await denied(updateDoc(ref, { providerCheckAt: null }));
  const base = { payerName: 'X', amountCents: 100, status: 'pending', refundedCents: 0, approvedAt: null };
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', C, 'invoices', 'i4'), { ...base, providerRef: 'pay_x' }));
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', C, 'invoices', 'i5'), { ...base, providerRef: '', providerUrl: 'u' }));
  await assertSucceeds(setDoc(doc(as(OWNER), 'trainingCenters', C, 'invoices', 'i6'), { ...base, providerRef: '' }));
  // Baixa manual de cobrança gerada no provedor segue liberada (a function apaga a fatura).
  await assertSucceeds(updateDoc(ref, { status: 'approved', method: 'cash' }));
  await denied(getDoc(doc(as(OWNER), 'trainingCenterReceiving', C)));
  await denied(getDoc(doc(as(OWNER), 'trainingCenterPayers', `${C}_s1`)));
});

test('centro suspenso fica somente leitura', async () => {
  await assertSucceeds(getDoc(doc(as(OWNER), 'trainingCenters', SUSP, 'classes', 'l1')));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', SUSP, 'classes', 'l1'), { name: 'x' }));
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', SUSP, 'programs', 'p1'), { name: 'x', levels: [] }));
});

test('auditoria: cria em nome próprio com hora do servidor; nunca edita nem apaga', async () => {
  const db = as(COACH);
  await assertSucceeds(setDoc(doc(collection(db, 'trainingCenters', C, 'auditLogs')), { actorUid: COACH, action: 'access.denied', at: serverTimestamp() }));
  await denied(setDoc(doc(collection(db, 'trainingCenters', C, 'auditLogs')), { actorUid: OWNER, action: 'x', at: serverTimestamp() }));
  await denied(getDoc(doc(db, 'trainingCenters', C, 'auditLogs', 'a1')));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'auditLogs', 'a1'), { action: 'y' }));
});

test('locais: gestor cria e arquiva; ninguém exclui; professor só lê', async () => {
  const loc = { name: 'Arena Pepê', type: 'partner', status: 'active', windows: [], isPrimary: false };
  await assertSucceeds(setDoc(doc(as(ADMIN), 'trainingCenters', C, 'locations', 'pepe'), loc));
  await denied(setDoc(doc(as(COACH), 'trainingCenters', C, 'locations', 'x'), loc));
  await denied(setDoc(doc(as(ADMIN), 'trainingCenters', C, 'locations', 'y'), { ...loc, type: 'castelo' }));
  await assertSucceeds(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'locations', 'pepe'), { status: 'archived' }));
  await assertSucceeds(getDoc(doc(as(COACH), 'trainingCenters', C, 'locations', 'pepe')));
  await denied(deleteDoc(doc(as(OWNER), 'trainingCenters', C, 'locations', 'pepe')));
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', SUSP, 'locations', 'z'), loc));
});

test('assinaturas: só o servidor cria/anda; gestor agenda e desfaz o cancelamento no fim do ciclo', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'trainingCenters', C, 'subscriptions', 'e1'), {
      studentId: 's1', status: 'past_due', nextChargeDate: '2026-11-05', cancelAt: null, priceCents: 32000, dunningStage: 1,
    });
    await setDoc(doc(ctx.firestore(), 'trainingCenters', C, 'billingRuns', '2026-11-02'), { date: '2026-11-02', summary: {} });
  });
  const ref = (uid) => doc(as(uid), 'trainingCenters', C, 'subscriptions', 'e1');
  await assertSucceeds(getDoc(ref(RECEP)));
  await denied(getDoc(ref(COACH)));
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', C, 'subscriptions', 'e2'), { status: 'active' }));
  await denied(updateDoc(ref(OWNER), { priceCents: 100 }));
  await denied(updateDoc(ref(RECEP), { status: 'canceling', cancelAt: '2026-11-05' }));
  await denied(updateDoc(ref(OWNER), { status: 'canceling', cancelAt: '2026-10-25' }));
  await assertSucceeds(updateDoc(ref(OWNER), { status: 'canceling', cancelAt: '2026-11-05' }));
  await assertSucceeds(updateDoc(ref(ADMIN), { status: 'active', cancelAt: null }));
  await denied(updateDoc(ref(OWNER), { status: 'suspended' }));
  await assertSucceeds(getDoc(doc(as(OWNER), 'trainingCenters', C, 'billingRuns', '2026-11-02')));
  await denied(getDoc(doc(as(RECEP), 'trainingCenters', C, 'billingRuns', '2026-11-02')));
});

test('recorrência: pendência do aluno e vínculo da cobrança com o ciclo são do servidor', async () => {
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'students', 's1'), { billingHold: false }));
  await assertSucceeds(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'students', 's1'), { name: 'Carla D.' }));
  await denied(setDoc(doc(collection(as(OWNER), 'trainingCenters', C, 'invoices')), {
    payerName: 'Carla', amountCents: 100, status: 'pending', refundedCents: 0, approvedAt: null, subscriptionId: 'e1',
  }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'invoices', 'i1'), { cycle: '2026-11' }));
  await assertSucceeds(updateDoc(doc(as(OWNER), 'trainingCenters', C), { billing: { billingDay: 10 } }));
  await denied(updateDoc(doc(as(RECEP), 'trainingCenters', C), { billing: { billingDay: 10 } }));
});

test('preferências de aviso: gestor salva; fila de adiados e log são do servidor', async () => {
  await assertSucceeds(updateDoc(doc(as(OWNER), 'trainingCenters', C), { notifications: { events: { payment_confirmed: { push: true } } } }));
  await denied(updateDoc(doc(as(COACH), 'trainingCenters', C), { notifications: {} }));
  await denied(getDocs(collection(as(OWNER), 'trainingCenters', C, 'notificationOutbox')));
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', C, 'notificationLog', 'x'), { kind: 'x' }));
});

test('conta de recebimento: owner/admin leem a situação; ninguém grava pelo cliente', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'trainingCenters', C, 'receivingAccount', 'current'), { status: 'pending', documents: [] });
  });
  await assertSucceeds(getDoc(doc(as(ADMIN), 'trainingCenters', C, 'receivingAccount', 'current')));
  await denied(getDoc(doc(as(COACH), 'trainingCenters', C, 'receivingAccount', 'current')));
  await denied(getDoc(doc(as(RECEP), 'trainingCenters', C, 'receivingAccount', 'current')));
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', C, 'receivingAccount', 'current'), { status: 'approved' }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C), { receivingStatus: 'approved' }));
  await denied(getDoc(doc(as(OWNER), 'trainingCenterAsaasSecrets', C)));
});

test('repasses: gestor define regra e fecha; pago congela; professor lê só o dele', async () => {
  const rule = { kind: 'per_class', amountCents: 8000, percent: 0 };
  await assertSucceeds(setDoc(doc(as(ADMIN), 'trainingCenters', C, 'payRules', COACH), rule));
  await denied(setDoc(doc(as(RECEP), 'trainingCenters', C, 'payRules', COACH), rule));
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', C, 'payRules', COACH), { ...rule, percent: 150 }));
  await assertSucceeds(getDoc(doc(as(COACH), 'trainingCenters', C, 'payRules', COACH)));
  await denied(getDoc(doc(as(COACH), 'trainingCenters', C, 'payRules', ADMIN)));

  const p = { month: '2026-10', coachUid: COACH, coachName: 'Coach', totalCents: 24000, status: 'closed', lines: [] };
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', C, 'payouts', 'x'), p));
  await denied(setDoc(doc(as(COACH), 'trainingCenters', C, 'payouts', `2026-10_${COACH}`), p));
  await assertSucceeds(setDoc(doc(as(OWNER), 'trainingCenters', C, 'payouts', `2026-10_${COACH}`), p));
  await assertSucceeds(getDoc(doc(as(COACH), 'trainingCenters', C, 'payouts', `2026-10_${COACH}`)));
  await assertSucceeds(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'payouts', `2026-10_${COACH}`), { status: 'paid', paidMethod: 'pix' }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'payouts', `2026-10_${COACH}`), { totalCents: 1 }));
  await denied(deleteDoc(doc(as(OWNER), 'trainingCenters', C, 'payouts', `2026-10_${COACH}`)));
});

test('repasse em transferência pelo NexaGO: cliente não marca pago nem mexe no estado', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'trainingCenters', C, 'payouts', `2026-09_${COACH}`), {
      month: '2026-09', coachUid: COACH, totalCents: 10000, status: 'closed', transferStatus: 'pending', transferId: 'tr_1',
    });
    await setDoc(doc(ctx.firestore(), 'trainingCenters', C, 'payouts', `2026-08_${COACH}`), {
      month: '2026-08', coachUid: COACH, totalCents: 10000, status: 'closed', transferStatus: 'failed',
    });
  });
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'payouts', `2026-09_${COACH}`), { status: 'paid' }));
  await denied(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'payouts', `2026-08_${COACH}`), { transferStatus: 'done' }));
  await assertSucceeds(updateDoc(doc(as(OWNER), 'trainingCenters', C, 'payouts', `2026-08_${COACH}`), { status: 'paid', paidMethod: 'pix' }));
});

test('automação do repasse: só o owner liga; segurar é do owner; prazo é do servidor', async () => {
  const s = { autoClose: true, autoPay: true, closeDay: 1, reviewDays: 3, maxAutoPayCents: 0 };
  await assertSucceeds(setDoc(doc(as(OWNER), 'trainingCenters', C, 'settings', 'payouts'), s));
  await denied(setDoc(doc(as(ADMIN), 'trainingCenters', C, 'settings', 'payouts'), s));
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', C, 'settings', 'payouts'), { ...s, closeDay: 31 }));
  await assertSucceeds(getDoc(doc(as(ADMIN), 'trainingCenters', C, 'settings', 'payouts')));
  await denied(getDoc(doc(as(COACH), 'trainingCenters', C, 'settings', 'payouts')));
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', C, 'payoutRuns', '2026-10'), { closed: 1 }));

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'trainingCenters', C, 'payouts', `2026-07_${COACH}`), {
      month: '2026-07', coachUid: COACH, totalCents: 10000, status: 'closed', autoPayAt: '2026-08-04', autoPayHold: false,
    });
  });
  const ref = (uid) => doc(as(uid), 'trainingCenters', C, 'payouts', `2026-07_${COACH}`);
  await denied(updateDoc(ref(ADMIN), { autoPayHold: true }));
  await assertSucceeds(updateDoc(ref(OWNER), { autoPayHold: true }));
  await denied(updateDoc(ref(OWNER), { autoPayAt: '2026-07-01' }));
  // Refazer o fechamento (admin regrava sem os campos do automático) tira do automático.
  await assertSucceeds(setDoc(ref(ADMIN), { month: '2026-07', coachUid: COACH, totalCents: 12000, status: 'closed' }));
  await denied(setDoc(doc(as(OWNER), 'trainingCenters', C, 'payouts', `2026-06_${COACH}`), { month: '2026-06', coachUid: COACH, status: 'closed', autoPayAt: '2026-07-01' }));
});
