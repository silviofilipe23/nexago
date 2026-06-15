import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {hasRoleInClaims} from "./auth-roles";
import {deliverNotificationToUser} from "./notification-delivery";
import {MatchStatus} from "./match-status";

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

async function assertCanManageTournament(
  db: Firestore,
  uid: string,
  tournamentId: string,
): Promise<Record<string, unknown>> {
  const snap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Torneio não encontrado");
  }
  const data = snap.data()!;
  const managerId = data.managerId as string | undefined;
  if (managerId === uid) return data;

  const user = await getAuth().getUser(uid);
  const claims = user.customClaims ?? {};
  if (
    hasRoleInClaims(claims, "admin") ||
    claims["superAdmin"] === true ||
    hasRoleInClaims(claims, "organizer")
  ) {
    return data;
  }

  const staffSnap = await db
    .doc(`tournaments/${tournamentId}/staff/${uid}`)
    .get();
  if (
    staffSnap.exists &&
    staffSnap.data()?.status === "active" &&
    staffSnap.data()?.role === "manager"
  ) {
    return data;
  }

  throw new HttpsError("permission-denied", "Sem permissão para este torneio");
}

function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

interface MatchDraft {
  round: number;
  matchType: string;
  poolId: string;
  teamAId: string;
  teamBId: string;
  isGroupMatch: boolean;
  matchNumber: number;
}

function buildGroupsKnockoutMatches(
  teamIds: string[],
  groups: Array<{id: string; teamIds: string[]}>,
): MatchDraft[] {
  const matches: MatchDraft[] = [];
  let matchNumber = 1;
  for (const group of groups) {
    const ids = group.teamIds.filter((id) => id.trim().length > 0);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        matches.push({
          round: 0,
          matchType: "group",
          poolId: group.id,
          teamAId: ids[i],
          teamBId: ids[j],
          isGroupMatch: true,
          matchNumber: matchNumber++,
        });
      }
    }
  }
  if (teamIds.length >= 4) {
    const seeds = teamIds.slice(0, 4);
    matches.push({
      round: 1,
      matchType: "knockout",
      poolId: "",
      teamAId: seeds[0],
      teamBId: seeds[3],
      isGroupMatch: false,
      matchNumber: matchNumber++,
    });
    matches.push({
      round: 1,
      matchType: "knockout",
      poolId: "",
      teamAId: seeds[1],
      teamBId: seeds[2],
      isGroupMatch: false,
      matchNumber: matchNumber++,
    });
  }
  return matches;
}

function buildDoubleEliminationMatches(teamIds: string[]): MatchDraft[] {
  const matches: MatchDraft[] = [];
  const n = teamIds.length;
  if (n < 2) return matches;

  const bracketSize = 1 << Math.ceil(Math.log2(n));
  const padded = [...teamIds];
  while (padded.length < bracketSize) padded.push("");

  let matchNumber = 1;
  const firstRoundPairs = bracketSize / 2;
  for (let i = 0; i < firstRoundPairs; i++) {
    matches.push({
      round: 1,
      matchType: "winners",
      poolId: "",
      teamAId: padded[i * 2] ?? "",
      teamBId: padded[i * 2 + 1] ?? "",
      isGroupMatch: false,
      matchNumber: matchNumber++,
    });
  }

  let round = 2;
  let remaining = firstRoundPairs / 2;
  while (remaining >= 1) {
    for (let i = 0; i < remaining; i++) {
      matches.push({
        round,
        matchType: "winners",
        poolId: "",
        teamAId: "",
        teamBId: "",
        isGroupMatch: false,
        matchNumber: matchNumber++,
      });
    }
    round++;
    remaining = remaining / 2;
  }

  matches.push({
    round: round,
    matchType: "grand_final",
    poolId: "",
    teamAId: "",
    teamBId: "",
    isGroupMatch: false,
    matchNumber: matchNumber++,
  });

  return matches;
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

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  await assertCanManageTournament(db, uid, tournamentId);

  const seeds = (request.data?.seeds as string[] | undefined) ?? [];
  const groupsPreview =
    (request.data?.groupsPreview as Array<{id: string; teamIds: string[]}> | undefined) ??
    [];
  const bracketConfig = request.data?.bracketConfig as Record<string, unknown> | undefined;

  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const teamIds: string[] = [];
  if (seeds.length > 0) {
    teamIds.push(...seeds);
  } else {
    for (const doc of inscriptionsSnap.docs) {
      const teamId = (doc.data().teamId as string)?.trim();
      if (teamId && doc.data().isPaid === true) teamIds.push(teamId);
    }
  }

  const matchDrafts =
    format === "double_elimination"
      ? buildDoubleEliminationMatches(teamIds)
      : buildGroupsKnockoutMatches(
          teamIds,
          groupsPreview.length > 0
            ? groupsPreview
            : [{id: "A", teamIds: teamIds.slice(0, Math.ceil(teamIds.length / 2))},
               {id: "B", teamIds: teamIds.slice(Math.ceil(teamIds.length / 2))}],
        );

  const batch = db.batch();
  const matchesCol = db.collection(artifactsMatchesPath(projectId));

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
          bracketConfig: bracketConfig ?? {},
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
    if (audience === "paid" && inscription.isPaid !== true) continue;
    if (audience === "pending" && inscription.isPaid === true) continue;

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

export const cancelTournament = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }

  const db = getFirestore();
  await assertCanManageTournament(db, uid, tournamentId);
  await db.doc(`tournaments/${tournamentId}`).update({
    listingStatus: "cancelled",
    updatedAt: FieldValue.serverTimestamp(),
  });
  logger.info("Torneio cancelado pelo organizador", {tournamentId, uid});
  return {ok: true};
});
