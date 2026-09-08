/**
 * Callables do organizador para o passe de vaga: liberar e revogar.
 *
 * O passe é uma PERMISSÃO nominal, não uma inscrição: nada é criado no lugar do atleta, e a
 * vaga só existe de fato quando ele se inscrever. Por isso a validação aqui é a mesma régua que
 * ele encontraria três telas adiante — liberar vaga para quem o nível ou a idade vão barrar é
 * entregar um passe que é mentira.
 *
 * O que o passe NÃO promete: o nível da DUPLA (soma dos degraus), que só é avaliável quando o
 * parceiro aparece, e o prazo do torneio — o passe fura a lotação e só ela.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {getFirebaseProjectId} from "./firebase-paths";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";
import {assertCanManageTournament} from "./tournament-acl";
import {loadTournamentData} from "./tournament-registration-guards";
import {SPOT_PASSES_COLLECTION, type SpotPassStatus} from "./tournament-spot-pass";
import {
  assertAthleteCanReceiveSpotPass,
  assertCategoryAcceptsSpotPass,
  athleteDisplayName,
  buildSpotPassDoc,
  findActiveSpotPass,
  spotPassRegistrationUrl,
  trimmed,
} from "./tournament-spot-pass-grant";

/**
 * Libera uma vaga nominal numa categoria para UM atleta.
 *
 * Idempotente: chamar de novo para o mesmo atleta e categoria devolve o passe que já existe em
 * vez de criar um segundo — dois passes abririam duas vagas para a mesma pessoa.
 */
export const organizerGrantTournamentSpotPass = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const organizerUid = request.auth?.uid;
  if (!organizerUid) {
    throw new HttpsError("unauthenticated", "Login necessário");
  }

  const tournamentId = trimmed(request.data?.tournamentId);
  const categoryId = trimmed(request.data?.categoryId);
  const athleteUid = trimmed(request.data?.athleteUid);
  if (!tournamentId || !categoryId || !athleteUid) {
    throw new HttpsError(
      "invalid-argument",
      "tournamentId, categoryId e athleteUid são obrigatórios.",
    );
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();

  await assertCanManageTournament(db, organizerUid, tournamentId);

  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  const {category, categoryKeys, categoryLabel} = assertCategoryAcceptsSpotPass(
    tournament,
    categoryId,
  );

  const athlete = await assertAthleteCanReceiveSpotPass({
    db,
    projectId,
    tournament,
    category,
    tournamentId,
    categoryKeys,
    athleteUid,
    alreadyRegisteredMessage: "Este atleta já tem inscrição nesta categoria.",
  });

  // Idempotente: dois passes abririam duas vagas para a mesma pessoa.
  const live = await findActiveSpotPass({db, tournamentId, categoryKeys, athleteUid});
  if (live) {
    return {passId: live.id, alreadyGranted: true};
  }

  const ref = db.collection(SPOT_PASSES_COLLECTION).doc();
  await ref.set(
    buildSpotPassDoc({
      tournamentId,
      categoryId,
      categoryLabel,
      athleteUid,
      athleteName: athleteDisplayName(athlete),
      grantedByUid: organizerUid,
    }),
  );

  logger.info("Passe de vaga liberado", {
    passId: ref.id,
    tournamentId,
    categoryId,
    athleteUid,
    organizerUid,
  });

  try {
    await deliverNotificationToUser({
      userId: athleteUid,
      title: "Vaga liberada",
      body:
        `O organizador abriu uma vaga para você em ${categoryLabel}. ` +
        "Faça sua inscrição pelo app.",
      type: "tournament_spot_pass_granted",
      data: {
        tournamentId,
        categoryId,
        url: spotPassRegistrationUrl(tournamentId, categoryId),
      },
      requireInteraction: true,
    });
  } catch (notifyError) {
    // O passe já vale; o aviso é o enfeite. Recusar aqui obrigaria o organizador a liberar de
    // novo uma vaga que já está liberada.
    logger.warn("Falha ao avisar atleta da vaga liberada", {
      passId: ref.id,
      athleteUid,
      notifyError,
    });
  }

  return {passId: ref.id, alreadyGranted: false};
});

/** Revoga um passe ainda não usado. Passe já queimado não volta — a inscrição existe. */
export const organizerRevokeTournamentSpotPass = onCall(async (request) => {
  const organizerUid = request.auth?.uid;
  if (!organizerUid) {
    throw new HttpsError("unauthenticated", "Login necessário");
  }

  const passId = trimmed(request.data?.passId);
  if (!passId) {
    throw new HttpsError("invalid-argument", "passId é obrigatório.");
  }

  const db = getFirestore();
  const ref = db.collection(SPOT_PASSES_COLLECTION).doc(passId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Passe não encontrado.");
  }
  const data = snap.data() ?? {};
  const tournamentId = trimmed(data.tournamentId);

  await assertCanManageTournament(db, organizerUid, tournamentId);

  if (data.status !== "active") {
    throw new HttpsError(
      "failed-precondition",
      data.status === "used" ?
        "Esta vaga já foi usada — remova a inscrição para liberá-la." :
        "Este passe não está mais ativo.",
    );
  }

  await ref.update({
    status: "revoked" satisfies SpotPassStatus,
    revokedAt: FieldValue.serverTimestamp(),
    revokedByUid: organizerUid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info("Passe de vaga revogado", {passId, tournamentId, organizerUid});

  return {ok: true};
});
