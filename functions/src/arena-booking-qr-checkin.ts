/**
 * Check-in da reserva pelo QR da quadra (PR 4c de `docs/product/reservas-por-capacidade.md`).
 *
 * O atleta chega, a recepção indica a quadra e ele lê o QR impresso nela
 * (`arena-court-checkin-qr.ts`, o mesmo das aulas). Numa transação:
 * - reserva sem quadra definida (`unassigned`): a quadra lida vira a da reserva
 *   (`allocationSource: "qr"`) — se for outra que a provisória, a reserva muda para ela,
 *   empurrando uma flutuante que estiver lá;
 * - reserva com quadra definida: o QR tem que ser dessa quadra;
 * - nos dois casos o check-in é marcado (`attendanceStatus: "checked_in"`, que credita a
 *   gamificação pelo trigger de sempre).
 *
 * A janela é a do check-in do app: de 20 min antes do início até o fim do horário.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, type Firestore, type DocumentData} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {parseCourtQrPayload, resolveCourtCheckinToken} from "./arena-court-checkin-qr";
import {arenaBookingStartAt} from "./arena-booking-start-at";
import {parseDateKeyFromBooking, normalizeBookingStatus} from "./slot-vacancy-alerts";
import {toMinutes} from "./arena-recurring-booking";
import {assignBookingInPlace, moveBookingToCourt} from "./arena-booking-court-change";

const ARENA_BOOKINGS = "arenaBookings";

/** O check-in pelo QR abre 20 min antes do início (igual ao check-in do app). */
export const QR_CHECKIN_OPENS_MINUTES_BEFORE = 20;

const ACTIVE_STATUSES = new Set(["active", "confirmed", "pending_payment"]);

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function bookingOwnerUid(booking: DocumentData): string {
  return str(booking["athleteId"]) || str(booking["bookingAthleteId"]);
}

/** Início e fim da reserva em ms, ou `null` sem horário válido. Fim "00:00" = meia-noite. */
export function bookingWindowMs(booking: DocumentData): {startMs: number; endMs: number} | null {
  const dateKey = parseDateKeyFromBooking(booking["date"]);
  const startTime = str(booking["startTime"]);
  const endTime = str(booking["endTime"]);
  if (!dateKey || startTime.length < 4 || endTime.length < 4) return null;
  const dayMs = arenaBookingStartAt(dateKey, "00:00").getTime();
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin <= startMin) endMin += 24 * 60;
  return {startMs: dayMs + startMin * 60_000, endMs: dayMs + endMin * 60_000};
}

/**
 * Por que este atleta não pode fazer check-in pelo QR agora, ou `null` se pode.
 * Puro — testado sem Firestore. Check-in já feito não é motivo: quem chama decide.
 */
export function qrCheckInBlockReason(booking: DocumentData, uid: string, nowMs: number): string | null {
  if (bookingOwnerUid(booking) !== uid) {
    return "Só quem fez a reserva faz o check-in pelo QR.";
  }
  if (booking["isClassSession"] === true || str(booking["classSessionId"])) {
    return "Esta reserva é de uma aula. Faça o check-in pela aula.";
  }
  if (!ACTIVE_STATUSES.has(normalizeBookingStatus(booking["status"]))) {
    return "Só dá para fazer check-in de uma reserva ativa.";
  }
  if (str(booking["attendanceStatus"]).toLowerCase() === "no_show") {
    return "Esta reserva foi marcada como falta. Fale com a recepção.";
  }
  const window = bookingWindowMs(booking);
  if (!window) return "Esta reserva não tem horário válido.";
  if (nowMs < window.startMs - QR_CHECKIN_OPENS_MINUTES_BEFORE * 60_000) {
    return `O check-in abre ${QR_CHECKIN_OPENS_MINUTES_BEFORE} min antes do horário.`;
  }
  if (nowMs >= window.endMs) return "Esta reserva já terminou.";
  return null;
}

export function isCheckedIn(booking: DocumentData): boolean {
  return str(booking["attendanceStatus"]).toLowerCase() === "checked_in";
}

export interface QrCheckInInput {
  bookingId: string;
  /** Texto lido do QR (`nexago-checkin:v1:{token}`). */
  qr: string;
}

export interface QrCheckInResult {
  bookingId: string;
  courtId: string;
  courtName: string;
  /** A reserva estava sem quadra definida e agora tem. */
  assigned: boolean;
  /** A reserva saiu da quadra provisória para a quadra lida. */
  moved: boolean;
  /** O check-in já estava feito nesta quadra (leitura repetida). */
  alreadyCheckedIn: boolean;
}

export function parseQrCheckInInput(raw: unknown): QrCheckInInput {
  const data = (raw ?? {}) as Record<string, unknown>;
  const bookingId = str(data["bookingId"]);
  if (!bookingId) throw new HttpsError("invalid-argument", "Reserva inválida.");
  return {bookingId, qr: str(data["qr"])};
}

function checkInFields(): Record<string, unknown> {
  return {
    attendanceStatus: "checked_in",
    checkedInAt: FieldValue.serverTimestamp(),
    checkInMethod: "qr",
    // O QR está na quadra: ler é estar na arena.
    locationVerified: true,
  };
}

const COURT_TAKEN_MESSAGE = "Essa quadra está ocupada nesse horário. Confira com a recepção qual é a sua quadra.";
const WRONG_COURT_MESSAGE = "Esta não é a quadra da sua reserva. Confira com a recepção.";

export async function checkInBookingByCourtQrCore(
  db: Firestore,
  uid: string,
  input: QrCheckInInput,
  nowMs: number,
): Promise<QrCheckInResult> {
  const token = parseCourtQrPayload(input.qr);
  if (!token) {
    throw new HttpsError("invalid-argument", "Este QR não é de check-in do nexaGO.", {reason: "qr_unknown"});
  }

  const bookingRef = db.collection(ARENA_BOOKINGS).doc(input.bookingId);
  const snap = await bookingRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Reserva não encontrada.");
  const booking = snap.data() as DocumentData;
  if (bookingOwnerUid(booking) !== uid) {
    throw new HttpsError("permission-denied", "Só quem fez a reserva faz o check-in pelo QR.");
  }

  const court = await resolveCourtCheckinToken(db, token);
  if (!court) {
    throw new HttpsError("failed-precondition", "Este QR não vale mais. Peça à recepção o QR atual da quadra.",
      {reason: "qr_invalid"});
  }
  if (court.arenaId !== str(booking["arenaId"])) {
    throw new HttpsError("failed-precondition", "Este QR é de outra arena.", {reason: "qr_other_arena"});
  }

  const blockReason = qrCheckInBlockReason(booking, uid, nowMs);
  if (blockReason) throw new HttpsError("failed-precondition", blockReason, {reason: "not_allowed"});

  const fromCourtId = str(booking["courtId"]);
  const sameCourt = fromCourtId === court.courtId;
  const unassigned = booking["allocationStatus"] === "unassigned";
  const result = (moved: boolean, assigned: boolean, courtName: string, alreadyCheckedIn = false): QrCheckInResult => ({
    bookingId: input.bookingId,
    courtId: court.courtId,
    courtName,
    assigned,
    moved,
    alreadyCheckedIn,
  });

  if (isCheckedIn(booking)) {
    if (sameCourt && !unassigned) return result(false, false, str(booking["courtName"]) || court.courtName, true);
    throw new HttpsError("failed-precondition", "Seu check-in já foi feito. Para trocar de quadra, fale com a recepção.",
      {reason: "already_checked_in"});
  }
  if (!sameCourt && !unassigned) {
    throw new HttpsError("failed-precondition", WRONG_COURT_MESSAGE, {reason: "wrong_court"});
  }

  // Confere de novo na transação (a recepção pode ter mexido na reserva enquanto o atleta lia).
  const checkFresh = (fresh: DocumentData) => {
    const reason = qrCheckInBlockReason(fresh, uid, nowMs);
    if (reason) throw new HttpsError("failed-precondition", reason, {reason: "not_allowed"});
    if (isCheckedIn(fresh)) {
      throw new HttpsError("failed-precondition", "Seu check-in já foi feito.", {reason: "already_checked_in"});
    }
    if (str(fresh["courtId"]) !== court.courtId && fresh["allocationStatus"] !== "unassigned") {
      throw new HttpsError("failed-precondition", WRONG_COURT_MESSAGE, {reason: "wrong_court"});
    }
  };
  const actor = {uid, source: "qr" as const};

  if (sameCourt) {
    const assigned = await assignBookingInPlace(db, {
      bookingId: input.bookingId,
      courtId: court.courtId,
      actor,
      nowMs,
      checkFresh,
      extra: checkInFields(),
    });
    return result(false, assigned.assigned, assigned.courtName);
  }

  try {
    const moved = await moveBookingToCourt(db, {
      bookingId: input.bookingId,
      booking,
      toCourtId: court.courtId,
      actor,
      reason: "Atleta leu o QR da quadra",
      displacedReason: (toCourtName) => `Outro atleta fez check-in na ${toCourtName}`,
      nowMs,
      checkFresh,
      extra: checkInFields(),
    });
    return result(true, true, moved.courtName);
  } catch (e) {
    if (e instanceof HttpsError && e.code === "already-exists") {
      throw new HttpsError("failed-precondition", COURT_TAKEN_MESSAGE, {reason: "court_taken"});
    }
    throw e;
  }
}

export const checkInArenaBookingByCourtQr = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const input = parseQrCheckInInput(request.data);
  const result = await checkInBookingByCourtQrCore(getFirestore(), uid, input, Date.now());
  logger.info("checkInArenaBookingByCourtQr: check-in pelo QR", {
    bookingId: result.bookingId,
    courtId: result.courtId,
    moved: result.moved,
    assigned: result.assigned,
    by: uid,
  });
  return result;
});
