import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";

const INVITES_COLLECTION = "coachAthleteInvites";
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

async function findPendingInvite(db: Firestore, coachUid: string, athleteUid: string): Promise<boolean> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("coachUid", "==", coachUid)
    .where("athleteUid", "==", athleteUid)
    .where("status", "==", "pending")
    .get();
  return !snap.empty;
}

export const sendCoachAthleteInvite = onCall(async (request) => {
  const coachUid = request.auth?.uid;
  if (!coachUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const athleteUid = (request.data?.athleteUid as string | undefined)?.trim() ?? "";
  const athleteName = (request.data?.athleteName as string | undefined)?.trim() || "Atleta";
  const squadId = (request.data?.squadId as string | undefined)?.trim() || "";

  if (!athleteUid) {
    throw new HttpsError("invalid-argument", "athleteUid é obrigatório.");
  }
  if (athleteUid === coachUid) {
    throw new HttpsError("invalid-argument", "Você não pode convidar a si mesmo.");
  }

  const db = getFirestore();

  const coachSnap = await db.doc(`coaches/${coachUid}`).get();
  if (!coachSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Complete seu cadastro de treinador antes de convidar atletas.",
    );
  }
  const coachName = (coachSnap.data()?.["displayName"] as string | undefined)?.trim() || "Treinador";

  const existingLink = await db.doc(`coaches/${coachUid}/athletes/${athleteUid}`).get();
  if (existingLink.exists) {
    throw new HttpsError("already-exists", "Este atleta já está vinculado à sua equipe.");
  }

  if (await findPendingInvite(db, coachUid, athleteUid)) {
    throw new HttpsError("already-exists", "Já existe um convite pendente para este atleta.");
  }

  const now = Date.now();
  const ref = db.collection(INVITES_COLLECTION).doc();
  await ref.set({
    coachUid,
    coachName,
    athleteUid,
    athleteName,
    ...(squadId ? {squadId} : {}),
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + INVITE_TTL_MS),
  });

  try {
    await deliverNotificationToUser({
      userId: athleteUid,
      title: `${coachName} quer te adicionar à equipe`,
      body: "Toque para ver o convite e aceitar ou recusar.",
      type: "coach_athlete_invite",
      data: {inviteId: ref.id, coachUid, url: `/convite-atleta/${ref.id}`},
    });
  } catch (notifyError) {
    logger.warn("Falha ao notificar atleta do convite de treinador", {
      inviteId: ref.id,
      athleteUid,
      notifyError,
    });
  }

  logger.info("Coach athlete invite sent", {inviteId: ref.id, coachUid, athleteUid});
  return {inviteId: ref.id};
});

export const acceptCoachAthleteInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }
  const inviteId = (request.data?.inviteId as string | undefined)?.trim() ?? "";
  if (!inviteId) {
    throw new HttpsError("invalid-argument", "inviteId é obrigatório.");
  }

  const db = getFirestore();
  const inviteRef = db.collection(INVITES_COLLECTION).doc(inviteId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(inviteRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Convite não encontrado.");
    }
    const invite = snap.data()!;
    if (invite["athleteUid"] !== uid) {
      throw new HttpsError("permission-denied", "Este convite não é para você.");
    }
    if (invite["status"] !== "pending") {
      throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
    }
    const expiresAt = invite["expiresAt"] as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      tx.update(inviteRef, {status: "expired"});
      throw new HttpsError("failed-precondition", "Este convite expirou.");
    }

    const coachUid = invite["coachUid"] as string;
    const linkRef = db.doc(`coaches/${coachUid}/athletes/${uid}`);
    tx.set(linkRef, {
      athleteUid: uid,
      squadId: (invite["squadId"] as string | undefined) ?? null,
      status: "ativo",
      linkStatus: "accepted",
      linkedAt: FieldValue.serverTimestamp(),
    });
    tx.update(inviteRef, {status: "accepted", acceptedAt: FieldValue.serverTimestamp()});

    return {coachUid};
  });

  logger.info("Coach athlete invite accepted", {inviteId, athleteUid: uid, coachUid: result.coachUid});
  return {ok: true};
});

export const cancelCoachAthleteInvite = onCall(async (request) => {
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
  const snap = await inviteRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Convite não encontrado.");
  }
  const invite = snap.data()!;
  if (invite["status"] !== "pending") {
    throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
  }

  const isCoach = invite["coachUid"] === uid;
  const isAthlete = invite["athleteUid"] === uid;

  if (asDecline) {
    if (!isAthlete) {
      throw new HttpsError("permission-denied", "Apenas o atleta convidado pode recusar.");
    }
    await inviteRef.update({status: "declined"});
    return {ok: true, status: "declined"};
  }

  if (!isCoach && !isAthlete) {
    throw new HttpsError("permission-denied", "Você não pode cancelar este convite.");
  }
  await inviteRef.update({status: "cancelled"});
  return {ok: true, status: "cancelled"};
});
