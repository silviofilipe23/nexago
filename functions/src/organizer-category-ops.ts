import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";
import {MatchStatus, isMatchCompleted, isMatchInProgress} from "./match-status";
import {
  buildDoubleEliminationMatches,
  buildGroupsKnockoutMatches,
  buildSingleEliminationMatches,
} from "./category-bracket-builders";
import {assertCanManageTournament} from "./tournament-acl";
import {
  canCancelTournament,
  countPaidRegistrations,
  paidTeamIdsForCancellation,
} from "./tournament-cancellation";

function getFirebaseProjectId(): string {
  return process.env.GCLOUD_PROJECT || "volley-track-2dd3b";
}

function artifactsInscriptionsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/inscriptions`;
}

function artifactsTeamsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/teams`;
}

function artifactsMatchesPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/matches`;
}

function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

export const generateCategoryBracket = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  const categoryId = (request.data?.categoryId as string)?.trim();
  const format = (request.data?.format as string)?.trim() || "groups_knockout";
  if (!tournamentId || !categoryId) {
    throw new HttpsError("invalid-argument", "tournamentId e categoryId obrigatórios");
  }

  const supportedBracketFormats = new Set([
    "groups_knockout",
    "single_elimination",
    "double_elimination",
  ]);
  if (!supportedBracketFormats.has(format)) {
    throw new HttpsError(
      "failed-precondition",
      `Formato "${format}" ainda não é suportado para geração de chave.`,
    );
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  await assertCanManageTournament(db, uid, tournamentId);

  const seeds = (request.data?.seeds as string[] | undefined) ?? [];
  const groupsPreview =
    (request.data?.groupsPreview as Array<{id: string; teamIds: string[]}> | undefined) ??
    [];
  const bracketConfig = request.data?.bracketConfig as Record<string, unknown> | undefined;

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  const tournamentData = tournamentSnap.data() ?? {};
  const categories =
    (tournamentData.categories as Array<Record<string, unknown>> | undefined) ?? [];
  const categoryMeta = categories.find(
    (entry) => String(entry.categoryName ?? "").trim() === categoryId,
  );
  const qualifiersPerGroup =
    (bracketConfig?.qualifiersPerGroup as number | undefined) ??
    (categoryMeta?.qualifiersPerGroup as number | undefined) ??
    2;

  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const paidTeamIds = new Set<string>();
  for (const doc of inscriptionsSnap.docs) {
    const data = doc.data();
    const teamId = (data.teamId as string)?.trim();
    // "Confirmado" no NexaGO = pago, fora da fila e com dupla completa.
    // Inscrições solo (partnerPending) não entram na chave.
    if (
      teamId &&
      data.isPaid === true &&
      data.waitlist !== true &&
      data.partnerPending !== true
    ) {
      paidTeamIds.add(teamId);
    }
  }

  const teamIds: string[] = [];
  if (seeds.length > 0) {
    for (const seed of seeds) {
      const id = seed.trim();
      if (id && paidTeamIds.has(id)) teamIds.push(id);
    }
  } else {
    teamIds.push(...paidTeamIds);
  }

  if (teamIds.length < 2) {
    throw new HttpsError(
      "failed-precondition",
      "É necessário ao menos 2 equipes pagas para publicar a chave.",
    );
  }

  const existingMatches = await db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  // Regerar a chave APAGA as partidas existentes. Se alguma já foi jogada
  // (em andamento/concluída ou com vencedor), exige confirmação explícita
  // (`force`) para não perder resultados silenciosamente.
  const force = request.data?.force === true;
  if (!force) {
    const hasPlayedMatches = existingMatches.docs.some((doc) => {
      const m = doc.data();
      const winnerId = typeof m.winnerId === "string" ? m.winnerId.trim() : "";
      return (
        isMatchCompleted(m.status) ||
        isMatchInProgress(m.status) ||
        winnerId.length > 0
      );
    });
    if (hasPlayedMatches) {
      throw new HttpsError(
        "failed-precondition",
        "A chave já tem partidas em andamento ou concluídas. " +
          "Regerar vai apagar os resultados atuais.",
        {reason: "bracket_has_results"},
      );
    }
  }

  const resolvedGroups =
    groupsPreview.length > 0
      ? groupsPreview
      : [
          {id: "A", teamIds: teamIds.slice(0, Math.ceil(teamIds.length / 2))},
          {id: "B", teamIds: teamIds.slice(Math.ceil(teamIds.length / 2))},
        ];

  const matchDrafts =
    format === "double_elimination"
      ? buildDoubleEliminationMatches(teamIds)
      : format === "single_elimination"
        ? buildSingleEliminationMatches(teamIds)
        : buildGroupsKnockoutMatches(
            teamIds,
            resolvedGroups,
            qualifiersPerGroup,
          );

  const batch = db.batch();
  const matchesCol = db.collection(artifactsMatchesPath(projectId));

  for (const doc of existingMatches.docs) {
    batch.delete(doc.ref);
  }

  for (const draft of matchDrafts) {
    const ref = matchesCol.doc();
    batch.set(ref, {
      tournamentId,
      categoryId,
      round: draft.round,
      matchType: draft.matchType,
      poolId: draft.poolId,
      teamAId: draft.teamAId,
      teamBId: draft.teamBId,
      status: MatchStatus.scheduled,
      resultA: "",
      resultB: "",
      isGroupMatch: draft.isGroupMatch,
      matchNumber: draft.matchNumber,
      ...(draft.winnerAdvance ? {winnerAdvance: draft.winnerAdvance} : {}),
      ...(draft.loserAdvance ? {loserAdvance: draft.loserAdvance} : {}),
      ...(draft.teamAQualifier ? {teamAQualifier: draft.teamAQualifier} : {}),
      ...(draft.teamBQualifier ? {teamBQualifier: draft.teamBQualifier} : {}),
      ...(draft.teamADescription ? {teamADescription: draft.teamADescription} : {}),
      ...(draft.teamBDescription ? {teamBDescription: draft.teamBDescription} : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const tournamentRef = db.doc(`tournaments/${tournamentId}`);
  batch.set(
    tournamentRef,
    {
      categoryOps: {
        [categoryId]: {
          bracketStatus: "published",
          bracketFormatOverride: format,
          seeds: teamIds,
          bracketConfig: {
            ...(bracketConfig ?? {}),
            qualifiersPerGroup,
          },
          groupsPreview: resolvedGroups,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  await batch.commit();
  return {matchCount: matchDrafts.length, format};
});

export const organizerConfirmRegistrationPayment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const registrationId = (request.data?.registrationId as string)?.trim();
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId obrigatório");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsInscriptionsPath(projectId)}/${registrationId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inscrição não encontrada");

  const data = snap.data()!;
  const tournamentId = (data.tournamentId as string)?.trim();
  if (!tournamentId) throw new HttpsError("failed-precondition", "Torneio inválido");

  await assertCanManageTournament(db, uid, tournamentId);
  await ref.update({
    isPaid: true,
    // Ao confirmar o pagamento, o time deixa de ser "fila".
    waitlist: false,
    paidAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {ok: true};
});

export const organizerMoveToWaitlist = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const registrationId = (request.data?.registrationId as string)?.trim();
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId obrigatório");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsInscriptionsPath(projectId)}/${registrationId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inscrição não encontrada");

  const tournamentId = (snap.data()?.tournamentId as string)?.trim();
  if (!tournamentId) throw new HttpsError("failed-precondition", "Torneio inválido");

  await assertCanManageTournament(db, uid, tournamentId);
  await ref.update({
    waitlist: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {ok: true};
});

export const organizerRemoveFromCategory = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const registrationId = (request.data?.registrationId as string)?.trim();
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId obrigatório");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsInscriptionsPath(projectId)}/${registrationId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inscrição não encontrada");

  const tournamentId = (snap.data()?.tournamentId as string)?.trim();
  if (!tournamentId) throw new HttpsError("failed-precondition", "Torneio inválido");

  await assertCanManageTournament(db, uid, tournamentId);
  await ref.delete();
  return {ok: true};
});

export const resendRegistrationPayment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const registrationId = (request.data?.registrationId as string)?.trim();
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId obrigatório");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const ref = db.doc(`${artifactsInscriptionsPath(projectId)}/${registrationId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inscrição não encontrada");

  const data = snap.data()!;
  const tournamentId = (data.tournamentId as string)?.trim();
  if (!tournamentId) throw new HttpsError("failed-precondition", "Torneio inválido");

  await assertCanManageTournament(db, uid, tournamentId);

  const teamId = (data.teamId as string)?.trim();
  if (!teamId) throw new HttpsError("failed-precondition", "Equipe inválida");

  const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
  const team = teamSnap.data();
  const payerUid = (team?.player1Id as string) || (team?.player2Id as string);
  if (!payerUid) throw new HttpsError("failed-precondition", "Atleta não encontrado");

  await deliverNotificationToUser({
    userId: payerUid,
    title: "Cobrança de inscrição",
    body: "O organizador reenviou a cobrança da sua inscrição no torneio.",
    type: "tournament_payment_reminder",
    data: {tournamentId, registrationId},
    requireInteraction: true,
  });

  return {ok: true};
});

export const sendCategoryCommunication = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  const categoryId = (request.data?.categoryId as string)?.trim();
  const message = (request.data?.message as string)?.trim();
  const audience = (request.data?.audience as string)?.trim() || "all";
  const sendPush = request.data?.sendPush !== false;

  if (!tournamentId || !categoryId || !message) {
    throw new HttpsError("invalid-argument", "Dados incompletos");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  await assertCanManageTournament(db, uid, tournamentId);

  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const whatsappLinks: Array<{teamId: string; links: string[]}> = [];
  let pushCount = 0;

  for (const doc of inscriptionsSnap.docs) {
    const inscription = doc.data();
    const confirmed =
      inscription.isPaid === true && inscription.waitlist !== true;
    if (audience === "paid" && !confirmed) continue;
    if (audience === "pending" && confirmed) continue;

    const teamId = (inscription.teamId as string)?.trim();
    if (!teamId) continue;

    const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
    if (!teamSnap.exists) continue;
    const team = teamSnap.data()!;
    const playerIds = [team.player1Id, team.player2Id].filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );

    const links: string[] = [];
    for (const playerId of playerIds) {
      const userSnap = await db.doc(`users/${playerId}`).get();
      const phone = (userSnap.data()?.phoneNumber as string)?.trim() ?? "";
      if (phone) {
        const waPhone = normalizePhoneForWhatsApp(phone);
        links.push(
          `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`,
        );
      }
      if (sendPush) {
        await deliverNotificationToUser({
          userId: playerId,
          title: "Mensagem do torneio",
          body: message.slice(0, 180),
          type: "tournament_communication",
          data: {tournamentId, categoryId},
          requireInteraction: false,
        });
        pushCount++;
      }
    }
    whatsappLinks.push({teamId, links});
  }

  return {pushCount, whatsappLinks};
});

export const closeTournamentRegistrations = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }

  const db = getFirestore();
  const tournament = await assertCanManageTournament(db, uid, tournamentId);
  const categories = ((tournament.categories as unknown[]) ?? []).map((item) => {
    if (typeof item !== "object" || item === null) return item;
    return {...(item as Record<string, unknown>), registrationClosed: true};
  });

  await db.doc(`tournaments/${tournamentId}`).update({
    listingStatus: "closed",
    categories,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {ok: true};
});

/**
 * Avisa as duplas pagas de que o torneio foi cancelado (para buscarem o
 * reembolso). Resolve os times pagos -> uids dos atletas e entrega push+inbox.
 * Best-effort: falhas aqui não revertem o cancelamento já efetivado.
 */
async function notifyPaidTeamsOfCancellation(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  tournamentName: string,
  paidTeamIds: string[],
): Promise<void> {
  const uids = new Set<string>();
  for (const teamId of paidTeamIds) {
    const teamSnap = await db
      .doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
      .get();
    const team = teamSnap.data() ?? {};
    for (const id of [team.player1Id, team.player2Id]) {
      if (typeof id === "string" && id.trim()) uids.add(id.trim());
    }
  }

  const body =
    `${tournamentName} foi cancelado pelo organizador. ` +
    "Procure o organizador para tratar do reembolso.";
  await Promise.all(
    [...uids].map((uid) =>
      deliverNotificationToUser({
        userId: uid,
        title: "Torneio cancelado",
        body,
        type: "tournament_cancelled",
        data: {tournamentId, url: `/torneios/${tournamentId}`},
      }),
    ),
  );
}

export const cancelTournament = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }

  const db = getFirestore();
  await assertCanManageTournament(db, uid, tournamentId);

  // Integridade financeira: não cancelar silenciosamente um torneio com
  // inscrições pagas — não há estorno automático, então o organizador precisa
  // confirmar (force) que vai reembolsar manualmente.
  const projectId = getFirebaseProjectId();
  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  const paidCount = countPaidRegistrations(
    inscriptionsSnap.docs.map((d) => d.data()),
  );
  const force = request.data?.force === true;
  if (!canCancelTournament({paidCount, force})) {
    throw new HttpsError(
      "failed-precondition",
      `${paidCount} dupla(s) já pagaram a inscrição. Cancelar exige reembolso ` +
        "manual — confirme para prosseguir.",
      {reason: "has_paid_registrations", paidCount},
    );
  }

  const tournamentRef = db.doc(`tournaments/${tournamentId}`);
  await tournamentRef.update({
    listingStatus: "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
    refundsPending: paidCount > 0,
    paidRegistrationsAtCancel: paidCount,
    updatedAt: FieldValue.serverTimestamp(),
  });
  logger.info("Torneio cancelado pelo organizador", {
    tournamentId,
    uid,
    paidCount,
    force,
  });

  // Avisa as duplas pagas para buscarem o reembolso (best-effort).
  if (paidCount > 0) {
    try {
      const tournamentSnap = await tournamentRef.get();
      const tournamentName =
        typeof tournamentSnap.data()?.name === "string" ?
          (tournamentSnap.data()?.name as string) :
          "O torneio";
      const paidTeamIds = paidTeamIdsForCancellation(
        inscriptionsSnap.docs.map((d) => d.data()),
      );
      await notifyPaidTeamsOfCancellation(
        db,
        projectId,
        tournamentId,
        tournamentName,
        paidTeamIds,
      );
    } catch (e) {
      logger.error("cancelTournament: falha ao notificar duplas pagas", {
        tournamentId,
        e,
      });
    }
  }

  return {ok: true, paidCount};
});
