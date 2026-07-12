import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";

export type CallUpResponse = "confirmado" | "talvez" | "nao_vou" | "aguardando";

/** Mapa inicial de respostas — todo destinatário começa "aguardando". */
export function buildInitialResponses(recipients: string[]): Record<string, CallUpResponse> {
  const out: Record<string, CallUpResponse> = {};
  for (const uid of recipients) {
    out[uid] = "aguardando";
  }
  return out;
}

export const sendCallUp = onCall(async (request) => {
  const coachUid = request.auth?.uid;
  if (!coachUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const squadId = (request.data?.squadId as string | undefined)?.trim() ?? "";
  const title = (request.data?.title as string | undefined)?.trim() ?? "";
  const message = (request.data?.message as string | undefined)?.trim() ?? "";
  const responseDeadline = (request.data?.responseDeadline as string | undefined)?.trim() ?? "";
  const recipients = Array.isArray(request.data?.recipients)
    ? (request.data.recipients as unknown[]).map(String).filter(Boolean)
    : [];

  if (!squadId || !title || recipients.length === 0) {
    throw new HttpsError("invalid-argument", "squadId, title e recipients são obrigatórios.");
  }

  const db = getFirestore();

  const linkSnaps = await Promise.all(
    recipients.map((uid) => db.doc(`coaches/${coachUid}/athletes/${uid}`).get()),
  );
  if (linkSnaps.some((s) => !s.exists)) {
    throw new HttpsError(
      "failed-precondition",
      "Um ou mais destinatários não estão vinculados à sua equipe.",
    );
  }

  const coachSnap = await db.doc(`coaches/${coachUid}`).get();
  const coachName = (coachSnap.data()?.["displayName"] as string | undefined)?.trim() || "Seu treinador";

  const ref = db.collection(`coaches/${coachUid}/callUps`).doc();
  await ref.set({
    coachName,
    squadId,
    title,
    message,
    responseDeadline,
    recipients,
    responses: buildInitialResponses(recipients),
    createdAt: FieldValue.serverTimestamp(),
  });

  await Promise.all(
    recipients.map((uid) =>
      deliverNotificationToUser({
        userId: uid,
        title: `${coachName} enviou uma convocação`,
        body: title,
        type: "coach_call_up",
        data: {coachUid, callUpId: ref.id, url: `/convocacao/${coachUid}/${ref.id}`},
      }).catch((notifyError) => {
        logger.warn("Falha ao notificar atleta da convocação", {callUpId: ref.id, uid, notifyError});
      }),
    ),
  );

  logger.info("Coach call-up sent", {callUpId: ref.id, coachUid, recipients: recipients.length});
  return {callUpId: ref.id};
});

export const respondToCallUp = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const coachUid = (request.data?.coachUid as string | undefined)?.trim() ?? "";
  const callUpId = (request.data?.callUpId as string | undefined)?.trim() ?? "";
  const response = request.data?.response as CallUpResponse | undefined;

  if (!coachUid || !callUpId) {
    throw new HttpsError("invalid-argument", "coachUid e callUpId são obrigatórios.");
  }
  if (!response || !["confirmado", "talvez", "nao_vou"].includes(response)) {
    throw new HttpsError("invalid-argument", "Resposta inválida.");
  }

  const db = getFirestore();
  const ref = db.doc(`coaches/${coachUid}/callUps/${callUpId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Convocação não encontrada.");
    }
    const data = snap.data()!;
    const recipients = Array.isArray(data["recipients"]) ? (data["recipients"] as string[]) : [];
    if (!recipients.includes(uid)) {
      throw new HttpsError("permission-denied", "Você não foi convocado para este evento.");
    }
    tx.update(ref, {[`responses.${uid}`]: response});
  });

  logger.info("Call-up response recorded", {coachUid, callUpId, uid, response});
  return {ok: true};
});
