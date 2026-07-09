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

const PENDING_SLOT_STATUSES = ["invited", "countered"] as const;

function pendingUidsOf(slots: MatchData[]): string[] {
  return slots
    .filter((s) => PENDING_SLOT_STATUSES.includes(s.status as typeof PENDING_SLOT_STATUSES[number]))
    .map((s) => s.uid as string);
}

function nextSlotExpiresAtOf(slots: MatchData[]): Timestamp | null {
  let min: Timestamp | null = null;
  for (const s of slots) {
    if (!PENDING_SLOT_STATUSES.includes(s.status as typeof PENDING_SLOT_STATUSES[number])) continue;
    const at = s.expiresAt as Timestamp;
    if (min == null || at.toMillis() < min.toMillis()) min = at;
  }
  return min;
}

export async function expireFriendlyMatchSlotIfDue(
  db: Firestore,
  matchId: string,
  slotIndex: number,
  nowMs: number = Date.now(),
): Promise<{expired: boolean; notifications: FriendlyMatchNotification[]}> {
  const ref = db.collection(MATCHES_COLLECTION).doc(matchId);

  type Outcome = {data: MatchData; slotName: string} | null;
  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as MatchData;
    if (data.status !== "filling") return null;
    const slots = (data.slots as MatchData[]).slice();
    const slotData = slots[slotIndex];
    if (slotData == null || !PENDING_SLOT_STATUSES.includes(
      slotData.status as typeof PENDING_SLOT_STATUSES[number])) return null;
    const expiresAt = slotData.expiresAt as Timestamp | undefined;
    if (expiresAt == null || !isInviteExpired(expiresAt.toMillis(), nowMs)) return null;
    slots[slotIndex] = {...slotData, status: "expired"};
    tx.set(ref, {
      slots,
      pendingSlotUids: pendingUidsOf(slots),
      nextSlotExpiresAt: nextSlotExpiresAtOf(slots),
      updatedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("slot_expired", "system", nowMs)),
    }, {merge: true});
    return {data, slotName: slotData.name as string};
  });

  if (outcome == null) return {expired: false, notifications: []};
  return {
    expired: true,
    notifications: [{
      userId: outcome.data.organizerUid as string,
      title: "Convite vencido",
      body: `${outcome.slotName} não respondeu a tempo. Bora escolher outra pessoa pra vaga?`,
      type: "friendly_match_slot_expired",
      data: {type: "friendly_match_slot_expired", matchId},
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
  const participantUids = due.participantUids as string[];
  return {
    sent: true,
    notifications: participantUids.map((userId) => ({
      userId,
      title,
      body: kind === "24h" ?
        "Seu jogo é amanhã. Ainda está de pé?" :
        "Seu jogo está chegando. Não esquece o check-in!",
      type: "friendly_match_reminder",
      data: {type: "friendly_match_reminder", matchId, reminderKind: kind},
    })),
  };
}

export async function unfillFriendlyMatchIfDue(
  db: Firestore,
  matchId: string,
  nowMs: number = Date.now(),
): Promise<{unfilled: boolean; notifications: FriendlyMatchNotification[]}> {
  const ref = db.collection(MATCHES_COLLECTION).doc(matchId);
  const outcome = await db.runTransaction<MatchData | null>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as MatchData;
    if (data.status !== "filling") return null;
    const scheduledAt = data.scheduledAt as Timestamp;
    if (scheduledAt.toMillis() > nowMs) return null;
    tx.set(ref, {
      status: "unfilled",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("unfilled", "system", nowMs)),
    }, {merge: true});
    return data;
  });

  if (outcome == null) return {unfilled: false, notifications: []};
  const stakeholders = new Set<string>([
    outcome.organizerUid as string,
    ...(outcome.participantUids as string[]),
  ]);
  return {
    unfilled: true,
    notifications: [...stakeholders].map((userId) => ({
      userId,
      title: "Jogo não fechou a tempo 😕",
      body: "Não deu pra completar o time antes do horário marcado.",
      type: "friendly_match_unfilled",
      data: {type: "friendly_match_unfilled", matchId},
    })),
  };
}

// ---------------------------------------------------------------------------
// Wrappers agendados
// ---------------------------------------------------------------------------

export const expireFriendlyMatchSlots = onSchedule(
  {schedule: "every 5 minutes", timeZone: TIME_ZONE},
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const snap = await db
      .collection(MATCHES_COLLECTION)
      .where("status", "==", "filling")
      .where("nextSlotExpiresAt", "<=", now)
      .limit(SWEEP_LIMIT)
      .get();
    for (const doc of snap.docs) {
      const slots = (doc.data().slots ?? []) as MatchData[];
      for (let i = 0; i < slots.length; i++) {
        try {
          const result = await expireFriendlyMatchSlotIfDue(db, doc.id, i, now.toMillis());
          await deliverFriendlyMatchNotifications(result.notifications);
        } catch (error) {
          logger.error("expireFriendlyMatchSlots: falha ao expirar vaga", {
            matchId: doc.id, slotIndex: i, error,
          });
        }
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

export const unfillFriendlyMatches = onSchedule(
  {schedule: "every 5 minutes", timeZone: TIME_ZONE},
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const snap = await db
      .collection(MATCHES_COLLECTION)
      .where("status", "==", "filling")
      .where("scheduledAt", "<=", now)
      .limit(SWEEP_LIMIT)
      .get();
    for (const doc of snap.docs) {
      try {
        const result = await unfillFriendlyMatchIfDue(db, doc.id, now.toMillis());
        await deliverFriendlyMatchNotifications(result.notifications);
      } catch (error) {
        logger.error("unfillFriendlyMatches: falha ao encerrar", {matchId: doc.id, error});
      }
    }
  },
);
