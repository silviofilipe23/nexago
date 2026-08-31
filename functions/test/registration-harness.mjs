/**
 * Harness de integração das inscrições de torneio.
 *
 * Roda as callables REAIS (`.run()`) contra o emulador do Firestore, com
 * torneio/categorias/atletas semeados por cenário. É a única camada que prova a
 * regra de negócio de ponta a ponta: o resto (lógica pura, widget) só cobre
 * pedaços.
 *
 * Uso: `firebase emulators:exec --only firestore --project <id> "node --test test/registration-*.test.mjs"`
 */

import {initializeApp} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';

export const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'nexago-registration-matrix';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    'FIRESTORE_EMULATOR_HOST ausente — rode via `firebase emulators:exec --only firestore`.',
  );
}

initializeApp({projectId: PROJECT_ID});

export const db = getFirestore();
export {Timestamp};

export const INSCRIPTIONS = `artifacts/${PROJECT_ID}/public/data/inscriptions`;
export const TEAMS = `artifacts/${PROJECT_ID}/public/data/teams`;
export const INVITES = 'tournamentRegistrationInvites';
export const EXTERNAL_INVITES = 'tournamentExternalPartnerInvites';

// ── callables ───────────────────────────────────────────────────────────────

const partnerInvite = await import('../lib/tournament-partner-invite.js');
const teamRegistration = await import('../lib/tournament-team-registration.js');
const externalInvite = await import('../lib/tournament-external-invite.js');
const registrationPix = await import('../lib/tournament-registration-pix.js');
const substitution = await import('../lib/tournament-substitution.js');

export const callables = {
  registerSolo: partnerInvite.registerSoloTournament,
  sendInvite: partnerInvite.sendTournamentPartnerInvite,
  acceptInvite: partnerInvite.acceptTournamentPartnerInvite,
  cancelInvite: partnerInvite.cancelTournamentPartnerInvite,
  cancelRegistration: partnerInvite.cancelTournamentRegistration,
  setUniform: partnerInvite.setRegistrationUniform,
  createTeam: teamRegistration.createTournamentTeamRegistration,
  leaveTeam: teamRegistration.leaveTournamentTeamRegistration,
  createExternalInvite: externalInvite.createExternalPartnerInvite,
  claimExternalInvite: externalInvite.claimExternalPartnerInvite,
  confirmFree: registrationPix.confirmFreeTournamentRegistration,
  reserveDirect: registrationPix.reserveDirectOrganizerRegistration,
  sendSubstitution: substitution.sendTournamentSubstitutionInvite,
  markViewed: substitution.markSubstitutionInviteViewed,
  resendSubstitution: substitution.resendSubstitutionInvite,
};

export const markStaleSubstitutionInvitesForCategory = substitution.markStaleSubstitutionInvitesForCategory;

/** Executa a callable como o atleta [uid]. */
export function call(fn, uid, data = {}) {
  return fn.run({
    auth: uid ? {uid, token: {}} : undefined,
    data,
    rawRequest: {headers: {}},
    acceptsStreaming: false,
  });
}

/**
 * Executa esperando falha e devolve a mensagem do erro.
 * Falha o teste se a callable tiver sucesso.
 */
export async function callExpectingError(fn, uid, data = {}) {
  try {
    await call(fn, uid, data);
  } catch (error) {
    return String(error?.message ?? error);
  }
  throw new Error('A callable deveria ter falhado, mas teve sucesso.');
}

// ── limpeza ─────────────────────────────────────────────────────────────────

export async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const url =
    `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, {method: 'DELETE'});
  if (!res.ok) {
    throw new Error(`Falha ao limpar o emulador: ${res.status}`);
  }
}

// ── seeds ───────────────────────────────────────────────────────────────────

let userCounter = 0;

/**
 * Atleta com perfil apto a torneios. `gender`: 'Masculino' | 'Feminino' |
 * 'Outro' | null (ausente). `level`: código do nível no esporte do torneio.
 */
export async function seedAthlete({
  uid,
  name,
  gender = 'Masculino',
  level,
  sportCode = 'BEACH_TENNIS',
  birthDate,
  profileReady = true,
} = {}) {
  const id = uid ?? `atleta-${++userCounter}`;
  const data = {
    name: name ?? `Atleta ${id}`,
    city: 'Goiânia',
    state: 'GO',
    phoneNumber: '62999990000',
  };
  if (profileReady) {
    data.onboardingCompleted = true;
    data.phoneVerified = true;
  }
  if (gender != null) data.gender = gender;
  if (birthDate) data.birthDate = birthDate;
  if (level) {
    data.sportOnboarding = {
      completedAt: Timestamp.now(),
      levelsBySport: {[sportCode]: level},
    };
  }
  await db.doc(`users/${id}`).set(data);
  return id;
}

/** Atalhos legíveis nos cenários. */
export const seedMan = (opts = {}) => seedAthlete({gender: 'Masculino', ...opts});
export const seedWoman = (opts = {}) => seedAthlete({gender: 'Feminino', ...opts});

let tournamentCounter = 0;

/**
 * Torneio com categorias. Cada categoria é o objeto cru gravado em
 * `tournaments/{id}.categories[]` — de propósito: é assim que o portal do
 * organizador grava e é isso que as callables leem.
 */
export async function seedTournament({
  id,
  categories,
  sport = 'beachTennis',
  listingStatus = 'open',
  name = 'Copa de Teste',
  registrationClosesAt,
  registrationOpensAt,
  waitlistEnabled,
  requireFormedPair,
  organizerId = 'organizador-1',
} = {}) {
  const tournamentId = id ?? `torneio-${++tournamentCounter}`;
  const data = {
    name,
    sport,
    listingStatus,
    organizerId,
    categories,
    createdAt: Timestamp.now(),
  };
  if (registrationClosesAt) data.registrationClosesAt = registrationClosesAt;
  if (registrationOpensAt) data.registrationOpensAt = registrationOpensAt;
  if (waitlistEnabled !== undefined) data.waitlistEnabled = waitlistEnabled;
  if (requireFormedPair !== undefined) data.requireFormedPair = requireFormedPair;
  await db.doc(`tournaments/${tournamentId}`).set(data);
  return tournamentId;
}

/** Categoria de DUPLA (o portal do organizador grava `teamSize: 2`). */
export function duplaCategory({
  id = 'cat-dupla',
  categoryName = 'Dupla Masculina',
  genderType = 'male',
  entryFee = 100,
  maxTeams = 8,
  ...rest
} = {}) {
  return {
    id,
    categoryName,
    genderType,
    entryFee,
    maxTeams,
    teamSize: 2,
    ...rest,
  };
}

/** Categoria de EQUIPE nomeada (trio/quarteto/quinteto). */
export function teamCategory({
  id = 'cat-equipe',
  categoryName = 'Quarteto Misto',
  teamSize = 4,
  genderMode,
  genderComposition,
  entryFee = 200,
  maxTeams = 8,
  ...rest
} = {}) {
  const category = {
    id,
    categoryName,
    teamSize,
    entryFee,
    maxTeams,
    ...rest,
  };
  if (genderMode) category.genderMode = genderMode;
  if (genderComposition) category.genderComposition = genderComposition;
  return category;
}

/**
 * Enche a categoria com [count] inscrições de outras duplas, direto em docs —
 * o que interessa aqui é a OCUPAÇÃO, não o caminho que a criou.
 */
export async function seedOccupiedRegistrations({
  tournamentId,
  categoryId,
  count,
  waitlist = false,
  prefix = 'ocupada',
} = {}) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const ref = db.collection(INSCRIPTIONS).doc(`${prefix}-${categoryId}-${i}`);
    await ref.set({
      tournamentId,
      categoryId,
      participantUids: [`${prefix}-a-${i}`, `${prefix}-b-${i}`],
      isPaid: false,
      paidAmount: 0,
      createdAt: Timestamp.now(),
      ...(waitlist ? {waitlist: true} : {}),
    });
    ids.push(ref.id);
  }
  return ids;
}

// ── leitura do estado ───────────────────────────────────────────────────────

export async function getRegistration(registrationId) {
  const snap = await db.doc(`${INSCRIPTIONS}/${registrationId}`).get();
  return snap.exists ? {id: snap.id, ...snap.data()} : null;
}

export async function getTeam(teamId) {
  const snap = await db.doc(`${TEAMS}/${teamId}`).get();
  return snap.exists ? {id: snap.id, ...snap.data()} : null;
}

export async function getInvite(inviteId) {
  const snap = await db.doc(`${INVITES}/${inviteId}`).get();
  return snap.exists ? {id: snap.id, ...snap.data()} : null;
}

export async function listRegistrations(tournamentId) {
  const snap = await db
    .collection(INSCRIPTIONS)
    .where('tournamentId', '==', tournamentId)
    .get();
  return snap.docs.map((d) => ({id: d.id, ...d.data()}));
}

// ── fluxos compostos (atalhos dos cenários) ─────────────────────────────────

/** Dupla fechada pelo caminho convite direto → aceite. Devolve o resultado do aceite. */
export async function formDupla({tournamentId, categoryId, inviterUid, inviteeUid, inviterName = 'Convidante', inviteeName = 'Convidado'}) {
  const {inviteId} = await call(callables.sendInvite, inviterUid, {
    tournamentId,
    categoryId,
    inviteeUid,
    inviteeName,
    inviterName,
  });
  const result = await call(callables.acceptInvite, inviteeUid, {inviteId});
  return {inviteId, ...result};
}

/** Equipe montada: capitão cria e cada integrante aceita. */
export async function formTeam({tournamentId, categoryId, captainUid, memberUids, teamName = 'Equipe Teste'}) {
  const created = await call(callables.createTeam, captainUid, {
    tournamentId,
    categoryId,
    teamName,
  });
  const inviteIds = [];
  for (const memberUid of memberUids) {
    const {inviteId} = await call(callables.sendInvite, captainUid, {
      tournamentId,
      categoryId,
      inviteeUid: memberUid,
      inviteeName: `Integrante ${memberUid}`,
      inviterName: 'Capitão',
    });
    inviteIds.push(inviteId);
    await call(callables.acceptInvite, memberUid, {inviteId});
  }
  return {...created, inviteIds};
}

/** Publica a chave da categoria direto no doc (o gate lê categoryOps). */
export async function publishBracket(tournamentId, categoryId) {
  await db.doc(`tournaments/${tournamentId}`).set(
    {categoryOps: {[categoryId]: {bracketStatus: 'published'}}},
    {merge: true},
  );
}

/** Marca cotas pagas direto no doc — o que interessa é o ESTADO, não o caminho. */
export async function markSharePaid(registrationId, uids, {isPaid = false} = {}) {
  await db.doc(`${INSCRIPTIONS}/${registrationId}`).set(
    {sharePaidUids: uids, ...(isPaid ? {isPaid: true, paidAmount: 100} : {})},
    {merge: true},
  );
}
