import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {EVENT_TIME_ZONE} from "./event-timezone";
import {
  deliverNotificationToUser,
  type DeliverNotificationInput,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {
  buildOrganizerIdentity,
  isOpenListedTournament,
  ORGANIZER_FOLLOWER_PUSHES_COLLECTION,
  ORGANIZER_FOLLOWERS_SUBCOLLECTION,
  ORGANIZER_PUBLIC_PROFILES_COLLECTION,
  type DocData,
} from "./organizer-public-profile";

export const ORGANIZER_FOLLOWER_PUSH_TYPE = "organizer_event_registration_open";
const PUSH_BATCH = 20;
const DUE_LIMIT = 50;

export type Notify = (input: DeliverNotificationInput) => Promise<unknown>;

export type FollowerPushDecision =
  | {action: "none"}
  | {action: "send"}
  | {action: "schedule"; sendAtMs: number};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function opensAtMs(tournament: DocData): number | null {
  const raw = tournament.registrationOpensAt;
  return raw instanceof Timestamp ? raw.toMillis() : null;
}

/** Avisa uma vez, na transição para "inscrição aberta e listado". */
export function organizerFollowerPushDecision(
  before: DocData | null,
  after: DocData | null,
  nowMs: number,
): FollowerPushDecision {
  if (!after || !isOpenListedTournament(after) || !str(after.managerId)) return {action: "none"};
  if (isOpenListedTournament(before)) return {action: "none"};
  const opensAt = opensAtMs(after);
  if (opensAt != null && opensAt > nowMs) return {action: "schedule", sendAtMs: opensAt};
  return {action: "send"};
}

function eventDay(value: unknown): string {
  if (!(value instanceof Timestamp)) return "";
  return value.toDate().toLocaleDateString("pt-BR", {timeZone: EVENT_TIME_ZONE, day: "2-digit", month: "2-digit"});
}

export function organizerFollowerPushContent(
  organizerName: string,
  tournamentId: string,
  tournament: DocData,
): Omit<DeliverNotificationInput, "userId"> {
  const body = [str(tournament.name), eventDay(tournament.startAt), str(tournament.locationName)]
    .filter((part) => part.length > 0)
    .join(" · ");
  const path = `/torneios/${tournamentId}`;
  return {
    title: `${organizerName} abriu inscrições`,
    body,
    type: ORGANIZER_FOLLOWER_PUSH_TYPE,
    // `/torneios/{id}` existe no app e no portal; build antigo do app abre `url` que começa com `/`.
    data: {url: path, webUrl: path, tournamentId, organizerId: str(tournament.managerId)},
  };
}

async function resolveOrganizerName(db: Firestore, organizerId: string): Promise<string> {
  const profile = await db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(organizerId).get();
  const name = profile.exists ? str((profile.data() as DocData).name) : "";
  if (name) return name;
  const user = await db.collection("users").doc(organizerId).get();
  return user.exists ? buildOrganizerIdentity(user.data() as DocData).name : "Organizador";
}

export async function notifyOrganizerFollowers(
  db: Firestore,
  tournamentId: string,
  tournament: DocData,
  notify: Notify,
): Promise<number> {
  const organizerId = str(tournament.managerId);
  const followers = await db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(organizerId)
    .collection(ORGANIZER_FOLLOWERS_SUBCOLLECTION).get();
  const recipients = followers.docs.map((d) => d.id).filter((uid) => uid !== organizerId);
  if (recipients.length === 0) return 0;
  const content = organizerFollowerPushContent(await resolveOrganizerName(db, organizerId), tournamentId, tournament);
  for (let i = 0; i < recipients.length; i += PUSH_BATCH) {
    await Promise.all(recipients.slice(i, i + PUSH_BATCH).map((userId) =>
      notify({userId, ...content}).catch((error) => {
        logger.warn("organizerFollowerPush: push falhou", {userId, tournamentId, error});
      }),
    ));
  }
  return recipients.length;
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as {code?: unknown})?.code;
  return code === 6 || code === "already-exists" || /already exists/i.test(String((error as Error)?.message));
}

/**
 * A trava (`create`) garante um aviso por evento, mesmo com o gatilho reentregue ou o evento
 * reaberto. Criada já como `sending`: se a function cair no meio, preferimos perder um aviso a
 * duplicar.
 */
export async function handleTournamentOpenedForFollowers(
  db: Firestore,
  tournamentId: string,
  before: DocData | null,
  after: DocData | null,
  nowMs: number,
  notify: Notify,
): Promise<void> {
  const decision = organizerFollowerPushDecision(before, after, nowMs);
  if (decision.action === "none" || !after) return;
  const lockRef = db.collection(ORGANIZER_FOLLOWER_PUSHES_COLLECTION).doc(tournamentId);
  const base = {organizerId: str(after.managerId), createdAt: Timestamp.fromMillis(nowMs)};
  try {
    await lockRef.create(decision.action === "schedule" ?
      {...base, status: "scheduled", sendAt: Timestamp.fromMillis(decision.sendAtMs)} :
      {...base, status: "sending", sendAt: Timestamp.fromMillis(nowMs)});
  } catch (error) {
    if (isAlreadyExists(error)) return;
    throw error;
  }
  if (decision.action === "schedule") return;
  const recipients = await notifyOrganizerFollowers(db, tournamentId, after, notify);
  await lockRef.update({status: "sent", sentAt: Timestamp.fromMillis(nowMs), recipients});
}

export async function sendDueOrganizerFollowerPushes(db: Firestore, nowMs: number, notify: Notify): Promise<number> {
  const due = await db.collection(ORGANIZER_FOLLOWER_PUSHES_COLLECTION)
    .where("status", "==", "scheduled")
    .where("sendAt", "<=", Timestamp.fromMillis(nowMs))
    .limit(DUE_LIMIT)
    .get();
  let sent = 0;
  for (const lock of due.docs) {
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(lock.ref);
      if ((snap.data() as DocData | undefined)?.status !== "scheduled") return false;
      tx.update(lock.ref, {status: "sending"});
      return true;
    });
    if (!claimed) continue;

    const tournamentSnap = await db.collection("tournaments").doc(lock.id).get();
    const tournament = tournamentSnap.exists ? tournamentSnap.data() as DocData : null;
    if (!tournament || !isOpenListedTournament(tournament)) {
      await lock.ref.update({status: "skipped", skippedReason: tournament ? "not_open" : "deleted"});
      continue;
    }
    const opensAt = opensAtMs(tournament);
    if (opensAt != null && opensAt > nowMs) {
      await lock.ref.update({status: "scheduled", sendAt: Timestamp.fromMillis(opensAt)});
      continue;
    }
    const recipients = await notifyOrganizerFollowers(db, lock.id, tournament, notify);
    await lock.ref.update({status: "sent", sentAt: Timestamp.fromMillis(nowMs), recipients});
    sent += 1;
  }
  return sent;
}

function dataOf(snap: {exists: boolean; data: () => unknown} | undefined): DocData | null {
  return snap?.exists ? (snap.data() ?? {}) as DocData : null;
}

export const onTournamentWrittenNotifyOrganizerFollowers = onDocumentWritten(
  {
    document: "tournaments/{tournamentId}",
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    await handleTournamentOpenedForFollowers(
      getFirestore(),
      event.params.tournamentId,
      dataOf(event.data?.before),
      dataOf(event.data?.after),
      Date.now(),
      deliverNotificationToUser,
    );
  },
);

export const sendScheduledOrganizerFollowerPushes = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: EVENT_TIME_ZONE,
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async () => {
    const sent = await sendDueOrganizerFollowerPushes(getFirestore(), Date.now(), deliverNotificationToUser);
    if (sent > 0) logger.info("sendScheduledOrganizerFollowerPushes", {sent});
  },
);
