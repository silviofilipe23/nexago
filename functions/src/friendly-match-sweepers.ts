import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  deliverFriendlyMatchNotifications,
  type FriendlyMatchNotification,
} from "./friendly-match-invite";
import {isInviteExpired} from "./friendly-match-logic";

/**
 * Bora Jogar — sweepers agendados: expiração de convites e lembretes 24h/2h.
 *
 * Cada doc é processado numa transação que re-checa status e prazo — o
 * sweeper e as callables podem correr em paralelo sem transição dupla.
 * Nos lembretes, anular o campo `reminderXhAt` dentro da mesma transação é
 * o próprio lock de idempotência (null sai da query de range do wrapper).
 */

const MATCHES_COLLECTION = "friendlyMatches";
const SWEEP_LIMIT = 50;
const TIME_ZONE = "America/Sao_Paulo";

type MatchData = Record<string, unknown>;

function historyEntry(status: string, actorUid: string, nowMs: number): MatchData {
  return {status, actorUid, at: Timestamp.fromMillis(nowMs)};
}

function appendHistory(data: MatchData, entry: MatchData): MatchData[] {
  const history = Array.isArray(data.history) ? (data.history as MatchData[]) : [];
  return [...history, entry];
}

export async function expireFriendlyMatchIfDue(
  db: Firestore,
  matchId: string,
  nowMs: number = Date.now(),
): Promise<{expired: boolean; notifications: FriendlyMatchNotification[]}> {
  const ref = db.collection(MATCHES_COLLECTION).doc(matchId);
  const expired = await db.runTransaction<MatchData | null>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as MatchData;
    if (data.status !== "sent" && data.status !== "countered") return null;
    const expiresAt = data.expiresAt as Timestamp | undefined;
    if (expiresAt == null || !isInviteExpired(expiresAt.toMillis(), nowMs)) return null;
    tx.set(ref, {
      status: "expired",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("expired", "system", nowMs)),
    }, {merge: true});
    return data;
  });

  if (expired == null) return {expired: false, notifications: []};

  // Quem fez a proposta vigente esperava resposta: avisa que ela venceu.
  const waitingUid = expired.status === "sent" ?
    (expired.fromUid as string) :
    (expired.toUid as string);
  const otherName = waitingUid === expired.fromUid ?
    (expired.toName as string) :
    (expired.fromName as string);
  return {
    expired: true,
    notifications: [{
      userId: waitingUid,
      title: "Convite expirado",
      body: `${otherName} não respondeu a tempo. Bora tentar outro horário?`,
      type: "friendly_match_expired",
      data: {type: "friendly_match_expired", matchId},
    }],
  };
}

export async function sendFriendlyMatchReminderIfDue(
  db: Firestore,
  matchId: string,
  kind: "24h" | "2h",
  nowMs: number = Date.now(),
): Promise<{sent: boolean; notifications: FriendlyMatchNotification[]}> {
  const field = kind === "24h" ? "reminder24hAt" : "reminder2hAt";
  const ref = db.collection(MATCHES_COLLECTION).doc(matchId);
  const due = await db.runTransaction<MatchData | null>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as MatchData;
    if (data.status !== "confirmed") return null;
    const reminderAt = data[field];
    if (!(reminderAt instanceof Timestamp) || reminderAt.toMillis() > nowMs) return null;
    // Anular o campo é o lock: a próxima passada não encontra o doc.
    tx.set(ref, {[field]: null, updatedAt: Timestamp.fromMillis(nowMs)}, {merge: true});
    return data;
  });

  if (due == null) return {sent: false, notifications: []};

  const title = kind === "24h" ? "Jogo amanhã! 🏐" : "Seu jogo é daqui a pouco ⏰";
  const participants: Array<[string, string]> = [
    [due.fromUid as string, due.toName as string],
    [due.toUid as string, due.fromName as string],
  ];
  return {
    sent: true,
    notifications: participants.map(([userId, otherName]) => ({
      userId,
      title,
      body: kind === "24h" ?
        `Seu jogo com ${otherName} é amanhã. Ainda está de pé?` :
        `Seu jogo com ${otherName} está chegando. Não esquece o check-in!`,
      type: "friendly_match_reminder",
      data: {type: "friendly_match_reminder", matchId, reminderKind: kind},
    })),
  };
}

// ---------------------------------------------------------------------------
// Wrappers agendados
// ---------------------------------------------------------------------------

export const expireFriendlyMatches = onSchedule(
  {schedule: "every 5 minutes", timeZone: TIME_ZONE},
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const snap = await db
      .collection(MATCHES_COLLECTION)
      .where("status", "in", ["sent", "countered"])
      .where("expiresAt", "<=", now)
      .limit(SWEEP_LIMIT)
      .get();
    for (const doc of snap.docs) {
      try {
        const result = await expireFriendlyMatchIfDue(db, doc.id, now.toMillis());
        await deliverFriendlyMatchNotifications(result.notifications);
      } catch (error) {
        logger.error("expireFriendlyMatches: falha ao expirar", {matchId: doc.id, error});
      }
    }
  },
);

export const sendFriendlyMatchReminders = onSchedule(
  {schedule: "every 5 minutes", timeZone: TIME_ZONE},
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    for (const kind of ["24h", "2h"] as const) {
      const field = kind === "24h" ? "reminder24hAt" : "reminder2hAt";
      const snap = await db
        .collection(MATCHES_COLLECTION)
        .where("status", "==", "confirmed")
        .where(field, "<=", now)
        .limit(SWEEP_LIMIT)
        .get();
      for (const doc of snap.docs) {
        try {
          const result = await sendFriendlyMatchReminderIfDue(db, doc.id, kind, now.toMillis());
          await deliverFriendlyMatchNotifications(result.notifications);
        } catch (error) {
          logger.error("sendFriendlyMatchReminders: falha no lembrete", {
            matchId: doc.id, kind, error,
          });
        }
      }
    }
  },
);
