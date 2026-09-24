import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  isValidDateKey,
  toMinutes,
  fmtHourEnd,
  fmtHourStart,
  hasBlockedSlotOverlap,
  lockRefsForOccurrence,
} from "./arena-recurring-booking";
import {
  calculateBookingTotal,
  parsePromotionsFromDocs,
  readArenaFallbackPrice,
} from "./arena-pricing";
import {assertArenaAreaAccess} from "./arena-area-access";
import {deliverNotificationToUser} from "./notification-delivery";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

/** Reserva avulsa criada pelo gestor no balcão (sem app do atleta no meio).
 *  Mesma forma de documento do horário fixo — ver
 *  `materializeSeriesOccurrences` em arena-recurring-booking.ts. */

export interface ManualBookingInput {
  arenaId?: string;
  courtId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  athleteId?: string | null;
  customerName?: string | null;
  amountReais?: number;
  note?: string | null;
}

export interface ValidManualBooking {
  arenaId: string;
  courtId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  athleteId: string | null;
  customerName: string | null;
  amountReais: number;
  note: string | null;
}

/** "9:00" → "09:00"; "10:00:00" → "10:00"; lixo → null. */
function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1] ?? "", 10);
  const min = parseInt(m[2] ?? "", 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (h > 24 || min > 59) return null;
  if (h === 24 && min !== 0) return null;
  return `${h.toString().padStart(2, "0")}:${m[2]}`;
}

function trimmedOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/**
 * Valida e normaliza o payload da reserva de balcão.
 *
 * Sobre a data: **dia passado é recusado** — registro retroativo criaria lock e
 * presença para horário vencido, e não é o problema desta entrega. Mas **hora
 * passada no dia de hoje é aceita**: o cliente que chega 19h05 e paga o horário
 * das 19h é o caso comum do balcão.
 */
export function validateManualBookingInput(
  input: ManualBookingInput,
  todayKey: string,
): ValidManualBooking {
  const arenaId = input.arenaId?.trim() ?? "";
  const courtId = input.courtId?.trim() ?? "";
  if (!arenaId || !courtId) {
    throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
  }

  const dateKey = (input.date ?? "").trim().substring(0, 10);
  if (!isValidDateKey(dateKey)) {
    throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
  }
  if (dateKey < todayKey) {
    throw new HttpsError(
      "invalid-argument",
      "Não dá pra criar reserva em data passada.",
    );
  }

  const startTime = normalizeTime(input.startTime);
  const endTime = normalizeTime(input.endTime);
  if (!startTime || !endTime) {
    throw new HttpsError("invalid-argument", "Intervalo de horário inválido.");
  }
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  if (endMin <= startMin) {
    throw new HttpsError("invalid-argument", "Intervalo de horário inválido.");
  }

  const athleteId = trimmedOrNull(input.athleteId);
  const customerName = trimmedOrNull(input.customerName);
  if (!athleteId && !customerName) {
    throw new HttpsError(
      "invalid-argument",
      "Informe o atleta ou o nome do cliente.",
    );
  }

  const amountReais = Number(input.amountReais);
  if (!Number.isFinite(amountReais) || amountReais < 0) {
    throw new HttpsError("invalid-argument", "Valor inválido.");
  }

  return {
    arenaId,
    courtId,
    dateKey,
    startTime,
    endTime,
    athleteId,
    customerName,
    amountReais,
    note: trimmedOrNull(input.note),
  };
}

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_TIMEZONE_OFFSET = "-03:00";

interface ArenaCourtContext {
  arenaData: Record<string, unknown>;
  courtData: Record<string, unknown>;
  arenaName: string;
  courtName: string;
}

/** Acesso de escrita em `agenda` + arena e quadra numa leitura só — as duas
 *  callables precisam exatamente disso, e `calculateBookingTotal` precisa do
 *  `courtData` cru. */
async function requireArenaCourtContext(
  db: Firestore,
  arenaId: string,
  courtId: string,
  uid: string,
): Promise<ArenaCourtContext> {
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");

  const [arenaSnap, courtSnap] = await Promise.all([
    db.collection("arenas").doc(arenaId).get(),
    db.collection("arenas").doc(arenaId).collection("courts").doc(courtId).get(),
  ]);
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  if (!courtSnap.exists) {
    throw new HttpsError("not-found", "Quadra não encontrada.");
  }

  const arenaData = arenaSnap.data() as Record<string, unknown>;
  const courtData = courtSnap.data() as Record<string, unknown>;
  const arenaName = typeof arenaData["name"] === "string" ?
    (arenaData["name"] as string).trim() || "Arena" :
    "Arena";
  const courtName = typeof courtData["name"] === "string" ?
    (courtData["name"] as string).trim() || "Quadra" :
    "Quadra";

  return {arenaData, courtData, arenaName, courtName};
}

/** Preço sugerido: quadra + promoções ativas. Sem cupom (é do atleta) e sem
 *  regra de pico (não bloqueia o gestor). Quadra sem preço devolve 0 sem erro —
 *  o gestor digita. */
export const quoteArenaManualBooking = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const db = getFirestore();
  const input = (request.data ?? {}) as ManualBookingInput;
  // Cotação não precisa de cliente nem de valor: injeta o mínimo pra reusar a
  // mesma normalização de quadra/data/horário da criação.
  const parsed = validateManualBookingInput(
    {...input, customerName: "cotação", amountReais: 0},
    dayKeyFromEventDate(new Date()),
  );

  const ctx = await requireArenaCourtContext(db, parsed.arenaId, parsed.courtId, uid);
  const promoSnap = await db
    .collection("arenas").doc(parsed.arenaId)
    .collection("promotions")
    .where("active", "==", true)
    .get();

  const total = calculateBookingTotal({
    arenaId: parsed.arenaId,
    courtId: parsed.courtId,
    dateKey: parsed.dateKey,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    courtData: ctx.courtData,
    arenaFallback: readArenaFallbackPrice(ctx.arenaData),
    promotions: parsePromotionsFromDocs(promoSnap.docs),
  });

  return {amountReais: total.amountReais, lineItems: total.lineItems};
});

/** Cria a reserva de balcão: `arenaBookings` + `arenaSlots` + `arenaSlotLocks`
 *  numa transação, mesma forma do horário fixo. */
export const createArenaManualBooking = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const db = getFirestore();
  const parsed = validateManualBookingInput(
    (request.data ?? {}) as ManualBookingInput,
    dayKeyFromEventDate(new Date()),
  );
  const ctx = await requireArenaCourtContext(db, parsed.arenaId, parsed.courtId, uid);

  if (parsed.athleteId) {
    const userSnap = await db.collection("users").doc(parsed.athleteId).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Atleta vinculado não encontrado.");
    }
  }

  const blocked = await hasBlockedSlotOverlap(db, {
    arenaId: parsed.arenaId,
    courtId: parsed.courtId,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
  }, parsed.dateKey);
  if (blocked) {
    throw new HttpsError(
      "failed-precondition",
      "Esse horário está bloqueado; desbloqueie antes de reservar.",
    );
  }

  const lockRefs = lockRefsForOccurrence(db, parsed, parsed.dateKey);
  if (lockRefs.length === 0) {
    throw new HttpsError("failed-precondition", "Não foi possível calcular os horários.");
  }

  const bookingRef = db.collection(ARENA_BOOKINGS).doc();
  const slotRef = db.collection(ARENA_SLOTS).doc();
  const startAt = new Date(
    `${parsed.dateKey}T${parsed.startTime}:00${ARENA_TIMEZONE_OFFSET}`,
  );
  const confirmationDeadline = new Date(startAt.getTime() - 2 * 60 * 60 * 1000);

  try {
    await db.runTransaction(async (transaction) => {
      for (const lock of lockRefs) {
        const snap = await transaction.get(lock.ref);
        if (snap.exists) {
          throw new HttpsError("already-exists", "Esse horário já está reservado.");
        }
      }

      transaction.set(bookingRef, {
        athleteId: parsed.athleteId,
        arenaId: parsed.arenaId,
        arenaName: ctx.arenaName,
        courtId: parsed.courtId,
        courtName: ctx.courtName,
        customerName: parsed.customerName,
        date: parsed.dateKey,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        amountReais: parsed.amountReais,
        amountToPayNowReais: 0,
        amountPaidOnlineReais: 0,
        amountDueOnsiteReais: parsed.amountReais,
        paymentChannel: "onsite",
        paymentReceiver: null,
        paymentFraction: null,
        paymentStatus: "none",
        status: "active",
        attendanceConfirmed: false,
        attendanceStatus: "pending",
        confirmationDeadline: Timestamp.fromDate(confirmationDeadline),
        paymentExpiresAt: null,
        source: "manual",
        isRecurring: false,
        createdByRole: "arena_manager",
        createdBy: uid,
        ...(parsed.note ? {managerNote: parsed.note} : {}),
        createdAt: FieldValue.serverTimestamp(),
      });

      transaction.set(slotRef, {
        arenaId: parsed.arenaId,
        courtId: parsed.courtId,
        // String YYYY-MM-DD — alinhado a arenaBookings (evita deslocamento UTC no app).
        date: parsed.dateKey,
        dateKey: parsed.dateKey,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        status: "booked",
        bookingAthleteId: parsed.athleteId,
        bookingId: bookingRef.id,
        priceReais: parsed.amountReais,
        createdAt: FieldValue.serverTimestamp(),
      });

      for (const lock of lockRefs) {
        transaction.set(lock.ref, {
          arenaId: parsed.arenaId,
          courtId: parsed.courtId,
          date: parsed.dateKey,
          startTime: fmtHourStart(lock.hour),
          endTime: fmtHourEnd(lock.hour),
          bookingId: bookingRef.id,
          bookingAthleteId: parsed.athleteId,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("createArenaManualBooking: transação falhou", e);
    throw new HttpsError("internal", "Não foi possível criar a reserva.");
  }

  // Push é acessório: reserva já criada não pode cair por falha de notificação.
  if (parsed.athleteId) {
    try {
      await deliverNotificationToUser({
        userId: parsed.athleteId,
        title: "Reserva confirmada 🎾",
        body: `${parsed.startTime} - ${parsed.endTime} · ${ctx.courtName} · ${ctx.arenaName}`,
        type: "manual_booking_created",
        data: {bookingId: bookingRef.id, arenaId: parsed.arenaId},
        requireInteraction: false,
      });
    } catch (e) {
      logger.warn("createArenaManualBooking: notificação ao atleta falhou", e);
    }
  }

  logger.info("createArenaManualBooking: reserva criada", {
    bookingId: bookingRef.id,
    arenaId: parsed.arenaId,
    courtId: parsed.courtId,
    dateKey: parsed.dateKey,
  });

  return {bookingId: bookingRef.id};
});
