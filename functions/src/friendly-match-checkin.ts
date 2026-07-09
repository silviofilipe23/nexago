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
 * `realizado` (completed) exige check-in de TODOS os `participantUids`
 * dentro da janela — ninguém forja jogo realizado sozinho. Depois que a
 * janela fecha, o sweeper decide: ≥1 check-in → no_show penalizando todo
 * ausente (quem apareceu prova que o jogo era viável); 0 check-ins →
 * no_show sem penalidade (impossível distinguir "não rolou" de "todo mundo
 * esqueceu"; decisão de produto).
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
    const participantUids = data.participantUids as string[];
    if (!participantUids.includes(uid)) {
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

    const allPresent = participantUids.every((p) => checkIns[p] != null);

    if (allPresent) {
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
  const participantUids = data.participantUids as string[];
  const nameOf = (p: string): string =>
    p === data.organizerUid ?
      (data.organizerName as string) :
      ((data.slots as MatchData[]).find((s) => s.uid === p)?.name as string ?? "Atleta");
  const myName = nameOf(uid);

  if (outcome.kind === "completed") {
    // Reputação de todos — idempotente por match (retry seguro).
    for (const p of participantUids) {
      await applyReputationEvent(db, p, matchCompletedEventId(matchId), "match_completed", {matchId});
    }
    return {
      completed: true,
      notifications: participantUids.map((p) => notification(
        p, "friendly_match_completed", matchId,
        "Jogo confirmado! 🙌", "Como foi jogar? Avalie a galera agora.")),
    };
  }

  const others = participantUids.filter((p) => p !== uid);
  return {
    completed: false,
    notifications: others.map((p) => notification(
      p, "friendly_match_checkin_nudge", matchId,
      "Check-in feito ✔", `${myName} confirmou presença. Faça seu check-in também!`)),
  };
}

export async function closeFriendlyMatchCheckInIfDue(
  db: Firestore,
  matchId: string,
  nowMs: number = Date.now(),
): Promise<{closed: boolean; notifications: FriendlyMatchNotification[]}> {
  const ref = db.collection(MATCHES_COLLECTION).doc(matchId);

  type Outcome = {data: MatchData; penalizedUids: string[]; presentCount: number} | null;

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as MatchData;
    if (data.status !== "confirmed") return null;
    const closeAt = data.checkInCloseAt as Timestamp | undefined;
    if (closeAt == null || closeAt.toMillis() > nowMs) return null;

    const checkIns = (data.checkIns ?? {}) as Record<string, unknown>;
    const participantUids = data.participantUids as string[];
    const presentUids = participantUids.filter((p) => checkIns[p] != null);
    const absentUids = participantUids.filter((p) => checkIns[p] == null);
    if (absentUids.length === 0) return null; // completed já teria cuidado disso
    const penalizedUids = presentUids.length > 0 ? absentUids : [];

    tx.set(ref, {
      status: "no_show",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      noShowUids: penalizedUids,
      history: appendHistory(data, historyEntry("no_show", "system", nowMs)),
    }, {merge: true});
    return {data, penalizedUids, presentCount: presentUids.length};
  });

  if (outcome == null) return {closed: false, notifications: []};
  const {data, penalizedUids, presentCount} = outcome;
  const participantUids = data.participantUids as string[];
  const nameOf = (p: string): string =>
    p === data.organizerUid ?
      (data.organizerName as string) :
      ((data.slots as MatchData[]).find((s) => s.uid === p)?.name as string ?? "Atleta");

  for (const p of penalizedUids) {
    await applyReputationEvent(db, p, noShowEventId(matchId), "no_show", {matchId});
  }

  if (presentCount === 0) {
    return {
      closed: true,
      notifications: participantUids.map((p) => notification(
        p, "friendly_match_no_show", matchId,
        "Jogo não confirmado", "Nenhum check-in foi feito e o jogo foi encerrado sem avaliação.")),
    };
  }

  const penalizedSet = new Set(penalizedUids);
  const penalizedNames = penalizedUids.map(nameOf).join(", ");
  return {
    closed: true,
    notifications: participantUids.map((p) => notification(
      p, "friendly_match_no_show", matchId,
      penalizedSet.has(p) ? "Você não fez check-in" : "Sentimos muito 😕",
      penalizedSet.has(p) ?
        "O jogo foi encerrado sem a sua presença e sua reputação foi afetada." :
        `${penalizedNames} não fez check-in e o jogo foi encerrado. Bora buscar outro?`)),
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
