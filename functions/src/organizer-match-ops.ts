import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {hasRoleInClaims} from "./auth-roles";
import {deliverNotificationToUser} from "./notification-delivery";
import {MatchStatus, isMatchCompleted} from "./match-status";

function getFirebaseProjectId(): string {
  return process.env.GCLOUD_PROJECT || "volley-track-2dd3b";
}

function artifactsMatchesPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/matches`;
}

function artifactsTeamsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/teams`;
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

function parseIsoDate(value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", "Data inválida");
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new HttpsError("invalid-argument", "Data inválida");
  }
  return d;
}

function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface RestConflict {
  type: string;
  message: string;
  matchId?: string;
}

function detectRestConflict(
  target: FirebaseFirestore.DocumentData,
  scheduleStart: Date,
  scheduleEnd: Date,
  allMatches: FirebaseFirestore.QueryDocumentSnapshot[],
  minRestMin: number,
  excludeMatchId: string,
): RestConflict[] {
  const conflicts: RestConflict[] = [];
  const teamIds = new Set(
    [target.teamAId, target.teamBId].filter((id) => typeof id === "string" && id),
  );

  for (const doc of allMatches) {
    if (doc.id === excludeMatchId) continue;
    const other = doc.data();
    if (!other.scheduleTime) continue;

    const otherStart = (other.scheduleTime as Timestamp).toDate();
    const otherEnd = other.scheduleEndTime ?
      (other.scheduleEndTime as Timestamp).toDate() :
      new Date(otherStart.getTime() + 50 * 60 * 1000);

    const sharesTeam =
      teamIds.has(other.teamAId) || teamIds.has(other.teamBId);
    if (!sharesTeam) continue;

    const gapBefore =
      (scheduleStart.getTime() - otherEnd.getTime()) / 60000;
    const gapAfter =
      (otherStart.getTime() - scheduleEnd.getTime()) / 60000;

    if (gapBefore >= 0 && gapBefore < minRestMin) {
      conflicts.push({
        type: "rest",
        message: `Descanso insuficiente (${Math.round(gapBefore)}min).`,
        matchId: doc.id,
      });
    }
    if (gapAfter >= 0 && gapAfter < minRestMin) {
      conflicts.push({
        type: "rest",
        message: `Descanso insuficiente (${Math.round(gapAfter)}min).`,
        matchId: doc.id,
      });
    }
  }
  return conflicts;
}

function detectCourtOverlap(
  courtId: string,
  scheduleStart: Date,
  scheduleEnd: Date,
  allMatches: FirebaseFirestore.QueryDocumentSnapshot[],
  excludeMatchId: string,
): RestConflict | null {
  for (const doc of allMatches) {
    if (doc.id === excludeMatchId) continue;
    const m = doc.data();
    if (m.courtId !== courtId) continue;
    if (!m.scheduleTime) continue;

    const start = (m.scheduleTime as Timestamp).toDate();
    const end = m.scheduleEndTime ?
      (m.scheduleEndTime as Timestamp).toDate() :
      new Date(start.getTime() + 50 * 60 * 1000);

    if (scheduleStart < end && scheduleEnd > start) {
      return {
        type: "overlap",
        message: "Quadra ocupada neste horário.",
        matchId: doc.id,
      };
    }
  }
  return null;
}

async function loadTournamentMatches(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  dayKey?: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  let query: FirebaseFirestore.Query = db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId);
  const dk = dayKey?.trim();
  if (dk) {
    query = query.where("dayKey", "==", dk);
  }
  const snap = await query.get();
  return snap.docs;
}

async function getMatchOrThrow(
  db: Firestore,
  projectId: string,
  matchId: string,
): Promise<{
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
}> {
  const ref = db.doc(`${artifactsMatchesPath(projectId)}/${matchId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Partida não encontrada");
  }
  return {ref, data: snap.data()!};
}

export const scheduleMatch = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  const courtId = (request.data?.courtId as string)?.trim();
  const scheduleTime = parseIsoDate(request.data?.scheduleTime);
  const scheduleEndTime = parseIsoDate(request.data?.scheduleEndTime);
  const dayKey =
    (request.data?.dayKey as string)?.trim() || dayKeyFromDate(scheduleTime);

  if (!matchId || !courtId) {
    throw new HttpsError("invalid-argument", "matchId e courtId obrigatórios");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {ref, data} = await getMatchOrThrow(db, projectId, matchId);
  const tournamentId = data.tournamentId as string;
  await assertCanManageTournament(db, uid, tournamentId);

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  const matchOps = tournamentSnap.data()?.matchOps as Record<string, unknown> | undefined;
  const minRest = (matchOps?.minRestBetweenMatchesMin as number) ?? 45;

  const allMatches = await loadTournamentMatches(db, projectId, tournamentId);
  const overlap = detectCourtOverlap(
    courtId,
    scheduleTime,
    scheduleEndTime,
    allMatches,
    matchId,
  );
  if (overlap) {
    throw new HttpsError("failed-precondition", overlap.message);
  }

  const restWarnings = detectRestConflict(
    data,
    scheduleTime,
    scheduleEndTime,
    allMatches,
    minRest,
    matchId,
  );

  const courts = tournamentSnap.data()?.courts as Array<{id: string; name: string}> | undefined;
  const court = courts?.find((c) => c.id === courtId);
  const courtName = court?.name ?? courtId;

  await ref.update({
    courtId,
    courtName,
    scheduleTime: Timestamp.fromDate(scheduleTime),
    scheduleEndTime: Timestamp.fromDate(scheduleEndTime),
    dayKey,
    queueStatus: data.queueStatus || "waiting",
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    warnings: restWarnings,
  };
});

export const rescheduleMatch = scheduleMatch;

export const callMatchToCourt = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  const courtId = (request.data?.courtId as string)?.trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId obrigatório");

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {ref, data} = await getMatchOrThrow(db, projectId, matchId);
  const tournamentId = data.tournamentId as string;
  await assertCanManageTournament(db, uid, tournamentId);

  const update: Record<string, unknown> = {
    queueStatus: "on_court",
    status: MatchStatus.inProgress,
    matchStartedAt: data.matchStartedAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (courtId) {
    update.courtId = courtId;
  }

  await ref.update(update);

  // Notificar atletas (best-effort)
  try {
    const teamIds = [data.teamAId, data.teamBId].filter(Boolean) as string[];
    for (const teamId of teamIds) {
      const teamSnap = await db
        .doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
        .get();
      const team = teamSnap.data();
      if (!team) continue;
      const players = [team.player1Id, team.player2Id].filter(Boolean) as string[];
      for (const playerId of players) {
        await deliverNotificationToUser({
          userId: playerId,
          title: "Chamada de quadra",
          body: "Sua partida foi chamada. Dirija-se à quadra.",
          type: "match_call",
          data: {type: "match_call", matchId, tournamentId},
        });
      }
    }
  } catch (e) {
    logger.warn("callMatchToCourt notify failed", e);
  }

  return {ok: true};
});

export const releaseMatchAfterCheckIn = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId obrigatório");

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {ref, data} = await getMatchOrThrow(db, projectId, matchId);
  await assertCanManageTournament(db, uid, data.tournamentId as string);

  const checkIn = data.checkIn as Record<string, Record<string, string>> | undefined;
  const a = checkIn?.teamA?.status;
  const b = checkIn?.teamB?.status;
  if (a !== "present" || b !== "present") {
    throw new HttpsError(
      "failed-precondition",
      "Ambas equipes precisam estar presentes",
    );
  }

  await ref.update({
    queueStatus: "on_court",
    status: MatchStatus.inProgress,
    matchStartedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {ok: true};
});

export const declareMatchWalkover = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  const winnerTeamId = (request.data?.winnerTeamId as string)?.trim();
  if (!matchId || !winnerTeamId) {
    throw new HttpsError("invalid-argument", "matchId e winnerTeamId obrigatórios");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {ref, data} = await getMatchOrThrow(db, projectId, matchId);
  await assertCanManageTournament(db, uid, data.tournamentId as string);

  const loserId =
    data.teamAId === winnerTeamId ? data.teamBId : data.teamAId;

  await ref.update({
    winnerId: winnerTeamId,
    status: MatchStatus.completed,
    resultA: data.teamAId === winnerTeamId ? "W.O." : "0",
    resultB: data.teamBId === winnerTeamId ? "W.O." : "0",
    matchEndedAt: FieldValue.serverTimestamp(),
    queueStatus: "completed",
    checkIn: {
      teamA: {
        status: data.teamAId === loserId ? "wo" : "present",
        at: FieldValue.serverTimestamp(),
        byUid: uid,
      },
      teamB: {
        status: data.teamBId === loserId ? "wo" : "present",
        at: FieldValue.serverTimestamp(),
        byUid: uid,
      },
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {ok: true, winnerTeamId};
});

export const validateMatchResult = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId obrigatório");

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {ref, data} = await getMatchOrThrow(db, projectId, matchId);
  await assertCanManageTournament(db, uid, data.tournamentId as string);

  await ref.update({
    report: {
      ...(data.report as object || {}),
      status: "validated",
      validatedByUid: uid,
      validatedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db
    .collection(`${artifactsMatchesPath(projectId)}/${matchId}/auditLog`)
    .add({
      type: "result_validated",
      at: FieldValue.serverTimestamp(),
      byUid: uid,
      byRole: "manager",
    });

  return {ok: true};
});

export const advanceBracketWinner = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId obrigatório");

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {data} = await getMatchOrThrow(db, projectId, matchId);
  await assertCanManageTournament(db, uid, data.tournamentId as string);

  const winnerId = data.winnerId as string | undefined;
  if (!winnerId) {
    throw new HttpsError("failed-precondition", "Partida sem vencedor");
  }

  const tournamentId = data.tournamentId as string;
  const categoryId = data.categoryId as string;
  const round = (data.round as number) ?? 0;
  const matchNumber = (data.matchNumber as number) ?? 0;

  const nextRound = round + 1;
  const nextMatchNumber = Math.ceil(matchNumber / 2);

  const nextSnap = await db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .where("round", "==", nextRound)
    .where("matchNumber", "==", nextMatchNumber)
    .limit(1)
    .get();

  if (nextSnap.empty) {
    return {ok: true, advanced: false};
  }

  const nextDoc = nextSnap.docs[0];
  const slot = matchNumber % 2 === 1 ? "teamAId" : "teamBId";
  const descSlot = matchNumber % 2 === 1 ? "teamADescription" : "teamBDescription";
  const winnerDesc =
    data.teamAId === winnerId ?
      data.teamADescription :
      data.teamBDescription;

  const patch: Record<string, unknown> = {
    [slot]: winnerId,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (winnerDesc) patch[descSlot] = winnerDesc;

  await nextDoc.ref.update(patch);

  return {ok: true, advanced: true, nextMatchId: nextDoc.id};
});

export const autoScheduleTournamentDay = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  const dayKey = (request.data?.dayKey as string)?.trim();
  const preview = request.data?.preview !== false;

  if (!tournamentId || !dayKey) {
    throw new HttpsError("invalid-argument", "tournamentId e dayKey obrigatórios");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const tournament = await assertCanManageTournament(db, uid, tournamentId);

  const matchOps = tournament.matchOps as Record<string, unknown> | undefined;
  const duration = (matchOps?.defaultMatchDurationMin as number) ?? 50;
  const minRest = (matchOps?.minRestBetweenMatchesMin as number) ?? 45;
  const dayStartStr = (matchOps?.dayStart as string) ?? "08:00";
  const [h, m] = dayStartStr.split(":").map(Number);
  const dayStart = new Date(`${dayKey}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

  const courts = (tournament.courts as Array<{id: string; order: number}>) ?? [];
  if (courts.length === 0) {
    throw new HttpsError("failed-precondition", "Configure quadras no torneio");
  }

  const allMatches = await loadTournamentMatches(
    db,
    projectId,
    tournamentId,
    dayKey,
  );
  const unscheduled = allMatches.filter((doc) => {
    const d = doc.data();
    return !d.scheduleTime && !isMatchCompleted(d.status);
  });

  const courtBusyUntil: Record<string, Date> = {};
  for (const c of courts) {
    courtBusyUntil[c.id] = new Date(dayStart);
  }

  const slots: Array<{
    matchId: string;
    courtId: string;
    start: string;
    end: string;
  }> = [];

  const sorted = [...unscheduled].sort(
    (a, b) => (a.data().round ?? 0) - (b.data().round ?? 0),
  );

  for (const doc of sorted) {
    let chosenCourt = courts[0].id;
    let chosenStart = courtBusyUntil[chosenCourt] ?? dayStart;

    for (const court of courts) {
      const start = courtBusyUntil[court.id] ?? dayStart;
      if (start < chosenStart) {
        chosenStart = start;
        chosenCourt = court.id;
      }
    }

    const end = new Date(chosenStart.getTime() + duration * 60 * 1000);
    slots.push({
      matchId: doc.id,
      courtId: chosenCourt,
      start: chosenStart.toISOString(),
      end: end.toISOString(),
    });
    courtBusyUntil[chosenCourt] = new Date(
      end.getTime() + minRest * 60 * 1000,
    );
  }

  if (!preview) {
    const batch = db.batch();
    for (const slot of slots) {
      const ref = db.doc(
        `${artifactsMatchesPath(projectId)}/${slot.matchId}`,
      );
      batch.update(ref, {
        courtId: slot.courtId,
        scheduleTime: Timestamp.fromDate(new Date(slot.start)),
        scheduleEndTime: Timestamp.fromDate(new Date(slot.end)),
        dayKey,
        queueStatus: "waiting",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return {ok: true, preview, slots, count: slots.length};
});
