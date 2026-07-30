/**
 * Clubinho — jogo aberto recorrente da arena (lista pública + PIX por sessão).
 *
 * `arenaClubs/{clubId}` guarda a config (série semanal ou template de sessões
 * avulsas). Cada data vira `arenaClubSessions/{club_{clubId}_{date}}` com a
 * config COPIADA (preço/vagas/prazo ancorados no momento da criação — editar a
 * série só afeta sessões futuras ainda não geradas, como no mensalista).
 *
 * O bloqueio de agenda replica o mecanismo do mensalista: por sessão × quadra
 * são criados `arenaBookings` + `arenaSlots` + `arenaSlotLocks` — assim o app
 * atual e o quote de reserva já enxergam o horário ocupado sem mudança.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {isArenaEntitledPro} from "./arena-entitlement";
import {deliverNotificationToUser} from "./notification-delivery";
import {dayKeyFromEventDate} from "./event-timezone";
import {
  WEEKDAY_LABELS_PT,
  addDaysToDateKey,
  fmtHourEnd,
  fmtHourStart,
  hasBlockedSlotOverlap,
  isValidDateKey,
  lockRefsForOccurrence,
  occurrenceDatesBetween,
  toMinutes,
} from "./arena-recurring-booking";
import {
  ARENA_CLUBS,
  ARENA_CLUB_SESSIONS,
  CLUB_PARTICIPANTS,
  CLUB_HORIZON_DAYS,
} from "./arena-club-constants";
import {
  deleteAsaasPaymentIfOpen,
  refundAsaasPayment,
} from "./asaas-booking-payment";
import {asaasArenaSecrets} from "./asaas-client";
import {debitArenaWalletForClubRefund} from "./arena-wallet";
import {resolveAthleteDisplay} from "./arena-club-join";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_TIMEZONE_OFFSET = "-03:00";

const MAX_CLUB_COURTS = 12;
const MAX_CLUB_CAPACITY = 500;
const MAX_CANCEL_WINDOW_HOURS = 168; // 7 dias

export interface ArenaClubData {
  arenaId: string;
  arenaName: string;
  name: string;
  description: string | null;
  /** ISO 1–7; null = clubinho só de sessões avulsas. */
  weekday: number | null;
  startTime: string;
  endTime: string;
  courtIds: string[];
  courtNames: string[];
  capacity: number;
  priceReais: number;
  cancelWindowHours: number;
  /** Aceita reservar vaga pagando na arena (sem PIX antecipado). */
  allowOnsitePayment: boolean;
  status: string;
  startDate: string;
  endDate: string | null;
  skippedDates: string[];
}

export function parseArenaClub(data: Record<string, unknown>): ArenaClubData {
  return {
    arenaId: String(data["arenaId"] ?? ""),
    arenaName: String(data["arenaName"] ?? "Arena"),
    name: String(data["name"] ?? "Clubinho"),
    description: typeof data["description"] === "string" ? data["description"] : null,
    weekday: typeof data["weekday"] === "number" ? data["weekday"] : null,
    startTime: String(data["startTime"] ?? ""),
    endTime: String(data["endTime"] ?? ""),
    courtIds: Array.isArray(data["courtIds"]) ? (data["courtIds"] as unknown[]).map(String) : [],
    courtNames: Array.isArray(data["courtNames"]) ?
      (data["courtNames"] as unknown[]).map(String) :
      [],
    capacity: Number(data["capacity"] ?? 0),
    priceReais: Number(data["priceReais"] ?? 0),
    cancelWindowHours: Number(data["cancelWindowHours"] ?? 0),
    allowOnsitePayment: data["allowOnsitePayment"] !== false,
    status: String(data["status"] ?? ""),
    startDate: String(data["startDate"] ?? ""),
    endDate: typeof data["endDate"] === "string" ? data["endDate"] : null,
    skippedDates: Array.isArray(data["skippedDates"]) ?
      (data["skippedDates"] as unknown[]).map(String) :
      [],
  };
}

// ---------------------------------------------------------------------------
// Ids determinísticos (idempotência da materialização)
// ---------------------------------------------------------------------------

function safeIdPart(s: string): string {
  return s.replace(/\//g, "_");
}

/** Uma sessão por clubinho por dia (limitação consciente da v1). */
export function clubSessionId(clubId: string, dateKey: string): string {
  return `club_${safeIdPart(clubId)}_${dateKey}`;
}

/** Booking de bloqueio por quadra da sessão. */
export function clubBlockBookingId(
  clubId: string,
  dateKey: string,
  courtId: string,
): string {
  return `club_${safeIdPart(clubId)}_${dateKey}_${safeIdPart(courtId)}`;
}

export function clubSessionStartAt(dateKey: string, startTime: string): Date {
  return new Date(`${dateKey}T${startTime}:00${ARENA_TIMEZONE_OFFSET}`);
}

// ---------------------------------------------------------------------------
// Materialização de uma sessão (compartilhada: callable, série e scheduler)
// ---------------------------------------------------------------------------

export type MaterializeSessionOutcome = "created" | "exists" | "conflict";

export interface MaterializeSessionResult {
  outcome: MaterializeSessionOutcome;
  sessionId: string;
  skippedCourtIds: string[];
}

/**
 * Cria a sessão + bloqueios (booking/slot/locks por quadra) em uma transação.
 * Quadra com conflito de lock/bloqueio é pulada; se todas conflitarem, a
 * sessão não é criada (`conflict`).
 */
export async function materializeClubSession(
  db: Firestore,
  clubId: string,
  club: ArenaClubData,
  dateKey: string,
  source: "series" | "manual",
): Promise<MaterializeSessionResult> {
  const sessionRef = db.collection(ARENA_CLUB_SESSIONS).doc(clubSessionId(clubId, dateKey));

  // Pré-checagem de slots `blocked` (fora da transação, como no mensalista).
  const preUsable: Array<{courtId: string; courtName: string}> = [];
  const preSkipped: string[] = [];
  for (let i = 0; i < club.courtIds.length; i++) {
    const courtId = club.courtIds[i]!;
    const blocked = await hasBlockedSlotOverlap(
      db,
      {arenaId: club.arenaId, courtId, startTime: club.startTime, endTime: club.endTime},
      dateKey,
    );
    if (blocked) {
      preSkipped.push(courtId);
    } else {
      preUsable.push({courtId, courtName: club.courtNames[i] ?? "Quadra"});
    }
  }

  if (preUsable.length === 0) {
    return {outcome: "conflict", sessionId: sessionRef.id, skippedCourtIds: preSkipped};
  }

  const startAt = clubSessionStartAt(dateKey, club.startTime);

  try {
    const result = await db.runTransaction(async (tx: Transaction) => {
      const existing = await tx.get(sessionRef);
      if (existing.exists) {
        return {outcome: "exists" as const, skippedCourtIds: [] as string[]};
      }

      // Todas as leituras antes das escritas (exigência do Firestore).
      const usable: Array<{
        courtId: string;
        courtName: string;
        locks: ReturnType<typeof lockRefsForOccurrence>;
      }> = [];
      const skippedCourtIds = [...preSkipped];

      for (const court of preUsable) {
        const locks = lockRefsForOccurrence(
          db,
          {
            arenaId: club.arenaId,
            courtId: court.courtId,
            startTime: club.startTime,
            endTime: club.endTime,
          },
          dateKey,
        );
        if (locks.length === 0) {
          skippedCourtIds.push(court.courtId);
          continue;
        }
        let conflict = false;
        for (const lock of locks) {
          const snap = await tx.get(lock.ref);
          if (snap.exists) {
            conflict = true;
            break;
          }
        }
        if (conflict) {
          skippedCourtIds.push(court.courtId);
        } else {
          usable.push({...court, locks});
        }
      }

      if (usable.length === 0) {
        return {outcome: "conflict" as const, skippedCourtIds};
      }

      const blockBookingIds: string[] = [];
      for (const court of usable) {
        const bookingId = clubBlockBookingId(clubId, dateKey, court.courtId);
        blockBookingIds.push(bookingId);
        const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
        const slotRef = db.collection(ARENA_SLOTS).doc(bookingId);

        tx.set(bookingRef, {
          athleteId: null,
          arenaId: club.arenaId,
          arenaName: club.arenaName,
          courtId: court.courtId,
          courtName: court.courtName,
          customerName: club.name,
          date: dateKey,
          startTime: club.startTime,
          endTime: club.endTime,
          amountReais: 0,
          amountToPayNowReais: 0,
          amountPaidOnlineReais: 0,
          amountDueOnsiteReais: 0,
          paymentChannel: "onsite",
          paymentReceiver: null,
          paymentFraction: null,
          paymentStatus: "none",
          status: "active",
          attendanceConfirmed: false,
          attendanceStatus: "pending",
          confirmationDeadline: null,
          paymentExpiresAt: null,
          source: "club",
          isClubSession: true,
          clubId,
          clubSessionId: sessionRef.id,
          createdByRole: "arena_manager",
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.set(slotRef, {
          arenaId: club.arenaId,
          courtId: court.courtId,
          // String YYYY-MM-DD — alinhado a arenaBookings (evita deslocamento UTC no app).
          date: dateKey,
          dateKey,
          startTime: club.startTime,
          endTime: club.endTime,
          status: "booked",
          bookingAthleteId: null,
          bookingId,
          isClubSession: true,
          clubId,
          clubSessionId: sessionRef.id,
          clubName: club.name,
          priceReais: 0,
          createdAt: FieldValue.serverTimestamp(),
        });

        for (const lock of court.locks) {
          tx.set(lock.ref, {
            arenaId: club.arenaId,
            courtId: court.courtId,
            date: dateKey,
            startTime: fmtHourStart(lock.hour),
            endTime: fmtHourEnd(lock.hour),
            bookingId,
            bookingAthleteId: null,
            clubSessionId: sessionRef.id,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }

      tx.set(sessionRef, {
        clubId,
        arenaId: club.arenaId,
        arenaName: club.arenaName,
        clubName: club.name,
        description: club.description,
        date: dateKey,
        startTime: club.startTime,
        endTime: club.endTime,
        startAt: Timestamp.fromDate(startAt),
        courtIds: usable.map((c) => c.courtId),
        courtNames: usable.map((c) => c.courtName),
        capacity: club.capacity,
        priceReais: club.priceReais,
        cancelWindowHours: club.cancelWindowHours,
        allowOnsitePayment: club.allowOnsitePayment,
        confirmedCount: 0,
        pendingCount: 0,
        status: "scheduled",
        source,
        blockBookingIds,
        skippedCourtIds,
        createdAt: FieldValue.serverTimestamp(),
        canceledAt: null,
        cancelReason: null,
      });

      return {outcome: "created" as const, skippedCourtIds};
    });

    return {...result, sessionId: sessionRef.id};
  } catch (e) {
    logger.error("materializeClubSession: transação falhou", {clubId, dateKey, error: e});
    return {outcome: "conflict", sessionId: sessionRef.id, skippedCourtIds: club.courtIds};
  }
}

export interface MaterializeClubSeriesResult {
  createdDates: string[];
  /** Datas sem nenhuma quadra livre (sessão não criada). */
  skippedDates: string[];
  /** Datas criadas com pelo menos uma quadra pulada por conflito. */
  partialDates: string[];
}

/** Materializa as datas da série em `(fromExclusive, untilInclusive]`. */
export async function materializeClubSeries(
  db: Firestore,
  clubId: string,
  club: ArenaClubData,
  fromExclusive: string,
  untilInclusive: string,
): Promise<MaterializeClubSeriesResult> {
  const result: MaterializeClubSeriesResult = {
    createdDates: [],
    skippedDates: [],
    partialDates: [],
  };
  if (club.weekday == null) return result;

  const dates = occurrenceDatesBetween(
    {
      weekday: club.weekday,
      startDate: club.startDate,
      endDate: club.endDate,
      skippedDates: club.skippedDates,
    },
    fromExclusive,
    untilInclusive,
  );

  for (const dateKey of dates) {
    const outcome = await materializeClubSession(db, clubId, club, dateKey, "series");
    if (outcome.outcome === "created") {
      result.createdDates.push(dateKey);
      if (outcome.skippedCourtIds.length > 0) result.partialDates.push(dateKey);
    } else if (outcome.outcome === "conflict") {
      result.skippedDates.push(dateKey);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Liberação de bloqueios e cancelamento de sessão
// ---------------------------------------------------------------------------

export interface ClubSessionDocData {
  clubId: string;
  arenaId: string;
  arenaName: string;
  clubName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  blockBookingIds: string[];
  confirmedCount: number;
  pendingCount: number;
  capacity: number;
  priceReais: number;
  cancelWindowHours: number;
}

export function parseClubSession(data: Record<string, unknown>): ClubSessionDocData {
  return {
    clubId: String(data["clubId"] ?? ""),
    arenaId: String(data["arenaId"] ?? ""),
    arenaName: String(data["arenaName"] ?? "Arena"),
    clubName: String(data["clubName"] ?? "Clubinho"),
    date: String(data["date"] ?? ""),
    startTime: String(data["startTime"] ?? ""),
    endTime: String(data["endTime"] ?? ""),
    status: String(data["status"] ?? ""),
    blockBookingIds: Array.isArray(data["blockBookingIds"]) ?
      (data["blockBookingIds"] as unknown[]).map(String) :
      [],
    confirmedCount: Number(data["confirmedCount"] ?? 0),
    pendingCount: Number(data["pendingCount"] ?? 0),
    capacity: Number(data["capacity"] ?? 0),
    priceReais: Number(data["priceReais"] ?? 0),
    cancelWindowHours: Number(data["cancelWindowHours"] ?? 0),
  };
}

/**
 * Libera os bloqueios de agenda da sessão: cancela os bookings de bloqueio e
 * apaga os `arenaSlots` + `arenaSlotLocks`. Escritas sequenciais idempotentes
 * (re-execução após falha parcial é segura).
 */
export async function releaseClubSessionBlocks(
  db: Firestore,
  session: ClubSessionDocData,
  cancelReason: string,
): Promise<void> {
  for (const bookingId of session.blockBookingIds) {
    const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
    const snap = await bookingRef.get();
    if (snap.exists) {
      const status = String(snap.data()?.["status"] ?? "").toLowerCase();
      if (status === "active") {
        await bookingRef.set({
          status: "cancelled",
          canceledAt: FieldValue.serverTimestamp(),
          canceledByRole: "arena_manager",
          cancelReason,
        }, {merge: true});
      }
      const courtId = String(snap.data()?.["courtId"] ?? "");
      for (const lock of lockRefsForOccurrence(
        db,
        {
          arenaId: session.arenaId,
          courtId,
          startTime: session.startTime,
          endTime: session.endTime,
        },
        session.date,
      )) {
        await lock.ref.delete();
      }
    }
    await db.collection(ARENA_SLOTS).doc(bookingId).delete();
  }
}

export interface CancelClubSessionDeps {
  refund: (paymentId: string) => Promise<void>;
  deletePayment: (paymentId: string) => Promise<void>;
  notify: (input: {
    userId: string;
    title: string;
    body: string;
    type: string;
    data: Record<string, string>;
  }) => Promise<void>;
}

const defaultCancelDeps: CancelClubSessionDeps = {
  refund: (paymentId) => refundAsaasPayment(paymentId),
  deletePayment: (paymentId) => deleteAsaasPaymentIfOpen(paymentId),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

export interface CancelClubSessionResult {
  sessionId: string;
  refunded: number;
  refundFailed: number;
  canceledPending: number;
  /** Confirmados que iam pagar na arena — cancelados sem estorno. */
  canceledOnsite: number;
}

/**
 * Cancela a sessão: libera bloqueios e faz o estorno em massa dos confirmados
 * (refund Asaas → débito na carteira → status → notificação). Idempotente por
 * participante: re-executar só reprocessa quem ficou `refundStatus: failed`.
 */
export async function cancelClubSessionCore(
  db: Firestore,
  sessionId: string,
  reason: string | null,
  deps: CancelClubSessionDeps = defaultCancelDeps,
): Promise<CancelClubSessionResult> {
  const sessionRef = db.collection(ARENA_CLUB_SESSIONS).doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Sessão do clubinho não encontrada.");
  }
  const session = parseClubSession(sessionSnap.data() as Record<string, unknown>);
  if (session.status === "completed") {
    throw new HttpsError("failed-precondition", "Esta sessão já foi concluída.");
  }

  if (session.status !== "canceled") {
    await sessionRef.set({
      status: "canceled",
      canceledAt: FieldValue.serverTimestamp(),
      cancelReason: reason ?? "club_session_canceled",
    }, {merge: true});
    await releaseClubSessionBlocks(db, session, "club_session_canceled");
  }

  const participantsSnap = await sessionRef.collection(CLUB_PARTICIPANTS).get();
  let refunded = 0;
  let refundFailed = 0;
  let canceledPending = 0;
  let canceledOnsite = 0;

  for (const doc of participantsSnap.docs) {
    const p = doc.data() as Record<string, unknown>;
    const status = String(p["status"] ?? "");
    const athleteId = String(p["athleteId"] ?? doc.id);
    const paymentMethod = p["paymentMethod"] === "onsite" ? "onsite" : "pix";
    const asaasPaymentId = typeof p["asaasPaymentId"] === "string" ?
      p["asaasPaymentId"].trim() :
      "";

    if (status === "pending_payment") {
      try {
        if (asaasPaymentId) await deps.deletePayment(asaasPaymentId);
        await doc.ref.set({
          status: "canceled",
          canceledAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        canceledPending += 1;
      } catch (e) {
        logger.error("cancelClubSessionCore: falha ao cancelar pendente", {
          sessionId,
          athleteId,
          error: e,
        });
      }
      continue;
    }

    if (status !== "confirmed") continue;

    // Vaga "paga na arena": nada a estornar — só cancela e avisa.
    if (paymentMethod === "onsite") {
      await doc.ref.set({
        status: "canceled",
        canceledAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      canceledOnsite += 1;
      try {
        await deps.notify({
          userId: athleteId,
          title: "Clubinho cancelado 😔",
          body: `A sessão de ${session.clubName} em ${formatDateBr(session.date)} foi ` +
            "cancelada pela arena.",
          type: "club_session_canceled",
          data: {clubSessionId: sessionId, arenaId: session.arenaId},
        });
      } catch (e) {
        logger.warn("cancelClubSessionCore: notificação falhou", {sessionId, athleteId, error: e});
      }
      continue;
    }

    try {
      if (asaasPaymentId) await deps.refund(asaasPaymentId);
      const netReais = Number(p["netReais"] ?? 0);
      if (netReais > 0) {
        await debitArenaWalletForClubRefund(db, session.arenaId, {
          sessionId,
          participantId: doc.id,
          netReais,
        });
      }
      await doc.ref.set({
        status: "canceled_by_arena_refunded",
        refundStatus: "done",
        canceledAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      refunded += 1;

      try {
        await deps.notify({
          userId: athleteId,
          title: "Clubinho cancelado 😔",
          body: `A sessão de ${session.clubName} em ${formatDateBr(session.date)} foi ` +
            "cancelada pela arena. Seu PIX será estornado automaticamente.",
          type: "club_session_canceled",
          data: {clubSessionId: sessionId, arenaId: session.arenaId},
        });
      } catch (e) {
        logger.warn("cancelClubSessionCore: notificação falhou", {sessionId, athleteId, error: e});
      }
    } catch (e) {
      refundFailed += 1;
      logger.error("cancelClubSessionCore: estorno falhou", {sessionId, athleteId, error: e});
      await doc.ref.set({refundStatus: "failed"}, {merge: true});
    }
  }

  return {sessionId, refunded, refundFailed, canceledPending, canceledOnsite};
}

function formatDateBr(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ---------------------------------------------------------------------------
// Gestor adiciona/remove atleta na lista
// ---------------------------------------------------------------------------

export interface ManageParticipantDeps {
  refund: (paymentId: string) => Promise<void>;
  deletePayment: (paymentId: string) => Promise<void>;
  notify: (input: {
    userId: string;
    title: string;
    body: string;
    type: string;
    data: Record<string, string>;
  }) => Promise<void>;
}

const defaultManageDeps: ManageParticipantDeps = {
  refund: (paymentId) => refundAsaasPayment(paymentId),
  deletePayment: (paymentId) => deleteAsaasPaymentIfOpen(paymentId),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

export interface AddClubParticipantInput {
  athleteId: string | null;
  customerName: string | null;
  athleteName: string;
  athletePhotoUrl: string | null;
  addedByUid: string;
}

/**
 * Adiciona um participante pela mão do gestor: atleta da plataforma
 * (docId = uid) ou convidado sem conta (docId `guest_*`, só o nome).
 * Entra direto como `confirmed` com pagamento na arena — vale até em
 * clubinho "só PIX" (prerrogativa do gestor, que cobra no balcão).
 */
export async function addClubParticipantCore(
  db: Firestore,
  sessionId: string,
  input: AddClubParticipantInput,
  deps: ManageParticipantDeps = defaultManageDeps,
): Promise<{participantId: string; converted: boolean}> {
  const sessionRef = db.collection(ARENA_CLUB_SESSIONS).doc(sessionId);
  const participantRef = input.athleteId ?
    sessionRef.collection(CLUB_PARTICIPANTS).doc(input.athleteId) :
    sessionRef.collection(CLUB_PARTICIPANTS).doc(`guest_${db.collection("_").doc().id}`);

  const result = await db.runTransaction(async (tx: Transaction) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Sessão do clubinho não encontrada.");
    }
    const sessionData = sessionSnap.data() as Record<string, unknown>;
    const session = parseClubSession(sessionData);
    if (session.status !== "scheduled") {
      throw new HttpsError("failed-precondition", "Esta sessão não está mais aberta.");
    }
    const startAt = sessionData["startAt"];
    if (startAt instanceof Timestamp && Date.now() >= startAt.toMillis()) {
      throw new HttpsError("failed-precondition", "Esta sessão já começou.");
    }

    const participantSnap = await tx.get(participantRef);
    const existing = participantSnap.exists ?
      (participantSnap.data() as Record<string, unknown>) :
      null;
    const existingStatus = existing ? String(existing["status"] ?? "") : "";

    if (existingStatus === "confirmed") {
      throw new HttpsError("already-exists", "Este atleta já está na lista.");
    }

    const wasHeld = existingStatus === "pending_payment";
    if (!wasHeld && session.confirmedCount + session.pendingCount >= session.capacity) {
      throw new HttpsError(
        "resource-exhausted",
        "A lista está cheia — aumente as vagas do clubinho para adicionar mais.",
      );
    }

    tx.set(participantRef, {
      athleteId: input.athleteId,
      athleteName: input.athleteName,
      athletePhotoUrl: input.athletePhotoUrl,
      clubId: session.clubId,
      arenaId: session.arenaId,
      arenaName: session.arenaName,
      clubName: session.clubName,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      startAt: sessionData["startAt"] ?? null,
      status: "confirmed",
      paymentMethod: "onsite",
      amountReais: session.priceReais,
      platformFeeReais: 0,
      netReais: 0,
      asaasPaymentId: null,
      pixCopyPaste: null,
      paymentExpiresAt: null,
      refundStatus: "none",
      addedByRole: "arena_manager",
      addedByUid: input.addedByUid,
      joinedAt: existing?.["joinedAt"] ?? FieldValue.serverTimestamp(),
      confirmedAt: FieldValue.serverTimestamp(),
      canceledAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(sessionRef, {
      confirmedCount: session.confirmedCount + 1,
      ...(wasHeld ? {pendingCount: Math.max(0, session.pendingCount - 1)} : {}),
    }, {merge: true});

    return {
      session,
      previousAsaasPaymentId: typeof existing?.["asaasPaymentId"] === "string" ?
        (existing["asaasPaymentId"] as string).trim() :
        "",
      converted: wasHeld,
    };
  });

  if (result.previousAsaasPaymentId) {
    await deps.deletePayment(result.previousAsaasPaymentId);
  }

  if (input.athleteId) {
    try {
      await deps.notify({
        userId: input.athleteId,
        title: "Você está na lista! 🎾",
        body: `A arena garantiu sua vaga no ${result.session.clubName} em ` +
          `${formatDateBr(result.session.date)} — pagamento na arena.`,
        type: "club_join_confirmed",
        data: {clubSessionId: sessionId, arenaId: result.session.arenaId},
      });
    } catch (e) {
      logger.warn("addClubParticipantCore: notificação falhou", {sessionId, error: e});
    }
  }

  return {participantId: participantRef.id, converted: result.converted};
}

/**
 * Remove um participante pela mão do gestor. PIX confirmado → estorno
 * automático (sem janela de prazo: o gestor pode remover até o início);
 * onsite/convidado/pendente → só cancela. A vaga reabre.
 */
export async function removeClubParticipantCore(
  db: Firestore,
  sessionId: string,
  participantId: string,
  deps: ManageParticipantDeps = defaultManageDeps,
): Promise<{participantId: string; refunded: boolean}> {
  const sessionRef = db.collection(ARENA_CLUB_SESSIONS).doc(sessionId);
  const participantRef = sessionRef.collection(CLUB_PARTICIPANTS).doc(participantId);

  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Sessão do clubinho não encontrada.");
  }
  const session = parseClubSession(sessionSnap.data() as Record<string, unknown>);

  const participantSnap = await participantRef.get();
  if (!participantSnap.exists) {
    throw new HttpsError("not-found", "Participante não encontrado.");
  }
  const participant = participantSnap.data() as Record<string, unknown>;
  const status = String(participant["status"] ?? "");
  const paymentMethod = participant["paymentMethod"] === "onsite" ? "onsite" : "pix";
  const athleteId = typeof participant["athleteId"] === "string" ?
    (participant["athleteId"] as string).trim() :
    "";
  const asaasPaymentId = typeof participant["asaasPaymentId"] === "string" ?
    (participant["asaasPaymentId"] as string).trim() :
    "";

  if (status === "pending_payment") {
    if (asaasPaymentId) await deps.deletePayment(asaasPaymentId);
    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(participantRef);
      if (String(snap.data()?.["status"]) !== "pending_payment") return;
      const sSnap = await tx.get(sessionRef);
      const pending = Number(sSnap.data()?.["pendingCount"] ?? 0);
      tx.set(participantRef, {
        status: "canceled",
        canceledAt: FieldValue.serverTimestamp(),
        removedByRole: "arena_manager",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(sessionRef, {pendingCount: Math.max(0, pending - 1)}, {merge: true});
    });
    return {participantId, refunded: false};
  }

  if (status !== "confirmed") {
    throw new HttpsError("failed-precondition", "Este participante já saiu da lista.");
  }

  const isPixPaid = paymentMethod === "pix";
  if (isPixPaid && asaasPaymentId) {
    try {
      await deps.refund(asaasPaymentId);
    } catch (e) {
      await participantRef.set({refundStatus: "failed"}, {merge: true});
      logger.error("removeClubParticipantCore: estorno falhou", {sessionId, participantId, error: e});
      throw new HttpsError(
        "internal",
        "Não foi possível estornar o PIX agora. Tente novamente em instantes.",
      );
    }
  }

  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(participantRef);
    if (String(snap.data()?.["status"]) !== "confirmed") return;
    const sSnap = await tx.get(sessionRef);
    const confirmed = Number(sSnap.data()?.["confirmedCount"] ?? 0);
    tx.set(participantRef, {
      status: isPixPaid ? "canceled_by_arena_refunded" : "canceled",
      ...(isPixPaid ? {refundStatus: "done"} : {}),
      canceledAt: FieldValue.serverTimestamp(),
      removedByRole: "arena_manager",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(sessionRef, {confirmedCount: Math.max(0, confirmed - 1)}, {merge: true});
  });

  if (isPixPaid) {
    const netReais = Number(participant["netReais"] ?? 0);
    if (netReais > 0) {
      try {
        await debitArenaWalletForClubRefund(db, session.arenaId, {
          sessionId,
          participantId,
          netReais,
        });
      } catch (e) {
        logger.error("removeClubParticipantCore: débito da carteira falhou", {
          sessionId,
          participantId,
          error: e,
        });
      }
    }
  }

  if (athleteId) {
    try {
      await deps.notify({
        userId: athleteId,
        title: "Você saiu da lista",
        body: `A arena removeu seu nome da lista do ${session.clubName} ` +
          `(${formatDateBr(session.date)})` +
          (isPixPaid ? " — seu PIX será estornado automaticamente." : "."),
        type: "club_leave_refunded",
        data: {clubSessionId: sessionId, arenaId: session.arenaId},
      });
    } catch (e) {
      logger.warn("removeClubParticipantCore: notificação falhou", {sessionId, error: e});
    }
  }

  return {participantId, refunded: isPixPaid};
}

// ---------------------------------------------------------------------------
// Validação de acesso
// ---------------------------------------------------------------------------

async function requireArenaManager(
  db: Firestore,
  arenaId: string,
  uid: string,
): Promise<Record<string, unknown>> {
  const arenaSnap = await db.collection("arenas").doc(arenaId).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  const arenaData = arenaSnap.data() as Record<string, unknown>;
  const managerUserId = typeof arenaData["managerUserId"] === "string" ?
    (arenaData["managerUserId"] as string).trim() :
    "";
  if (!managerUserId || managerUserId !== uid) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o gestor da arena pode gerenciar o clubinho.",
    );
  }
  return arenaData;
}

function requireClubEntitlement(arenaData: Record<string, unknown>): void {
  if (!isArenaEntitledPro(arenaData, Date.now())) {
    throw new HttpsError(
      "permission-denied",
      "O Clubinho está disponível nos planos Pro e Elite. Faça upgrade para usar.",
    );
  }
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

interface UpsertClubInput {
  clubId?: string;
  arenaId?: string;
  name?: string;
  description?: string;
  weekday?: number | null;
  startTime?: string;
  endTime?: string;
  courtIds?: string[];
  capacity?: number;
  priceReais?: number;
  cancelWindowHours?: number;
  allowOnsitePayment?: boolean;
  startDate?: string;
  endDate?: string | null;
}

export const upsertArenaClub = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const input = (request.data ?? {}) as UpsertClubInput;
  const clubId = input.clubId?.trim() || null;
  const arenaId = input.arenaId?.trim() ?? "";
  const name = input.name?.trim() ?? "";
  const description = input.description?.trim().slice(0, 500) || null;
  const weekday = input.weekday == null ? null : Number(input.weekday);
  const startTime = input.startTime?.trim() ?? "";
  const endTime = input.endTime?.trim() ?? "";
  const courtIds = Array.isArray(input.courtIds) ?
    [...new Set(input.courtIds.map((c) => String(c).trim()).filter(Boolean))] :
    [];
  const capacity = Number(input.capacity);
  const priceReais = Number(input.priceReais);
  const cancelWindowHours = Number(input.cancelWindowHours);
  const allowOnsitePayment = input.allowOnsitePayment !== false;
  const todayKey = dayKeyFromEventDate(new Date());
  const startDate = input.startDate?.trim() || todayKey;
  const endDate = input.endDate?.trim() || null;

  if (!arenaId) {
    throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  }
  if (!name || name.length > 60) {
    throw new HttpsError("invalid-argument", "Informe um nome de até 60 caracteres.");
  }
  if (weekday != null && (!Number.isInteger(weekday) || weekday < 1 || weekday > 7)) {
    throw new HttpsError("invalid-argument", "Dia da semana inválido.");
  }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    throw new HttpsError("invalid-argument", "Horário inválido.");
  }
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  if (endMin <= startMin) {
    throw new HttpsError("invalid-argument", "Intervalo de horário inválido.");
  }
  if (courtIds.length === 0 || courtIds.length > MAX_CLUB_COURTS) {
    throw new HttpsError("invalid-argument", "Selecione de 1 a 12 quadras.");
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CLUB_CAPACITY) {
    throw new HttpsError("invalid-argument", "Informe o número de vagas (1 a 500).");
  }
  if (!Number.isFinite(priceReais) || priceReais <= 0) {
    throw new HttpsError("invalid-argument", "Informe o valor por atleta.");
  }
  if (
    !Number.isFinite(cancelWindowHours) ||
    cancelWindowHours < 0 ||
    cancelWindowHours > MAX_CANCEL_WINDOW_HOURS
  ) {
    throw new HttpsError("invalid-argument", "Prazo de cancelamento inválido (0 a 168h).");
  }
  if (!isValidDateKey(startDate)) {
    throw new HttpsError("invalid-argument", "Data de início inválida.");
  }
  if (endDate != null && (!isValidDateKey(endDate) || endDate < startDate)) {
    throw new HttpsError("invalid-argument", "Data de término inválida.");
  }

  const db = getFirestore();
  const arenaData = await requireArenaManager(db, arenaId, uid);
  requireClubEntitlement(arenaData);

  // Quadras devem existir; captura os nomes para snapshot.
  const courtNames: string[] = [];
  for (const courtId of courtIds) {
    const courtSnap = await db
      .collection("arenas").doc(arenaId)
      .collection("courts").doc(courtId)
      .get();
    if (!courtSnap.exists) {
      throw new HttpsError("not-found", "Uma das quadras selecionadas não existe mais.");
    }
    const courtName = typeof courtSnap.data()?.["name"] === "string" ?
      (courtSnap.data()!["name"] as string).trim() || "Quadra" :
      "Quadra";
    courtNames.push(courtName);
  }

  const arenaName = typeof arenaData["name"] === "string" ?
    (arenaData["name"] as string).trim() || "Arena" :
    "Arena";

  const horizonKey = addDaysToDateKey(todayKey, CLUB_HORIZON_DAYS);

  if (clubId == null) {
    const clubRef = db.collection(ARENA_CLUBS).doc();
    const club: ArenaClubData = {
      arenaId,
      arenaName,
      name,
      description,
      weekday,
      startTime,
      endTime,
      courtIds,
      courtNames,
      capacity,
      priceReais,
      cancelWindowHours,
      allowOnsitePayment,
      status: "active",
      startDate,
      endDate,
      skippedDates: [],
    };

    await clubRef.set({
      ...club,
      // Sem série (weekday null): já nasce no horizonte para o scheduler pular.
      materializedUntil: weekday == null ? horizonKey : addDaysToDateKey(todayKey, -1),
      createdByUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    let createdDates: string[] = [];
    let skippedDates: string[] = [];
    if (weekday != null) {
      const result = await materializeClubSeries(
        db,
        clubRef.id,
        club,
        addDaysToDateKey(todayKey, -1),
        horizonKey,
      );
      createdDates = result.createdDates;
      skippedDates = result.skippedDates;
      await clubRef.set({
        materializedUntil: horizonKey,
        ...(result.skippedDates.length > 0 ?
          {skippedDates: FieldValue.arrayUnion(...result.skippedDates)} :
          {}),
      }, {merge: true});
    }

    logger.info("upsertArenaClub: clubinho criado", {
      clubId: clubRef.id,
      arenaId,
      created: createdDates.length,
      skipped: skippedDates.length,
    });
    return {clubId: clubRef.id, createdDates, skippedDates};
  }

  // Update — só afeta sessões futuras ainda não geradas (snapshot por sessão).
  const clubRef = db.collection(ARENA_CLUBS).doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new HttpsError("not-found", "Clubinho não encontrado.");
  }
  const existing = parseArenaClub(clubSnap.data() as Record<string, unknown>);
  if (existing.arenaId !== arenaId) {
    throw new HttpsError("permission-denied", "Clubinho de outra arena.");
  }
  if (existing.status === "archived") {
    throw new HttpsError("failed-precondition", "Clubinho arquivado não pode ser editado.");
  }

  await clubRef.set({
    name,
    description,
    weekday,
    startTime,
    endTime,
    courtIds,
    courtNames,
    capacity,
    priceReais,
    cancelWindowHours,
    allowOnsitePayment,
    endDate,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  // Materializa já com a nova config (idempotente: datas existentes ficam como estão).
  let createdDates: string[] = [];
  let skippedDates: string[] = [];
  if (weekday != null && existing.status === "active") {
    const updated: ArenaClubData = {
      ...existing,
      name,
      description,
      weekday,
      startTime,
      endTime,
      courtIds,
      courtNames,
      capacity,
      priceReais,
      cancelWindowHours,
      allowOnsitePayment,
      endDate,
    };
    const result = await materializeClubSeries(
      db,
      clubId,
      updated,
      addDaysToDateKey(todayKey, -1),
      horizonKey,
    );
    createdDates = result.createdDates;
    skippedDates = result.skippedDates;
    await clubRef.set({
      materializedUntil: horizonKey,
      ...(result.skippedDates.length > 0 ?
        {skippedDates: FieldValue.arrayUnion(...result.skippedDates)} :
        {}),
    }, {merge: true});
  }

  return {clubId, createdDates, skippedDates};
});

interface SetClubStatusInput {
  clubId?: string;
  status?: string;
}

export const setArenaClubStatus = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as SetClubStatusInput;
  const clubId = input.clubId?.trim() ?? "";
  const status = input.status?.trim() ?? "";
  if (!clubId) {
    throw new HttpsError("invalid-argument", "Clubinho inválido.");
  }
  if (status !== "active" && status !== "paused" && status !== "archived") {
    throw new HttpsError("invalid-argument", "Status inválido.");
  }

  const db = getFirestore();
  const clubRef = db.collection(ARENA_CLUBS).doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new HttpsError("not-found", "Clubinho não encontrado.");
  }
  const club = parseArenaClub(clubSnap.data() as Record<string, unknown>);
  const arenaData = await requireArenaManager(db, club.arenaId, uid);

  const todayKey = dayKeyFromEventDate(new Date());

  if (status === "archived") {
    // Sessões futuras com gente na lista precisam ser canceladas antes
    // (cancelamento faz estorno — ação explícita do gestor, não implícita).
    const sessionsSnap = await db
      .collection(ARENA_CLUB_SESSIONS)
      .where("clubId", "==", clubId)
      .where("status", "==", "scheduled")
      .get();
    const future = sessionsSnap.docs.filter(
      (d) => String(d.data()["date"] ?? "") >= todayKey,
    );
    const withPeople = future.filter((d) => {
      const s = parseClubSession(d.data() as Record<string, unknown>);
      return s.confirmedCount > 0 || s.pendingCount > 0;
    });
    if (withPeople.length > 0) {
      throw new HttpsError(
        "failed-precondition",
        "Há sessões futuras com atletas na lista. Cancele essas sessões antes de arquivar " +
        "(o cancelamento estorna os pagamentos automaticamente).",
      );
    }
    for (const doc of future) {
      const s = parseClubSession(doc.data() as Record<string, unknown>);
      await doc.ref.set({
        status: "canceled",
        canceledAt: FieldValue.serverTimestamp(),
        cancelReason: "club_archived",
      }, {merge: true});
      await releaseClubSessionBlocks(db, s, "club_archived");
    }
  }

  await clubRef.set({
    status,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  // Reativação: repõe o horizonte imediatamente (o scheduler só roda de madrugada).
  let createdDates: string[] = [];
  if (status === "active" && club.weekday != null) {
    requireClubEntitlement(arenaData);
    const horizonKey = addDaysToDateKey(todayKey, CLUB_HORIZON_DAYS);
    const result = await materializeClubSeries(
      db,
      clubId,
      {...club, status: "active"},
      addDaysToDateKey(todayKey, -1),
      horizonKey,
    );
    createdDates = result.createdDates;
    await clubRef.set({
      materializedUntil: horizonKey,
      ...(result.skippedDates.length > 0 ?
        {skippedDates: FieldValue.arrayUnion(...result.skippedDates)} :
        {}),
    }, {merge: true});
  }

  return {clubId, status, createdDates};
});

interface CreateSessionInput {
  clubId?: string;
  date?: string;
}

export const createArenaClubSession = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as CreateSessionInput;
  const clubId = input.clubId?.trim() ?? "";
  const date = input.date?.trim() ?? "";
  if (!clubId) {
    throw new HttpsError("invalid-argument", "Clubinho inválido.");
  }
  const todayKey = dayKeyFromEventDate(new Date());
  if (!isValidDateKey(date) || date < todayKey) {
    throw new HttpsError("invalid-argument", "Data inválida.");
  }

  const db = getFirestore();
  const clubRef = db.collection(ARENA_CLUBS).doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new HttpsError("not-found", "Clubinho não encontrado.");
  }
  const club = parseArenaClub(clubSnap.data() as Record<string, unknown>);
  const arenaData = await requireArenaManager(db, club.arenaId, uid);
  requireClubEntitlement(arenaData);
  if (club.status !== "active") {
    throw new HttpsError("failed-precondition", "Reative o clubinho para criar sessões.");
  }

  const result = await materializeClubSession(db, clubId, club, date, "manual");
  if (result.outcome === "exists") {
    throw new HttpsError(
      "already-exists",
      "Já existe uma sessão deste clubinho nessa data.",
    );
  }
  if (result.outcome === "conflict") {
    throw new HttpsError(
      "failed-precondition",
      "Todas as quadras do clubinho têm conflito nesse dia/horário.",
    );
  }

  return {sessionId: result.sessionId, skippedCourtIds: result.skippedCourtIds};
});

interface CancelSessionInput {
  sessionId?: string;
  reason?: string;
}

export const cancelArenaClubSession = onCall({
  secrets: asaasArenaSecrets,
  timeoutSeconds: 300,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as CancelSessionInput;
  const sessionId = input.sessionId?.trim() ?? "";
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "Sessão inválida.");
  }
  const reason = input.reason?.trim().slice(0, 500) || null;

  const db = getFirestore();
  const sessionSnap = await db.collection(ARENA_CLUB_SESSIONS).doc(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Sessão do clubinho não encontrada.");
  }
  const session = parseClubSession(sessionSnap.data() as Record<string, unknown>);
  // Sem gate de plano aqui: gestor pode cancelar/estornar mesmo com plano vencido.
  await requireArenaManager(db, session.arenaId, uid);

  const result = await cancelClubSessionCore(db, sessionId, reason);
  logger.info("cancelArenaClubSession", result);
  return result;
});

interface AddParticipantCallableInput {
  sessionId?: string;
  athleteId?: string;
  customerName?: string;
}

export const addArenaClubParticipant = onCall({
  secrets: asaasArenaSecrets,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as AddParticipantCallableInput;
  const sessionId = input.sessionId?.trim() ?? "";
  const athleteId = input.athleteId?.trim() || null;
  const customerName = input.customerName?.trim().slice(0, 80) || null;
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "Sessão inválida.");
  }
  if ((athleteId == null) === (customerName == null)) {
    throw new HttpsError(
      "invalid-argument",
      "Informe o atleta OU o nome do convidado (apenas um).",
    );
  }

  const db = getFirestore();
  const sessionSnap = await db.collection(ARENA_CLUB_SESSIONS).doc(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Sessão do clubinho não encontrada.");
  }
  const session = parseClubSession(sessionSnap.data() as Record<string, unknown>);
  await requireArenaManager(db, session.arenaId, uid);

  let athleteName = customerName ?? "Atleta";
  let athletePhotoUrl: string | null = null;
  if (athleteId) {
    const userSnap = await db.collection("users").doc(athleteId).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Atleta não encontrado.");
    }
    const display = await resolveAthleteDisplay(db, athleteId);
    athleteName = display.name;
    athletePhotoUrl = display.photoUrl;
  }

  const result = await addClubParticipantCore(db, sessionId, {
    athleteId,
    customerName,
    athleteName,
    athletePhotoUrl,
    addedByUid: uid,
  });
  logger.info("addArenaClubParticipant", {sessionId, ...result});
  return {sessionId, ...result};
});

interface RemoveParticipantCallableInput {
  sessionId?: string;
  participantId?: string;
}

export const removeArenaClubParticipant = onCall({
  secrets: asaasArenaSecrets,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as RemoveParticipantCallableInput;
  const sessionId = input.sessionId?.trim() ?? "";
  const participantId = input.participantId?.trim() ?? "";
  if (!sessionId || !participantId) {
    throw new HttpsError("invalid-argument", "Sessão ou participante inválido.");
  }

  const db = getFirestore();
  const sessionSnap = await db.collection(ARENA_CLUB_SESSIONS).doc(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Sessão do clubinho não encontrada.");
  }
  const session = parseClubSession(sessionSnap.data() as Record<string, unknown>);
  await requireArenaManager(db, session.arenaId, uid);

  const result = await removeClubParticipantCore(db, sessionId, participantId);
  logger.info("removeArenaClubParticipant", {sessionId, ...result});
  return {sessionId, ...result};
});

/** Rótulo "toda sexta-feira, 15:00–19:00" para notificações/logs. */
export function clubScheduleLabel(club: ArenaClubData): string {
  const day = club.weekday != null ? WEEKDAY_LABELS_PT[club.weekday] ?? "?" : "avulso";
  return `${day} ${club.startTime}–${club.endTime}`;
}
