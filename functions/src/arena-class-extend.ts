/**
 * Emendar a aula (+1h): o professor estica uma aula da agenda em uma hora, na mesma quadra.
 *
 * A hora a mais ocupa a quadra como qualquer aula — trava por hora, `arenaSlots` e reserva da aula
 * esticados — e por isso desconta da capacidade do horário numa arena que define a quadra
 * (`docs/product/reservas-por-capacidade.md`). Reserva provisória (flutuante) na hora seguinte vai
 * para outra quadra livre; sem quadra livre, ou com reserva definida, bloqueio ou manutenção, **não
 * emenda** ("sem vaga, não marca").
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, type Firestore, type Transaction} from "firebase-admin/firestore";
import {ARENA_CLASS_SESSIONS} from "./arena-class-constants";
import {authorizeClassAction, classSessionStartAt, requireClassEntitlement, requireUid, str} from "./arena-class";
import {claimCourtLocks} from "./arena-floating-booking";
import {
  fmtHourEnd,
  fmtHourStart,
  hasBlockedSlotOverlap,
  lockRefsForOccurrence,
  toMinutes,
} from "./arena-recurring-booking";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";

/** Quanto uma emenda acrescenta. */
export const CLASS_EXTEND_MINUTES = 60;

const DAY_MINUTES = 24 * 60;

type Data = Record<string, unknown>;

export function fmtMinutes(total: number): string {
  if (total >= DAY_MINUTES) return "24:00";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Fim da aula em minutos do dia; "00:00"/"24:00" depois do início = meia-noite. */
function endMinutes(startTime: string, endTime: string): number {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return end <= start ? DAY_MINUTES : end;
}

/**
 * Por que esta aula não pode ser emendada agora, ou `null` se pode. Puro — a falta de vaga é
 * decidida depois, nas travas.
 */
export function classExtendBlockReason(session: Data, nowMs: number): string | null {
  const status = str(session["status"]);
  if (status === "canceled") return "Esta aula foi cancelada.";
  if (status === "completed") return "A chamada desta aula já foi fechada.";
  const date = str(session["date"]);
  const startTime = str(session["startTime"]);
  const endTime = str(session["endTime"]);
  if (!date || !startTime || !endTime) return "Esta aula não tem horário válido.";
  const end = endMinutes(startTime, endTime);
  if (end + CLASS_EXTEND_MINUTES > DAY_MINUTES) return "Não dá para emendar depois da meia-noite.";
  const endMs = classSessionStartAt(date, "00:00").getTime() + end * 60_000;
  if (nowMs >= endMs) return "Esta aula já terminou.";
  return null;
}

export interface ExtendClassSessionResult {
  sessionId: string;
  startTime: string;
  /** Fim novo. */
  endTime: string;
  /** Fim antes da emenda (início da hora a mais). */
  previousEndTime: string;
  /** Reservas provisórias que foram para outra quadra para abrir a vaga. */
  relocatedBookings: number;
}

function noVacancy(from: string, to: string): HttpsError {
  return new HttpsError(
    "failed-precondition",
    `Sem vaga das ${from} às ${to}: a quadra está ocupada e não há outra livre. A aula não foi emendada.`,
    {reason: "no_vacancy"},
  );
}

export async function extendClassSessionCore(
  db: Firestore,
  sessionId: string,
  nowMs: number,
): Promise<ExtendClassSessionResult> {
  const sessionRef = db.collection(ARENA_CLASS_SESSIONS).doc(sessionId);
  const snap = await sessionRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const session = snap.data() as Data;
  const blocked = classExtendBlockReason(session, nowMs);
  if (blocked) throw new HttpsError("failed-precondition", blocked);

  const arenaId = str(session["arenaId"]);
  const courtId = str(session["courtId"]);
  const startTime = str(session["startTime"]);
  const previousEndTime = str(session["endTime"]);
  const date = str(session["date"]);
  const fromMin = endMinutes(startTime, previousEndTime);
  const from = fmtMinutes(fromMin);
  const to = fmtMinutes(fromMin + CLASS_EXTEND_MINUTES);
  const extra = {arenaId, courtId, startTime: from, endTime: to};

  const courtSnap = await db.collection("arenas").doc(arenaId).collection("courts").doc(courtId).get();
  const court = courtSnap.data() ?? {};
  if (court["status"] === "maintenance" || court["maintenance"] === true) {
    throw new HttpsError("failed-precondition", "A quadra desta aula está em manutenção. A aula não foi emendada.",
      {reason: "no_vacancy"});
  }
  // Bloqueio do gestor (manutenção, evento, torneio) na hora a mais.
  if (await hasBlockedSlotOverlap(db, extra, date)) throw noVacancy(from, to);

  const locks = lockRefsForOccurrence(db, extra, date);
  const bookingId = str(session["blockBookingId"]) || sessionId;
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const slotRef = db.collection(ARENA_SLOTS).doc(bookingId);

  const relocated = await db.runTransaction(async (tx: Transaction) => {
    const fresh = await tx.get(sessionRef);
    if (!fresh.exists) throw new HttpsError("not-found", "Aula não encontrada.");
    const freshData = fresh.data() as Data;
    if (str(freshData["endTime"]) !== previousEndTime) {
      throw new HttpsError("aborted", "A aula mudou enquanto você emendava. Abra a aula de novo.");
    }
    const freshBlock = classExtendBlockReason(freshData, nowMs);
    if (freshBlock) throw new HttpsError("failed-precondition", freshBlock);
    const bookingSnap = await tx.get(bookingRef);
    const slotSnap = await tx.get(slotRef);

    // A hora em que a aula já está (fim quebrado, ex. 19:30) é dela; a flutuante vai embora.
    const claim = await claimCourtLocks(tx, db, {arenaId, courtId, lockRefs: locks.map((l) => l.ref)},
      {ownBookingId: bookingId, reason: "Quadra ocupada pela aula emendada"});
    if (!claim.ok) throw noVacancy(from, to);
    claim.commit(tx);

    for (const lock of locks) {
      tx.set(lock.ref, {
        arenaId,
        courtId,
        date,
        startTime: fmtHourStart(lock.hour),
        endTime: fmtHourEnd(lock.hour),
        bookingId,
        bookingAthleteId: null,
        classSessionId: sessionId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    const extension = {
      extendedMinutes: FieldValue.increment(CLASS_EXTEND_MINUTES),
      extendedAt: FieldValue.serverTimestamp(),
    };
    tx.set(sessionRef, {endTime: to, ...extension}, {merge: true});
    if (bookingSnap.exists) tx.set(bookingRef, {endTime: to, ...extension}, {merge: true});
    if (slotSnap.exists && slotSnap.data()?.["bookingId"] === bookingId) {
      tx.set(slotRef, {endTime: to}, {merge: true});
    }
    return claim.relocations.length;
  });

  return {sessionId, startTime, endTime: to, previousEndTime, relocatedBookings: relocated};
}

export const extendArenaClassSession = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const sessionId = str((request.data as Data | undefined)?.["sessionId"]);
  if (!sessionId) throw new HttpsError("invalid-argument", "Aula inválida.");
  const db = getFirestore();
  const snap = await db.collection(ARENA_CLASS_SESSIONS).doc(sessionId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const session = snap.data() as Data;
  const {role, arenaData} = await authorizeClassAction(
    db, str(session["arenaId"]), [str(session["teacherUserId"]) || null], uid, "canScheduleLessons",
  );
  requireClassEntitlement(arenaData);
  const result = await extendClassSessionCore(db, sessionId, Date.now());
  logger.info("extendArenaClassSession: aula emendada", {...result, role, by: uid});
  return result;
});
