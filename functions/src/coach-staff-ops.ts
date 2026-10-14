import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {applyRolesToClaims, firestoreRolesPayload, rolesFromClaims} from "./auth-roles";
import {withCoachRole} from "./coach-signup";
import {isCoachStaffRole, type CoachStaffRole} from "./coach-staff-roles";
import {normalizeInviteEmail} from "./arena-staff-roles";
import {inviteClaimState} from "./arena-staff-ops";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const INVITES = "coachStaffInvites";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function assertCanInviteSelf(coachUid: string, targetUid: string | null): void {
  if (targetUid !== null && targetUid === coachUid) {
    throw new HttpsError("invalid-argument", "Você é o treinador principal; não precisa se convidar.");
  }
}

export function assertInviteRole(role: unknown): CoachStaffRole {
  if (!isCoachStaffRole(role)) throw new HttpsError("invalid-argument", "Cargo inválido.");
  return role;
}

function requireUid(request: {auth?: {uid?: string} | null}): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  return uid;
}

/** Concede a claim `coach` de forma SÍNCRONA (o membro é mandado direto ao portal, cujo
 *  guard lê claims/`users/{uid}`). Não cria `coaches/{uid}`: o membro não é treinador. */
async function ensureCoachRole(uid: string): Promise<void> {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const roles = rolesFromClaims(user.customClaims);
  const next = withCoachRole(roles);
  if (next.length !== roles.length) {
    await auth.setCustomUserClaims(
      uid,
      applyRolesToClaims((user.customClaims || {}) as Record<string, unknown>, next),
    );
  }
  await getFirestore().doc(`users/${uid}`).set(firestoreRolesPayload(next), {merge: true});
}

export const createCoachStaffInvite = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const coachUid = requireUid(request);
  const email = normalizeInviteEmail(request.data?.email);
  if (!email.includes("@")) throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
  const role = assertInviteRole(request.data?.role);

  const db = getFirestore();
  const coachSnap = await db.doc(`coaches/${coachUid}`).get();
  if (!coachSnap.exists) {
    throw new HttpsError("failed-precondition", "Complete seu cadastro de treinador antes de montar a comissão.");
  }

  let targetUid: string | null = null;
  try {
    targetUid = (await getAuth().getUserByEmail(email)).uid;
  } catch {
    targetUid = null; // sem conta ainda — o convite espera o cadastro
  }
  assertCanInviteSelf(coachUid, targetUid);
  if (targetUid) {
    if ((await db.doc(`coaches/${coachUid}/staff/${targetUid}`).get()).exists) {
      throw new HttpsError("already-exists", "Esta pessoa já está na comissão.");
    }
  }

  const duplicate = await db.collection(INVITES)
    .where("coachUid", "==", coachUid)
    .where("emailLower", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!duplicate.empty) {
    throw new HttpsError("already-exists", "Já existe um convite pendente para este e-mail.");
  }

  const coachName = String(coachSnap.data()?.displayName ?? "").trim();
  const ref = db.collection(INVITES).doc();
  await ref.set({
    coachUid,
    coachName,
    emailLower: email,
    role,
    status: "pending",
    invitedBy: coachUid,
    acceptedBy: null,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
  });
  logger.info("coachStaff: convite criado", {coachUid, inviteId: ref.id, role});
  return {inviteId: ref.id};
});

export const acceptCoachStaffInvite = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireUid(request);
  const inviteId = String(request.data?.inviteId ?? "").trim();
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId é obrigatório.");

  // E-mail NÃO verificado de propósito (mesmo risco aceito da arena: sem infra de envio).
  const email = normalizeInviteEmail(request.auth?.token?.email);
  const db = getFirestore();
  const ref = db.doc(`${INVITES}/${inviteId}`);

  // Transação: dois aceites simultâneos não podem criar o vínculo duas vezes nem reusar o convite.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
    const invite = snap.data() ?? {};

    const state = inviteClaimState(invite, email, Date.now());
    if (state === "email-mismatch") {
      throw new HttpsError(
        "permission-denied",
        `Este convite foi enviado para outro e-mail. Você está conectado como ${
          email || "uma conta sem e-mail"
        } — saia desta conta e entre com o e-mail que recebeu o convite.`,
      );
    }
    if (state === "expired") {
      throw new HttpsError("failed-precondition", "Este convite venceu. Peça um convite novo ao treinador.");
    }
    if (state === "settled") {
      throw new HttpsError("failed-precondition", "Este convite foi cancelado ou já foi usado. Peça um convite novo ao treinador.");
    }

    const coachUid = String(invite.coachUid ?? "");
    const role = invite.role;
    if (!coachUid || !isCoachStaffRole(role)) {
      throw new HttpsError("failed-precondition", "Convite inválido.");
    }
    if (coachUid === uid) {
      throw new HttpsError("invalid-argument", "Você é o treinador principal desta comissão.");
    }
    const staffRef = db.doc(`coaches/${coachUid}/staff/${uid}`);
    if ((await tx.get(staffRef)).exists) {
      tx.set(ref, {status: "accepted", acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp()}, {merge: true});
      throw new HttpsError("already-exists", "Você já faz parte desta comissão.");
    }
    return {coachUid, role, staffRef};
  });

  let user;
  try {
    user = await getAuth().getUser(uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }

  await result.staffRef.set({
    role: result.role,
    email,
    displayName: user.displayName || email.split("@")[0],
    photoUrl: user.photoURL ?? null,
    addedBy: String((await ref.get()).data()?.invitedBy ?? ""),
    addedAt: FieldValue.serverTimestamp(),
  });
  await ensureCoachRole(uid);
  await ref.set({status: "accepted", acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp()}, {merge: true});
  logger.info("coachStaff: convite aceito", {coachUid: result.coachUid, inviteId, uid, role: result.role});
  return {coachUid: result.coachUid, role: result.role};
});

export const revokeCoachStaffInvite = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireUid(request);
  const inviteId = String(request.data?.inviteId ?? "").trim();
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId é obrigatório.");
  const ref = getFirestore().doc(`${INVITES}/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
  if (snap.data()?.coachUid !== uid) {
    throw new HttpsError("permission-denied", "Apenas o treinador principal gerencia a comissão.");
  }
  await ref.set({status: "revoked", revokedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {ok: true as const};
});

export const changeCoachStaffRole = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireUid(request);
  const staffUserId = String(request.data?.staffUserId ?? "").trim();
  if (!staffUserId) throw new HttpsError("invalid-argument", "staffUserId é obrigatório.");
  const role = assertInviteRole(request.data?.role);
  const ref = getFirestore().doc(`coaches/${uid}/staff/${staffUserId}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Membro não encontrado na sua comissão.");
  await ref.set({role, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {ok: true as const};
});

export const removeCoachStaff = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireUid(request);
  const staffUserId = String(request.data?.staffUserId ?? "").trim();
  if (!staffUserId) throw new HttpsError("invalid-argument", "staffUserId é obrigatório.");
  await getFirestore().doc(`coaches/${uid}/staff/${staffUserId}`).delete();
  logger.info("coachStaff: membro removido", {coachUid: uid, staffUserId});
  return {ok: true as const};
});

export const leaveCoachStaff = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireUid(request);
  const coachUid = String(request.data?.coachUid ?? "").trim();
  if (!coachUid) throw new HttpsError("invalid-argument", "coachUid é obrigatório.");
  await getFirestore().doc(`coaches/${coachUid}/staff/${uid}`).delete();
  return {ok: true as const};
});
