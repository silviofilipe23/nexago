/**
 * Convidar jogadores para uma reserva de quadra (`arenaBookings`).
 *
 * O dono da reserva chama parceiros por convite direto (atleta do nexaGO, com
 * push) ou por link multiuso (`bookingInvites/link_{bookingId}`, para o grupo
 * do WhatsApp). Quem aceita entra em `participants`/`participantUids` do doc
 * da reserva — gravados SÓ aqui (as allow-lists de update do dono e da equipe
 * nas rules recusam esses campos). Desenho em
 * docs/superpowers/specs/2026-10-19-convite-jogadores-reserva-design.md.
 *
 * Um doc de convite por reserva × atleta (`{bookingId}_{uid}`), qualquer canal:
 * reconvidar reabre o mesmo doc e o XP de quem convidou (evento
 * `invite_{inviteId}`) não se repete quando alguém sai e volta.
 *
 * Os `*Core` recebem o Firestore por parâmetro e devolvem as notificações a
 * enviar (testáveis com o fake); os wrappers `onCall` no fim autenticam,
 * delegam e entregam os pushes. Transações leem tudo antes de escrever.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {awardPlayerInviteXp} from "./player-invite-gamification";

/** Dono + 3 — o mesmo `kBookingTeamSlots` (app) / `TEAM_SLOTS` (portal). */
export const BOOKING_MAX_PLAYERS = 4;
const MAX_INVITEES_PER_CALL = 10;
const MAX_PENDING_INVITES = 12;

const BOOKINGS = "arenaBookings";
const INVITES = "bookingInvites";
const ARENA_TIMEZONE_OFFSET = "-03:00";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Agenda do atleta no app (`/discover?tab=agenda`), existe nos builds da loja. */
const AGENDA_URL = "/discover?tab=agenda";
const WEEKDAY_SHORT_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

type Data = Record<string, unknown>;

export type BookingInviteStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "canceled"
  | "left"
  | "removed";

export type BookingParticipant = {
  uid: string;
  name: string;
  avatarUrl?: string;
  via: "direct" | "link";
  joinedAt: Timestamp;
};

export type BookingInviteNotification = {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

export function bookingInviteDocId(bookingId: string, uid: string): string {
  return `${bookingId}_${uid}`;
}

export function bookingInviteLinkId(bookingId: string): string {
  return `link_${bookingId}`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireId(value: unknown, label: string): string {
  const id = str(value);
  if (!id || id.includes("/")) {
    throw new HttpsError("invalid-argument", `${label} inválido.`);
  }
  return id;
}

/** Dono da reserva: `athleteId`, ou `bookingAthleteId` nas reservas antigas. */
export function bookingOwnerUid(booking: Data): string {
  return str(booking.athleteId) || str(booking.bookingAthleteId);
}

export function bookingIsCanceled(booking: Data): boolean {
  const status = str(booking.status).toLowerCase();
  return status === "canceled" || status === "cancelled";
}

/**
 * Início e fim da reserva em ms: `date` 'YYYY-MM-DD' + 'HH:MM' no fuso de SP
 * (a mesma conta dos lembretes). Fim ≤ início vira o dia seguinte
 * ('23:00'–'00:00'). `null` quando a reserva não tem horário legível.
 */
export function bookingWindowMs(booking: Data): {startMs: number; endMs: number} | null {
  const date = str(booking.date).slice(0, 10);
  const start = str(booking.startTime).slice(0, 5);
  const end = str(booking.endTime).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
  const startMs = Date.parse(`${date}T${start}:00${ARENA_TIMEZONE_OFFSET}`);
  let endMs = Date.parse(`${date}T${end}:00${ARENA_TIMEZONE_OFFSET}`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  if (endMs <= startMs) endMs += DAY_MS;
  return {startMs, endMs};
}

/** Reserva ainda de pé para entrar/sair do jogo: não cancelada e não encerrada. */
export function assertBookingStillOn(
  booking: Data,
  nowMs: number,
): {startMs: number; endMs: number} {
  if (bookingIsCanceled(booking)) {
    throw new HttpsError("failed-precondition", "Esta reserva foi cancelada.");
  }
  const window = bookingWindowMs(booking);
  if (!window) {
    throw new HttpsError("failed-precondition", "Esta reserva não tem data e horário válidos.");
  }
  if (nowMs >= window.endMs) {
    throw new HttpsError("failed-precondition", "Este jogo já terminou.");
  }
  return window;
}

/** Além de [assertBookingStillOn]: convidar exige a reserva garantida (PIX pago). */
export function assertBookingOpenForInvites(
  booking: Data,
  nowMs: number,
): {startMs: number; endMs: number} {
  const window = assertBookingStillOn(booking, nowMs);
  if (str(booking.status).toLowerCase() === "pending_payment") {
    throw new HttpsError(
      "failed-precondition",
      "Conclua o pagamento da reserva para convidar jogadores.",
    );
  }
  return window;
}

/** Participantes gravados por este módulo (entradas sem `uid` são ignoradas). */
export function participantsOf(booking: Data): BookingParticipant[] {
  const raw = booking.participants;
  if (!Array.isArray(raw)) return [];
  const out: BookingParticipant[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Data;
    const uid = str(item.uid);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const avatarUrl = str(item.avatarUrl);
    out.push({
      uid,
      name: str(item.name) || "Atleta",
      ...(avatarUrl ? {avatarUrl} : {}),
      via: item.via === "link" ? "link" : "direct",
      joinedAt: item.joinedAt instanceof Timestamp ?
        item.joinedAt :
        Timestamp.fromMillis(0),
    });
  }
  return out;
}

/** Campos da reserva derivados da lista: o que o app/portal/lembrete leem. */
export function participantsPatch(participants: BookingParticipant[]): Data {
  return {
    participants,
    participantUids: participants.map((p) => p.uid),
    confirmedParticipants: 1 + participants.length,
  };
}

export function sanitizeInviteeUids(raw: unknown, ownerUid: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpsError("invalid-argument", "Escolha ao menos um atleta para convidar.");
  }
  const out: string[] = [];
  for (const value of raw) {
    const uid = str(value);
    if (!uid || uid.includes("/")) {
      throw new HttpsError("invalid-argument", "Atleta inválido.");
    }
    if (uid === ownerUid) {
      throw new HttpsError("invalid-argument", "Você não pode convidar a si mesmo.");
    }
    if (!out.includes(uid)) out.push(uid);
  }
  if (out.length > MAX_INVITEES_PER_CALL) {
    throw new HttpsError(
      "invalid-argument",
      `Convide no máximo ${MAX_INVITEES_PER_CALL} atletas por vez.`,
    );
  }
  return out;
}

/** "sáb, 25/10 às 19:00" — sem o horário quando ele não é legível. */
export function bookingWhenLabel(booking: Data): string {
  const date = str(booking.date).slice(0, 10);
  const start = str(booking.startTime).slice(0, 5);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return start;
  const [, y, m, d] = match;
  const weekday = WEEKDAY_SHORT_PT[new Date(Date.UTC(+y, +m - 1, +d)).getUTCDay()];
  const day = `${weekday}, ${d}/${m}`;
  return /^\d{2}:\d{2}$/.test(start) ? `${day} às ${start}` : day;
}

function arenaNameOf(booking: Data): string {
  return str(booking.arenaName) || "a arena";
}

export function profileName(profile: Data | undefined): string {
  for (const field of ["fullName", "name", "nickname", "displayName"]) {
    const value = str(profile?.[field]);
    if (value) return value;
  }
  return "Atleta";
}

export function profileAvatar(profile: Data | undefined): string | undefined {
  for (const field of ["profilePhotoUrl", "avatarUrl", "photoURL", "photoUrl"]) {
    const value = str(profile?.[field]);
    if (value) return value;
  }
  return undefined;
}

/** Cópia da reserva guardada no convite (a tela do convite e o legado leem daqui). */
function bookingCopy(bookingId: string, booking: Data, endMs: number): Data {
  return {
    bookingId,
    arenaId: str(booking.arenaId),
    arenaName: str(booking.arenaName),
    courtId: str(booking.courtId) || null,
    courtName: str(booking.courtName),
    date: str(booking.date).slice(0, 10),
    startTime: str(booking.startTime).slice(0, 5),
    endTime: str(booking.endTime).slice(0, 5),
    sport: str(booking.sport) || null,
    expiresAt: Timestamp.fromMillis(endMs),
  };
}

function inviteeNotification(
  inviteId: string,
  bookingId: string,
  booking: Data,
  ownerName: string,
  inviteeUid: string,
): BookingInviteNotification {
  const url = `/convite/${inviteId}`;
  return {
    userId: inviteeUid,
    title: "Você foi convidado para jogar",
    body: `${ownerName} te chamou para jogar na ${arenaNameOf(booking)} · ` +
      `${bookingWhenLabel(booking)}`,
    type: "booking_invite",
    data: {inviteId, bookingId, arenaId: str(booking.arenaId), url, webUrl: url},
  };
}

function bookingNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  bookingId: string,
  booking: Data,
): BookingInviteNotification {
  return {
    userId,
    title,
    body,
    type,
    data: {bookingId, arenaId: str(booking.arenaId), url: AGENDA_URL},
  };
}

async function readProfile(db: Firestore, uid: string): Promise<Data | undefined> {
  const snap = await db.doc(`public_profiles/${uid}`).get();
  return snap.exists ? (snap.data() as Data) : undefined;
}

// ---------------------------------------------------------------------------
// Convidar (direto)
// ---------------------------------------------------------------------------

export type InviteArenaBookingPlayersInput = {bookingId: string; inviteeUids: string[]};

export type InviteArenaBookingPlayersResult = {
  invited: Array<{uid: string; inviteId: string}>;
  skipped: Array<{uid: string; reason: "participant" | "pending"}>;
  notifications: BookingInviteNotification[];
};

export async function inviteArenaBookingPlayersCore(
  db: Firestore,
  uid: string,
  input: InviteArenaBookingPlayersInput,
  nowMs: number = Date.now(),
): Promise<InviteArenaBookingPlayersResult> {
  const bookingId = requireId(input?.bookingId, "Reserva");
  const bookingSnap = await db.doc(`${BOOKINGS}/${bookingId}`).get();
  if (!bookingSnap.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada.");
  }
  const booking = (bookingSnap.data() ?? {}) as Data;
  if (bookingOwnerUid(booking) !== uid) {
    throw new HttpsError("permission-denied", "Só quem fez a reserva pode convidar jogadores.");
  }
  const {endMs} = assertBookingOpenForInvites(booking, nowMs);
  const inviteeUids = sanitizeInviteeUids(input?.inviteeUids, uid);

  const participants = participantsOf(booking);
  if (participants.length + 1 >= BOOKING_MAX_PLAYERS) {
    throw new HttpsError("failed-precondition", "A quadra já está completa.");
  }

  const [ownerProfile, ...inviteeProfiles] = await Promise.all([
    readProfile(db, uid),
    ...inviteeUids.map((inviteeUid) => readProfile(db, inviteeUid)),
  ]);
  inviteeProfiles.forEach((profile) => {
    if (!profile) throw new HttpsError("not-found", "Atleta não encontrado.");
  });

  const existing = await db.collection(INVITES).where("bookingId", "==", bookingId).get();
  const pendingUids = new Set<string>();
  for (const doc of existing.docs) {
    const data = doc.data() as Data;
    if (data.status === "pending" && str(data.inviteeUid)) pendingUids.add(str(data.inviteeUid));
  }
  const participantUids = new Set(participants.map((p) => p.uid));

  const skipped: InviteArenaBookingPlayersResult["skipped"] = [];
  const toInvite: Array<{uid: string; profile: Data | undefined}> = [];
  inviteeUids.forEach((inviteeUid, i) => {
    if (participantUids.has(inviteeUid)) {
      skipped.push({uid: inviteeUid, reason: "participant"});
    } else if (pendingUids.has(inviteeUid)) {
      skipped.push({uid: inviteeUid, reason: "pending"});
    } else {
      toInvite.push({uid: inviteeUid, profile: inviteeProfiles[i]});
    }
  });
  if (pendingUids.size + toInvite.length > MAX_PENDING_INVITES) {
    throw new HttpsError(
      "failed-precondition",
      "Há muitos convites sem resposta nesta reserva. Cancele algum antes de chamar mais gente.",
    );
  }

  const ownerName = profileName(ownerProfile);
  const now = Timestamp.fromMillis(nowMs);
  const copy = bookingCopy(bookingId, booking, endMs);
  const batch = db.batch();
  const invited: InviteArenaBookingPlayersResult["invited"] = [];
  const notifications: BookingInviteNotification[] = [];
  for (const invitee of toInvite) {
    const inviteId = bookingInviteDocId(bookingId, invitee.uid);
    // Troca o doc inteiro: reconvidar quem recusou/saiu zera a resposta antiga.
    batch.set(db.doc(`${INVITES}/${inviteId}`), {
      ...copy,
      kind: "direct",
      invitedByUid: uid,
      invitedByName: ownerName,
      inviteeUid: invitee.uid,
      inviteeName: profileName(invitee.profile),
      inviteeAvatarUrl: profileAvatar(invitee.profile) ?? null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    invited.push({uid: invitee.uid, inviteId});
    notifications.push(inviteeNotification(inviteId, bookingId, booking, ownerName, invitee.uid));
  }
  if (toInvite.length > 0) await batch.commit();

  return {invited, skipped, notifications};
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

export async function getArenaBookingInviteLinkCore(
  db: Firestore,
  uid: string,
  input: {bookingId: string},
  nowMs: number = Date.now(),
): Promise<{inviteId: string}> {
  const bookingId = requireId(input?.bookingId, "Reserva");
  const bookingSnap = await db.doc(`${BOOKINGS}/${bookingId}`).get();
  if (!bookingSnap.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada.");
  }
  const booking = (bookingSnap.data() ?? {}) as Data;
  if (bookingOwnerUid(booking) !== uid) {
    throw new HttpsError("permission-denied", "Só quem fez a reserva pode convidar jogadores.");
  }
  const {endMs} = assertBookingOpenForInvites(booking, nowMs);
  if (participantsOf(booking).length + 1 >= BOOKING_MAX_PLAYERS) {
    throw new HttpsError("failed-precondition", "A quadra já está completa.");
  }

  const inviteId = bookingInviteLinkId(bookingId);
  const linkRef = db.doc(`${INVITES}/${inviteId}`);
  const linkSnap = await linkRef.get();
  const now = Timestamp.fromMillis(nowMs);
  const ownerName = profileName(await readProfile(db, uid));
  await linkRef.set({
    ...bookingCopy(bookingId, booking, endMs),
    kind: "link",
    invitedByUid: uid,
    invitedByName: ownerName,
    status: "open",
    createdAt: linkSnap.exists ? (linkSnap.data() as Data).createdAt ?? now : now,
    updatedAt: now,
  });
  return {inviteId};
}

// ---------------------------------------------------------------------------
// Responder (aceitar / recusar)
// ---------------------------------------------------------------------------

export type RespondArenaBookingInviteResult = {
  status: "accepted" | "declined" | "already" | "dismissed";
  bookingId: string;
  /** Doc do convite deste atleta (`{bookingId}_{uid}`); vazio em `dismissed`. */
  inviteId: string;
  ownerUid: string;
  notifications: BookingInviteNotification[];
};

const BLOCKED_STATUS_MESSAGE: Record<string, string> = {
  declined: "Você já recusou este convite.",
  canceled: "Este convite foi cancelado por quem te chamou.",
  left: "Você saiu deste jogo.",
  removed: "Você não está mais neste jogo.",
};

export async function respondArenaBookingInviteCore(
  db: Firestore,
  uid: string,
  input: {inviteId: string; accept: boolean},
  nowMs: number = Date.now(),
): Promise<RespondArenaBookingInviteResult> {
  const inviteId = requireId(input?.inviteId, "Convite");
  if (typeof input?.accept !== "boolean") {
    throw new HttpsError("invalid-argument", "Resposta inválida.");
  }
  const accept = input.accept;
  const profile = await readProfile(db, uid);
  const name = profileName(profile);
  const avatarUrl = profileAvatar(profile);
  const now = Timestamp.fromMillis(nowMs);

  type Outcome = {
    status: RespondArenaBookingInviteResult["status"];
    bookingId: string;
    inviteId: string;
    ownerUid: string;
    booking: Data;
    playerCount: number;
  };

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const inviteRef = db.doc(`${INVITES}/${inviteId}`);
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) {
      throw new HttpsError("not-found", "Convite não encontrado.");
    }
    const invite = (inviteSnap.data() ?? {}) as Data;
    const isLink = invite.kind === "link" && !str(invite.inviteeUid);
    const bookingId = str(invite.bookingId);
    if (!bookingId) throw new HttpsError("not-found", "Convite não encontrado.");

    const bookingRef = db.doc(`${BOOKINGS}/${bookingId}`);
    const bookingSnap = await tx.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new HttpsError("failed-precondition", "Esta reserva foi cancelada.");
    }
    const booking = (bookingSnap.data() ?? {}) as Data;
    const ownerUid = bookingOwnerUid(booking);

    const targetId = bookingInviteDocId(bookingId, uid);
    const targetRef = isLink ? db.doc(`${INVITES}/${targetId}`) : inviteRef;
    const targetSnap = isLink ? await tx.get(targetRef) : inviteSnap;

    if (isLink) {
      if (invite.status !== "open") {
        throw new HttpsError("failed-precondition", "Este link de convite não está mais ativo.");
      }
      if (!accept) {
        return {status: "dismissed", bookingId, inviteId: "", ownerUid, booking, playerCount: 0};
      }
      if (uid === ownerUid) {
        throw new HttpsError(
          "failed-precondition",
          "Este jogo é seu — mande o link para quem vai jogar com você.",
        );
      }
    } else if (str(invite.inviteeUid) !== uid) {
      throw new HttpsError("permission-denied", "Este convite é para outro atleta.");
    }

    const participants = participantsOf(booking);
    const alreadyIn = participants.some((p) => p.uid === uid);
    const status = str(invite.status);
    if (!isLink) {
      if (status === "accepted" && alreadyIn) {
        return {status: "already", bookingId, inviteId: targetId, ownerUid, booking,
          playerCount: participants.length + 1};
      }
      if (status !== "pending") {
        throw new HttpsError(
          "failed-precondition",
          BLOCKED_STATUS_MESSAGE[status] ?? "Este convite não está mais disponível.",
        );
      }
    }

    assertBookingStillOn(booking, nowMs);

    if (!accept) {
      if (alreadyIn) {
        throw new HttpsError(
          "failed-precondition",
          "Você já está neste jogo. Para sair, use \"Sair do jogo\" na reserva.",
        );
      }
      tx.update(inviteRef, {status: "declined", respondedAt: now, updatedAt: now});
      return {status: "declined", bookingId, inviteId: targetId, ownerUid, booking,
        playerCount: participants.length + 1};
    }

    const accepted = {
      status: "accepted",
      acceptedByUid: uid,
      acceptedByName: name,
      acceptedAt: now,
      respondedAt: now,
      updatedAt: now,
    };

    if (alreadyIn) {
      // Entrou por outro canal (link × convite direto): só alinha o doc dele.
      if (isLink && !targetSnap.exists) {
        // Sem doc próprio: nada a alinhar.
      } else if (str(targetSnap.data()?.status) !== "accepted") {
        tx.update(targetRef, accepted);
      }
      return {status: "already", bookingId, inviteId: targetId, ownerUid, booking,
        playerCount: participants.length + 1};
    }

    if (participants.length + 1 >= BOOKING_MAX_PLAYERS) {
      throw new HttpsError("failed-precondition", "A quadra já está completa.");
    }

    const participant: BookingParticipant = {
      uid,
      name,
      ...(avatarUrl ? {avatarUrl} : {}),
      via: isLink ? "link" : "direct",
      joinedAt: now,
    };
    const next = [...participants, participant];
    tx.set(bookingRef, participantsPatch(next), {merge: true});

    if (isLink) {
      const window = bookingWindowMs(booking);
      const previous = (targetSnap.data() ?? {}) as Data;
      tx.set(targetRef, {
        ...bookingCopy(bookingId, booking, window?.endMs ?? nowMs),
        kind: "link",
        linkInviteId: inviteId,
        invitedByUid: ownerUid,
        invitedByName: str(invite.invitedByName) || "Atleta",
        inviteeUid: uid,
        inviteeName: name,
        inviteeAvatarUrl: avatarUrl ?? null,
        createdAt: previous.createdAt ?? now,
        ...accepted,
      });
    } else {
      tx.update(inviteRef, accepted);
    }
    return {status: "accepted", bookingId, inviteId: targetId, ownerUid, booking,
      playerCount: next.length + 1};
  });

  const notifications: BookingInviteNotification[] = [];
  const {booking, bookingId, ownerUid} = outcome;
  const where = `${arenaNameOf(booking)} · ${bookingWhenLabel(booking)}`;
  if (ownerUid && outcome.status === "accepted") {
    notifications.push(bookingNotification(
      ownerUid,
      "booking_invite_accepted",
      `${name} vai jogar com você`,
      `${where} · ${outcome.playerCount}/${BOOKING_MAX_PLAYERS} jogadores`,
      bookingId,
      booking,
    ));
  } else if (ownerUid && outcome.status === "declined") {
    notifications.push(bookingNotification(
      ownerUid,
      "booking_invite_declined",
      `${name} não vai poder jogar`,
      `${where}. Chame outra pessoa pelo app.`,
      bookingId,
      booking,
    ));
  }

  return {
    status: outcome.status,
    bookingId,
    inviteId: outcome.inviteId,
    ownerUid,
    notifications,
  };
}

// ---------------------------------------------------------------------------
// Sair do jogo / remover participante
// ---------------------------------------------------------------------------

export type LeaveArenaBookingResult = {
  removed: boolean;
  notifications: BookingInviteNotification[];
};

export async function leaveArenaBookingCore(
  db: Firestore,
  uid: string,
  input: {bookingId: string; participantUid?: string},
  nowMs: number = Date.now(),
): Promise<LeaveArenaBookingResult> {
  const bookingId = requireId(input?.bookingId, "Reserva");
  const targetUid = str(input?.participantUid) || uid;
  if (targetUid.includes("/")) throw new HttpsError("invalid-argument", "Atleta inválido.");
  const removingOther = targetUid !== uid;
  const now = Timestamp.fromMillis(nowMs);

  const outcome = await db.runTransaction(async (tx) => {
    const bookingRef = db.doc(`${BOOKINGS}/${bookingId}`);
    const inviteRef = db.doc(`${INVITES}/${bookingInviteDocId(bookingId, targetUid)}`);
    const [bookingSnap, inviteSnap] = [await tx.get(bookingRef), await tx.get(inviteRef)];
    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Reserva não encontrada.");
    }
    const booking = (bookingSnap.data() ?? {}) as Data;
    const ownerUid = bookingOwnerUid(booking);
    if (removingOther && uid !== ownerUid) {
      throw new HttpsError("permission-denied", "Só quem fez a reserva pode tirar alguém do jogo.");
    }
    if (!removingOther && uid === ownerUid) {
      throw new HttpsError(
        "failed-precondition",
        "A reserva é sua — para não jogar, cancele a reserva.",
      );
    }
    assertBookingStillOn(booking, nowMs);

    const participants = participantsOf(booking);
    const target = participants.find((p) => p.uid === targetUid);
    if (!target) {
      return {removed: false, booking, ownerUid, targetName: ""};
    }
    tx.set(
      bookingRef,
      participantsPatch(participants.filter((p) => p.uid !== targetUid)),
      {merge: true},
    );
    if (inviteSnap.exists) {
      tx.update(inviteRef, {
        status: removingOther ? "removed" : "left",
        leftAt: now,
        updatedAt: now,
      });
    }
    return {removed: true, booking, ownerUid, targetName: target.name};
  });

  const notifications: BookingInviteNotification[] = [];
  if (outcome.removed) {
    const {booking} = outcome;
    const where = `${arenaNameOf(booking)} · ${bookingWhenLabel(booking)}`;
    if (removingOther) {
      const ownerName = profileName(await readProfile(db, uid));
      notifications.push(bookingNotification(
        targetUid,
        "booking_participant_removed",
        "Lista do jogo atualizada",
        `${ownerName} tirou você do jogo na ${where}.`,
        bookingId,
        booking,
      ));
    } else if (outcome.ownerUid) {
      notifications.push(bookingNotification(
        outcome.ownerUid,
        "booking_participant_left",
        `${outcome.targetName} saiu do jogo`,
        `${where}. A vaga está aberta de novo.`,
        bookingId,
        booking,
      ));
    }
  }
  return {removed: outcome.removed, notifications};
}

// ---------------------------------------------------------------------------
// Cancelar convite pendente
// ---------------------------------------------------------------------------

export async function cancelArenaBookingInviteCore(
  db: Firestore,
  uid: string,
  input: {inviteId: string},
  nowMs: number = Date.now(),
): Promise<{canceled: boolean}> {
  const inviteId = requireId(input?.inviteId, "Convite");
  const inviteRef = db.doc(`${INVITES}/${inviteId}`);
  const snap = await inviteRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
  const invite = (snap.data() ?? {}) as Data;
  if (str(invite.invitedByUid) !== uid) {
    throw new HttpsError("permission-denied", "Só quem convidou pode cancelar o convite.");
  }
  if (invite.status === "canceled") return {canceled: false};
  if (invite.status !== "pending") {
    throw new HttpsError("failed-precondition", "Este convite já foi respondido.");
  }
  const now = Timestamp.fromMillis(nowMs);
  await inviteRef.update({status: "canceled", canceledAt: now, updatedAt: now});
  return {canceled: true};
}

// ---------------------------------------------------------------------------
// Reserva cancelada → avisa quem ia jogar e encerra os convites em aberto
// ---------------------------------------------------------------------------

export async function closeInvitesOfCanceledBookingCore(
  db: Firestore,
  bookingId: string,
  booking: Data,
  nowMs: number = Date.now(),
): Promise<BookingInviteNotification[]> {
  const now = Timestamp.fromMillis(nowMs);
  const invites = await db.collection(INVITES).where("bookingId", "==", bookingId).get();
  const batch = db.batch();
  let writes = 0;
  for (const doc of invites.docs) {
    const status = (doc.data() as Data).status;
    if (status === "pending" || status === "open") {
      batch.update(doc.ref, {status: "canceled", canceledAt: now, updatedAt: now});
      writes += 1;
    }
  }
  if (writes > 0) await batch.commit();

  const where = `${arenaNameOf(booking)} · ${bookingWhenLabel(booking)}`;
  return participantsOf(booking).map((p) => bookingNotification(
    p.uid,
    "booking_canceled_participant",
    "Jogo cancelado",
    `A reserva na ${where} foi cancelada.`,
    bookingId,
    booking,
  ));
}

// ---------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------

function requireAuth(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

async function deliverAll(notifications: BookingInviteNotification[]): Promise<void> {
  for (const notification of notifications) {
    try {
      await deliverNotificationToUser(notification);
    } catch (error) {
      logger.error("booking-invite: falha ao notificar", {
        userId: notification.userId,
        type: notification.type,
        error,
      });
    }
  }
}

export const inviteArenaBookingPlayers = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const result = await inviteArenaBookingPlayersCore(
    getFirestore(), uid, request.data as InviteArenaBookingPlayersInput);
  await deliverAll(result.notifications);
  return {invited: result.invited, skipped: result.skipped};
});

export const getArenaBookingInviteLink = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  return getArenaBookingInviteLinkCore(getFirestore(), uid, request.data as {bookingId: string});
});

export const respondArenaBookingInvite = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const db = getFirestore();
  const result = await respondArenaBookingInviteCore(
    db, uid, request.data as {inviteId: string; accept: boolean});
  if (result.status === "accepted" && result.ownerUid) {
    // Mesmo id de evento do gatilho onBookingInviteAcceptedAwardInviterXp:
    // o que chegar primeiro credita, o outro vira no-op. A entrada por link
    // CRIA o doc já aceito, então só este caminho credita.
    try {
      await awardPlayerInviteXp(db, result.ownerUid, result.inviteId);
    } catch (error) {
      logger.error("booking-invite: falha ao creditar XP", {inviteId: result.inviteId, error});
    }
  }
  await deliverAll(result.notifications);
  return {status: result.status, bookingId: result.bookingId, inviteId: result.inviteId};
});

export const leaveArenaBooking = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const result = await leaveArenaBookingCore(
    getFirestore(), uid, request.data as {bookingId: string; participantUid?: string});
  await deliverAll(result.notifications);
  return {removed: result.removed};
});

export const cancelArenaBookingInvite = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = requireAuth(request.auth?.uid);
  return cancelArenaBookingInviteCore(getFirestore(), uid, request.data as {inviteId: string});
});

/**
 * Reserva cancelada (dono, equipe ou PIX vencido): avisa os participantes e
 * encerra convites pendentes e o link. O "desfazer" da equipe (60 s) não
 * reabre os convites — os participantes continuam na reserva.
 */
export const onArenaBookingCanceledNotifyParticipants = onDocumentUpdated(
  `${BOOKINGS}/{bookingId}`,
  async (event) => {
    const before = event.data?.before.data() as Data | undefined;
    const after = event.data?.after.data() as Data | undefined;
    if (!before || !after) return;
    if (bookingIsCanceled(before) || !bookingIsCanceled(after)) return;
    try {
      const notifications = await closeInvitesOfCanceledBookingCore(
        getFirestore(), event.params.bookingId, after);
      await deliverAll(notifications);
    } catch (error) {
      logger.error("booking-invite: falha ao encerrar convites da reserva cancelada", {
        bookingId: event.params.bookingId,
        error,
      });
    }
  },
);
