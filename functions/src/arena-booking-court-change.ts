/**
 * Trocar a quadra de uma reserva — o gestor remaneja o atleta (PR 1 de
 * `docs/product/reservas-por-capacidade.md`).
 *
 * A reserva continua a mesma (id, pagamento, horário, valor); só a quadra muda.
 * Numa transação: confere que a quadra de destino está livre em todas as horas,
 * move os `arenaSlotLocks` (mesmo id determinístico das outras funções, só com a
 * quadra nova), atualiza o `courtId` dos docs de `arenaSlots` da reserva e grava
 * `courtId`/`courtName` + histórico na reserva.
 *
 * Fica de fora o que calcula as travas pela própria série, não pela reserva —
 * aula, clubinho e plano de horário: mover só a ocorrência deixaria a série
 * apagando/recriando travas na quadra antiga. Esses mudam de quadra pela tela
 * da aula/clubinho/plano.
 *
 * O valor da reserva não muda (já foi cotado e, às vezes, pago).
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertArenaAreaAccess} from "./arena-area-access";
import {computeSlotLockIds} from "./arena-booking-waitlist";
import {hasBlockedSlotOverlap, toMinutes} from "./arena-recurring-booking";
import {arenaBookingStartAt} from "./arena-booking-start-at";
import {courtSportCodes} from "./arena-booking-sport";
import {parseDateKeyFromBooking, normalizeBookingStatus} from "./slot-vacancy-alerts";
import {deliverNotificationToUser} from "./notification-delivery";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";

export const BOOKING_COURT_CHANGED_PUSH_TYPE = "arena_booking_court_changed";

/** Status em que a reserva ainda segura o horário. */
const MOVABLE_STATUSES = new Set(["active", "confirmed", "pending_payment"]);

/** Histórico guardado na reserva — o suficiente pra auditoria, sem crescer sem fim. */
const COURT_HISTORY_MAX = 20;

export interface ChangeBookingCourtInput {
  bookingId: string;
  toCourtId: string;
  reason: string | null;
}

export interface ChangeBookingCourtResult {
  changed: boolean;
  bookingId: string;
  courtId: string;
  courtName: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseChangeBookingCourtInput(raw: unknown): ChangeBookingCourtInput {
  const data = (raw ?? {}) as Record<string, unknown>;
  const bookingId = str(data["bookingId"]);
  const toCourtId = str(data["toCourtId"]);
  if (!bookingId) throw new HttpsError("invalid-argument", "Reserva inválida.");
  if (!toCourtId) throw new HttpsError("invalid-argument", "Escolha a quadra de destino.");
  const reason = str(data["reason"]).slice(0, 300) || null;
  return {bookingId, toCourtId, reason};
}

/**
 * Por que esta reserva não pode trocar de quadra aqui, ou `null` se pode.
 * Puro — testado sem Firestore.
 */
export function courtChangeBlockReason(booking: DocumentData, nowMs: number): string | null {
  if (booking["isClassSession"] === true || str(booking["classSessionId"])) {
    return "Esta reserva é de uma aula. Troque a quadra pela tela da aula.";
  }
  if (str(booking["clubSessionId"]) || str(booking["clubId"])) {
    return "Esta reserva é de um clubinho. Troque a quadra pela tela do clubinho.";
  }
  if (str(booking["scheduleSubscriptionId"])) {
    return "Esta reserva é de um plano de horário. Troque a quadra pela tela do plano.";
  }

  const status = normalizeBookingStatus(booking["status"]);
  if (!MOVABLE_STATUSES.has(status)) {
    return "Só dá para trocar a quadra de uma reserva ativa.";
  }

  const dateKey = parseDateKeyFromBooking(booking["date"]);
  const startTime = str(booking["startTime"]);
  const endTime = str(booking["endTime"]);
  if (!dateKey || startTime.length < 4 || endTime.length < 4) {
    return "Esta reserva não tem horário válido.";
  }
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  const endAtMs = arenaBookingStartAt(dateKey, "00:00").getTime() + endMin * 60 * 1000;
  if (nowMs >= endAtMs) {
    return "Esta reserva já terminou.";
  }
  return null;
}

/** Quadra de destino pode receber a reserva? `null` = pode. Puro. */
export function targetCourtBlockReason(
  courtData: DocumentData | undefined,
  bookingSport: string | null,
): string | null {
  if (!courtData) return "Quadra não encontrada.";
  if (courtData["status"] === "maintenance" || courtData["maintenance"] === true) {
    return "Essa quadra está em manutenção.";
  }
  if (bookingSport) {
    const sports = courtSportCodes(courtData);
    if (sports.length > 0 && !sports.includes(bookingSport)) {
      return "Essa quadra não é do esporte desta reserva.";
    }
  }
  return null;
}

/** Reserva de outra quadra no dia que encosta no horário — `arenaSlots` `booked` sem trava (legado). */
async function hasBookedSlotOverlap(
  db: Firestore,
  params: {arenaId: string; courtId: string; dateKey: string; startTime: string; endTime: string; bookingId: string},
): Promise<boolean> {
  const snap = await db.collection(ARENA_SLOTS)
    .where("arenaId", "==", params.arenaId)
    .where("courtId", "==", params.courtId)
    .where("date", "==", params.dateKey)
    .get();
  const startMin = toMinutes(params.startTime);
  let endMin = toMinutes(params.endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (str(data["status"]).toLowerCase() !== "booked") continue;
    if (str(data["bookingId"]) === params.bookingId) continue;
    const slotStart = toMinutes(str(data["startTime"]) || "00:00");
    let slotEnd = toMinutes(str(data["endTime"]) || "00:00");
    if (slotEnd === 0 && slotStart > 0) slotEnd = 24 * 60;
    if (slotStart < endMin && slotEnd > startMin) return true;
  }
  return false;
}

export async function changeArenaBookingCourtCore(
  db: Firestore,
  uid: string,
  input: ChangeBookingCourtInput,
  nowMs: number,
): Promise<ChangeBookingCourtResult> {
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(input.bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) throw new HttpsError("not-found", "Reserva não encontrada.");
  const booking = bookingSnap.data() as DocumentData;

  const arenaId = str(booking["arenaId"]);
  if (!arenaId) throw new HttpsError("failed-precondition", "Reserva sem arena.");
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");

  const fromCourtId = str(booking["courtId"]);
  if (fromCourtId === input.toCourtId) {
    return {
      changed: false,
      bookingId: input.bookingId,
      courtId: fromCourtId,
      courtName: str(booking["courtName"]) || "Quadra",
    };
  }

  const blockReason = courtChangeBlockReason(booking, nowMs);
  if (blockReason) throw new HttpsError("failed-precondition", blockReason);

  const courtSnap = await db.collection("arenas").doc(arenaId)
    .collection("courts").doc(input.toCourtId).get();
  const courtData = courtSnap.exists ? courtSnap.data() as DocumentData : undefined;
  const sport = str(booking["sport"]) || null;
  const targetReason = targetCourtBlockReason(courtData, sport);
  if (targetReason) {
    throw new HttpsError(courtData ? "failed-precondition" : "not-found", targetReason);
  }
  const toCourtName = str(courtData?.["name"]) || "Quadra";

  const dateKey = parseDateKeyFromBooking(booking["date"]) ?? "";
  const startTime = str(booking["startTime"]);
  const endTime = str(booking["endTime"]);

  const blocked = await hasBlockedSlotOverlap(db, {arenaId, courtId: input.toCourtId, startTime, endTime}, dateKey);
  if (blocked) {
    throw new HttpsError("failed-precondition", "Essa quadra está bloqueada nesse horário.");
  }
  const legacyBooked = await hasBookedSlotOverlap(db, {
    arenaId, courtId: input.toCourtId, dateKey, startTime, endTime, bookingId: input.bookingId,
  });
  if (legacyBooked) {
    throw new HttpsError("already-exists", "Essa quadra já está reservada nesse horário.");
  }

  const fromLockIds = fromCourtId ?
    computeSlotLockIds({arenaId, courtId: fromCourtId, dateKey, startTime, endTime}) :
    [];
  const toLockIds = computeSlotLockIds({arenaId, courtId: input.toCourtId, dateKey, startTime, endTime});
  if (toLockIds.length === 0) {
    throw new HttpsError("failed-precondition", "Não foi possível calcular os horários.");
  }

  const fromCourtName = str(booking["courtName"]) || "Quadra";

  await db.runTransaction(async (tx) => {
    // Fase de leitura: reserva fresca, travas de origem e destino, slots da reserva.
    const fresh = await tx.get(bookingRef);
    if (!fresh.exists) throw new HttpsError("not-found", "Reserva não encontrada.");
    const freshData = fresh.data() as DocumentData;
    if (str(freshData["courtId"]) !== fromCourtId) {
      throw new HttpsError("aborted", "A reserva mudou enquanto você trocava a quadra. Tente de novo.");
    }
    const freshReason = courtChangeBlockReason(freshData, nowMs);
    if (freshReason) throw new HttpsError("failed-precondition", freshReason);

    const fromLocks: DocumentSnapshot[] = [];
    for (const id of fromLockIds) {
      fromLocks.push(await tx.get(db.collection(ARENA_SLOT_LOCKS).doc(id)));
    }
    for (const id of toLockIds) {
      const snap = await tx.get(db.collection(ARENA_SLOT_LOCKS).doc(id));
      if (snap.exists && snap.data()?.["bookingId"] !== input.bookingId) {
        throw new HttpsError("already-exists", "Essa quadra já está reservada nesse horário.");
      }
    }
    const slots = await tx.get(db.collection(ARENA_SLOTS).where("bookingId", "==", input.bookingId));

    // Escritas.
    for (let i = 0; i < toLockIds.length; i++) {
      const source = fromLocks[i];
      const sourceData = source?.exists && source.data()?.["bookingId"] === input.bookingId ?
        source.data() as DocumentData :
        null;
      tx.set(db.collection(ARENA_SLOT_LOCKS).doc(toLockIds[i]!), {
        // Copia o que a trava carregava (recurringBookingId etc.); só a quadra muda.
        ...(sourceData ?? {
          arenaId,
          date: dateKey,
          bookingId: input.bookingId,
          bookingAthleteId: str(booking["athleteId"]) || null,
        }),
        courtId: input.toCourtId,
        movedAt: FieldValue.serverTimestamp(),
      });
      // Trava de origem só sai se for desta reserva (nunca derruba a de outra).
      if (sourceData && source) tx.delete(source.ref);
    }
    // Hora de origem sem par no destino (não acontece com o mesmo horário, mas
    // não deixa trava órfã se acontecer).
    for (let i = toLockIds.length; i < fromLocks.length; i++) {
      const source = fromLocks[i];
      if (source?.exists && source.data()?.["bookingId"] === input.bookingId) tx.delete(source.ref);
    }

    for (const doc of slots.docs) {
      tx.set(doc.ref, {courtId: input.toCourtId}, {merge: true});
    }

    const history = Array.isArray(freshData["courtHistory"]) ? freshData["courtHistory"] as unknown[] : [];
    const entry = {
      fromCourtId,
      fromCourtName,
      toCourtId: input.toCourtId,
      toCourtName,
      by: uid,
      at: Timestamp.fromMillis(nowMs),
      reason: input.reason,
    };
    tx.set(bookingRef, {
      courtId: input.toCourtId,
      courtName: toCourtName,
      courtHistory: [...history, entry].slice(-COURT_HISTORY_MAX),
      courtChangedAt: FieldValue.serverTimestamp(),
      courtChangedBy: uid,
    }, {merge: true});
  });

  return {changed: true, bookingId: input.bookingId, courtId: input.toCourtId, courtName: toCourtName};
}

export function courtChangedPushBody(booking: DocumentData, toCourtName: string): string {
  const startTime = str(booking["startTime"]);
  const arenaName = str(booking["arenaName"]) || "a arena";
  return `Sua reserva das ${startTime} em ${arenaName} agora é na ${toCourtName}.`;
}

export const changeArenaBookingCourt = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");

  const db = getFirestore();
  const input = parseChangeBookingCourtInput(request.data);
  const result = await changeArenaBookingCourtCore(db, uid, input, Date.now());
  if (!result.changed) return result;

  // Push é acessório: a troca já foi gravada.
  try {
    const booking = (await db.collection(ARENA_BOOKINGS).doc(result.bookingId).get()).data() ?? {};
    const athleteId = str(booking["athleteId"]);
    if (athleteId) {
      await deliverNotificationToUser({
        userId: athleteId,
        title: "Sua quadra mudou",
        body: courtChangedPushBody(booking, result.courtName),
        type: BOOKING_COURT_CHANGED_PUSH_TYPE,
        data: {
          type: BOOKING_COURT_CHANGED_PUSH_TYPE,
          bookingId: result.bookingId,
          arenaId: str(booking["arenaId"]),
        },
        requireInteraction: false,
      });
    }
  } catch (e) {
    logger.warn("changeArenaBookingCourt: push ao atleta falhou", e);
  }

  logger.info("changeArenaBookingCourt: quadra trocada", {
    bookingId: result.bookingId,
    toCourtId: result.courtId,
    by: uid,
  });
  return result;
});
