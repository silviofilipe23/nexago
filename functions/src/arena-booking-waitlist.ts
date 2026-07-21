/**
 * Lista de espera de quadra: quando um horário de `arenaBookings` está lotado,
 * o atleta pode entrar numa fila (`arenaBookingWaitlist`). Ao cancelar a reserva
 * que ocupava o horário, o mais antigo da fila (FIFO) é notificado e tem uma
 * janela de 15 minutos para reservar antes de perder a vez.
 *
 * Domínio distinto de `organizerMoveToWaitlist`
 * (`functions/src/organizer-category-ops.ts`), que é lista de espera de
 * INSCRIÇÃO em torneio (categoria lotada) — não reaproveita essa coleção.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";
import {
  buildSlotsDeepLink,
  extractBookingSlotMatch,
  formatDateLabel,
  isBookingCanceledTransition,
  resolveCourtName,
} from "./slot-vacancy-alerts";

export const ARENA_BOOKING_WAITLIST = "arenaBookingWaitlist";
const ARENA_BOOKING_WAITLIST_NOTIFY_LOCKS = "arenaBookingWaitlistNotifyLocks";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";

/** Janela para o atleta notificado confirmar a reserva antes de perder a vez. */
export const WAITLIST_NOTIFY_WINDOW_MS = 15 * 60 * 1000;

export type ArenaBookingWaitlistStatus =
  | "waiting"
  | "notified"
  | "expired"
  | "converted";

interface JoinWaitlistInput {
  arenaId: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  arenaName?: string;
  courtName?: string;
}

function parseDateKey(dateRaw: string): string {
  const t = dateRaw.trim();
  if (t.length >= 10) return t.substring(0, 10);
  return t;
}

function toMinutes(hhmm: string): number {
  const parts = hhmm.trim().split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parts.length > 1 ? parseInt(parts[1] ?? "0", 10) : 0;
  return h * 60 + m;
}

function calendarHoursSpanning(startMin: number, endMin: number): number[] {
  if (endMin <= startMin) return [];
  const startH = Math.floor(startMin / 60);
  const endH = Math.floor((endMin - 1) / 60);
  const hours: number[] = [];
  for (let h = startH; h <= endH; h++) hours.push(h);
  return hours;
}

function fmtHour2(h: number): string {
  return Math.min(23, Math.max(0, h)).toString().padStart(2, "0");
}

export function safeIdPart(s: string): string {
  return s.replace(/\//g, "_");
}

/**
 * IDs deterministicos em `arenaSlotLocks` para as horas cheias cobertas pelo
 * intervalo `startTime`–`endTime` — mesma granularidade usada pela transação
 * de `createArenaBooking` (`arena-booking-create.ts`) para travar o horário.
 */
export function computeSlotLockIds(params: {
  arenaId: string;
  courtId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
}): string[] {
  const {arenaId, courtId, dateKey, startTime, endTime} = params;
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  const hours = calendarHoursSpanning(startMin, endMin);
  if (hours.length === 0) return [];

  const safeArena = safeIdPart(arenaId);
  const safeCourt = safeIdPart(courtId);
  return hours.map((h) => `${safeArena}_${safeCourt}_${dateKey}_h${fmtHour2(h)}`);
}

/**
 * Um horário só é considerado "lotado" quando TODAS as horas que ele cobre já
 * têm lock ativo — evita aceitar entrada na fila para um horário com vaga.
 */
export function isSlotFullyBooked(
  lockIds: string[],
  existingLockIds: Set<string> | string[],
): boolean {
  if (lockIds.length === 0) return false;
  const existing = existingLockIds instanceof Set ?
    existingLockIds :
    new Set(existingLockIds);
  return lockIds.every((id) => existing.has(id));
}

export function computeWaitlistExpiresAtMs(nowMs: number): number {
  return nowMs + WAITLIST_NOTIFY_WINDOW_MS;
}

/**
 * Uma entrada `notified` expira quando passa do `expiresAt` sem virar reserva.
 * Sem `expiresAt` registrado é tratado como expirado (limpeza defensiva).
 */
export function isNotifiedWaitlistEntryExpired(
  status: string,
  expiresAtMs: number | null,
  nowMs: number,
): boolean {
  if (status !== "notified") return false;
  if (expiresAtMs == null) return true;
  return nowMs >= expiresAtMs;
}

export interface WaitlistQueueEntryLite {
  id: string;
  status: string;
  createdAtMs: number;
}

/** Mais antigo (`createdAt` ascendente) entre as entradas ainda `waiting`. */
export function selectFifoWinner(
  entries: WaitlistQueueEntryLite[],
): WaitlistQueueEntryLite | null {
  const waiting = entries.filter((e) => e.status === "waiting");
  if (waiting.length === 0) return null;
  return [...waiting].sort((a, b) => a.createdAtMs - b.createdAtMs)[0]!;
}

function timestampToMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  return 0;
}

/**
 * Entra na fila de espera de um horário de quadra. Reconsulta `arenaSlotLocks`
 * (mesma fonte de verdade usada por `createArenaBooking`) para confirmar que o
 * horário está de fato lotado antes de aceitar a entrada.
 */
export const joinArenaBookingWaitlist = onCall(async (request) => {
  const athleteId = request.auth?.uid;
  if (!athleteId) {
    throw new HttpsError(
      "unauthenticated",
      "Faça login para entrar na lista de espera.",
    );
  }

  const input = (request.data ?? {}) as JoinWaitlistInput;
  const arenaId = input.arenaId?.trim();
  const courtId = input.courtId?.trim();
  const dateKey = parseDateKey(input.date ?? "");
  const startTime = input.startTime?.trim() ?? "";
  const endTime = input.endTime?.trim() ?? "";

  if (!arenaId || !courtId || !dateKey || startTime.length < 4 || endTime.length < 4) {
    throw new HttpsError("invalid-argument", "Dados do horário inválidos.");
  }

  const lockIds = computeSlotLockIds({arenaId, courtId, dateKey, startTime, endTime});
  if (lockIds.length === 0) {
    throw new HttpsError("invalid-argument", "Intervalo de horário inválido.");
  }

  const db = getFirestore();
  const lockRefs = lockIds.map((id) => db.collection(ARENA_SLOT_LOCKS).doc(id));
  const lockSnaps = await db.getAll(...lockRefs);
  const existingLockIds = new Set(
    lockSnaps.filter((s) => s.exists).map((s) => s.id),
  );

  if (!isSlotFullyBooked(lockIds, existingLockIds)) {
    throw new HttpsError(
      "failed-precondition",
      "Esse horário ainda tem vaga — reserve diretamente em vez de entrar na lista de espera.",
    );
  }

  const entryId = [
    safeIdPart(arenaId),
    safeIdPart(courtId),
    dateKey,
    `${startTime}-${endTime}`,
    safeIdPart(athleteId),
  ].join("_");
  const entryRef = db.collection(ARENA_BOOKING_WAITLIST).doc(entryId);

  const existing = await entryRef.get();
  if (existing.exists) {
    const status = (existing.data()?.["status"] as string | undefined) ?? "";
    if (status === "waiting" || status === "notified") {
      // Já está na fila (ou já foi chamado) para este horário exato — idempotente.
      return {waitlistId: entryRef.id, status};
    }
  }

  await entryRef.set({
    arenaId,
    courtId,
    date: dateKey,
    startTime,
    endTime,
    athleteId,
    arenaName: input.arenaName?.trim() || null,
    courtName: input.courtName?.trim() || null,
    status: "waiting" as ArenaBookingWaitlistStatus,
    createdAt: FieldValue.serverTimestamp(),
    notifiedAt: null,
    expiresAt: null,
  });

  logger.info("joinArenaBookingWaitlist: entrada criada", {
    waitlistId: entryRef.id,
    arenaId,
    courtId,
    dateKey,
    startTime,
    endTime,
  });

  return {waitlistId: entryRef.id, status: "waiting"};
});

/**
 * Quando uma reserva em `arenaBookings` é cancelada, notifica o atleta mais
 * antigo (FIFO) da fila para o mesmo arenaId/courtId/date/startTime/endTime.
 */
export const notifyArenaWaitlistOnSlotFreed = onDocumentUpdated(
  {
    document: "arenaBookings/{bookingId}",
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    const bookingId = event.params.bookingId;
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;

    if (!isBookingCanceledTransition(before, after)) {
      return;
    }

    const match = extractBookingSlotMatch(after ?? {});
    if (!match) {
      logger.warn(
        `arenaBookingWaitlist: booking ${bookingId} cancelado sem dados de slot válidos`,
      );
      return;
    }

    const db = getFirestore();

    // Idempotência: um retry do trigger não pode notificar duas pessoas
    // diferentes para o mesmo cancelamento (mesmo padrão de
    // slotVacancyNotifyLocks em slot-vacancy-alerts.ts).
    const lockRef = db.collection(ARENA_BOOKING_WAITLIST_NOTIFY_LOCKS).doc(bookingId);
    try {
      await lockRef.create({createdAt: FieldValue.serverTimestamp()});
    } catch {
      logger.info(`arenaBookingWaitlist: booking ${bookingId} já processado`);
      return;
    }

    const queueSnap = await db
      .collection(ARENA_BOOKING_WAITLIST)
      .where("arenaId", "==", match.arenaId)
      .where("courtId", "==", match.courtId)
      .where("date", "==", match.dateKey)
      .where("startTime", "==", match.startTime)
      .where("endTime", "==", match.endTime)
      .where("status", "==", "waiting")
      .orderBy("createdAt", "asc")
      .limit(5)
      .get();

    if (queueSnap.empty) {
      logger.info(`arenaBookingWaitlist: sem fila para booking ${bookingId} cancelado`, match);
      return;
    }

    const candidates: WaitlistQueueEntryLite[] = queueSnap.docs.map((doc) => ({
      id: doc.id,
      status: String(doc.data()["status"] ?? ""),
      createdAtMs: timestampToMillis(doc.data()["createdAt"]),
    }));
    const winner = selectFifoWinner(candidates);
    if (!winner) {
      logger.info(`arenaBookingWaitlist: fila vazia após filtro (booking ${bookingId})`);
      return;
    }

    const winnerRef = db.collection(ARENA_BOOKING_WAITLIST).doc(winner.id);
    const winnerSnap = await winnerRef.get();
    const winnerData = winnerSnap.data();
    if (!winnerSnap.exists || !winnerData || winnerData["status"] !== "waiting") {
      logger.info(`arenaBookingWaitlist: vencedor ${winner.id} não está mais 'waiting'`);
      return;
    }

    const athleteId =
      typeof winnerData["athleteId"] === "string" ? winnerData["athleteId"] : "";
    if (!athleteId) {
      logger.warn(`arenaBookingWaitlist: entrada ${winner.id} sem athleteId`);
      return;
    }

    const nowMs = Date.now();
    const expiresAtMs = computeWaitlistExpiresAtMs(nowMs);

    await winnerRef.update({
      status: "notified" as ArenaBookingWaitlistStatus,
      notifiedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAtMs),
    });

    const courtName =
      typeof winnerData["courtName"] === "string" && winnerData["courtName"].trim().length > 0 ?
        (winnerData["courtName"] as string) :
        await resolveCourtName(match.arenaId, match.courtId);
    const arenaLabel =
      typeof winnerData["arenaName"] === "string" && winnerData["arenaName"].trim().length > 0 ?
        (winnerData["arenaName"] as string) :
        match.arenaName;
    const timePart =
      match.startTime && match.endTime ?
        `${match.startTime}–${match.endTime}` :
        match.startTime;
    const dateLabel = formatDateLabel(match.dateKey);

    try {
      await deliverNotificationToUser({
        userId: athleteId,
        title: "Vaga disponível na lista de espera!",
        body: `${arenaLabel} · ${courtName} · ${dateLabel} · ${timePart} — reserve em até 15 min.`,
        type: "arena_booking_waitlist_notified",
        data: {
          url: buildSlotsDeepLink(match),
          arenaId: match.arenaId,
          courtId: match.courtId,
          date: match.dateKey,
          startTime: match.startTime,
          endTime: match.endTime,
          waitlistId: winner.id,
          expiresAt: new Date(expiresAtMs).toISOString(),
        },
        requireInteraction: true,
      });
    } catch (error) {
      logger.error(
        `arenaBookingWaitlist: falha ao notificar ${athleteId} (entrada ${winner.id})`,
        error,
      );
    }

    logger.info(`arenaBookingWaitlist: booking ${bookingId} liberou vaga`, {
      notifiedEntryId: winner.id,
      athleteId,
    });
  },
);

/**
 * Expira entradas `notified` cujo prazo de 15 minutos passou sem virar
 * reserva — mesmo padrão de `onSchedule` de `arena-recurring-materializer.ts`.
 */
export const expireArenaBookingWaitlistEntries = onSchedule(
  {
    // Janela de confirmação é curta (15 min); cadência mais frequente que o
    // padrão diário de outros jobs para não deixar a expiração atrasada.
    schedule: "every 5 minutes",
    timeZone: "America/Sao_Paulo",
  },
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();

    const snap = await db
      .collection(ARENA_BOOKING_WAITLIST)
      .where("status", "==", "notified")
      .where("expiresAt", "<", now)
      .limit(200)
      .get();

    if (snap.empty) {
      logger.info("expireArenaBookingWaitlistEntries: nenhuma entrada vencida");
      return;
    }

    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.update(doc.ref, {
        status: "expired" as ArenaBookingWaitlistStatus,
        expiredAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    logger.info(`expireArenaBookingWaitlistEntries: ${snap.size} entrada(s) expirada(s)`);
  },
);
