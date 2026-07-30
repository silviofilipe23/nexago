/**
 * Sincroniza `arenaSlots` + `arenaSlotLocks` com o status da reserva.
 *
 * Todos os cancelamentos avulsos (atleta no app/web, gestor no app/web) fazem
 * apenas `update` de `status` em `arenaBookings` — as rules não deixam o
 * atleta apagar locks, então o horário ficava preso para sempre: o
 * `createArenaBooking` recusava o slot ("acabou de ser reservado") e as grades
 * seguiam mostrando "ocupado". Este trigger fecha o ciclo server-side:
 *
 * - transição para cancelado → apaga os locks DO PRÓPRIO booking e os docs de
 *   `arenaSlots` com `bookingId` da reserva (retrocompatível com qualquer
 *   versão de app, pois reage à escrita que todos os clients já fazem);
 * - restore (desfazer do gestor em 60s) → recria locks + slot em transação;
 *   se outra reserva tomou o horário nesse meio-tempo, reverte a reserva para
 *   `canceled` com `restoreFailedReason: 'slot_taken'`.
 *
 * Fluxos PIX (`releaseArenaBookingHold`) e recorrência
 * (`cancelFutureOccurrences`) já liberavam tudo sozinhos; quando eles rodam,
 * este trigger vira no-op (deletes idempotentes com checagem de dono).
 */
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import type {DocumentData, Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  CANCELED_BOOKING_STATUSES,
  isBookingCanceledTransition,
  normalizeBookingStatus,
  parseDateKeyFromBooking,
} from "./slot-vacancy-alerts";
import {computeSlotLockIds} from "./arena-booking-waitlist";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";

/** Status que uma reserva restaurada pode assumir (espelha `statusBeforeCancel`). */
const RESTORED_TARGET_STATUSES = new Set(["active", "confirmed", "pending_payment"]);

export interface ReleaseSlotHoldResult {
  deletedLocks: number;
  deletedSlots: number;
}

/** Transição cancelado → status ativo (desfazer do gestor). */
export function isBookingRestoredTransition(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!before || !after) return false;
  const prev = normalizeBookingStatus(before["status"]);
  if (!CANCELED_BOOKING_STATUSES.has(prev)) return false;
  return RESTORED_TARGET_STATUSES.has(normalizeBookingStatus(after["status"]));
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

function fmtHourStart(h: number): string {
  return `${Math.min(23, Math.max(0, h)).toString().padStart(2, "0")}:00`;
}

function fmtHourEnd(h: number): string {
  if (h >= 23) return "24:00";
  return `${(h + 1).toString().padStart(2, "0")}:00`;
}

function strField(data: DocumentData, field: string): string {
  const v = data[field];
  return typeof v === "string" ? v.trim() : "";
}

interface SlotLockPlan {
  id: string;
  startTime: string;
  endTime: string;
}

/**
 * Locks (id determinístico + janela de hora cheia) cobertos pela reserva —
 * mesma formula de `createArenaBooking`/`computeSlotLockIds`. Vazio quando a
 * reserva não tem dados de horário utilizáveis (legado).
 */
function slotLockPlansForBooking(booking: DocumentData): SlotLockPlan[] {
  const arenaId = strField(booking, "arenaId");
  const courtId = strField(booking, "courtId");
  const dateKey = parseDateKeyFromBooking(booking["date"]) ?? "";
  const startTime = strField(booking, "startTime");
  const endTime = strField(booking, "endTime");
  if (!arenaId || !courtId || !dateKey || startTime.length < 4 || endTime.length < 4) {
    return [];
  }

  const ids = computeSlotLockIds({arenaId, courtId, dateKey, startTime, endTime});
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  const hours = calendarHoursSpanning(startMin, endMin);
  return ids.map((id, i) => ({
    id,
    startTime: fmtHourStart(hours[i] ?? 0),
    endTime: fmtHourEnd(hours[i] ?? 0),
  }));
}

/**
 * Libera o horário de uma reserva cancelada: apaga os locks cujo `bookingId`
 * é o da reserva (um lock re-adquirido por outra reserva NUNCA é tocado — um
 * retry do trigger não pode derrubar a reserva nova) e os docs de `arenaSlots`
 * da reserva. Idempotente.
 */
export async function releaseArenaBookingSlotHold(
  db: Firestore,
  bookingId: string,
  booking: DocumentData,
): Promise<ReleaseSlotHoldResult> {
  let deletedLocks = 0;
  for (const plan of slotLockPlansForBooking(booking)) {
    const ref = db.collection(ARENA_SLOT_LOCKS).doc(plan.id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    if (snap.data()?.["bookingId"] !== bookingId) continue;
    await ref.delete();
    deletedLocks++;
  }

  let deletedSlots = 0;
  const slotsSnap = await db
    .collection(ARENA_SLOTS)
    .where("bookingId", "==", bookingId)
    .get();
  for (const doc of slotsSnap.docs) {
    await doc.ref.delete();
    deletedSlots++;
  }

  return {deletedLocks, deletedSlots};
}

/**
 * Retoma o horário de uma reserva restaurada (desfazer do gestor). Em
 * transação: se algum lock pertence a OUTRA reserva, o restore perde — a
 * reserva volta para `canceled` com `restoreFailedReason: 'slot_taken'`;
 * senão recria locks e o doc de `arenaSlots` (id = bookingId, idempotente).
 */
export async function reacquireArenaBookingSlotHold(
  db: Firestore,
  bookingId: string,
  booking: DocumentData,
): Promise<"reacquired" | "conflict"> {
  const plans = slotLockPlansForBooking(booking);
  if (plans.length === 0) return "reacquired";

  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const arenaId = strField(booking, "arenaId");
  const courtId = strField(booking, "courtId");
  const dateKey = parseDateKeyFromBooking(booking["date"]) ?? "";
  const athleteId = strField(booking, "athleteId") || null;
  const recurringBookingId = strField(booking, "recurringBookingId") || null;
  const amountReais =
    typeof booking["amountReais"] === "number" ? booking["amountReais"] : null;

  return db.runTransaction(async (tx) => {
    let conflict = false;
    for (const plan of plans) {
      const snap = await tx.get(db.collection(ARENA_SLOT_LOCKS).doc(plan.id));
      if (snap.exists && snap.data()?.["bookingId"] !== bookingId) {
        conflict = true;
        break;
      }
    }

    if (conflict) {
      tx.set(bookingRef, {
        status: "canceled",
        attendanceStatus: "canceled",
        canceledAt: FieldValue.serverTimestamp(),
        restoreFailedReason: "slot_taken",
      }, {merge: true});
      return "conflict";
    }

    for (const plan of plans) {
      tx.set(db.collection(ARENA_SLOT_LOCKS).doc(plan.id), {
        arenaId,
        courtId,
        date: dateKey,
        startTime: plan.startTime,
        endTime: plan.endTime,
        bookingId,
        bookingAthleteId: athleteId,
        ...(recurringBookingId ? {recurringBookingId} : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    tx.set(db.collection(ARENA_SLOTS).doc(bookingId), {
      arenaId,
      courtId,
      // String YYYY-MM-DD — evita deslocamento de dia (UTC); alinhado a arenaBookings.
      date: dateKey,
      dateKey,
      startTime: strField(booking, "startTime"),
      endTime: strField(booking, "endTime"),
      status: "booked",
      bookingAthleteId: athleteId,
      bookingId,
      priceReais: amountReais,
      ...(booking["isRecurring"] === true ? {isRecurring: true} : {}),
      ...(recurringBookingId ? {recurringBookingId} : {}),
      createdAt: FieldValue.serverTimestamp(),
    });

    return "reacquired";
  });
}

/**
 * Mantém `arenaSlots`/`arenaSlotLocks` coerentes com o status da reserva —
 * cancelou libera, restaurou retoma (com detecção de conflito).
 */
export const onArenaBookingStatusChangedSyncSlotHold = onDocumentUpdated(
  "arenaBookings/{bookingId}",
  async (event) => {
    const bookingId = event.params.bookingId;
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!after) return;

    if (isBookingCanceledTransition(before, after)) {
      const result = await releaseArenaBookingSlotHold(getFirestore(), bookingId, after);
      logger.info(
        `slotHold: booking ${bookingId} cancelado — ` +
        `${result.deletedLocks} lock(s) e ${result.deletedSlots} slot(s) liberados`,
      );
      return;
    }

    if (isBookingRestoredTransition(before, after)) {
      const outcome = await reacquireArenaBookingSlotHold(getFirestore(), bookingId, after);
      if (outcome === "conflict") {
        logger.warn(
          `slotHold: restore do booking ${bookingId} conflitou (horário já tomado) — revertido para canceled`,
        );
      } else {
        logger.info(`slotHold: booking ${bookingId} restaurado — locks e slot recriados`);
      }
    }
  },
);
