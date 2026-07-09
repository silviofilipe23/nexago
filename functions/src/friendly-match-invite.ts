import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  Timestamp,
  type Firestore,
  type DocumentReference,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";
import {loadFriendlyMatchConfig} from "./friendly-match-config";
import {
  computeCompatibilityScore,
  computeConfirmationSchedule,
  isCancellationPenalized,
  isInviteExpired,
  type CompatibilityProfile,
  type FriendlyMatchObjective,
} from "./friendly-match-logic";
import {applyReputationEvent, lateCancelEventId} from "./friendly-match-reputation";

/**
 * Bora Jogar — callables do ciclo de convite (enviar, aceitar, recusar,
 * contrapropor, cancelar). Os `*Core` recebem o Firestore por parâmetro e
 * devolvem as notificações a enviar (testáveis com o fake); os wrappers
 * `onCall` no fim do arquivo autenticam, delegam e entregam os pushes.
 *
 * Escrita em `friendlyMatches` é exclusiva destas funções (rules bloqueiam
 * o client). Convite vencido é encerrado AQUI de forma durável: o flip para
 * `expired` é commitado na transação e o erro é lançado só depois — nunca
 * lançar dentro do callback, senão o rollback descarta o flip.
 */

const MATCHES_COLLECTION = "friendlyMatches";
const HOUR_MS = 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 300;
const MAX_ALTERNATIVE_TIMES = 2;
const MAX_INVITEES = 10;
const PENDING_SLOT_STATUSES = ["invited", "countered"] as const;
const OBJECTIVES: readonly FriendlyMatchObjective[] = ["training", "friendly", "partner"];

export type FriendlyMatchNotification = {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
};

export type FriendlyMatchLocation = {
  arenaId?: string;
  arenaName?: string;
  freeText?: string;
};

export type SendFriendlyMatchInput = {
  toUids: string[];
  sport: string;
  objective: FriendlyMatchObjective;
  scheduledAtMs: number;
  alternativeTimesMs?: number[];
  location: FriendlyMatchLocation;
  message?: string;
};

export type FriendlyMatchActionResult = {
  matchId: string;
  notifications: FriendlyMatchNotification[];
};

type MatchData = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers de validação e leitura
// ---------------------------------------------------------------------------

function requireFutureMs(raw: unknown, nowMs: number, label: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= nowMs) {
    throw new HttpsError("invalid-argument", `${label} deve ser um horário futuro.`);
  }
  return raw;
}

function sanitizeLocation(raw: unknown): FriendlyMatchLocation {
  const data = (raw ?? {}) as Record<string, unknown>;
  const arenaId = typeof data.arenaId === "string" ? data.arenaId.trim() : "";
  const arenaName = typeof data.arenaName === "string" ? data.arenaName.trim() : "";
  const freeText = typeof data.freeText === "string" ? data.freeText.trim() : "";
  if (!arenaId && !freeText) {
    throw new HttpsError(
      "invalid-argument", "Informe uma arena ou descreva o local do jogo.");
  }
  const location: FriendlyMatchLocation = {};
  if (arenaId) location.arenaId = arenaId;
  if (arenaName) location.arenaName = arenaName;
  if (freeText) location.freeText = freeText;
  return location;
}

function sanitizeMessage(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "Mensagem inválida.");
  }
  const message = raw.trim();
  if (!message) return undefined;
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError(
      "invalid-argument", `Mensagem deve ter até ${MAX_MESSAGE_LENGTH} caracteres.`);
  }
  return message;
}

function sanitizeAlternativeTimes(raw: unknown, nowMs: number): number[] {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ALTERNATIVE_TIMES) {
    throw new HttpsError(
      "invalid-argument", `Proponha no máximo ${MAX_ALTERNATIVE_TIMES} horários alternativos.`);
  }
  return raw.map((value) => requireFutureMs(value, nowMs, "Horário alternativo"));
}

function displayNameOf(profile: MatchData): string {
  for (const field of ["fullName", "name", "nickname"]) {
    const value = profile[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Atleta";
}

function photoUrlOf(profile: MatchData): string | undefined {
  for (const field of ["profilePhotoUrl", "avatarUrl", "photoURL"]) {
    const value = profile[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function compatibilityProfileOf(profile: MatchData): CompatibilityProfile {
  const onboarding = (profile.sportOnboarding ?? {}) as Record<string, unknown>;
  const reputation = (profile.reputation ?? {}) as Record<string, unknown>;
  return {
    levelsBySport: (onboarding.levelsBySport ?? {}) as Record<string, unknown>,
    city: typeof profile.city === "string" ? profile.city : undefined,
    state: typeof profile.state === "string" ? profile.state : undefined,
    lookingForPartner: profile.lookingForPartner === true,
    reputationScore:
      typeof reputation.score === "number" ? (reputation.score as number) : undefined,
  };
}

function historyEntry(status: string, actorUid: string, nowMs: number): MatchData {
  return {status, actorUid, at: Timestamp.fromMillis(nowMs)};
}

function appendHistory(data: MatchData, entry: MatchData): MatchData[] {
  const history = Array.isArray(data.history) ? (data.history as MatchData[]) : [];
  return [...history, entry];
}

function otherParticipant(data: MatchData, uid: string): string {
  return uid === data.fromUid ? (data.toUid as string) : (data.fromUid as string);
}

function participantName(data: MatchData, uid: string): string {
  return uid === data.fromUid ? (data.fromName as string) : (data.toName as string);
}

function notificationFor(
  data: MatchData,
  matchId: string,
  targetUid: string,
  type: string,
  title: string,
  body: string,
): FriendlyMatchNotification {
  return {userId: targetUid, title, body, type, data: {type, matchId}};
}

/** Convite pendente (vaga invited/countered) entre A e B, em qualquer direção como organizador. */
async function hasPendingInviteWith(
  db: Firestore,
  uidA: string,
  uidB: string,
): Promise<boolean> {
  for (const [organizerUid, otherUid] of [[uidA, uidB], [uidB, uidA]]) {
    const snap = await db
      .collection(MATCHES_COLLECTION)
      .where("organizerUid", "==", organizerUid)
      .where("pendingSlotUids", "array-contains", otherUid)
      .limit(1)
      .get();
    if (snap.docs.length > 0) return true;
  }
  return false;
}

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

function sanitizeToUids(raw: unknown, organizerUid: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpsError("invalid-argument", "Escolha ao menos um atleta para convidar.");
  }
  if (raw.length > MAX_INVITEES) {
    throw new HttpsError("invalid-argument", `Convide no máximo ${MAX_INVITEES} atletas.`);
  }
  const seen = new Set<string>();
  const toUids: string[] = [];
  for (const value of raw) {
    const toUid = typeof value === "string" ? value.trim() : "";
    if (!toUid || toUid === organizerUid) {
      throw new HttpsError("invalid-argument", "Escolha outro atleta para convidar.");
    }
    if (seen.has(toUid)) {
      throw new HttpsError("invalid-argument", "Não é possível convidar o mesmo atleta duas vezes.");
    }
    seen.add(toUid);
    toUids.push(toUid);
  }
  return toUids;
}

// ---------------------------------------------------------------------------
// Enviar convite
// ---------------------------------------------------------------------------

export async function sendFriendlyMatchInviteCore(
  db: Firestore,
  uid: string,
  input: SendFriendlyMatchInput,
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const toUids = sanitizeToUids(input.toUids, uid);
  const sport = typeof input.sport === "string" ? input.sport.trim() : "";
  if (!sport) {
    throw new HttpsError("invalid-argument", "Informe o esporte do jogo.");
  }
  if (!OBJECTIVES.includes(input.objective)) {
    throw new HttpsError("invalid-argument", "Objetivo do jogo inválido.");
  }
  const scheduledAtMs = requireFutureMs(input.scheduledAtMs, nowMs, "Horário do jogo");
  if (toUids.length > 1 && input.alternativeTimesMs != null && input.alternativeTimesMs.length > 0) {
    throw new HttpsError(
      "invalid-argument", "Horários alternativos só valem para convite a uma pessoa.");
  }
  const alternativeTimesMs = toUids.length === 1 ?
    sanitizeAlternativeTimes(input.alternativeTimesMs, nowMs) : [];
  const location = sanitizeLocation(input.location);
  const message = sanitizeMessage(input.message);

  const [senderSnap, ...recipientSnaps] = await Promise.all([
    db.doc(`public_profiles/${uid}`).get(),
    ...toUids.map((toUid) => db.doc(`public_profiles/${toUid}`).get()),
  ]);
  recipientSnaps.forEach((snap, i) => {
    if (!snap.exists) throw new HttpsError("not-found", `Atleta não encontrado: ${toUids[i]}`);
  });
  const senderProfile = (senderSnap.data() ?? {}) as MatchData;

  for (const toUid of toUids) {
    if (await hasPendingInviteWith(db, uid, toUid)) {
      throw new HttpsError(
        "failed-precondition", "Já existe um convite pendente entre vocês.");
    }
  }

  const config = await loadFriendlyMatchConfig(db);
  const fromName = displayNameOf(senderProfile);
  const now = Timestamp.fromMillis(nowMs);
  const expiresAt = Timestamp.fromMillis(nowMs + config.inviteExpirationHours * HOUR_MS);

  const slots: MatchData[] = toUids.map((toUid, i) => {
    const recipientProfile = recipientSnaps[i].data() as MatchData;
    const {score, breakdown} = computeCompatibilityScore({
      sport, objective: input.objective,
      sender: compatibilityProfileOf(senderProfile),
      recipient: compatibilityProfileOf(recipientProfile),
    });
    const photoUrl = photoUrlOf(recipientProfile);
    return {
      uid: toUid,
      name: displayNameOf(recipientProfile),
      photoUrl: photoUrl ?? null,
      status: "invited",
      invitedAt: now,
      respondedAt: null,
      expiresAt,
      scoreAtSend: score,
      scoreBreakdown: breakdown,
    };
  });

  const doc: MatchData = {
    organizerUid: uid,
    organizerName: fromName,
    slotsTotal: toUids.length,
    slots,
    participantUids: [uid],
    pendingSlotUids: pendingUidsOf(slots),
    nextSlotExpiresAt: nextSlotExpiresAtOf(slots),
    sport,
    objective: input.objective,
    scheduledAt: Timestamp.fromMillis(scheduledAtMs),
    alternativeTimes: alternativeTimesMs.map((ms) => Timestamp.fromMillis(ms)),
    location,
    status: "filling",
    statusUpdatedAt: now,
    history: [historyEntry("filling", uid, nowMs)],
    createdAt: now,
    updatedAt: now,
  };
  const fromPhotoUrl = photoUrlOf(senderProfile);
  if (fromPhotoUrl) doc.organizerPhotoUrl = fromPhotoUrl;
  if (message) doc.message = message;

  const ref = await db.collection(MATCHES_COLLECTION).add(doc);
  const notifications = slots.map((slot) => {
    const body = input.objective === "partner" ?
      `${fromName} quer formar dupla com você` :
      `${fromName} te convidou para jogar`;
    return notificationFor(doc, ref.id, slot.uid as string, "friendly_match_invite", "Bora jogar? 🏐", body);
  });
  return {matchId: ref.id, notifications};
}

// ---------------------------------------------------------------------------
// Transições respondidas (aceitar / recusar / contrapropor / cancelar)
// ---------------------------------------------------------------------------

/**
 * Resultado interno das transações de transição: `expired` sinaliza que o
 * convite venceu e o flip já foi COMMITADO — o chamador lança o erro depois.
 */
type TransitionOutcome =
  | {kind: "ok"; data: MatchData; notifications: FriendlyMatchNotification[]}
  | {kind: "expired"};

function matchRef(db: Firestore, matchId: string): DocumentReference {
  const id = typeof matchId === "string" ? matchId.trim() : "";
  if (!id) throw new HttpsError("invalid-argument", "Convite inválido.");
  return db.collection(MATCHES_COLLECTION).doc(id);
}

/** Quem responde a proposta vigente: destinatário em `sent`, remetente em `countered`. */
function responderOf(data: MatchData): string {
  return data.status === "sent" ? (data.toUid as string) : (data.fromUid as string);
}

/** Commita o flip para expired dentro da transação (durável). */
function commitExpiredFlip(
  tx: {set: (ref: DocumentReference, data: MatchData, opts: {merge: boolean}) => void},
  ref: DocumentReference,
  data: MatchData,
  nowMs: number,
): void {
  tx.set(ref, {
    status: "expired",
    statusUpdatedAt: Timestamp.fromMillis(nowMs),
    updatedAt: Timestamp.fromMillis(nowMs),
    history: appendHistory(data, historyEntry("expired", "system", nowMs)),
  }, {merge: true});
}

function assertPendingStatus(data: MatchData): void {
  if (!PENDING_STATUSES.includes(data.status as typeof PENDING_STATUSES[number])) {
    throw new HttpsError(
      "failed-precondition", "Este convite não está mais aguardando resposta.");
  }
}

function assertResponder(data: MatchData, uid: string): void {
  if (responderOf(data) !== uid) {
    throw new HttpsError("permission-denied", "Não é você quem responde este convite.");
  }
}

export async function acceptFriendlyMatchInviteCore(
  db: Firestore,
  uid: string,
  input: {matchId: string; chosenTimeMs?: number},
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const ref = matchRef(db, input.matchId);
  const config = await loadFriendlyMatchConfig(db);

  const outcome = await db.runTransaction<TransitionOutcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
    const data = snap.data() as MatchData;
    assertPendingStatus(data);
    assertResponder(data, uid);
    if (isInviteExpired((data.expiresAt as Timestamp).toMillis(), nowMs)) {
      commitExpiredFlip(tx, ref, data, nowMs);
      return {kind: "expired"};
    }

    // Proposta vigente: a original em `sent`, a contraproposta em `countered`.
    const counter = (data.counterProposal ?? null) as MatchData | null;
    const proposal = data.status === "countered" && counter ? counter : data;
    const proposalMain = (proposal.scheduledAt as Timestamp).toMillis();
    const proposalAlts = Array.isArray(proposal.alternativeTimes) ?
      (proposal.alternativeTimes as Timestamp[]).map((ts) => ts.toMillis()) :
      [];
    const chosenMs = input.chosenTimeMs ?? proposalMain;
    if (![proposalMain, ...proposalAlts].includes(chosenMs)) {
      throw new HttpsError(
        "invalid-argument", "Escolha um dos horários propostos.");
    }

    const schedule = computeConfirmationSchedule(chosenMs, config, nowMs);
    const update: MatchData = {
      status: "confirmed",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      confirmedAt: Timestamp.fromMillis(nowMs),
      confirmedTime: Timestamp.fromMillis(chosenMs),
      // `scheduledAt` passa a ser o horário REAL do jogo (agenda/sweepers).
      scheduledAt: Timestamp.fromMillis(chosenMs),
      checkInOpenAt: Timestamp.fromMillis(schedule.checkInOpenAtMs),
      checkInCloseAt: Timestamp.fromMillis(schedule.checkInCloseAtMs),
      history: appendHistory(data, historyEntry("confirmed", uid, nowMs)),
    };
    if (schedule.reminder24hAtMs != null) {
      update.reminder24hAt = Timestamp.fromMillis(schedule.reminder24hAtMs);
    }
    if (schedule.reminder2hAtMs != null) {
      update.reminder2hAt = Timestamp.fromMillis(schedule.reminder2hAtMs);
    }
    // Contraproposta pode trocar o local.
    if (data.status === "countered" && counter?.location != null) {
      update.location = counter.location;
    }
    tx.set(ref, update, {merge: true});

    const accepterName = participantName(data, uid);
    const target = otherParticipant(data, uid);
    return {
      kind: "ok",
      data,
      notifications: [
        notificationFor(
          data, ref.id, target, "friendly_match_confirmed",
          "Deu match! 🎉", `${accepterName} topou. Bora jogar!`),
      ],
    };
  });

  if (outcome.kind === "expired") {
    throw new HttpsError("failed-precondition", "Este convite expirou.");
  }
  return {matchId: ref.id, notifications: outcome.notifications};
}

export async function declineFriendlyMatchInviteCore(
  db: Firestore,
  uid: string,
  input: {matchId: string; reason?: string},
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const ref = matchRef(db, input.matchId);
  const outcome = await db.runTransaction<TransitionOutcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
    const data = snap.data() as MatchData;
    assertPendingStatus(data);
    assertResponder(data, uid);
    if (isInviteExpired((data.expiresAt as Timestamp).toMillis(), nowMs)) {
      commitExpiredFlip(tx, ref, data, nowMs);
      return {kind: "expired"};
    }

    const update: MatchData = {
      status: "declined",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("declined", uid, nowMs)),
    };
    const reason = sanitizeMessage(input.reason);
    if (reason) update.declineReason = reason;
    tx.set(ref, update, {merge: true});

    const declinerName = participantName(data, uid);
    const target = otherParticipant(data, uid);
    return {
      kind: "ok",
      data,
      notifications: [
        notificationFor(
          data, ref.id, target, "friendly_match_declined",
          "Não rolou desta vez", `${declinerName} não pode jogar agora.`),
      ],
    };
  });

  if (outcome.kind === "expired") {
    throw new HttpsError("failed-precondition", "Este convite expirou.");
  }
  return {matchId: ref.id, notifications: outcome.notifications};
}

export async function counterFriendlyMatchInviteCore(
  db: Firestore,
  uid: string,
  input: {
    matchId: string;
    scheduledAtMs: number;
    alternativeTimesMs?: number[];
    location?: FriendlyMatchLocation;
    message?: string;
  },
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const ref = matchRef(db, input.matchId);
  const scheduledAtMs = requireFutureMs(input.scheduledAtMs, nowMs, "Horário do jogo");
  const alternativeTimesMs = sanitizeAlternativeTimes(input.alternativeTimesMs, nowMs);
  const message = sanitizeMessage(input.message);
  const location = input.location != null ? sanitizeLocation(input.location) : null;
  const config = await loadFriendlyMatchConfig(db);

  const outcome = await db.runTransaction<TransitionOutcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
    const data = snap.data() as MatchData;
    if (data.status !== "sent") {
      throw new HttpsError(
        "failed-precondition",
        "Este convite não aceita contraproposta — só há uma rodada.");
    }
    if (data.toUid !== uid) {
      throw new HttpsError("permission-denied", "Não é você quem responde este convite.");
    }
    if (isInviteExpired((data.expiresAt as Timestamp).toMillis(), nowMs)) {
      commitExpiredFlip(tx, ref, data, nowMs);
      return {kind: "expired"};
    }

    const counterProposal: MatchData = {
      scheduledAt: Timestamp.fromMillis(scheduledAtMs),
      alternativeTimes: alternativeTimesMs.map((ms) => Timestamp.fromMillis(ms)),
      proposedByUid: uid,
      at: Timestamp.fromMillis(nowMs),
    };
    if (location) counterProposal.location = location;
    if (message) counterProposal.message = message;

    tx.set(ref, {
      status: "countered",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      counterProposal,
      expiresAt: Timestamp.fromMillis(nowMs + config.inviteExpirationHours * HOUR_MS),
      history: appendHistory(data, historyEntry("countered", uid, nowMs)),
    }, {merge: true});

    return {
      kind: "ok",
      data,
      notifications: [
        notificationFor(
          data, ref.id, data.fromUid as string, "friendly_match_countered",
          "Contraproposta ⏱", `${data.toName} sugeriu outro horário para o jogo.`),
      ],
    };
  });

  if (outcome.kind === "expired") {
    throw new HttpsError("failed-precondition", "Este convite expirou.");
  }
  return {matchId: ref.id, notifications: outcome.notifications};
}

export async function cancelFriendlyMatchCore(
  db: Firestore,
  uid: string,
  input: {matchId: string},
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const ref = matchRef(db, input.matchId);
  const config = await loadFriendlyMatchConfig(db);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
    const data = snap.data() as MatchData;
    const status = data.status as string;

    let penalized = false;
    if (status === "sent" || status === "countered") {
      // Retirada do convite: só o remetente (o destinatário recusa).
      if (data.fromUid !== uid) {
        throw new HttpsError(
          "permission-denied", "Só quem enviou pode retirar o convite.");
      }
    } else if (status === "confirmed") {
      if (data.fromUid !== uid && data.toUid !== uid) {
        throw new HttpsError("permission-denied", "Você não participa deste jogo.");
      }
      penalized = isCancellationPenalized(
        (data.scheduledAt as Timestamp).toMillis(), nowMs, config);
    } else {
      throw new HttpsError(
        "failed-precondition", "Este jogo não pode mais ser cancelado.");
    }

    tx.set(ref, {
      status: "cancelled",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      cancelledByUid: uid,
      cancelledAt: Timestamp.fromMillis(nowMs),
      cancelPenalized: penalized,
      history: appendHistory(data, historyEntry("cancelled", uid, nowMs)),
    }, {merge: true});

    const cancellerName = participantName(data, uid);
    const target = otherParticipant(data, uid);
    const wasConfirmed = status === "confirmed";
    return {
      penalized,
      notifications: [
        notificationFor(
          data, ref.id, target, "friendly_match_cancelled",
          wasConfirmed ? "Jogo cancelado 😕" : "Convite retirado",
          wasConfirmed ?
            `${cancellerName} desmarcou o jogo. Bora achar outro?` :
            `${cancellerName} retirou o convite.`),
      ],
    };
  });

  if (result.penalized) {
    await applyReputationEvent(
      db, uid, lateCancelEventId(ref.id), "late_cancel", {matchId: ref.id});
  }
  return {matchId: ref.id, notifications: result.notifications};
}

// ---------------------------------------------------------------------------
// Wrappers onCall
// ---------------------------------------------------------------------------

function requireAuth(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

export async function deliverFriendlyMatchNotifications(
  notifications: FriendlyMatchNotification[],
): Promise<void> {
  return deliverAll(notifications);
}

async function deliverAll(notifications: FriendlyMatchNotification[]): Promise<void> {
  for (const notification of notifications) {
    try {
      await deliverNotificationToUser(notification);
    } catch (error) {
      logger.error("friendly-match: falha ao notificar", {
        userId: notification.userId,
        type: notification.type,
        error,
      });
    }
  }
}

export const sendFriendlyMatchInvite = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const result = await sendFriendlyMatchInviteCore(
    getFirestore(), uid, request.data as SendFriendlyMatchInput);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});

export const acceptFriendlyMatchInvite = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = request.data as {matchId: string; chosenTimeMs?: number};
  const result = await acceptFriendlyMatchInviteCore(getFirestore(), uid, data);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});

export const declineFriendlyMatchInvite = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = request.data as {matchId: string; reason?: string};
  const result = await declineFriendlyMatchInviteCore(getFirestore(), uid, data);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});

export const counterFriendlyMatchInvite = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = request.data as {
    matchId: string;
    scheduledAtMs: number;
    alternativeTimesMs?: number[];
    location?: FriendlyMatchLocation;
    message?: string;
  };
  const result = await counterFriendlyMatchInviteCore(getFirestore(), uid, data);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});

export const cancelFriendlyMatch = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = request.data as {matchId: string};
  const result = await cancelFriendlyMatchCore(getFirestore(), uid, data);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});
