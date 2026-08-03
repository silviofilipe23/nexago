import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";
import {
  dayKeyFromEventDate,
  eventDateFromDayKeyAndTime,
} from "./event-timezone";
import {
  MatchStatus,
  isMatchCanceled,
  isMatchCompleted,
  isMatchInProgress,
} from "./match-status";
import {syncTournamentLiveMatchesNow} from "./tournament-live-matches";
import {tryAwardLeagueStagePointsForMatch} from "./league-ranking";
import {applyBracketAdvances, canFillBracketSlot} from "./category-bracket-advance";
import {
  tryFillKnockoutFromGroupStandings,
  type GroupPreview,
} from "./group-standings";
import {assertCanManageTournament, assertCanScoreTournament} from "./tournament-acl";
import {
  DEFAULT_BEST_OF,
  matchWinnerId,
  parseAndValidateSets,
  setsWon,
} from "./match-scoring";
import {
  allCategoryFinalsComplete,
  isFinalMatchType,
  isTerminalListingStatus,
  type CompletionMatch,
} from "./tournament-completion";
import {artifactsMatchesPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";




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

/** `HH:mm` válido ou [fallback] (ex. matchOps.dayStart). */
function parseDayStartTime(value: unknown, fallback: string): string {
  const fb = typeof fallback === "string" && fallback.trim() ? fallback.trim() : "07:00";
  const raw = typeof value === "string" && value.trim() ? value.trim() : fb;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return fb;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return fb;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

async function loadCategoryGroupsPreview(
  db: Firestore,
  tournamentId: string,
  categoryId: string,
): Promise<GroupPreview[]> {
  const snap = await db.doc(`tournaments/${tournamentId}`).get();
  const categoryOps = snap.data()?.categoryOps as
    | Record<string, Record<string, unknown>>
    | undefined;
  const raw = categoryOps?.[categoryId]?.groupsPreview;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const group = entry as Record<string, unknown>;
      const id = String(group.id ?? "").trim();
      const teamIds = Array.isArray(group.teamIds)
        ? group.teamIds.map((teamId) => String(teamId).trim()).filter(Boolean)
        : [];
      if (!id || teamIds.length === 0) return null;
      return {id, teamIds};
    })
    .filter((group): group is GroupPreview => group !== null);
}

async function advanceBracketWinnerInternal(
  db: Firestore,
  projectId: string,
  data: FirebaseFirestore.DocumentData,
): Promise<{advanced: boolean; nextMatchId?: string; nextMatchIds?: string[]}> {
  const winnerId = data.winnerId as string | undefined;
  if (!winnerId) {
    return {advanced: false};
  }

  const matchTypeNorm = String(data.matchType ?? "")
    .trim()
    .toLowerCase();
  if (data.isGroupMatch === true || matchTypeNorm === "group" || matchTypeNorm === "groups") {
    const tournamentId = data.tournamentId as string;
    const categoryId = data.categoryId as string;
    const groups = await loadCategoryGroupsPreview(db, tournamentId, categoryId);
    if (groups.length === 0) {
      return {advanced: false};
    }

    const fillResult = await tryFillKnockoutFromGroupStandings(
      db,
      artifactsMatchesPath(projectId),
      tournamentId,
      categoryId,
      groups,
    );
    return {advanced: fillResult.filled};
  }

  if (data.winnerAdvance || data.loserAdvance) {
    const metadataResult = await applyBracketAdvances(
      db,
      artifactsMatchesPath(projectId),
      data,
    );
    if (metadataResult.advanced) {
      return {
        advanced: true,
        nextMatchId: metadataResult.nextMatchIds[0],
        nextMatchIds: metadataResult.nextMatchIds,
      };
    }
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
    return {advanced: false};
  }

  const nextDoc = nextSnap.docs[0];
  const slot = matchNumber % 2 === 1 ? "teamAId" : "teamBId";
  // Não sobrescreve uma próxima partida já iniciada e é no-op se o slot já
  // estiver correto (reexecução/correção segura — item #2 da auditoria).
  if (!canFillBracketSlot(nextDoc.data(), slot, winnerId)) {
    return {advanced: false, nextMatchId: nextDoc.id};
  }
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

  return {advanced: true, nextMatchId: nextDoc.id};
}

/**
 * Ao concluir a grande final de uma categoria: registra o campeão na categoria
 * e, se TODAS as categorias já decidiram suas finais, marca o torneio como
 * concluído. Idempotente: não sobrescreve status terminal já gravado.
 */
async function tryCompleteTournamentAfterFinal(
  db: Firestore,
  projectId: string,
  after: FirebaseFirestore.DocumentData,
): Promise<void> {
  if (!isFinalMatchType(String(after.matchType ?? ""))) return;
  const tournamentId = String(after.tournamentId ?? "").trim();
  const categoryId = String(after.categoryId ?? "").trim();
  const championTeamId = String(after.winnerId ?? "").trim();
  if (!tournamentId || !categoryId || !championTeamId) return;

  const tournamentRef = db.doc(`tournaments/${tournamentId}`);

  // Registra o campeão e marca a chave da categoria como concluída.
  await tournamentRef.set(
    {
      categoryOps: {
        [categoryId]: {
          bracketStatus: "completed",
          championTeamId,
          completedAt: FieldValue.serverTimestamp(),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  const tournamentSnap = await tournamentRef.get();
  const tournamentData = tournamentSnap.data() ?? {};
  if (isTerminalListingStatus(tournamentData.listingStatus ?? tournamentData.status)) {
    return;
  }

  const categoriesRaw = Array.isArray(tournamentData.categories) ?
    (tournamentData.categories as Array<Record<string, unknown>>) :
    [];
  const categoryIds = categoriesRaw
    .map((c) => String(c?.id ?? "").trim())
    .filter((id) => id.length > 0);

  const matchDocs = await loadTournamentMatches(db, projectId, tournamentId);
  const matches: CompletionMatch[] = matchDocs.map((d) => {
    const m = d.data();
    return {
      categoryId: String(m.categoryId ?? ""),
      matchType: String(m.matchType ?? ""),
      status: m.status,
    };
  });

  if (!allCategoryFinalsComplete(categoryIds, matches)) return;

  await tournamentRef.set(
    {
      listingStatus: "completed",
      status: "completed",
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

/**
 * Campos de quadra que TODO agendamento (manual ou automático) precisa gravar
 * no doc da partida. `courtName` é o rótulo que as telas exibem — app
 * (`TournamentMatch.courtName`), portal do atleta e portal do organizador leem
 * o nome, não o `courtId` —, então gravar só o id deixa a quadra em branco na
 * lista de jogos, no placar e nos grupos. Quando a quadra não está no doc do
 * torneio (ou está sem nome), o próprio id vira o rótulo.
 */
export function scheduleCourtFields(
  courts: ReadonlyArray<{id?: unknown; name?: unknown}> | undefined,
  courtId: string,
): {courtId: string; courtName: string} {
  const court = courts?.find((c) => c?.id === courtId);
  const name = typeof court?.name === "string" ? court.name.trim() : "";
  return {courtId, courtName: name || courtId};
}

export const scheduleMatch = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  const courtId = (request.data?.courtId as string)?.trim();
  const scheduleTime = parseIsoDate(request.data?.scheduleTime);
  const scheduleEndTime = parseIsoDate(request.data?.scheduleEndTime);
  const dayKey =
    (request.data?.dayKey as string)?.trim() || dayKeyFromEventDate(scheduleTime);

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

  await ref.update({
    ...scheduleCourtFields(courts, courtId),
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

export const unscheduleMatch = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId obrigatório");

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {ref, data} = await getMatchOrThrow(db, projectId, matchId);
  const tournamentId = data.tournamentId as string;
  await assertCanManageTournament(db, uid, tournamentId);

  if (isMatchCompleted(data.status)) {
    throw new HttpsError(
      "failed-precondition",
      "Partida concluída não pode ter o agendamento cancelado",
    );
  }
  if (isMatchInProgress(data.status) || data.queueStatus === "on_court") {
    throw new HttpsError(
      "failed-precondition",
      "Partida em andamento não pode ter o agendamento cancelado",
    );
  }

  await ref.update({
    courtId: FieldValue.delete(),
    courtName: FieldValue.delete(),
    scheduleTime: FieldValue.delete(),
    scheduleEndTime: FieldValue.delete(),
    dayKey: FieldValue.delete(),
    queueStatus: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {ok: true};
});

/**
 * Campos de quadra a gravar e rótulo do push de `callMatchToCourt`.
 *
 * O organizador pode chamar a partida para uma quadra DIFERENTE da agendada.
 * Nesse caso o `courtName` já gravado na partida está obsoleto: não pode
 * continuar no doc (todas as telas exibem o nome, não o id) nem virar o
 * "Dirija-se à X" da notificação. Sem `courtId` no request, a quadra agendada
 * é mantida (`patch: null`) e o nome só é resolvido pelo id quando o doc não
 * tem `courtName` — por isso, nesse caso, `courts` pode vir `undefined` sem
 * mudar o resultado: a lista não chega a ser consultada.
 */
export function callToCourtFields(
  courts: ReadonlyArray<{id?: unknown; name?: unknown}> | undefined,
  requestedCourtId: unknown,
  match: {courtId?: unknown; courtName?: unknown},
): {patch: {courtId: string; courtName: string} | null; label: string} {
  const requested =
    typeof requestedCourtId === "string" ? requestedCourtId.trim() : "";
  if (requested) {
    const patch = scheduleCourtFields(courts, requested);
    return {patch, label: patch.courtName};
  }

  const scheduledName =
    typeof match.courtName === "string" ? match.courtName.trim() : "";
  if (scheduledName) return {patch: null, label: scheduledName};

  const scheduledId =
    typeof match.courtId === "string" ? match.courtId.trim() : "";
  if (scheduledId) {
    return {
      patch: null,
      label: scheduleCourtFields(courts, scheduledId).courtName,
    };
  }

  return {patch: null, label: "quadra"};
}

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

  const checkIn = data.checkIn as Record<string, Record<string, string>> | undefined;
  const a = checkIn?.teamA?.status;
  const b = checkIn?.teamB?.status;
  if (a !== "present" || b !== "present") {
    throw new HttpsError(
      "failed-precondition",
      "Faça check-in das duas equipes antes de chamar para a quadra",
    );
  }

  const update: Record<string, unknown> = {
    queueStatus: "on_court",
    status: MatchStatus.inProgress,
    matchStartedAt: data.matchStartedAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const scheduledCourtId =
    typeof data.courtId === "string" ? data.courtId.trim() : "";
  const scheduledCourtName =
    typeof data.courtName === "string" ? data.courtName.trim() : "";
  const effectiveCourtId = courtId || scheduledCourtId;

  // As quadras do torneio só são lidas quando o nome precisa ser resolvido pelo
  // id: com `courtName` no doc e sem troca de quadra, `callToCourtFields` nem
  // consulta a lista.
  const needsCourtName =
    Boolean(courtId) || Boolean(scheduledCourtId && !scheduledCourtName);
  const courts = needsCourtName ?
    ((await db.doc(`tournaments/${tournamentId}`).get()).data()?.courts as
      | Array<{id: string; name: string}>
      | undefined) :
    undefined;
  const {patch: courtPatch, label: courtLabel} = callToCourtFields(
    courts,
    courtId,
    data,
  );
  if (courtPatch) Object.assign(update, courtPatch);

  await ref.update(update);

  await syncTournamentLiveMatchesNow(db, projectId, tournamentId);

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
          title: "Sua partida está prestes a começar",
          body: `Sua partida foi chamada. Dirija-se à ${courtLabel}.`,
          type: "match_call",
          data: {type: "match_call", matchId, tournamentId, courtId: effectiveCourtId},
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

  await syncTournamentLiveMatchesNow(
    db,
    projectId,
    data.tournamentId as string,
  );

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

  const tournamentId = data.tournamentId as string;
  await syncTournamentLiveMatchesNow(db, projectId, tournamentId);
  await advanceBracketWinnerInternal(db, projectId, {
    ...data,
    winnerId: winnerTeamId,
    status: MatchStatus.completed,
  });
  await tryAwardLeagueStagePointsForMatch(db, projectId, {
    ...data,
    id: matchId,
    winnerId: winnerTeamId,
    status: MatchStatus.completed,
  });

  return {ok: true, winnerTeamId};
});

/**
 * Grava o resultado de uma partida validando o placar de forma AUTORITATIVA no
 * servidor (item #5): rejeita sets ilegais/empatados e calcula o vencedor pelas
 * regras (target por set + vantagem), em vez de confiar no que o cliente enviar.
 * O avanço de chave e o ranking são propagados pelo trigger de conclusão.
 */
export const submitMatchResult = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId obrigatório");

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {ref, data} = await getMatchOrThrow(db, projectId, matchId);
  await assertCanScoreTournament(db, uid, data.tournamentId as string);

  // Formato (nº de sets): request (lançamento rápido) → doc da partida → padrão.
  const normalizeBestOf = (raw: unknown): number | null => {
    const n = Number(raw);
    return n === 1 || n === 3 ? n : null;
  };
  const bestOf =
    normalizeBestOf(request.data?.bestOf) ??
    normalizeBestOf(data.bestOf) ??
    DEFAULT_BEST_OF;

  let sets;
  try {
    sets = parseAndValidateSets(request.data?.sets, bestOf);
  } catch (e) {
    throw new HttpsError(
      "invalid-argument",
      e instanceof Error ? e.message : "Placar inválido.",
    );
  }

  const teamAId = (data.teamAId as string | undefined)?.trim() ?? "";
  const teamBId = (data.teamBId as string | undefined)?.trim() ?? "";
  const winnerId = matchWinnerId(sets, teamAId, teamBId, bestOf);
  const wins = setsWon(sets, bestOf);
  const completed = winnerId !== null;

  const update: Record<string, unknown> = {
    sets: sets.map((s) => ({a: s.a, b: s.b})),
    bestOf,
    status: completed ? MatchStatus.completed : MatchStatus.inProgress,
    resultA: `${wins.a}`,
    resultB: `${wins.b}`,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (completed) {
    update.winnerId = winnerId;
    update.matchEndedAt = FieldValue.serverTimestamp();
    // Resultado final gravado: não faz sentido sobrar um placar "ao vivo"
    // desatualizado numa partida já encerrada.
    update.liveScore = FieldValue.delete();
  }

  await ref.update(update);
  await syncTournamentLiveMatchesNow(db, projectId, data.tournamentId as string);

  return {ok: true, completed, winnerId};
});

/**
 * Normaliza um contador de placar ao vivo (games/sets): inteiro entre 0 e 99,
 * ou `null` se inválido — mesma faixa tolerada por `parseAndValidateSets`.
 */
function normalizeLiveScoreCount(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}

/**
 * Núcleo de `updateLiveMatchScore`, testável sem o wrapper `onCall`. Reaproveita
 * o MESMO guard de autorização de `submitMatchResult` (`assertCanScoreTournament`
 * — staff manager/scorer ou dono do torneio) em vez de duplicar a lógica de
 * permissão. Grava o placar parcial (`liveScore`) do set em andamento e garante
 * `status = 'In Progress'` na primeira chamada; nunca sobrescreve uma partida
 * já `Completed`/`Canceled`.
 */
export async function updateLiveMatchScoreCore(
  db: Firestore,
  uid: string,
  input: Record<string, unknown>,
): Promise<{ok: true}> {
  const matchId = (input.matchId as string | undefined)?.trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId obrigatório");

  const setsA = normalizeLiveScoreCount(input.setsA);
  const setsB = normalizeLiveScoreCount(input.setsB);
  const currentGamesA = normalizeLiveScoreCount(input.currentGamesA);
  const currentGamesB = normalizeLiveScoreCount(input.currentGamesB);
  if (setsA === null || setsB === null || currentGamesA === null || currentGamesB === null) {
    throw new HttpsError("invalid-argument", "Placar ao vivo inválido");
  }

  const projectId = getFirebaseProjectId();
  const {ref, data} = await getMatchOrThrow(db, projectId, matchId);
  await assertCanScoreTournament(db, uid, data.tournamentId as string);

  if (isMatchCompleted(data.status) || isMatchCanceled(data.status)) {
    throw new HttpsError(
      "failed-precondition",
      "Partida já encerrada não pode receber placar ao vivo",
    );
  }

  const update: Record<string, unknown> = {
    liveScore: {
      setsA,
      setsB,
      currentGamesA,
      currentGamesB,
      updatedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  };

  const wasInProgress = isMatchInProgress(data.status);
  if (!wasInProgress) {
    update.status = MatchStatus.inProgress;
    if (!data.matchStartedAt) {
      update.matchStartedAt = FieldValue.serverTimestamp();
    }
  }

  await ref.update(update);

  if (!wasInProgress) {
    await syncTournamentLiveMatchesNow(db, projectId, data.tournamentId as string);
  }

  return {ok: true};
}

/**
 * Callable para o mesário/staff atualizar o placar ao vivo (games/sets do set
 * em andamento) de uma partida `In Progress`. Ver `updateLiveMatchScoreCore`.
 */
export const updateLiveMatchScore = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const db = getFirestore();
  return updateLiveMatchScoreCore(db, uid, request.data ?? {});
});

export const validateMatchResult = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId obrigatório");

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {ref, data} = await getMatchOrThrow(db, projectId, matchId);
  await assertCanScoreTournament(db, uid, data.tournamentId as string);

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

  if (!data.winnerId) {
    throw new HttpsError("failed-precondition", "Partida sem vencedor");
  }

  const result = await advanceBracketWinnerInternal(db, projectId, data);

  return {ok: true, ...result};
});

/**
 * Compara duas partidas pela numeração GLOBAL cronológica (`matchNumber`).
 * NÃO comparar por `round`: em dupla eliminação, WB, LB, 3º lugar e final têm
 * cada um sua própria contagem de round reiniciando em 1, então "round" não é
 * uma sequência global — comparar por ele antes do matchNumber agendava a
 * final e o 3º lugar (round 1 na sua chave) antes da WB/LB R2.
 */
export function compareByMatchNumber(
  a: {matchNumber?: number},
  b: {matchNumber?: number},
): number {
  return (a.matchNumber ?? 0) - (b.matchNumber ?? 0);
}

export const autoScheduleTournamentDay = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = (request.data?.tournamentId as string)?.trim();
  const dayKey = (request.data?.dayKey as string)?.trim();
  const preview = request.data?.preview !== false;
  const avoidAthleteConflict = request.data?.avoidAthleteConflict !== false;
  const respectBracketDeps = request.data?.respectBracketDeps !== false;
  const categoryId = (request.data?.categoryId as string)?.trim() ?? "";

  if (!tournamentId || !dayKey) {
    throw new HttpsError("invalid-argument", "tournamentId e dayKey obrigatórios");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const tournament = await assertCanManageTournament(db, uid, tournamentId);

  const matchOps = tournament.matchOps as Record<string, unknown> | undefined;
  const duration = (matchOps?.defaultMatchDurationMin as number) ?? 30;
  const minRest = (matchOps?.minRestBetweenMatchesMin as number) ?? 30;
  const configDayStart = (matchOps?.dayStart as string) ?? "07:00";
  const dayStartStr = parseDayStartTime(request.data?.dayStart, configDayStart);
  const [h, m] = dayStartStr.split(":").map(Number);
  const dayStart = eventDateFromDayKeyAndTime(dayKey, h, m);

  const allCourts =
    (tournament.courts as Array<{id: string; name?: string; order: number}>) ?? [];
  if (allCourts.length === 0) {
    throw new HttpsError("failed-precondition", "Configure quadras no torneio");
  }
  // `courtIds` restringe onde o auto-agendamento pode alocar; o que já estava
  // marcado nas quadras de fora continua intocado e segue bloqueando horário.
  const courts = selectAutoScheduleCourts(allCourts, request.data?.courtIds);
  if (courts.length === 0) {
    throw new HttpsError("invalid-argument", "Nenhuma quadra válida selecionada");
  }

  const allMatches = await loadTournamentMatches(db, projectId, tournamentId);
  const unscheduled = allMatches.filter((doc) => {
    const d = doc.data();
    if (d.scheduleTime || isMatchCompleted(d.status)) return false;
    return isMatchEligibleForAutoSchedule(d, {
      respectBracketDeps,
      dayKey,
      categoryId,
    });
  });

  const courtBusyUntil: Record<string, Date> = {};
  for (const c of courts) {
    courtBusyUntil[c.id] = new Date(dayStart);
  }

  const teamBusyUntil: Record<string, Date> = {};
  for (const doc of allMatches) {
    const d = doc.data();
    if (!d.scheduleTime) continue;
    if (String(d.dayKey ?? "").trim() !== dayKey) continue;
    const courtId = String(d.courtId ?? "").trim();
    if (!courtId) continue;

    const schedStart = (d.scheduleTime as Timestamp).toDate();
    const schedEnd = d.scheduleEndTime ?
      (d.scheduleEndTime as Timestamp).toDate() :
      new Date(schedStart.getTime() + duration * 60 * 1000);

    const prevCourt = courtBusyUntil[courtId];
    if (!prevCourt || schedEnd > prevCourt) {
      courtBusyUntil[courtId] = schedEnd;
    }

    const teamRestUntil = new Date(schedEnd.getTime() + minRest * 60 * 1000);
    for (const tid of [d.teamAId, d.teamBId]) {
      if (typeof tid !== "string" || !tid.trim()) continue;
      const prevTeam = teamBusyUntil[tid];
      if (!prevTeam || teamRestUntil > prevTeam) {
        teamBusyUntil[tid] = teamRestUntil;
      }
    }
  }

  const slots: Array<{
    matchId: string;
    courtId: string;
    start: string;
    end: string;
  }> = [];
  const skipped: Array<{matchId: string; reason: string}> = [];

  // Sequência de jogos: matchNumber já é a numeração GLOBAL cronológica
  // (grupos intercalados 1..N, depois o mata-mata em ordem de dependência).
  // Ver compareByMatchNumber para o porquê de não ordenar por `round`.
  const sorted = [...unscheduled].sort((a, b) =>
    compareByMatchNumber(a.data(), b.data()),
  );

  for (const doc of sorted) {
    const data = doc.data();
    let chosenCourt = courts[0].id;
    let chosenStart = courtBusyUntil[chosenCourt] ?? dayStart;
    if (chosenStart < dayStart) chosenStart = new Date(dayStart);

    for (const court of courts) {
      let start = courtBusyUntil[court.id] ?? dayStart;
      if (start < dayStart) start = new Date(dayStart);

      if (avoidAthleteConflict) {
        for (const tid of [data.teamAId, data.teamBId]) {
          if (typeof tid !== "string" || !tid.trim()) continue;
          const busy = teamBusyUntil[tid];
          if (busy && busy > start) {
            start = busy;
          }
        }
      }

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
    courtBusyUntil[chosenCourt] = end;

    if (avoidAthleteConflict) {
      const teamRestUntil = new Date(end.getTime() + minRest * 60 * 1000);
      for (const tid of [data.teamAId, data.teamBId]) {
        if (typeof tid !== "string" || !tid.trim()) continue;
        teamBusyUntil[tid] = teamRestUntil;
      }
    }
  }

  let applied = 0;
  if (!preview) {
    const batch = db.batch();
    const matchesById = new Map(
      allMatches.map((d) => [d.id, d] as const),
    );
    for (const slot of slots) {
      const matchDoc = matchesById.get(slot.matchId);
      if (!matchDoc) continue;
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      const overlap = detectCourtOverlap(
        slot.courtId,
        start,
        end,
        allMatches,
        slot.matchId,
      );
      const restWarnings = avoidAthleteConflict ?
        detectRestConflict(
          matchDoc.data(),
          start,
          end,
          allMatches,
          minRest,
          slot.matchId,
        ) :
        [];
      if (overlap || restWarnings.length > 0) {
        skipped.push({
          matchId: slot.matchId,
          reason: overlap?.message ?? restWarnings[0]!.message,
        });
        continue;
      }
      const ref = db.doc(
        `${artifactsMatchesPath(projectId)}/${slot.matchId}`,
      );
      batch.update(ref, {
        ...scheduleCourtFields(courts, slot.courtId),
        scheduleTime: Timestamp.fromDate(start),
        scheduleEndTime: Timestamp.fromDate(end),
        dayKey,
        queueStatus: "waiting",
        updatedAt: FieldValue.serverTimestamp(),
      });
      applied++;
    }
    if (applied > 0) {
      await batch.commit();
    }
  }

  return {ok: true, preview, slots, skipped, count: slots.length, applied};
});

export const applyLeagueRankingForMatch = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const matchId = (request.data?.matchId as string)?.trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId obrigatório");

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {data} = await getMatchOrThrow(db, projectId, matchId);
  await assertCanManageTournament(db, uid, data.tournamentId as string);

  const result = await tryAwardLeagueStagePointsForMatch(db, projectId, {
    ...data,
    id: matchId,
  });
  return {ok: true, ...result};
});

/**
 * Decide se uma partida recém-atualizada deve propagar (avanço de chave +
 * ranking de liga): precisa estar concluída com vencedor, e só quando o
 * resultado acabou de ser definido ou o vencedor mudou (correção).
 */
export function shouldPropagateMatchAdvance(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!after) return false;
  if (!isMatchCompleted(after.status)) return false;
  const winnerId = String(after.winnerId ?? "").trim();
  if (!winnerId) return false;
  if (!before || !isMatchCompleted(before.status)) return true;
  return String(before.winnerId ?? "").trim() !== winnerId;
}

/**
 * Partida elegível para o auto-agendamento (H3). Quando `respectBracketDeps`
 * é true, pula partidas cujo lado ainda é um placeholder de chave (ex.:
 * "Vencedor Jogo #7") — só agenda quando as duas duplas já foram decididas
 * pela partida anterior (winner/loser advance já aplicado). Partidas de grupo
 * nunca são afetadas: já nascem com as duas duplas reais.
 */
export function isMatchAutoSchedulable(
  data: {teamAId?: unknown; teamBId?: unknown},
  respectBracketDeps: boolean,
): boolean {
  if (!respectBracketDeps) return true;
  const teamA = typeof data.teamAId === "string" ? data.teamAId.trim() : "";
  const teamB = typeof data.teamBId === "string" ? data.teamBId.trim() : "";
  return teamA !== "" && teamB !== "";
}

/**
 * Quadras que o auto-agendamento pode usar. `courtIds` vazio (ou ausente) =
 * todas as quadras do torneio, que é o comportamento histórico e o que o app
 * Flutter continua enviando. Quando vem preenchido, filtra PRESERVANDO a ordem
 * do doc do torneio: a ordem das quadras define o desempate na escolha gulosa
 * (`courts[0]` é o chute inicial), então reordenar mudaria a grade gerada.
 * Ids desconhecidos são ignorados — cabe ao chamador tratar o resultado vazio.
 */
export function selectAutoScheduleCourts<T extends {id: string}>(
  allCourts: T[],
  courtIds: unknown,
): T[] {
  if (!Array.isArray(courtIds)) return allCourts;
  const wanted = new Set(
    courtIds
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v !== ""),
  );
  if (wanted.size === 0) return allCourts;
  return allCourts.filter((c) => wanted.has(c.id));
}

/**
 * Partida candidata a receber horário nesta rodada de auto-agendamento.
 * Restringe apenas o conjunto que SERÁ agendado — a leitura de ocupação de
 * quadra/descanso continua varrendo todas as partidas do torneio, senão uma
 * partida de outra categoria seria sobreposta.
 */
export function isMatchEligibleForAutoSchedule(
  data: {
    teamAId?: unknown;
    teamBId?: unknown;
    dayKey?: unknown;
    categoryId?: unknown;
  },
  opts: {respectBracketDeps: boolean; dayKey: string; categoryId: string},
): boolean {
  if (!isMatchAutoSchedulable(data, opts.respectBracketDeps)) return false;
  if (opts.categoryId) {
    const cat = typeof data.categoryId === "string" ? data.categoryId.trim() : "";
    if (cat !== opts.categoryId) return false;
  }
  const matchDayKey = String(data.dayKey ?? "").trim();
  return matchDayKey === "" || matchDayKey === opts.dayKey;
}

/**
 * Propaga avanço de chave e ranking quando a partida é concluída — de forma
 * atômica do ponto de vista do cliente e idempotente. Isso substitui as duas
 * chamadas HTTPS sequenciais que o app fazia após gravar o placar (item #1):
 * mesmo que o app caia/perca rede logo após salvar, a chave continua avançando.
 */
export const onTournamentMatchCompletedAdvance = onDocumentUpdated(
  "artifacts/{appId}/public/data/matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data() as
      | Record<string, unknown>
      | undefined;
    const after = event.data?.after.data() as
      | Record<string, unknown>
      | undefined;

    if (!shouldPropagateMatchAdvance(before, after) || !after) return;

    const db = getFirestore();
    const projectId = event.params.appId;
    const matchId = event.params.matchId;

    try {
      await advanceBracketWinnerInternal(db, projectId, after);
    } catch (e) {
      logger.error("onTournamentMatchCompletedAdvance: avanço falhou", {matchId, e});
    }
    try {
      await tryCompleteTournamentAfterFinal(db, projectId, after);
    } catch (e) {
      logger.error("onTournamentMatchCompletedAdvance: conclusão falhou", {matchId, e});
    }
    try {
      await tryAwardLeagueStagePointsForMatch(db, projectId, {
        ...after,
        id: matchId,
      });
    } catch (e) {
      logger.error("onTournamentMatchCompletedAdvance: ranking falhou", {matchId, e});
    }
    try {
      await syncTournamentLiveMatchesNow(
        db,
        projectId,
        String(after.tournamentId ?? ""),
      );
    } catch (e) {
      logger.warn("onTournamentMatchCompletedAdvance: sync falhou", {matchId, e});
    }
  },
);
