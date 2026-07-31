import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  applyRolesToClaims,
  firestoreRolesPayload,
  rolesFromClaims,
} from "./auth-roles";
import {withArenaRole} from "./arena-signup";
import {
  isArenaStaffRole,
  maxArenaStaffSeats,
  normalizeInviteEmail,
  type ArenaStaffRole,
} from "./arena-staff-roles";

const INVITES = "arenaStaffInvites";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Barra o convite quando o plano não dá assento ou a equipe está cheia. */
export function assertSeatAvailable(seats: number, used: number): void {
  if (seats <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "O plano atual não inclui equipe. Assine o Pro ou o Elite para convidar membros.",
    );
  }
  if (used >= seats) {
    throw new HttpsError(
      "failed-precondition",
      `Limite de ${seats} membros do seu plano atingido. Remova alguém ou assine o Elite.`,
    );
  }
}

/** Convite pendente, não vencido e do e-mail de quem está reivindicando. */
export function inviteIsClaimable(
  invite: {status?: unknown; emailLower?: unknown; expiresAt?: {toMillis(): number}},
  emailLower: string,
  nowMs: number,
): boolean {
  if (invite.status !== "pending") return false;
  if (invite.emailLower !== emailLower || emailLower === "") return false;
  const expiresAt = invite.expiresAt?.toMillis?.();
  return expiresAt == null || expiresAt > nowMs;
}

/** Concede a role `arena` de forma SÍNCRONA. Não pode ficar só no trigger de
 *  espelho: quem acabou de aceitar o convite é mandado direto ao portal, e
 *  `AuthService.assertArenaRole` leria `users/{uid}` antes do trigger gravar. */
async function ensureArenaRole(uid: string): Promise<void> {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const roles = rolesFromClaims(user.customClaims);
  const next = withArenaRole(roles);

  if (next.length !== roles.length) {
    await auth.setCustomUserClaims(
      uid,
      applyRolesToClaims((user.customClaims || {}) as Record<string, unknown>, next),
    );
    logger.info("arenaStaff: role arena concedida", {uid});
  }

  // Write incondicional (mesmo quando a claim já tinha `arena`): o login do
  // portal lê `users/{uid}`, não a claim, e é fail-closed — se os dois algum
  // dia saírem de sincronia, esta função tem de se autocurar. O merge é
  // idempotente, então repeti-lo sempre é seguro e barato.
  await getFirestore().doc(`users/${uid}`).set(firestoreRolesPayload(next), {merge: true});
}

/** Carrega a arena e confere que quem chamou é o dono. */
async function loadOwnedArena(arenaId: string, uid: string) {
  const snap = await getFirestore().doc(`arenas/${arenaId}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  if (snap.data()?.managerUserId !== uid) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o dono da arena gerencia a equipe.",
    );
  }
  return snap;
}

/** Conta, dentre os `emailLower` de convites pendentes já lidos, quantos NÃO
 *  são o e-mail excluído. Extraída como função pura (sem Firebase Admin) só
 *  para ser testável — quem lê os documentos é `countUsedSeats`. */
export function countPendingInvitesExcluding(
  pendingEmailsLower: ReadonlyArray<unknown>,
  excludeEmailLower?: string,
): number {
  if (excludeEmailLower === undefined) return pendingEmailsLower.length;
  return pendingEmailsLower.filter((email) => email !== excludeEmailLower).length;
}

/** Membros ativos + convites pendentes ocupam assento. Quando
 *  `excludeEmailLower` é informado, o(s) convite(s) pendente(s) desse e-mail
 *  não contam — usado no caminho direto de `inviteArenaStaff`, onde o
 *  próprio convite antigo da pessoa sendo adicionada está prestes a ser
 *  encerrado (`settlePendingInvitesForEmail`) e não pode travar a vaga dela
 *  mesma (settlar antes de checar o assento criaria um efeito colateral que
 *  sobrevive mesmo se a checagem de assento em seguida barrar). Sem
 *  exclusão, `.count()` agregado basta e é usado. Com exclusão, Firestore
 *  não tem agregação `!=` confiável aqui, então lemos os convites pendentes
 *  da arena e filtramos em memória — o volume é limitado pelo próprio teto
 *  de assentos (no máximo 5 hoje), então o `get()` é barato; não trocar de
 *  volta para `count()` agregado. */
async function countUsedSeats(
  arenaId: string,
  excludeEmailLower?: string,
): Promise<number> {
  const db = getFirestore();
  const staffCountPromise = db.collection(`arenas/${arenaId}/staff`).count().get();

  if (excludeEmailLower === undefined) {
    const [staff, invites] = await Promise.all([
      staffCountPromise,
      db
        .collection(INVITES)
        .where("arenaId", "==", arenaId)
        .where("status", "==", "pending")
        .count()
        .get(),
    ]);
    return staff.data().count + invites.data().count;
  }

  const [staff, invites] = await Promise.all([
    staffCountPromise,
    db
      .collection(INVITES)
      .where("arenaId", "==", arenaId)
      .where("status", "==", "pending")
      .get(),
  ]);
  const pendingCount = countPendingInvitesExcluding(
    invites.docs.map((doc) => doc.data().emailLower),
    excludeEmailLower,
  );
  return staff.data().count + pendingCount;
}

/** Marca como aceitos todos os convites pendentes deste e-mail nesta arena.
 *  Usado quando o vínculo é criado pelo caminho direto (pessoa já tinha
 *  conta): sem isso, um convite antigo continua "pending" — reivindicável
 *  depois via link antigo (reescrevendo o cargo, ver Finding 1) e ainda
 *  ocupando assento. */
async function settlePendingInvitesForEmail(
  arenaId: string,
  emailLower: string,
  acceptedByUid: string,
): Promise<void> {
  const db = getFirestore();
  const pending = await db
    .collection(INVITES)
    .where("arenaId", "==", arenaId)
    .where("emailLower", "==", emailLower)
    .where("status", "==", "pending")
    .get();
  if (pending.empty) return;

  const batch = db.batch();
  for (const doc of pending.docs) {
    batch.set(
      doc.ref,
      {status: "accepted", acceptedBy: acceptedByUid, acceptedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
  }
  await batch.commit();
}

async function createStaffDoc(
  arenaId: string,
  uid: string,
  role: ArenaStaffRole,
  addedBy: string,
  email: string,
  displayName: string,
  photoUrl: string | null,
): Promise<void> {
  await getFirestore().doc(`arenas/${arenaId}/staff/${uid}`).set({
    role,
    status: "active",
    email,
    displayName,
    photoUrl,
    addedBy,
    addedAt: FieldValue.serverTimestamp(),
  });
  await ensureArenaRole(uid);
}

export const inviteArenaStaff = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const arenaId = String(request.data?.arenaId ?? "").trim();
  const email = normalizeInviteEmail(request.data?.email);
  const role = request.data?.role;

  if (!arenaId) throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
  if (!email.includes("@")) {
    throw new HttpsError("invalid-argument", "Informe um e-mail válido.");
  }
  if (!isArenaStaffRole(role)) {
    throw new HttpsError("invalid-argument", "Cargo inválido.");
  }

  const arenaSnap = await loadOwnedArena(arenaId, uid);
  const arenaData = arenaSnap.data() ?? {};
  const db = getFirestore();
  const arenaName = typeof arenaData.name === "string" ? arenaData.name : "";

  // Checagens de identidade (outright reject) vêm ANTES do assento: senão,
  // reconvidar alguém já na equipe/dono numa arena lotada mostra "limite de
  // membros atingido" em vez do motivo real. O assento só é checado depois de
  // sabermos que o convite/vínculo pode de fato prosseguir.

  // Caminho direto: o e-mail já tem conta → vínculo ativo na hora.
  let existing: {uid: string; displayName?: string; photoURL?: string} | null = null;
  try {
    const found = await getAuth().getUserByEmail(email);
    existing = {uid: found.uid, displayName: found.displayName, photoURL: found.photoURL};
  } catch {
    existing = null; // sem conta ainda — segue para convite pendente
  }

  if (existing) {
    if (existing.uid === uid) {
      throw new HttpsError(
        "invalid-argument",
        "Você já é o dono desta arena; não precisa se convidar.",
      );
    }
    const already = await db.doc(`arenas/${arenaId}/staff/${existing.uid}`).get();
    if (already.exists) {
      throw new HttpsError("already-exists", "Esta pessoa já está na equipe.");
    }

    // Exclui o e-mail sendo convidado da contagem: o convite antigo dele
    // mesmo (se houver) está prestes a ser encerrado abaixo e não pode
    // travar a própria vaga (ver Fix round 2 da revisão).
    const seats = maxArenaStaffSeats(arenaData, Date.now());
    assertSeatAvailable(seats, await countUsedSeats(arenaId, email));

    // Sem isto, um convite antigo pendente para este e-mail continuaria
    // reivindicável (reescrevendo o cargo pelo link antigo) e ocupando
    // assento — ver Finding 1 da revisão.
    await settlePendingInvitesForEmail(arenaId, email, existing.uid);

    await createStaffDoc(
      arenaId,
      existing.uid,
      role,
      uid,
      email,
      existing.displayName || email.split("@")[0],
      existing.photoURL ?? null,
    );
    logger.info("arenaStaff: vinculo criado direto", {arenaId, staffUid: existing.uid, role});
    return {inviteId: null, status: "active" as const};
  }

  const duplicate = await db
    .collection(INVITES)
    .where("arenaId", "==", arenaId)
    .where("emailLower", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!duplicate.empty) {
    throw new HttpsError("already-exists", "Já existe um convite pendente para este e-mail.");
  }

  const seats = maxArenaStaffSeats(arenaData, Date.now());
  assertSeatAvailable(seats, await countUsedSeats(arenaId));

  const ref = db.collection(INVITES).doc();
  await ref.set({
    arenaId,
    arenaName,
    emailLower: email,
    role,
    status: "pending",
    invitedBy: uid,
    acceptedBy: null,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS),
  });
  logger.info("arenaStaff: convite pendente criado", {arenaId, inviteId: ref.id, role});
  return {inviteId: ref.id, status: "pending" as const};
});

export const acceptArenaStaffInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const inviteId = String(request.data?.inviteId ?? "").trim();
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId é obrigatório.");

  // E-mail NÃO verificado de propósito: não há infra de envio de e-mail para
  // disparar a verificação (ver spec). O Firebase Auth já impede duas contas
  // com o mesmo e-mail, e o convite é sempre nominal.
  const email = normalizeInviteEmail(request.auth?.token?.email);
  const db = getFirestore();
  const ref = db.doc(`${INVITES}/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");

  const invite = snap.data() ?? {};
  if (!inviteIsClaimable(invite, email, Date.now())) {
    throw new HttpsError(
      "failed-precondition",
      "Este convite não é mais válido ou foi enviado para outro e-mail.",
    );
  }

  const arenaId = String(invite.arenaId ?? "");
  const role = invite.role;
  if (!isArenaStaffRole(role)) {
    throw new HttpsError("failed-precondition", "Convite com cargo inválido.");
  }

  const arenaSnap = await db.doc(`arenas/${arenaId}`).get();
  if (!arenaSnap.exists) throw new HttpsError("not-found", "Arena não encontrada.");

  // Defesa em profundidade: se por algum motivo um convite pendente
  // sobreviveu à pessoa já ter sido adicionada (ver Finding 1 da revisão),
  // barra aqui em vez de recriar/reescrever o vínculo, e aproveita para
  // encerrar o convite que ficou para trás.
  const alreadyStaffSnap = await db.doc(`arenas/${arenaId}/staff/${uid}`).get();
  if (alreadyStaffSnap.exists) {
    await ref.set(
      {status: "accepted", acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
    throw new HttpsError("already-exists", "Você já faz parte da equipe desta arena.");
  }

  const seats = maxArenaStaffSeats(arenaSnap.data() ?? {}, Date.now());
  const used = (await db.collection(`arenas/${arenaId}/staff`).count().get()).data().count;
  assertSeatAvailable(seats, used);

  const user = await getAuth().getUser(uid);
  await createStaffDoc(
    arenaId,
    uid,
    role,
    String(invite.invitedBy ?? ""),
    email,
    user.displayName || email.split("@")[0],
    user.photoURL ?? null,
  );
  await ref.set(
    {status: "accepted", acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
  logger.info("arenaStaff: convite aceito", {arenaId, inviteId, uid, role});
  return {arenaId, role};
});

export const revokeArenaStaffInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const inviteId = String(request.data?.inviteId ?? "").trim();
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId é obrigatório.");

  const db = getFirestore();
  const ref = db.doc(`${INVITES}/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");

  await loadOwnedArena(String(snap.data()?.arenaId ?? ""), uid);
  await ref.set({status: "revoked", revokedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {ok: true as const};
});

export const updateArenaStaffRole = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const arenaId = String(request.data?.arenaId ?? "").trim();
  const staffUserId = String(request.data?.staffUserId ?? "").trim();
  const role = request.data?.role;
  if (!arenaId || !staffUserId) {
    throw new HttpsError("invalid-argument", "arenaId e staffUserId são obrigatórios.");
  }
  if (!isArenaStaffRole(role)) throw new HttpsError("invalid-argument", "Cargo inválido.");

  await loadOwnedArena(arenaId, uid);
  const ref = getFirestore().doc(`arenas/${arenaId}/staff/${staffUserId}`);
  if (!(await ref.get()).exists) {
    throw new HttpsError("not-found", "Membro não encontrado nesta arena.");
  }
  await ref.set({role, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {ok: true as const};
});

export const removeArenaStaff = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const arenaId = String(request.data?.arenaId ?? "").trim();
  const staffUserId = String(request.data?.staffUserId ?? "").trim();
  if (!arenaId || !staffUserId) {
    throw new HttpsError("invalid-argument", "arenaId e staffUserId são obrigatórios.");
  }

  await loadOwnedArena(arenaId, uid);
  await getFirestore().doc(`arenas/${arenaId}/staff/${staffUserId}`).delete();
  logger.info("arenaStaff: membro removido", {arenaId, staffUserId});
  return {ok: true as const};
});
