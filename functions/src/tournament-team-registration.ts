/**
 * Inscrição em categoria de EQUIPE (trio/quarteto/quinteto).
 *
 * O capitão cria a equipe NOMEADA junto com a inscrição — diferente da dupla,
 * onde a equipe só nasce no aceite do convite. A inscrição fica com
 * `partnerPending: true` (elenco incompleto, fora da chave) até `memberUids`
 * atingir `teamSize`; os demais atletas entram por convite
 * (sendTournamentPartnerInvite/acceptTournamentPartnerInvite, ramo de equipe).
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertCanRegisterInTournament} from "./athlete-tournament-access";
import {assertTeamLevelEligibility} from "./category-level-eligibility";
import {assertTeamAgeEligibility} from "./category-age-eligibility";
import {deliverNotificationToUser} from "./notification-delivery";
import {
  assertTournamentAcceptsRegistration,
  findCategory,
  loadTournamentData,
  resolveCategoryMatchKeys,
} from "./tournament-registration-guards";
import {
  artifactsInscriptionsPath,
  artifactsTeamsPath,
  getFirebaseProjectId,
} from "./firebase-paths";
import {
  LGPD_TERM_VERSION,
  asTournamentCategory,
  categoryRequiresUniform,
  parseUniformPayload,
  uniformByUidEntry,
  validateUniformPayload,
} from "./tournament-partner-invite";
import {
  MIN_TEAM_CATEGORY_SIZE,
  evaluateTeamJoin,
  extractTeamMemberUids,
  isTeamCategory,
  normalizeTeamName,
  parseGenderComposition,
  registrationTeamSize,
  resolveCategoryTeamSize,
  teamJoinDenialMessage,
  teamNameKey,
  teamNameValidationError,
} from "./tournament-team-category";
import {loadUserGenderBucket} from "./tournament-team-roster";
import {sharePaidUidsFromRegistration} from "./tournament-registration-pix-helpers";

/** Nome exibível do atleta para notificações (users/{uid}). */
async function loadAthleteDisplayName(
  db: Firestore,
  uid: string,
): Promise<string> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    const data = snap.data() ?? {};
    for (const key of ["name", "displayName", "fullName", "firstName"]) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // fallback abaixo
  }
  return "Um atleta";
}

/**
 * Cria a equipe nomeada + inscrição do capitão numa categoria de equipe.
 * Params: `{tournamentId, categoryId, teamName, uniform?, lgpdAccepted?}`.
 * Retorna `{registrationId, teamId}`.
 */
export const createTournamentTeamRegistration = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const tournamentId =
    (request.data?.tournamentId as string | undefined)?.trim() ?? "";
  const categoryId =
    (request.data?.categoryId as string | undefined)?.trim() ?? "";
  if (!tournamentId || !categoryId) {
    throw new HttpsError(
      "invalid-argument",
      "tournamentId e categoryId são obrigatórios.",
    );
  }

  const nameError = teamNameValidationError(request.data?.teamName);
  if (nameError) {
    throw new HttpsError("invalid-argument", nameError);
  }
  const teamName = normalizeTeamName(request.data?.teamName);
  const nameKey = teamNameKey(teamName);

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  await assertCanRegisterInTournament(db, uid);

  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  const tournamentData = await assertTournamentAcceptsRegistration(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  const shouldWaitlist =
    (tournamentData as Record<string, unknown>).__shouldWaitlist === true;
  const category = asTournamentCategory(findCategory(tournament, categoryId));
  if (!category) {
    throw new HttpsError("not-found", "Categoria não encontrada neste torneio.");
  }
  if (!isTeamCategory(category)) {
    throw new HttpsError(
      "failed-precondition",
      "Esta categoria é de dupla. Use a inscrição comum.",
    );
  }
  const teamSize = resolveCategoryTeamSize(category);

  await assertTeamLevelEligibility({
    db,
    tournament,
    category,
    uids: [uid],
  });
  await assertTeamAgeEligibility({
    db,
    tournament,
    category,
    uids: [uid],
  });

  // Composição de gênero: o capitão precisa caber numa vaga da própria equipe.
  const composition = parseGenderComposition(category, teamSize);
  if (composition) {
    const captainBucket = await loadUserGenderBucket(db, uid);
    const joinCheck = evaluateTeamJoin({
      teamSize,
      composition,
      currentBuckets: [],
      joiningBucket: captainBucket,
    });
    if (!joinCheck.ok) {
      throw new HttpsError(
        "failed-precondition",
        teamJoinDenialMessage(joinCheck.reason, "self"),
      );
    }
  }

  const uniform = parseUniformPayload(request.data?.uniform);
  // Uniforme é coletado depois (pós-inscrição) — valida só se enviado.
  validateUniformPayload(
    category,
    uniform,
    uniform != null && categoryRequiresUniform(category),
  );
  const lgpdAccepted = request.data?.lgpdAccepted === true;

  // Uma varredura da categoria cobre as duas validações: atleta já inscrito e
  // nome de equipe repetido (chave normalizada — sem caixa/acentos/espaços).
  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);
  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const snap = await inscriptionsRef
    .where("tournamentId", "==", tournamentId)
    .get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!categoryKeys.has(String(data.categoryId ?? "").trim())) continue;
    const participants = Array.isArray(data.participantUids)
      ? (data.participantUids as unknown[]).map((p) => String(p).trim())
      : [];
    const player1Id = String(data.player1Id ?? "").trim();
    if (participants.includes(uid) || player1Id === uid) {
      throw new HttpsError(
        "failed-precondition",
        "Você já possui inscrição nesta categoria.",
      );
    }
    const existingName = String(data.teamName ?? "").trim();
    if (existingName && teamNameKey(existingName) === nameKey) {
      throw new HttpsError(
        "already-exists",
        "Já existe uma equipe com esse nome nesta categoria. Escolha outro nome.",
      );
    }
  }

  const teamsRef = db.collection(artifactsTeamsPath(projectId));
  const teamRef = teamsRef.doc();
  const regRef = inscriptionsRef.doc();

  const batch = db.batch();
  batch.set(teamRef, {
    teamName,
    captainUid: uid,
    memberUids: [uid],
    teamSize,
    // Espelho legado dos 2 primeiros membros (pôster, ranking, joins antigos).
    player1Id: uid,
    player2Id: "",
    tournamentId,
    categoryId,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(regRef, {
    tournamentId,
    categoryId,
    teamId: teamRef.id,
    teamName,
    teamSize,
    captainUid: uid,
    player1Id: uid,
    participantUids: [uid],
    partnerPending: true,
    isPaid: false,
    paidAmount: 0,
    createdAt: FieldValue.serverTimestamp(),
    ...(shouldWaitlist ? {waitlist: true} : {}),
    ...(uniform ? {uniformByUid: {[uid]: uniformByUidEntry(uniform)}} : {}),
    ...(lgpdAccepted
      ? {
          lgpdAcceptedUids: [uid],
          lgpdAcceptedAt: {[uid]: FieldValue.serverTimestamp()},
          lgpdTermVersion: LGPD_TERM_VERSION,
        }
      : {}),
  });
  await batch.commit();

  logger.info("Tournament team registration created", {
    registrationId: regRef.id,
    teamId: teamRef.id,
    tournamentId,
    categoryId,
    teamSize,
    uid,
  });

  return {registrationId: regRef.id, teamId: teamRef.id};
});

/**
 * Integrante (não capitão) sai da equipe enquanto a própria cota não foi paga.
 * A vaga reabre (`partnerPending: true`) e o capitão é avisado. O capitão não
 * sai — ele cancela a inscrição inteira (cancelTournamentRegistration).
 */
export const leaveTournamentTeamRegistration = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const registrationId =
    (request.data?.registrationId as string | undefined)?.trim() ?? "";
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId é obrigatório.");
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();
  const regRef = db
    .collection(artifactsInscriptionsPath(projectId))
    .doc(registrationId);

  const result = await db.runTransaction(async (tx) => {
    const regSnap = await tx.get(regRef);
    if (!regSnap.exists) {
      throw new HttpsError("not-found", "Inscrição não encontrada.");
    }
    const registration = regSnap.data()!;
    if (registrationTeamSize(registration, null) < MIN_TEAM_CATEGORY_SIZE) {
      throw new HttpsError(
        "failed-precondition",
        "Esta inscrição não é de categoria por equipe.",
      );
    }

    const teamId = String(registration.teamId ?? "").trim();
    const teamRef = teamId
      ? db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
      : null;
    const teamSnap = teamRef ? await tx.get(teamRef) : null;
    if (!teamRef || !teamSnap?.exists) {
      throw new HttpsError("failed-precondition", "Equipe não encontrada.");
    }
    const team = teamSnap.data()!;
    const members = extractTeamMemberUids(team);
    if (!members.includes(uid)) {
      throw new HttpsError(
        "permission-denied",
        "Você não faz parte desta equipe.",
      );
    }

    const captainUid = String(
      team.captainUid ?? registration.captainUid ?? registration.player1Id ?? "",
    ).trim();
    if (uid === captainUid) {
      throw new HttpsError(
        "failed-precondition",
        "O capitão não sai da equipe — cancele a inscrição para desfazê-la.",
      );
    }

    if (registration.isPaid === true) {
      throw new HttpsError(
        "failed-precondition",
        "Inscrição já confirmada. Fale com o organizador.",
      );
    }
    if (sharePaidUidsFromRegistration(registration).includes(uid)) {
      throw new HttpsError(
        "failed-precondition",
        "Sua cota já foi paga. Fale com o organizador.",
      );
    }

    const remaining = members.filter((memberUid) => memberUid !== uid);
    // Espelho legado: player2 é sempre o 2º membro restante (ou vazio).
    const legacyP2 = remaining.length > 1 ? remaining[1] : "";

    tx.update(teamRef, {
      memberUids: FieldValue.arrayRemove(uid),
      player2Id: legacyP2,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(regRef, {
      participantUids: FieldValue.arrayRemove(uid),
      partnerPending: true,
      [`uniformByUid.${uid}`]: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      teamId,
      captainUid,
      teamName: String(registration.teamName ?? team.teamName ?? "").trim(),
      tournamentId: String(registration.tournamentId ?? "").trim(),
      categoryId: String(registration.categoryId ?? "").trim(),
      memberCount: remaining.length,
    };
  });

  // Convites do atleta que saiu não existem (convite é sempre do capitão);
  // nada a limpar em tournamentRegistrationInvites além do aviso ao capitão.
  if (result.captainUid) {
    const leaverName = await loadAthleteDisplayName(db, uid);
    const url =
      `/torneios/${result.tournamentId}/inscricao` +
      `?registrationId=${encodeURIComponent(registrationId)}` +
      `&categoryId=${encodeURIComponent(result.categoryId)}` +
      "&step=partner";
    await deliverNotificationToUser({
      userId: result.captainUid,
      title: "Integrante saiu da equipe",
      body:
        `${leaverName} saiu da equipe` +
        `${result.teamName ? ` ${result.teamName}` : ""}. ` +
        "Convide outro atleta para completar o elenco.",
      type: "tournament_team_member_left",
      data: {
        tournamentId: result.tournamentId,
        categoryId: result.categoryId,
        registrationId,
        url,
      },
    }).catch(() => undefined);
  }

  logger.info("Tournament team member left", {
    registrationId,
    teamId: result.teamId,
    uid,
    remainingMembers: result.memberCount,
  });

  return {ok: true, registrationId};
});
