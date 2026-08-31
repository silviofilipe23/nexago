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
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertTeamLevelEligibility} from "./category-level-eligibility";
import {assertTeamAgeEligibility} from "./category-age-eligibility";
import {
  assertMixedDuoGenderEligibility,
  assertTeamGenderEligibility,
} from "./category-gender-eligibility";
import {
  deliverNotificationToUser,
  markTournamentPartnerInviteInboxResponse,
} from "./notification-delivery";
import {tournamentManagerUids} from "./tournament-acl";
import {
  findCategory,
  loadTournamentData,
  resolveCategoryMatchKeys,
} from "./tournament-registration-guards";
import {formatCategoryInviteNotificationLabel} from "./category-display-labels";
import {
  artifactsInscriptionsPath,
  artifactsTeamsPath,
  getFirebaseProjectId,
} from "./firebase-paths";
import {deleteAsaasPaymentOrThrow} from "./asaas-booking-payment";
import {
  MIN_TEAM_CATEGORY_SIZE,
  evaluateTeamJoin,
  extractTeamMemberUids,
  parseGenderComposition,
  registrationTeamSize,
  teamJoinDenialMessage,
} from "./tournament-team-category";
import {loadUserGenderBucket} from "./tournament-team-roster";
import {
  INVITES_COLLECTION,
  INVITE_TTL_MS,
  LGPD_TERM_VERSION,
  asTournamentCategory,
  categoryRequiresUniform,
  parseUniformPayload,
  registrationUniformForSlot,
  uniformByUidEntry,
  validateUniformPayload,
} from "./tournament-partner-invite";
import {
  SUBSTITUTION_BLOCK_MESSAGES,
  SUBSTITUTION_MEMBER_LEFT_MESSAGE,
  replaceUidInList,
  substitutionBlockReason,
  substitutionPermissionError,
} from "./tournament-substitution-logic";
import {
  buildPairKey,
  loadCategoryRegistrationsTx,
} from "./tournament-pair-uniqueness";
import {
  normalizeAthleteGenderBucket,
  sharePaidUidsFromRegistration,
  type AthleteGenderBucket,
} from "./tournament-registration-pix-helpers";

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

/** Motivo declarado da substituição — opcional, validado só quando presente. */
export const SUBSTITUTION_REASONS = [
  "lesao",
  "imprevisto",
  "trabalho",
  "viagem",
  "outro",
] as const;
export type SubstitutionReason = (typeof SUBSTITUTION_REASONS)[number];

const SUBSTITUTION_REASON_LABELS: Record<SubstitutionReason, string> = {
  lesao: "Lesão",
  imprevisto: "Imprevisto pessoal",
  trabalho: "Trabalho",
  viagem: "Viagem",
  outro: "Outro",
};

const SUBSTITUTION_REASON_NOTE_MAX_LENGTH = 300;

/** Label PT do motivo — usado na notificação ao organizador. */
export function substitutionReasonLabel(reason: string): string {
  return SUBSTITUTION_REASON_LABELS[reason as SubstitutionReason] ?? reason;
}

function parseSubstitutionReason(raw: unknown): SubstitutionReason | undefined {
  const value = str(raw);
  if (!value) return undefined;
  if (!(SUBSTITUTION_REASONS as readonly string[]).includes(value)) {
    throw new HttpsError("invalid-argument", "Motivo da substituição inválido.");
  }
  return value as SubstitutionReason;
}

function parseSubstitutionReasonNote(raw: unknown): string | undefined {
  const value = str(raw);
  if (!value) return undefined;
  if (value.length > SUBSTITUTION_REASON_NOTE_MAX_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `O motivo detalhado deve ter no máximo ${SUBSTITUTION_REASON_NOTE_MAX_LENGTH} caracteres.`,
    );
  }
  return value;
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
  const reason = parseSubstitutionReason(request.data?.reason);
  const reasonNote = parseSubstitutionReasonNote(request.data?.reasonNote);

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
    ...(reason ? {reason} : {}),
    ...(reasonNote ? {reasonNote} : {}),
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

/** Parâmetros do aceite (chamado por `acceptTournamentPartnerInvite`). */
export interface AcceptSubstitutionParams {
  db: Firestore;
  projectId: string;
  /** Convidado (substituto), autenticado. */
  uid: string;
  inviteId: string;
  inviteeLgpdAccepted: boolean;
  inviteeUniformRaw: unknown;
}

export async function acceptSubstitutionInviteFor(
  params: AcceptSubstitutionParams,
): Promise<{registrationId: string; teamId: string; tournamentId: string; categoryId: string}> {
  const {db, projectId, uid, inviteId, inviteeLgpdAccepted, inviteeUniformRaw} = params;

  const inviteRef = db.collection(INVITES_COLLECTION).doc(inviteId);
  const preview = (await inviteRef.get()).data();
  if (!preview) throw new HttpsError("not-found", "Convite não encontrado.");
  if (preview.inviteeUid !== uid) {
    throw new HttpsError("permission-denied", "Este convite não é para você.");
  }
  if (preview.status !== "pending") {
    throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
  }

  const tournamentId = str(preview.tournamentId);
  const categoryId = str(preview.categoryId);
  const registrationId = str(preview.attachRegistrationId);
  const outUid = str(preview.replacedUid);
  if (!tournamentId || !registrationId || !outUid) {
    throw new HttpsError("failed-precondition", "Convite inválido.");
  }

  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) throw new HttpsError("not-found", "Torneio não encontrado.");
  const category = asTournamentCategory(findCategory(tournament, categoryId));
  if (!category) throw new HttpsError("not-found", "Categoria não encontrada.");
  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);

  const regRef = db.collection(artifactsInscriptionsPath(projectId)).doc(registrationId);
  const regPreview = (await regRef.get()).data();
  if (!regPreview) {
    throw new HttpsError("failed-precondition", "A inscrição não existe mais.");
  }

  // Quem sairia já saiu (leave, cancelamento, outra troca): o convite morre.
  // FORA da transação de propósito — marcar stale e lançar dentro dela
  // descartaria a escrita junto (mesmo padrão da expiração no aceite normal).
  const previewParticipants = stringList(regPreview.participantUids);
  if (!previewParticipants.includes(outUid)) {
    await inviteRef.update({
      status: "stale",
      staleReason: "member_left",
      staleAt: FieldValue.serverTimestamp(),
    });
    throw new HttpsError("failed-precondition", SUBSTITUTION_MEMBER_LEFT_MESSAGE);
  }

  // Elegibilidade do elenco pós-troca — requireDeclared: o aceite fecha a vaga.
  const rosterAfter = replaceUidInList(previewParticipants, outUid, uid);
  const teamSize = registrationTeamSize(regPreview, category);
  const isTeam = teamSize >= MIN_TEAM_CATEGORY_SIZE;
  await assertTeamLevelEligibility({db, tournament, category, uids: rosterAfter});
  await assertTeamAgeEligibility({db, tournament, category, uids: rosterAfter});
  if (!isTeam) {
    await assertTeamGenderEligibility({db, category, uids: rosterAfter, requireDeclared: true});
    await assertMixedDuoGenderEligibility({db, category, uids: rosterAfter, requireDeclared: true});
  }

  const inviteeUniform = parseUniformPayload(inviteeUniformRaw);
  validateUniformPayload(
    category,
    inviteeUniform,
    inviteeUniform != null && categoryRequiresUniform(category),
  );

  // Gate avaliado ANTES de qualquer efeito externo (o cancelamento no Asaas é
  // irreversível): o caso mais comum de recusa não pode matar o PIX de quem
  // sairia. A transação re-checa para serializar a corrida publicar × aceitar.
  const previewBlock = substitutionBlockReason(tournament, category, categoryKeys);
  if (previewBlock) {
    throw new HttpsError("failed-precondition", SUBSTITUTION_BLOCK_MESSAGES[previewBlock], {reason: previewBlock});
  }

  // Cobrança PIX aberta de quem sai morre ANTES de qualquer escrita (padrão do
  // cancelamento). O doc `pixPending/{uid}` tem o pagador como id.
  const outPixRef = regRef.collection("pixPending").doc(outUid);
  const outPixSnap = await outPixRef.get();
  if (outPixSnap.exists && outPixSnap.data()?.status !== "paid") {
    const asaasId = str(outPixSnap.data()?.asaasPaymentId);
    if (asaasId) {
      try {
        await deleteAsaasPaymentOrThrow(asaasId);
      } catch (e) {
        logger.error("Falha ao cancelar PIX do atleta substituído", {registrationId, asaasId, e});
        throw new HttpsError(
          "unavailable",
          "Não foi possível cancelar a cobrança PIX pendente do atleta que sai. Tente novamente.",
        );
      }
    }
  }

  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const teamsPath = artifactsTeamsPath(projectId);

  const result = await db.runTransaction(async (tx) => {
    const invite = (await tx.get(inviteRef)).data();
    if (!invite || invite.status !== "pending") {
      throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
    }
    const expiresAt = invite.expiresAt as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      throw new HttpsError("failed-precondition", "Este convite expirou.");
    }

    // Gate re-lido DENTRO da transação: publicar a chave escreve no doc do
    // torneio, então esta leitura serializa a corrida publicar × aceitar.
    const tournamentTxSnap = await tx.get(db.doc(`tournaments/${tournamentId}`));
    const tournamentTx = tournamentTxSnap.exists ? tournamentTxSnap.data()! : tournament;
    const block = substitutionBlockReason(
      tournamentTx,
      findCategory(tournamentTx, categoryId),
      categoryKeys,
    );
    if (block) {
      throw new HttpsError("failed-precondition", SUBSTITUTION_BLOCK_MESSAGES[block], {reason: block});
    }

    const regSnap = await tx.get(regRef);
    if (!regSnap.exists) {
      throw new HttpsError("failed-precondition", "A inscrição não existe mais.");
    }
    const reg = regSnap.data()!;
    const participants = stringList(reg.participantUids);
    if (!participants.includes(outUid)) {
      throw new HttpsError("failed-precondition", SUBSTITUTION_MEMBER_LEFT_MESSAGE);
    }
    if (participants.includes(uid)) {
      throw new HttpsError("failed-precondition", "Você já está nesta inscrição.");
    }

    const teamId = str(reg.teamId);
    const teamRef = teamId ? db.doc(`${teamsPath}/${teamId}`) : null;
    const teamSnap = teamRef ? await tx.get(teamRef) : null;
    const team = teamSnap?.exists ? teamSnap.data()! : null;

    // Substituto sem OUTRA inscrição na categoria; dupla não pode repetir par.
    const categoryRegs = await loadCategoryRegistrationsTx(
      tx, inscriptionsRef, teamsPath, tournamentId, categoryKeys,
    );
    for (const parsed of categoryRegs) {
      if (parsed.registrationId === registrationId) continue;
      if (parsed.participantUids.includes(uid)) {
        throw new HttpsError("failed-precondition", "Você já possui inscrição nesta categoria.");
      }
    }
    if (!isTeam) {
      const remaining = participants.filter((id) => id !== outUid);
      const newPairKey = remaining.length > 0 ? buildPairKey(remaining[0], uid) : "";
      const duplicate =
        newPairKey.length > 0 &&
        categoryRegs.some(
          (parsed) => parsed.registrationId !== registrationId && parsed.pairKey === newPairKey,
        );
      if (duplicate) {
        throw new HttpsError(
          "failed-precondition",
          "Já existe uma dupla com vocês dois nesta categoria.",
        );
      }
    }

    // Composição de gênero (equipe) contra o elenco ATUAL menos quem sai —
    // relida na transação, como no aceite de convite de equipe.
    if (isTeam) {
      const composition = parseGenderComposition(category, teamSize);
      if (composition) {
        const buckets: Array<AthleteGenderBucket | null> = [];
        for (const memberUid of participants.filter((id) => id !== outUid)) {
          const userSnap = await tx.get(db.doc(`users/${memberUid}`));
          const gender = userSnap.exists ? userSnap.data()?.gender : undefined;
          buckets.push(normalizeAthleteGenderBucket(typeof gender === "string" ? gender : undefined));
        }
        const mySnap = await tx.get(db.doc(`users/${uid}`));
        const myGender = mySnap.exists ? mySnap.data()?.gender : undefined;
        const joinCheck = evaluateTeamJoin({
          teamSize,
          composition,
          currentBuckets: buckets,
          joiningBucket: normalizeAthleteGenderBucket(
            typeof myGender === "string" ? myGender : undefined,
          ),
        });
        if (!joinCheck.ok) {
          throw new HttpsError("failed-precondition", teamJoinDenialMessage(joinCheck.reason, "self"));
        }
      }
    }

    // ── escritas ──
    const outHadPaid = sharePaidUidsFromRegistration(reg).includes(outUid);
    const outIndex = participants.indexOf(outUid);
    const regUpdate: Record<string, unknown> = {
      participantUids: replaceUidInList(participants, outUid, uid),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (str(reg.player1Id) === outUid) regUpdate.player1Id = uid;
    if (outHadPaid) {
      regUpdate.sharePaidUids = replaceUidInList(sharePaidUidsFromRegistration(reg), outUid, uid);
    }
    const confirmedShares = stringList(reg.organizerConfirmedShareUids);
    if (confirmedShares.includes(outUid)) {
      regUpdate.organizerConfirmedShareUids = replaceUidInList(confirmedShares, outUid, uid);
    }
    if (isTeam) {
      regUpdate[`uniformByUid.${outUid}`] = FieldValue.delete();
      if (inviteeUniform) regUpdate[`uniformByUid.${uid}`] = uniformByUidEntry(inviteeUniform);
    } else {
      const slot = outIndex === 0 ? "Player1" : "Player2";
      for (const field of [
        `sizeTop${slot}`, `sizeShorts${slot}`, `jerseyNumber${slot}`, `jerseyName${slot}`,
      ]) {
        regUpdate[field] = FieldValue.delete();
      }
      if (inviteeUniform) {
        Object.assign(regUpdate, registrationUniformForSlot(inviteeUniform, slot));
      }
    }
    if (inviteeLgpdAccepted) {
      regUpdate.lgpdAcceptedUids = FieldValue.arrayUnion(uid);
      regUpdate[`lgpdAcceptedAt.${uid}`] = FieldValue.serverTimestamp();
      regUpdate.lgpdTermVersion = LGPD_TERM_VERSION;
    }
    // Trilha de auditoria. `Timestamp.now()`: serverTimestamp não entra em array.
    regUpdate.substitutionHistory = FieldValue.arrayUnion({
      outUid,
      outName: str(invite.replacedName) || "Atleta",
      inUid: uid,
      inName: str(invite.inviteeName) || "Atleta",
      byUid: str(invite.inviterUid),
      at: Timestamp.now(),
      outHadPaid,
      ...(str(invite.reason) ? {reason: str(invite.reason)} : {}),
      ...(str(invite.reasonNote) ? {reasonNote: str(invite.reasonNote)} : {}),
    });
    tx.update(regRef, regUpdate);

    if (teamRef && team) {
      const teamUpdate: Record<string, unknown> = {
        memberUids: replaceUidInList(extractTeamMemberUids(team), outUid, uid),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (str(team.player1Id) === outUid) teamUpdate.player1Id = uid;
      if (str(team.player2Id) === outUid) teamUpdate.player2Id = uid;
      tx.update(teamRef, teamUpdate);
    }

    if (outPixSnap.exists) tx.delete(outPixRef);

    tx.update(inviteRef, {
      status: "accepted",
      registrationId,
      ...(teamId ? {teamId} : {}),
      acceptedAt: FieldValue.serverTimestamp(),
    });

    return {registrationId, teamId, tournamentId, categoryId};
  });

  await markStaleAfterSubstitutionAccept(db, {
    tournamentId, categoryId, registrationId, outUid, substituteUid: uid, acceptedInviteId: inviteId,
  });
  await notifySubstitutionCompleted(db, {
    tournament, category, invite: preview, result, outUid, substituteUid: uid,
    rosterAfter, isTeam,
  });

  try {
    await markTournamentPartnerInviteInboxResponse(uid, inviteId, "accepted", {
      tournamentId, categoryId, registrationId: result.registrationId,
    });
  } catch (inboxError) {
    logger.warn("Falha ao atualizar inbox do convite de substituição", {inviteId, uid, inboxError});
  }

  logger.info("Tournament substitution accepted", {inviteId, ...result, outUid, substituteUid: uid});
  return result;
}

/** Convites tornados obsoletos pelo aceite: outros convites de substituição da
 *  MESMA vaga e convites pendentes que tocam o substituto na categoria. */
async function markStaleAfterSubstitutionAccept(
  db: Firestore,
  params: {
    tournamentId: string;
    categoryId: string;
    registrationId: string;
    outUid: string;
    substituteUid: string;
    acceptedInviteId: string;
  },
): Promise<void> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", params.tournamentId)
    .where("status", "==", "pending")
    .get();
  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    if (doc.id === params.acceptedInviteId) continue;
    const data = doc.data();
    const sameSlot =
      data.isSubstitutionInvite === true &&
      str(data.attachRegistrationId) === params.registrationId &&
      str(data.replacedUid) === params.outUid;
    const touchesSubstitute =
      str(data.categoryId) === params.categoryId &&
      (str(data.inviteeUid) === params.substituteUid || str(data.inviterUid) === params.substituteUid);
    if (!sameSlot && !touchesSubstitute) continue;
    batch.update(doc.ref, {
      status: "stale",
      staleReason: "accepted_other_invite",
      staleAt: FieldValue.serverTimestamp(),
    });
    count++;
  }
  if (count > 0) await batch.commit();
}

/** Avisos pós-fato (falha não desfaz a troca): quem saiu, o resto do elenco e
 *  quem opera o torneio. */
async function notifySubstitutionCompleted(
  db: Firestore,
  params: {
    tournament: Record<string, unknown>;
    category: Record<string, unknown>;
    invite: Record<string, unknown>;
    result: {registrationId: string; tournamentId: string; categoryId: string};
    outUid: string;
    substituteUid: string;
    rosterAfter: string[];
    isTeam: boolean;
  },
): Promise<void> {
  const {tournament, category, invite, result, outUid, substituteUid, rosterAfter, isTeam} = params;
  const inName = str(invite.inviteeName) || "O substituto";
  const outName = str(invite.replacedName) || "o atleta";
  const label = formatCategoryInviteNotificationLabel(category);
  const tournamentName = str(tournament.name);
  const reason = str(invite.reason);
  const reasonNote = str(invite.reasonNote);
  const managerReasonSuffix = reason
    ? ` Motivo informado: ${substitutionReasonLabel(reason)}.` +
      (reasonNote ? ` — "${reasonNote}"` : "")
    : "";

  await deliverNotificationToUser({
    userId: outUid,
    title: "Você foi substituído",
    body:
      `${inName} entrou no seu lugar na categoria ${label} do ${tournamentName}. ` +
      `Fale com ${isTeam ? "o capitão" : "seu parceiro"} se isso não era esperado.`,
    type: "tournament_substitution_out",
    data: {tournamentId: result.tournamentId, categoryId: result.categoryId, registrationId: result.registrationId},
  }).catch(() => undefined);

  const remaining = rosterAfter.filter((id) => id !== substituteUid);
  await Promise.all(
    remaining.map((memberUid) =>
      deliverNotificationToUser({
        userId: memberUid,
        title: "Substituição concluída",
        body: `${inName} entrou no lugar de ${outName} na categoria ${label}.`,
        type: "tournament_substitution_completed",
        data: {tournamentId: result.tournamentId, categoryId: result.categoryId, registrationId: result.registrationId},
      }).catch(() => undefined),
    ),
  );

  try {
    const managers = await tournamentManagerUids(db, result.tournamentId, tournament);
    await Promise.all(
      managers.map((managerUid) =>
        deliverNotificationToUser({
          userId: managerUid,
          title: "Substituição de atleta",
          body: `${inName} entrou no lugar de ${outName} na categoria ${label}.${managerReasonSuffix}`,
          type: "tournament_substitution_completed",
          data: {
            tournamentId: result.tournamentId,
            registrationId: result.registrationId,
            url: `/painel/eventos/${result.tournamentId}/inscricoes?registrationId=${result.registrationId}`,
          },
        }).catch(() => undefined),
      ),
    );
  } catch (notifyError) {
    logger.warn("Falha ao notificar organizador da substituição", {notifyError});
  }
}

/**
 * Marca `stale` (bracket_published) os convites de substituição pendentes da
 * categoria. Chamado por `generateCategoryBracket` após publicar — o aceite
 * re-checa o gate de qualquer forma; isto só mantém o inbox limpo.
 */
export async function markStaleSubstitutionInvitesForCategory(
  db: Firestore,
  tournamentId: string,
  categoryId: string,
): Promise<number> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();
  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.isSubstitutionInvite !== true) continue;
    if (str(data.categoryId) !== categoryId) continue;
    batch.update(doc.ref, {
      status: "stale",
      staleReason: "bracket_published",
      staleAt: FieldValue.serverTimestamp(),
    });
    count++;
  }
  if (count > 0) await batch.commit();
  return count;
}
