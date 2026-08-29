/**
 * Substituição de atleta em inscrição de torneio — efeitos.
 *
 * Convite na coleção `tournamentRegistrationInvites` com
 * `isSubstitutionInvite: true` + `replacedUid` + `attachRegistrationId`
 * (o attach reaproveita os sweeps existentes: cancelamento da inscrição
 * cancela o convite junto). Aceite/recusa entram pelas callables existentes
 * (`acceptTournamentPartnerInvite`/`cancelTournamentPartnerInvite`), que
 * delegam para cá via import dinâmico — este arquivo importa helpers de
 * tournament-partner-invite, então a volta precisa ser lazy.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertTeamLevelEligibility} from "./category-level-eligibility";
import {assertTeamAgeEligibility} from "./category-age-eligibility";
import {
  assertMixedDuoGenderEligibility,
  assertTeamGenderEligibility,
} from "./category-gender-eligibility";
import {deliverNotificationToUser} from "./notification-delivery";
import {
  findCategory,
  loadTournamentData,
  resolveCategoryMatchKeys,
} from "./tournament-registration-guards";
import {formatCategoryInviteNotificationLabel} from "./category-display-labels";
import {
  artifactsInscriptionsPath,
  getFirebaseProjectId,
} from "./firebase-paths";
import {
  MIN_TEAM_CATEGORY_SIZE,
  evaluateTeamJoin,
  parseGenderComposition,
  registrationTeamSize,
  teamJoinDenialMessage,
} from "./tournament-team-category";
import {loadUserGenderBucket} from "./tournament-team-roster";
import {
  INVITES_COLLECTION,
  INVITE_TTL_MS,
  asTournamentCategory,
} from "./tournament-partner-invite";
import {
  SUBSTITUTION_BLOCK_MESSAGES,
  replaceUidInList,
  substitutionBlockReason,
  substitutionPermissionError,
} from "./tournament-substitution-logic";

function str(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => str(v)).filter((v) => v.length > 0);
}

function inviteExpiredAt(raw: unknown, nowMs: number): boolean {
  const ts = raw as Timestamp | undefined;
  return Boolean(ts && typeof ts.toMillis === "function" && ts.toMillis() < nowMs);
}

/**
 * Convite de substituição: [inviteeUid] entraria no LUGAR de [replacedUid] na
 * inscrição [registrationId]. Permitido até a publicação das chaves da
 * categoria. NÃO passa por `assertTournamentAcceptsRegistration`: a troca deve
 * funcionar com as inscrições já encerradas.
 */
export const sendTournamentSubstitutionInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Usuário não autenticado.");

  const registrationId = str(request.data?.registrationId);
  const replacedUid = str(request.data?.replacedUid);
  const inviteeUid = str(request.data?.inviteeUid);
  const inviteeName = str(request.data?.inviteeName) || "Atleta";
  const inviterName = str(request.data?.inviterName) || "Atleta";
  const replacedName = str(request.data?.replacedName) || "Atleta";
  if (!registrationId || !replacedUid || !inviteeUid) {
    throw new HttpsError(
      "invalid-argument",
      "registrationId, replacedUid e inviteeUid são obrigatórios.",
    );
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  const regRef = db.collection(artifactsInscriptionsPath(projectId)).doc(registrationId);
  const regSnap = await regRef.get();
  if (!regSnap.exists) throw new HttpsError("not-found", "Inscrição não encontrada.");
  const registration = regSnap.data()!;

  const tournamentId = str(registration.tournamentId);
  const categoryId = str(registration.categoryId);
  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) throw new HttpsError("not-found", "Torneio não encontrado.");
  const category = asTournamentCategory(findCategory(tournament, categoryId));
  if (!category) {
    throw new HttpsError("not-found", "Categoria não encontrada neste torneio.");
  }
  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);

  const block = substitutionBlockReason(tournament, category, categoryKeys);
  if (block) {
    throw new HttpsError("failed-precondition", SUBSTITUTION_BLOCK_MESSAGES[block], {reason: block});
  }

  const participantUids = stringList(registration.participantUids);
  const teamSize = registrationTeamSize(registration, category);
  const permissionError = substitutionPermissionError({
    initiatorUid: uid,
    replacedUid,
    inviteeUid,
    participantUids,
    teamSize,
    captainUid: str(registration.captainUid),
  });
  if (permissionError) throw new HttpsError("failed-precondition", permissionError);

  // Elegibilidade do elenco PÓS-troca. Gênero com requireDeclared: false no
  // envio (padrão dos convites: ausente só bloqueia no aceite).
  const rosterAfter = replaceUidInList(participantUids, replacedUid, inviteeUid);
  await assertTeamLevelEligibility({db, tournament, category, uids: rosterAfter});
  await assertTeamAgeEligibility({db, tournament, category, uids: rosterAfter});
  if (teamSize >= MIN_TEAM_CATEGORY_SIZE) {
    const composition = parseGenderComposition(category, teamSize);
    if (composition) {
      const others = rosterAfter.filter((id) => id !== inviteeUid);
      const buckets = await Promise.all(others.map((m) => loadUserGenderBucket(db, m)));
      const joiningBucket = await loadUserGenderBucket(db, inviteeUid);
      const joinCheck = evaluateTeamJoin({
        teamSize,
        composition,
        currentBuckets: buckets,
        joiningBucket,
      });
      if (!joinCheck.ok) {
        throw new HttpsError("failed-precondition", teamJoinDenialMessage(joinCheck.reason));
      }
    }
  } else {
    await assertTeamGenderEligibility({db, category, uids: rosterAfter, requireDeclared: false});
    await assertMixedDuoGenderEligibility({db, category, uids: rosterAfter, requireDeclared: false});
  }

  // Substituto não pode já ter inscrição na categoria (qualquer forma dela).
  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  for (const doc of inscriptionsSnap.docs) {
    const data = doc.data();
    if (!categoryKeys.has(str(data.categoryId))) continue;
    if (stringList(data.participantUids).includes(inviteeUid) || str(data.player1Id) === inviteeUid) {
      throw new HttpsError("failed-precondition", "Este atleta já está inscrito nesta categoria.");
    }
  }

  // Um convite de substituição pendente por vaga; sem duplicar pro convidado.
  const invitesSnap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();
  const nowMs = Date.now();
  for (const doc of invitesSnap.docs) {
    const data = doc.data();
    if (data.isSubstitutionInvite !== true) continue;
    if (str(data.attachRegistrationId) !== registrationId) continue;
    if (inviteExpiredAt(data.expiresAt, nowMs)) continue;
    if (str(data.replacedUid) === replacedUid) {
      throw new HttpsError(
        "already-exists",
        "Já existe um convite de substituição pendente para esta vaga.",
      );
    }
    if (str(data.inviteeUid) === inviteeUid) {
      throw new HttpsError(
        "already-exists",
        "Já existe um convite de substituição pendente para este atleta.",
      );
    }
  }

  const teamId = str(registration.teamId);
  const teamName = str(registration.teamName);
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
    expiresAt: Timestamp.fromMillis(nowMs + INVITE_TTL_MS),
    isSubstitutionInvite: true,
    replacedUid,
    replacedName,
    // attach: os sweeps existentes (cancelamento da inscrição) matam o convite junto.
    attachRegistrationId: registrationId,
    ...(teamId ? {attachTeamId: teamId} : {}),
    ...(teamName ? {teamName} : {}),
    ...(teamSize >= MIN_TEAM_CATEGORY_SIZE ? {teamSize} : {}),
  });

  try {
    const categoryLabel = formatCategoryInviteNotificationLabel(category);
    const tournamentName = str(tournament.name);
    await deliverNotificationToUser({
      userId: inviteeUid,
      title: `${inviterName} te chamou como substituto`,
      body:
        `Entre no lugar de ${replacedName} na categoria ${categoryLabel} ` +
        `do ${tournamentName}.`,
      type: "tournament_substitution_invite",
      data: {inviteId: ref.id, tournamentId, categoryId, inviterUid: uid},
    });
  } catch (notifyError) {
    logger.warn("Falha ao notificar substituto convidado", {inviteId: ref.id, inviteeUid, notifyError});
  }

  logger.info("Tournament substitution invite sent", {
    inviteId: ref.id, tournamentId, categoryId, registrationId, inviterUid: uid, replacedUid, inviteeUid,
  });
  return {inviteId: ref.id};
});
