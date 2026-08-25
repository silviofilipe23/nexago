import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertCanManageTournament, tournamentManagerUids} from "./tournament-acl";
import {
  deliverNotificationToUser,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {
  artifactsInscriptionsPath,
  artifactsTeamsPath,
  getFirebaseProjectId,
} from "./firebase-paths";
import {registrationAthleteUids} from "./tournament-registration-pix-helpers";
import {buildRegistrationCancellationAudit} from "./tournament-registration-cancellation";
import {
  CANCELLATION_REQUEST_BLOCK_MESSAGES,
  buildCancellationDecline,
  buildCancellationRequest,
  cancellationRequestBlockReason,
  parseCancellationRequest,
} from "./tournament-cancellation-request";
import {findCategory} from "./tournament-registration-guards";

const MAX_REASON_LENGTH = 500;

/** Inscrição + equipe + atletas, base das duas callables. */
async function loadRegistrationContext(
  registrationId: string,
): Promise<{
  db: FirebaseFirestore.Firestore;
  projectId: string;
  ref: FirebaseFirestore.DocumentReference;
  registration: Record<string, unknown>;
  tournamentId: string;
  athleteUids: string[];
}> {
  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsInscriptionsPath(projectId)}/${registrationId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Inscrição não encontrada.");
  }
  const registration = snap.data()!;
  const tournamentId = String(registration.tournamentId ?? "").trim();
  if (!tournamentId) {
    throw new HttpsError("failed-precondition", "Torneio inválido.");
  }

  const teamId = String(registration.teamId ?? "").trim();
  let team: Record<string, unknown> | null = null;
  if (teamId) {
    const teamSnap = await db
      .doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
      .get();
    team = teamSnap.exists ? (teamSnap.data() as Record<string, unknown>) : null;
  }

  return {
    db,
    projectId,
    ref,
    registration,
    tournamentId,
    athleteUids: registrationAthleteUids(registration, team),
  };
}

/**
 * Atleta pede o cancelamento de uma inscrição JÁ PAGA ao organizador. A
 * plataforma não estorna: aprovado, o pedido só libera a vaga — a devolução do
 * valor é combinada entre os dois fora da plataforma.
 */
export const requestRegistrationCancellation = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const registrationId = String(request.data?.registrationId ?? "").trim();
  const reason = String(request.data?.reason ?? "").trim();
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId é obrigatório.");
  }
  if (!reason) {
    throw new HttpsError(
      "invalid-argument",
      "Escreva o motivo do cancelamento para o organizador.",
    );
  }
  if (reason.length > MAX_REASON_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `O motivo deve ter no máximo ${MAX_REASON_LENGTH} caracteres.`,
    );
  }

  const {db, ref, registration, tournamentId, athleteUids} =
    await loadRegistrationContext(registrationId);

  if (!athleteUids.includes(uid)) {
    throw new HttpsError(
      "permission-denied",
      "Você não é um dos atletas desta inscrição.",
    );
  }

  const blockReason = cancellationRequestBlockReason(registration);
  if (blockReason) {
    throw new HttpsError(
      "failed-precondition",
      CANCELLATION_REQUEST_BLOCK_MESSAGES[blockReason],
    );
  }

  await ref.update({
    cancellationRequest: {
      ...buildCancellationRequest({reason, requestedBy: uid}),
      requestedAt: FieldValue.serverTimestamp(),
      respondedAt: null,
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  const recipients = await tournamentManagerUids(db, tournamentId, tournamentSnap.data());
  if (recipients.length > 0) {
    const athleteSnap = await db.doc(`users/${uid}`).get();
    const athleteName =
      String(athleteSnap.data()?.fullName ?? athleteSnap.data()?.name ?? "").trim() ||
      "Um atleta";
    const categoryId = String(registration.categoryId ?? "").trim();
    const category = categoryId
      ? findCategory(tournamentSnap.data() ?? {}, categoryId)
      : null;
    const categoryLabel = String(
      category?.categoryName ?? category?.name ?? "",
    ).trim();
    await Promise.all(
      recipients.map((recipientUid) =>
        deliverNotificationToUser({
          userId: recipientUid,
          title: "Pedido de cancelamento",
          body: `${athleteName} pediu o cancelamento da inscrição${
            categoryLabel ? ` na categoria ${categoryLabel}` : ""
          }.`,
          type: "tournament_cancellation_requested",
          data: {
            tournamentId,
            registrationId,
            url: `/painel/eventos/${tournamentId}/inscricoes`,
          },
        }).catch(() => undefined),
      ),
    );
  }

  logger.info("Tournament cancellation requested", {
    registrationId,
    tournamentId,
    uid,
  });

  return {ok: true, registrationId};
});

/**
 * Organizador aprova (remove a inscrição e libera a vaga) ou recusa o pedido.
 * Em nenhum dos casos a plataforma movimenta dinheiro.
 */
export const respondRegistrationCancellationRequest = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const registrationId = String(request.data?.registrationId ?? "").trim();
  const approve = request.data?.approve === true;
  const note = String(request.data?.note ?? "").trim().slice(0, MAX_REASON_LENGTH);
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId é obrigatório.");
  }

  const {db, ref, registration, tournamentId, athleteUids} =
    await loadRegistrationContext(registrationId);

  await assertCanManageTournament(db, uid, tournamentId);

  const pending = parseCancellationRequest(registration);
  if (pending?.status !== "pending") {
    throw new HttpsError(
      "failed-precondition",
      "Não há pedido de cancelamento pendente nesta inscrição.",
    );
  }

  const notifyAthletes = (title: string, body: string) =>
    Promise.all(
      athleteUids.map((athleteUid) =>
        deliverNotificationToUser({
          userId: athleteUid,
          title,
          body,
          type: "tournament_registration_cancellation_response",
          data: {tournamentId, url: `/torneios/${tournamentId}`},
        }).catch(() => undefined),
      ),
    );

  if (!approve) {
    await ref.update({
      cancellationRequest: {
        ...buildCancellationDecline({request: pending, respondedBy: uid, note}),
        requestedAt: (registration.cancellationRequest as Record<string, unknown>)
          ?.requestedAt ?? FieldValue.serverTimestamp(),
        respondedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    await notifyAthletes(
      "Pedido de cancelamento recusado",
      note || "O organizador manteve sua inscrição. Fale com ele para entender.",
    );
    logger.info("Tournament cancellation request declined", {
      registrationId,
      tournamentId,
      uid,
    });
    return {ok: true, approved: false};
  }

  // Aprovado: mesma consequência de remover da categoria — auditoria e delete.
  // O dinheiro NÃO é estornado pela plataforma.
  const batch = db.batch();
  const auditRef = db.collection("tournamentRegistrationCancellations").doc();
  batch.set(auditRef, {
    ...buildRegistrationCancellationAudit({
      registrationId,
      cancelledBy: uid,
      athleteUids,
      registration,
    }),
    cancelledAt: FieldValue.serverTimestamp(),
    viaCancellationRequest: true,
    requestReason: pending.reason,
    responseNote: note,
  });
  batch.delete(ref);
  await batch.commit();

  await notifyAthletes(
    "Cancelamento aprovado",
    "Sua vaga foi liberada. Combine a devolução do valor com o organizador.",
  );

  logger.info("Tournament cancellation request approved", {
    registrationId,
    tournamentId,
    uid,
  });

  return {ok: true, approved: true};
});
