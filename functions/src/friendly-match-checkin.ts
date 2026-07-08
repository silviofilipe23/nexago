import {onSchedule} from "firebase-functions/v2/scheduler";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  deliverFriendlyMatchNotifications,
  type FriendlyMatchNotification,
} from "./friendly-match-invite";
import {loadFriendlyMatchConfig} from "./friendly-match-config";
import {resolveCheckInWindowState} from "./friendly-match-logic";
import {
  applyReputationEvent,
  matchCompletedEventId,
  noShowEventId,
} from "./friendly-match-reputation";

/**
 * Bora Jogar — dia do jogo: check-in mútuo manual e fechamento de no-show.
 *
 * `realizado` (completed) exige check-in dos DOIS dentro da janela — um
 * atleta sozinho não forja jogo realizado. Depois que a janela fecha, o
 * sweeper decide: 1 check-in → no_show com penalidade só do ausente;
 * 0 check-ins → no_show sem penalidade (impossível distinguir "não rolou"
 * de "ambos esqueceram"; decisão de produto).
 */

const MATCHES_COLLECTION = "friendlyMatches";
const SWEEP_LIMIT = 50;
const TIME_ZONE = "America/Sao_Paulo";
const HOUR_MS = 60 * 60 * 1000;

type MatchData = Record<string, unknown>;

function historyEntry(status: string, actorUid: string, nowMs: number): MatchData {
  return {status, actorUid, at: Timestamp.fromMillis(nowMs)};
}

function appendHistory(data: MatchData, entry: MatchData): MatchData[] {
  const history = Array.isArray(data.history) ? (data.history as MatchData[]) : [];
  return [...history, entry];
}

function notification(
  userId: string,
  type: string,
  matchId: string,
  title: string,
  body: string,
): FriendlyMatchNotification {
  return {userId, title, body, type, data: {type, matchId}};
}

export async function checkInFriendlyMatchCore(
  db: Firestore,
  uid: string,
  input: {matchId: string},
  nowMs: number = Date.now(),
): Promise<{completed: boolean; notifications: FriendlyMatchNotification[]}> {
  const matchId = typeof input.matchId === "string" ? input.matchId.trim() : "";
  if (!matchId) throw new HttpsError("invalid-argument", "Jogo inválido.");
  const ref = db.collection(MATCHES_COLLECTION).doc(matchId);
  const config = await loadFriendlyMatchConfig(db);

  type Outcome =
    | {kind: "noop"}
    | {kind: "first"; data: MatchData}
    | {kind: "completed"; data: MatchData};

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Jogo não encontrado.");
    const data = snap.data() as MatchData;
    if (data.fromUid !== uid && data.toUid !== uid) {
      throw new HttpsError("permission-denied", "Você não participa deste jogo.");
    }
    if (data.status !== "confirmed") {
      throw new HttpsError("failed-precondition", "Este jogo não aceita check-in.");
    }
    const windowState = resolveCheckInWindowState(
      (data.checkInOpenAt as Timestamp).toMillis(),
      (data.checkInCloseAt as Timestamp).toMillis(),
      nowMs,
    );
    if (windowState === "not_open") {
      throw new HttpsError(
        "failed-precondition",
        `O check-in abre ${config.checkInWindow.beforeMinutes} min antes do jogo.`);
    }
    if (windowState === "closed") {
      throw new HttpsError("failed-precondition", "A janela de check-in já fechou.");
    }

    const checkIns = {...((data.checkIns ?? {}) as Record<string, unknown>)};
    if (checkIns[uid] != null) return {kind: "noop"};
    checkIns[uid] = Timestamp.fromMillis(nowMs);

    const otherUid = uid === data.fromUid ? (data.toUid as string) : (data.fromUid as string);
    const bothPresent = checkIns[otherUid] != null;

    if (bothPresent) {
      tx.set(ref, {
        status: "completed",
        statusUpdatedAt: Timestamp.fromMillis(nowMs),
        updatedAt: Timestamp.fromMillis(nowMs),
        checkIns,
        completedAt: Timestamp.fromMillis(nowMs),
        reviewRevealAt: Timestamp.fromMillis(nowMs + config.reviewRevealHours * HOUR_MS),
        history: appendHistory(data, historyEntry("completed", uid, nowMs)),
      }, {merge: true});
      return {kind: "completed", data};
    }

    tx.set(ref, {
      checkIns,
      updatedAt: Timestamp.fromMillis(nowMs),
    }, {merge: true});
    return {kind: "first", data};
  });

  if (outcome.kind === "noop") return {completed: false, notifications: []};

  const data = outcome.data;
  const fromUid = data.fromUid as string;
  const toUid = data.toUid as string;
  const myName = uid === fromUid ? (data.fromName as string) : (data.toName as string);
  const otherUid = uid === fromUid ? toUid : fromUid;

  if (outcome.kind === "completed") {
    // Reputação dos dois — idempotente por match (retry seguro).
    await applyReputationEvent(
      db, fromUid, matchCompletedEventId(matchId), "match_completed", {matchId});
    await applyReputationEvent(
      db, toUid, matchCompletedEventId(matchId), "match_completed", {matchId});
    return {
      completed: true,
      notifications: [
        notification(
          fromUid, "friendly_match_completed", matchId,
          "Jogo confirmado! 🙌", `Como foi jogar com ${data.toName}? Avalie agora.`),
        notification(
          toUid, "friendly_match_completed", matchId,
          "Jogo confirmado! 🙌", `Como foi jogar com ${data.fromName}? Avalie agora.`),
      ],
    };
  }

  return {
    completed: false,
    notifications: [
      notification(
        otherUid, "friendly_match_checkin_nudge", matchId,
        "Check-in feito ✔", `${myName} confirmou presença. Faça seu check-in também!`),
    ],
  };
}

export async function closeFriendlyMatchCheckInIfDue(
  db: Firestore,
  matchId: string,
  nowMs: number = Date.now(),
): Promise<{closed: boolean; notifications: FriendlyMatchNotification[]}> {
  const ref = db.collection(MATCHES_COLLECTION).doc(matchId);

  type Outcome = {data: MatchData; absentUids: string[]} | null;

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as MatchData;
    if (data.status !== "confirmed") return null;
    const closeAt = data.checkInCloseAt as Timestamp | undefined;
    if (closeAt == null || closeAt.toMillis() > nowMs) return null;

    const checkIns = (data.checkIns ?? {}) as Record<string, unknown>;
    const participants = [data.fromUid as string, data.toUid as string];
    const absentUids = participants.filter((p) => checkIns[p] == null);
    // Ambos presentes seria `completed` pelo próprio check-in; defensivo.
    if (absentUids.length === 0) return null;
    // Penalidade só quando exatamente um faltou (decisão de produto).
    const penalizedUids = absentUids.length === 1 ? absentUids : [];

    tx.set(ref, {
      status: "no_show",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      noShowUids: penalizedUids,
      history: appendHistory(data, historyEntry("no_show", "system", nowMs)),
    }, {merge: true});
    return {data, absentUids: penalizedUids};
  });

  if (outcome == null) return {closed: false, notifications: []};

  const {data, absentUids} = outcome;
  const fromUid = data.fromUid as string;
  const toUid = data.toUid as string;

  if (absentUids.length === 1) {
    const absentUid = absentUids[0];
    const presentUid = absentUid === fromUid ? toUid : fromUid;
    const absentName = absentUid === fromUid ?
      (data.fromName as string) : (data.toName as string);
    await applyReputationEvent(
      db, absentUid, noShowEventId(matchId), "no_show", {matchId});
    return {
      closed: true,
      notifications: [
        notification(
          presentUid, "friendly_match_no_show", matchId,
          "Sentimos muito 😕",
          `${absentName} não fez check-in e o jogo foi encerrado. Bora buscar outro?`),
        notification(
          absentUid, "friendly_match_no_show", matchId,
          "Você não fez check-in",
          "O jogo foi encerrado sem a sua presença e sua reputação foi afetada."),
      ],
    };
  }

  return {
    closed: true,
    notifications: [fromUid, toUid].map((userId) =>
      notification(
        userId, "friendly_match_no_show", matchId,
        "Jogo não confirmado",
        "Nenhum check-in foi feito e o jogo foi encerrado sem avaliação.")),
  };
}

// ---------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------

export const checkInFriendlyMatch = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const data = request.data as {matchId: string};
  const result = await checkInFriendlyMatchCore(getFirestore(), uid, data);
  await deliverFriendlyMatchNotifications(result.notifications);
  return {completed: result.completed};
});

export const closeFriendlyMatchCheckIns = onSchedule(
  {schedule: "every 5 minutes", timeZone: TIME_ZONE},
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const snap = await db
      .collection(MATCHES_COLLECTION)
      .where("status", "==", "confirmed")
      .where("checkInCloseAt", "<=", now)
      .limit(SWEEP_LIMIT)
      .get();
    for (const doc of snap.docs) {
      try {
        const result = await closeFriendlyMatchCheckInIfDue(db, doc.id, now.toMillis());
        await deliverFriendlyMatchNotifications(result.notifications);
      } catch (error) {
        logger.error("closeFriendlyMatchCheckIns: falha ao fechar", {matchId: doc.id, error});
      }
    }
  },
);
