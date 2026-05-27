import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";

const INVITES_COLLECTION = "tournamentRegistrationInvites";
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

function getFirebaseProjectId(): string {
  return process.env.GCLOUD_PROJECT || "volley-track-2dd3b";
}

function artifactsTeamsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/teams`;
}

function artifactsInscriptionsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/inscriptions`;
}

type TournamentCategory = {categoryName: string; entryFee?: number};

async function loadTournamentData(
  db: Firestore,
  projectId: string,
  tournamentId: string,
): Promise<Record<string, unknown> | null> {
  let snap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!snap.exists) {
    snap = await db.doc(`artifacts/${projectId}/public/data/tournaments/${tournamentId}`).get();
  }
  if (!snap.exists) return null;
  return snap.data() ?? null;
}

function categoryExists(tournament: Record<string, unknown>, categoryId: string): boolean {
  const categories = (tournament.categories || []) as TournamentCategory[];
  return categories.some((c) => c.categoryName === categoryId);
}

async function userHasCategoryRegistration(
  db: Firestore,
  projectId: string,
  uid: string,
  tournamentId: string,
  categoryId: string,
): Promise<boolean> {
  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const snap = await inscriptionsRef.where("tournamentId", "==", tournamentId).get();
  const teamsRef = db.collection(artifactsTeamsPath(projectId));

  for (const doc of snap.docs) {
    const data = doc.data();
    if ((data.categoryId as string) !== categoryId) continue;
    const teamId = data.teamId as string | undefined;
    if (!teamId) continue;
    const teamSnap = await teamsRef.doc(teamId).get();
    if (!teamSnap.exists) continue;
    const team = teamSnap.data()!;
    if (team.player1Id === uid || team.player2Id === uid) {
      return true;
    }
  }
  return false;
}

async function findPendingInvite(
  db: Firestore,
  tournamentId: string,
  categoryId: string,
  inviterUid: string,
  inviteeUid: string,
): Promise<boolean> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("inviterUid", "==", inviterUid)
    .where("status", "==", "pending")
    .get();

  return snap.docs.some((d) => {
    const data = d.data();
    return data.categoryId === categoryId && data.inviteeUid === inviteeUid;
  });
}

export const sendTournamentPartnerInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const tournamentId = (request.data?.tournamentId as string | undefined)?.trim() ?? "";
  const categoryId = (request.data?.categoryId as string | undefined)?.trim() ?? "";
  const inviteeUid = (request.data?.inviteeUid as string | undefined)?.trim() ?? "";
  const inviteeName = (request.data?.inviteeName as string | undefined)?.trim() ?? "Atleta";
  const inviterName = (request.data?.inviterName as string | undefined)?.trim() ?? "Atleta";

  if (!tournamentId || !categoryId || !inviteeUid) {
    throw new HttpsError(
      "invalid-argument",
      "tournamentId, categoryId e inviteeUid são obrigatórios."
    );
  }

  if (inviteeUid === uid) {
    throw new HttpsError("invalid-argument", "Você não pode convidar a si mesmo.");
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  if (!categoryExists(tournament, categoryId)) {
    throw new HttpsError("not-found", "Categoria não encontrada neste torneio.");
  }

  if (await userHasCategoryRegistration(db, projectId, uid, tournamentId, categoryId)) {
    throw new HttpsError(
      "failed-precondition",
      "Você já possui inscrição nesta categoria."
    );
  }
  if (await userHasCategoryRegistration(db, projectId, inviteeUid, tournamentId, categoryId)) {
    throw new HttpsError(
      "failed-precondition",
      "Este parceiro já está inscrito nesta categoria."
    );
  }

  if (await findPendingInvite(db, tournamentId, categoryId, uid, inviteeUid)) {
    throw new HttpsError(
      "already-exists",
      "Já existe um convite pendente para este parceiro."
    );
  }

  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + INVITE_TTL_MS);
  const ref = db.collection(INVITES_COLLECTION).doc();

  await ref.set({
    tournamentId,
    categoryId,
    inviterUid: uid,
    inviterName,
    inviteeUid,
    inviteeName,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });

  try {
    await deliverNotificationToUser({
      userId: inviteeUid,
      title: "Convite para torneio",
      body: `${inviterName} te convidou para formar dupla · ${categoryId}`,
      type: "tournament_partner_invite",
      data: {
        inviteId: ref.id,
        tournamentId,
        categoryId,
        inviterUid: uid,
      },
    });
  } catch (notifyError) {
    logger.warn("Falha ao notificar convidado do torneio", {
      inviteId: ref.id,
      inviteeUid,
      notifyError,
    });
  }

  logger.info("Tournament partner invite sent", {
    inviteId: ref.id,
    tournamentId,
    categoryId,
    inviterUid: uid,
    inviteeUid,
  });

  return {inviteId: ref.id};
});

export const acceptTournamentPartnerInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const inviteId = (request.data?.inviteId as string | undefined)?.trim() ?? "";
  if (!inviteId) {
    throw new HttpsError("invalid-argument", "inviteId é obrigatório.");
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();
  const inviteRef = db.collection(INVITES_COLLECTION).doc(inviteId);

  const result = await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) {
      throw new HttpsError("not-found", "Convite não encontrado.");
    }
    const invite = inviteSnap.data()!;

    if (invite.inviteeUid !== uid) {
      throw new HttpsError("permission-denied", "Este convite não é para você.");
    }
    if (invite.status !== "pending") {
      throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
    }

    const expiresAt = invite.expiresAt as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      tx.update(inviteRef, {status: "expired"});
      throw new HttpsError("failed-precondition", "Este convite expirou.");
    }

    const tournamentId = invite.tournamentId as string;
    const categoryId = invite.categoryId as string;
    const inviterUid = invite.inviterUid as string;

    const teamsRef = db.collection(artifactsTeamsPath(projectId));
    const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));

    const teamRef = teamsRef.doc();
    const regRef = inscriptionsRef.doc();

    tx.set(teamRef, {
      player1Id: inviterUid,
      player2Id: uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(regRef, {
      teamId: teamRef.id,
      tournamentId,
      categoryId,
      isPaid: false,
      paidAmount: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.update(inviteRef, {
      status: "accepted",
      teamId: teamRef.id,
      registrationId: regRef.id,
      acceptedAt: FieldValue.serverTimestamp(),
    });

    return {
      registrationId: regRef.id,
      teamId: teamRef.id,
      tournamentId,
      categoryId,
    };
  });

  logger.info("Tournament partner invite accepted", {inviteId, ...result});

  const inviteAfter = (await inviteRef.get()).data();
  const inviterUid = (inviteAfter?.inviterUid as string | undefined)?.trim() ?? "";
  const inviteeName =
    (inviteAfter?.inviteeName as string | undefined)?.trim() || "Seu parceiro";
  const tournamentId = result.tournamentId;
  const categoryId = result.categoryId;
  const registrationId = result.registrationId;

  if (inviterUid) {
    const paymentPath =
      `/torneios/${tournamentId}/inscricao` +
      `?registrationId=${encodeURIComponent(registrationId)}` +
      `&categoryId=${encodeURIComponent(categoryId)}` +
      `&inviteId=${encodeURIComponent(inviteId)}` +
      "&step=payment";
    try {
      await deliverNotificationToUser({
        userId: inviterUid,
        title: "Parceiro confirmou!",
        body: `${inviteeName} aceitou! Conclua o pagamento da inscrição.`,
        type: "tournament_partner_invite_accepted",
        data: {
          inviteId,
          tournamentId,
          categoryId,
          registrationId,
          url: paymentPath,
        },
      });
    } catch (notifyError) {
      logger.warn("Falha ao notificar convidador do torneio", {
        inviteId,
        inviterUid,
        notifyError,
      });
    }
  }

  return result;
});

export const cancelTournamentPartnerInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const inviteId = (request.data?.inviteId as string | undefined)?.trim() ?? "";
  const asDecline = request.data?.asDecline === true;

  if (!inviteId) {
    throw new HttpsError("invalid-argument", "inviteId é obrigatório.");
  }

  const db = getFirestore();
  const inviteRef = db.collection(INVITES_COLLECTION).doc(inviteId);
  const inviteSnap = await inviteRef.get();

  if (!inviteSnap.exists) {
    throw new HttpsError("not-found", "Convite não encontrado.");
  }

  const invite = inviteSnap.data()!;
  if (invite.status !== "pending") {
    throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
  }

  const isInviter = invite.inviterUid === uid;
  const isInvitee = invite.inviteeUid === uid;

  if (asDecline) {
    if (!isInvitee) {
      throw new HttpsError("permission-denied", "Apenas o convidado pode recusar.");
    }
    await inviteRef.update({status: "declined"});
    return {success: true, status: "declined"};
  }

  if (!isInviter && !isInvitee) {
    throw new HttpsError("permission-denied", "Você não pode cancelar este convite.");
  }

  await inviteRef.update({status: "cancelled"});
  return {success: true, status: "cancelled"};
});
