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
import {getFirestore, FieldValue, type Firestore, type DocumentData, type DocumentSnapshot} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertArenaAreaAccess} from "./arena-area-access";
import {computeSlotLockIds} from "./arena-booking-waitlist";
import {hasBlockedSlotOverlap, toMinutes} from "./arena-recurring-booking";
import {arenaBookingStartAt} from "./arena-booking-start-at";
import {parseDateKeyFromBooking, normalizeBookingStatus} from "./slot-vacancy-alerts";
import {deliverNotificationToUser} from "./notification-delivery";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  claimCourtLocks,
  clubSessionCourtsAfterMove,
  isClubBlock,
  readBookingMove,
  targetCourtBlockReason,
  writeBookingCourtMove,
} from "./arena-floating-booking";
import {athleteSeesBookingCourt} from "./arena-booking-allocation";
import {ARENA_CLUB_SESSIONS, CLUB_PARTICIPANTS} from "./arena-club-constants";

export {clubSessionCourtsAfterMove, targetCourtBlockReason};

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";

export const BOOKING_COURT_CHANGED_PUSH_TYPE = "arena_booking_court_changed";
export const CLUB_COURT_CHANGED_PUSH_TYPE = "club_session_court_changed";

/** Status em que a reserva ainda segura o horário. */
const MOVABLE_STATUSES = new Set(["active", "confirmed", "pending_payment"]);

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
  /** A reserva estava sem quadra definida (modo "arena define a quadra") e agora tem. */
  assigned: boolean;
  /** Quadra antes da troca (aviso aos participantes do clubinho). */
  fromCourtName?: string;
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

/** Reserva de outra quadra no dia que encosta no horário — `arenaSlots` `booked` SEM trava (legado). */
export async function hasBookedSlotOverlap(
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
    if (!(slotStart < endMin && slotEnd > startMin)) continue;
    // Slot com trava da própria reserva não é legado: quem decide é a trava (e a flutuante
    // pode ser empurrada pelo `claimCourtLocks`).
    const ownLockId = computeSlotLockIds({
      arenaId: params.arenaId,
      courtId: params.courtId,
      dateKey: params.dateKey,
      startTime: str(data["startTime"]),
      endTime: str(data["endTime"]),
    })[0];
    if (ownLockId) {
      const lock = await db.collection(ARENA_SLOT_LOCKS).doc(ownLockId).get();
      if (lock.exists && str(lock.data()?.["bookingId"]) === str(data["bookingId"])) continue;
    }
    return true;
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
    // Reserva sem quadra definida confirmada na própria provisória: só marca como definida. O
    // clubinho fica sempre provisório.
    if (booking["allocationStatus"] === "unassigned" && !isClubBlock(booking)) {
      return assignBookingInPlace(db, {bookingId: input.bookingId, courtId: fromCourtId, actor: {uid, source: "staff"}, nowMs});
    }
    return {
      changed: false,
      bookingId: input.bookingId,
      courtId: fromCourtId,
      courtName: str(booking["courtName"]) || "Quadra",
      assigned: false,
    };
  }

  const moved = await moveBookingToCourt(db, {
    bookingId: input.bookingId,
    booking,
    toCourtId: input.toCourtId,
    actor: {uid, source: "staff"},
    reason: input.reason,
    displacedReason: (toCourtName) => `Gestor moveu outra reserva para ${toCourtName}`,
    nowMs,
  });

  return {
    changed: true,
    bookingId: input.bookingId,
    courtId: input.toCourtId,
    courtName: moved.courtName,
    assigned: booking["allocationStatus"] === "unassigned" && !isClubBlock(booking),
    fromCourtName: str(booking["courtName"]) || "Quadra",
  };
}

/** Quem define a quadra: a recepção (painel) ou o próprio atleta lendo o QR da quadra. */
export interface CourtAssignmentActor {
  uid: string;
  source: "staff" | "qr";
}

export interface MoveBookingToCourtParams {
  bookingId: string;
  /** Reserva lida antes da transação (a quadra de origem sai daqui). */
  booking: DocumentData;
  toCourtId: string;
  actor: CourtAssignmentActor;
  reason: string | null;
  /** Motivo gravado na reserva flutuante empurrada para outra quadra (troca). */
  displacedReason: (toCourtName: string) => string;
  nowMs: number;
  /** Confere a reserva fresca dentro da transação; lança para abortar. */
  checkFresh?: (fresh: DocumentData) => void;
  /** Campos gravados na reserva na mesma transação (ex.: check-in do QR). */
  extra?: Record<string, unknown>;
}

/**
 * Move a reserva para outra quadra numa transação: confere a quadra de destino (esporte,
 * manutenção, bloqueio, reserva legada), empurra a flutuante que estiver nela e move travas,
 * `arenaSlots` e a quadra da reserva. Quem chama confere a permissão antes.
 */
export async function moveBookingToCourt(
  db: Firestore,
  params: MoveBookingToCourtParams,
): Promise<{courtName: string}> {
  const {bookingId, booking, toCourtId, nowMs} = params;
  const blockReason = courtChangeBlockReason(booking, nowMs);
  if (blockReason) throw new HttpsError("failed-precondition", blockReason);

  const arenaId = str(booking["arenaId"]);
  const fromCourtId = str(booking["courtId"]);
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const courtSnap = await db.collection("arenas").doc(arenaId)
    .collection("courts").doc(toCourtId).get();
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

  const blocked = await hasBlockedSlotOverlap(db, {arenaId, courtId: toCourtId, startTime, endTime}, dateKey);
  if (blocked) {
    throw new HttpsError("failed-precondition", "Essa quadra está bloqueada nesse horário.");
  }
  const legacyBooked = await hasBookedSlotOverlap(db, {
    arenaId, courtId: toCourtId, dateKey, startTime, endTime, bookingId,
  });
  if (legacyBooked) {
    throw new HttpsError("already-exists", "Essa quadra já está reservada nesse horário.");
  }

  const toLockRefs = computeSlotLockIds({arenaId, courtId: toCourtId, dateKey, startTime, endTime})
    .map((id) => db.collection(ARENA_SLOT_LOCKS).doc(id));
  if (toLockRefs.length === 0) {
    throw new HttpsError("failed-precondition", "Não foi possível calcular os horários.");
  }

  await db.runTransaction(async (tx) => {
    // Fase de leitura: reserva fresca, destino (empurrando flutuante, se houver) e a mudança.
    const fresh = await tx.get(bookingRef);
    if (!fresh.exists) throw new HttpsError("not-found", "Reserva não encontrada.");
    const freshData = fresh.data() as DocumentData;
    if (str(freshData["courtId"]) !== fromCourtId) {
      throw new HttpsError("aborted", "A reserva mudou enquanto você trocava a quadra. Tente de novo.");
    }
    const freshReason = courtChangeBlockReason(freshData, nowMs);
    if (freshReason) throw new HttpsError("failed-precondition", freshReason);
    params.checkFresh?.(freshData);

    // Quadra de destino com reserva flutuante: ela vai para outra quadra livre — inclusive a que
    // esta reserva está deixando (troca).
    const claim = await claimCourtLocks(tx, db, {arenaId, courtId: toCourtId, lockRefs: toLockRefs}, {
      ownBookingId: bookingId,
      freeBookingIds: [bookingId],
      reason: params.displacedReason(toCourtName),
      nowMs,
    });
    if (!claim.ok) {
      throw new HttpsError("already-exists", "Essa quadra já está reservada nesse horário.");
    }
    const move = await readBookingMove(tx, db, bookingId, {courtId: toCourtId, courtName: toCourtName}, fresh);
    if (!move) throw new HttpsError("failed-precondition", "Esta reserva não tem horário válido.");
    // Bloqueio de uma sessão do clubinho (a sessão acompanha a troca em `writeBookingCourtMove`).
    if (move.clubSession && ["canceled", "completed"].includes(str(move.clubSession.data["status"]))) {
      throw new HttpsError("failed-precondition", "Esta sessão do clubinho já foi encerrada.");
    }

    // Escritas.
    writeBookingCourtMove(tx, db, move, {
      by: params.actor.uid,
      reason: params.reason,
      nowMs,
      assignedBy: params.actor,
      // Travas que a flutuante empurrada vai ocupar (troca) não podem ser apagadas aqui.
      skipDeletePaths: claim.relocatedLockPaths,
    });
    if (params.extra) tx.set(bookingRef, params.extra, {merge: true});
    claim.commit(tx);
  });

  return {courtName: toCourtName};
}

export interface AssignInPlaceParams {
  bookingId: string;
  courtId: string;
  actor: CourtAssignmentActor;
  nowMs: number;
  checkFresh?: (fresh: DocumentData) => void;
  extra?: Record<string, unknown>;
}

/**
 * A quadra provisória vira a definitiva (recepção confirma, ou o atleta lê o QR dela): a reserva
 * passa a `assigned` e as travas dela deixam de flutuar — ninguém mais empurra essa reserva.
 */
export async function assignBookingInPlace(
  db: Firestore,
  params: AssignInPlaceParams,
): Promise<ChangeBookingCourtResult> {
  const {bookingId, courtId, actor, nowMs} = params;
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(bookingRef);
    if (!fresh.exists) throw new HttpsError("not-found", "Reserva não encontrada.");
    const data = fresh.data() as DocumentData;
    const courtName = str(data["courtName"]) || "Quadra";
    if (str(data["courtId"]) !== courtId) {
      throw new HttpsError("aborted", "A reserva mudou enquanto você definia a quadra. Tente de novo.");
    }
    const reason = courtChangeBlockReason(data, nowMs);
    if (reason) throw new HttpsError("failed-precondition", reason);
    params.checkFresh?.(data);
    if (data["allocationStatus"] !== "unassigned") {
      if (params.extra) tx.set(bookingRef, params.extra, {merge: true});
      return {changed: false, bookingId, courtId, courtName, assigned: false};
    }

    const lockIds = computeSlotLockIds({
      arenaId: str(data["arenaId"]),
      courtId,
      dateKey: parseDateKeyFromBooking(data["date"]) ?? "",
      startTime: str(data["startTime"]),
      endTime: str(data["endTime"]),
    });
    const locks: DocumentSnapshot[] = [];
    for (const id of lockIds) locks.push(await tx.get(db.collection(ARENA_SLOT_LOCKS).doc(id)));

    for (const lock of locks) {
      if (!lock.exists || lock.data()?.["bookingId"] !== bookingId) continue;
      const lockData = {...lock.data() as DocumentData};
      delete lockData["floating"];
      tx.set(lock.ref, lockData);
    }
    tx.set(bookingRef, {
      allocationStatus: "assigned",
      allocationSource: actor.source,
      allocatedAt: FieldValue.serverTimestamp(),
      allocatedBy: actor.uid,
      ...params.extra,
    }, {merge: true});
    return {changed: true, bookingId, courtId, courtName, assigned: true};
  });
}

export function courtChangedPushBody(booking: DocumentData, toCourtName: string, assigned = false): string {
  const startTime = str(booking["startTime"]);
  const arenaName = str(booking["arenaName"]) || "a arena";
  if (assigned) return `Sua quadra para as ${startTime} em ${arenaName}: ${toCourtName}.`;
  return `Sua reserva das ${startTime} em ${arenaName} agora é na ${toCourtName}.`;
}

/** "Clubinho X de sex, 14/11: Quadra 2 mudou para Quadra 4." Puro. */
export function clubCourtChangedPushBody(session: DocumentData, fromCourtName: string, toCourtName: string): string {
  const [, m, d] = str(session["date"]).split("-");
  const when = d && m ? ` de ${d}/${m}` : "";
  return `${str(session["clubName"]) || "Clubinho"}${when}: ${fromCourtName} mudou para ${toCourtName}.`;
}

/** Participantes confirmados e pendentes da sessão recebem o aviso da quadra nova. */
async function notifyClubCourtChange(db: Firestore, result: ChangeBookingCourtResult): Promise<void> {
  const booking = (await db.collection(ARENA_BOOKINGS).doc(result.bookingId).get()).data() ?? {};
  const sessionId = str(booking["clubSessionId"]);
  if (!sessionId) return;
  const sessionRef = db.collection(ARENA_CLUB_SESSIONS).doc(sessionId);
  const [session, participants] = await Promise.all([sessionRef.get(), sessionRef.collection(CLUB_PARTICIPANTS).get()]);
  const body = clubCourtChangedPushBody(session.data() ?? {}, result.fromCourtName ?? "A quadra", result.courtName);
  for (const p of participants.docs) {
    const status = str(p.data()["status"]);
    // Convidado sem conta (`guest_*`) não recebe push.
    if ((status !== "confirmed" && status !== "pending") || p.id.startsWith("guest_")) continue;
    const arenaId = str(booking["arenaId"]);
    await deliverNotificationToUser({
      userId: p.id,
      title: "Seu clubinho mudou de quadra",
      body,
      type: CLUB_COURT_CHANGED_PUSH_TYPE,
      data: {
        type: CLUB_COURT_CHANGED_PUSH_TYPE, clubSessionId: sessionId, arenaId,
        // `url` = rota do app; `webUrl` = portal do atleta.
        url: `/clubinho/${sessionId}`, webUrl: `/reservar/${arenaId}/clubinho/${sessionId}`,
      },
      requireInteraction: false,
    });
  }
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
    // Arena que só mostra a quadra na chegada: a recepção definiu antes, o atleta não é avisado.
    if (athleteId && athleteSeesBookingCourt(booking, Date.now())) {
      await deliverNotificationToUser({
        userId: athleteId,
        title: result.assigned ? "Sua quadra está definida" : "Sua quadra mudou",
        body: courtChangedPushBody(booking, result.courtName, result.assigned),
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
  try {
    await notifyClubCourtChange(db, result);
  } catch (e) {
    logger.warn("changeArenaBookingCourt: aviso aos participantes do clubinho falhou", e);
  }

  logger.info("changeArenaBookingCourt: quadra trocada", {
    bookingId: result.bookingId,
    toCourtId: result.courtId,
    by: uid,
  });
  return result;
});
