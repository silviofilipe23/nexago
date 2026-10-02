import {getFirestore, Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
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

/**
 * Id da trava. Publicar uma liga cria todas as etapas abertas no mesmo batch: com uma trava por
 * torneio, cada seguidor levaria N pushes no mesmo segundo. Etapas da mesma liga no mesmo dia
 * dividem uma trava; uma etapa acrescentada em outro dia avisa de novo.
 */
export function followerPushLockId(tournamentId: string, tournament: DocData, nowMs: number): string {
  const leagueId = str(tournament.leagueId);
  if (!leagueId) return tournamentId;
  const day = new Date(nowMs).toLocaleDateString("en-CA", {timeZone: EVENT_TIME_ZONE});
  return `league_${leagueId}_${day}`;
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
    // Aviso informativo: não fica preso na tela do navegador (como os outros avisos em massa).
    requireInteraction: false,
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

function registrationOpensAtChanged(before: DocData | null, after: DocData | null): boolean {
  return opensAtMs(before ?? {}) !== opensAtMs(after ?? {});
}

/**
 * Trava ainda agendada acompanha a data de abertura: adiantar (ou limpar) `registrationOpensAt`
 * puxa o envio para a próxima varredura; adiar empurra. Trava já enviada ou pulada não muda.
 */
async function rescheduleFollowerPush(db: Firestore, lockId: string, tournament: DocData, nowMs: number): Promise<void> {
  const lockRef = db.collection(ORGANIZER_FOLLOWER_PUSHES_COLLECTION).doc(lockId);
  const opensAt = opensAtMs(tournament);
  const sendAtMs = opensAt != null && opensAt > nowMs ? opensAt : nowMs;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const lock = snap.exists ? snap.data() as DocData : null;
    if (lock?.status !== "scheduled") return;
    const current = lock.sendAt instanceof Timestamp ? lock.sendAt.toMillis() : null;
    if (current === sendAtMs) return;
    tx.update(lockRef, {sendAt: Timestamp.fromMillis(sendAtMs)});
  });
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
  if (!after) return;
  const lockId = followerPushLockId(tournamentId, after, nowMs);
  const decision = organizerFollowerPushDecision(before, after, nowMs);
  if (decision.action === "none") {
    if (isOpenListedTournament(before) && isOpenListedTournament(after) && registrationOpensAtChanged(before, after)) {
      await rescheduleFollowerPush(db, lockId, after, nowMs);
    }
    return;
  }
  const lockRef = db.collection(ORGANIZER_FOLLOWER_PUSHES_COLLECTION).doc(lockId);
  const base = {organizerId: str(after.managerId), tournamentId, createdAt: Timestamp.fromMillis(nowMs)};
  try {
    await lockRef.create(decision.action === "schedule" ?
      {...base, status: "scheduled", sendAt: Timestamp.fromMillis(decision.sendAtMs)} :
      {...base, status: "sending", sendAt: Timestamp.fromMillis(nowMs)});
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    // Despublicado e republicado com outra data: a trava agendada segue a data nova.
    await rescheduleFollowerPush(db, lockId, after, nowMs);
    return;
  }
  if (decision.action === "schedule") return;
  const recipients = await notifyOrganizerFollowers(db, tournamentId, after, notify);
  await lockRef.update({status: "sent", sentAt: Timestamp.fromMillis(nowMs), recipients});
}

/** Uma trava vencida. `true` = enviou. */
async function sendDueLock(
  db: Firestore,
  lock: {id: string; ref: DocumentReference; data: () => unknown},
  nowMs: number,
  notify: Notify,
): Promise<boolean> {
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(lock.ref);
    if ((snap.data() as DocData | undefined)?.status !== "scheduled") return false;
    tx.update(lock.ref, {status: "sending"});
    return true;
  });
  if (!claimed) return false;

  const tournamentId = str((lock.data() as DocData | undefined)?.tournamentId) || lock.id;
  const tournamentSnap = await db.collection("tournaments").doc(tournamentId).get();
  const tournament = tournamentSnap.exists ? tournamentSnap.data() as DocData : null;
  if (!tournament || !isOpenListedTournament(tournament)) {
    await lock.ref.update({status: "skipped", skippedReason: tournament ? "not_open" : "deleted"});
    return false;
  }
  const opensAt = opensAtMs(tournament);
  if (opensAt != null && opensAt > nowMs) {
    await lock.ref.update({status: "scheduled", sendAt: Timestamp.fromMillis(opensAt)});
    return false;
  }
  const recipients = await notifyOrganizerFollowers(db, tournamentId, tournament, notify);
  await lock.ref.update({status: "sent", sentAt: Timestamp.fromMillis(nowMs), recipients});
  return true;
}

export async function sendDueOrganizerFollowerPushes(db: Firestore, nowMs: number, notify: Notify): Promise<number> {
  const due = await db.collection(ORGANIZER_FOLLOWER_PUSHES_COLLECTION)
    .where("status", "==", "scheduled")
    .where("sendAt", "<=", Timestamp.fromMillis(nowMs))
    .limit(DUE_LIMIT)
    .get();
  let sent = 0;
  for (const lock of due.docs) {
    // Uma trava com problema não segura as outras até a próxima varredura.
    try {
      if (await sendDueLock(db, lock, nowMs, notify)) sent += 1;
    } catch (error) {
      logger.error("sendScheduledOrganizerFollowerPushes: trava falhou", {lockId: lock.id, error});
    }
  }
  return sent;
}

function dataOf(snap: {exists: boolean; data: () => unknown} | undefined): DocData | null {
  return snap?.exists ? (snap.data() ?? {}) as DocData : null;
}

export const onTournamentWrittenNotifyOrganizerFollowers = onDocumentWritten(
  {
    document: "tournaments/{tournamentId}",
    // Fan-out para milhares de seguidores passa do teto padrão de 60 s.
    timeoutSeconds: 540,
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
    timeoutSeconds: 540,
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async () => {
    const sent = await sendDueOrganizerFollowerPushes(getFirestore(), Date.now(), deliverNotificationToUser);
    if (sent > 0) logger.info("sendScheduledOrganizerFollowerPushes", {sent});
  },
);
