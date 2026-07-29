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

export const ARENA_RECURRING_BOOKINGS = "arenaRecurringBookings";
const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";

/** Horizonte rolante de materialização (dias). Deve exceder os 21 dias
 * visíveis na grade do atleta (`slots_page_providers.dart`). */
export const RECURRING_HORIZON_DAYS = 35;

/** Limite de séries ativas para arenas sem plano pago (Essencial). */
export const ESSENCIAL_MAX_ACTIVE_RECURRING = 3;

const ARENA_TIMEZONE_OFFSET = "-03:00";

export interface RecurringSeriesData {
  arenaId: string;
  arenaName: string;
  courtId: string;
  courtName: string;
  /** ISO: 1 = segunda … 7 = domingo (igual a `DateTime.weekday` do Dart). */
  weekday: number;
  startTime: string;
  endTime: string;
  athleteId: string | null;
  customerName: string | null;
  amountReais: number;
  status: string;
  startDate: string;
  endDate: string | null;
  skippedDates: string[];
}

/** Reconstrói `RecurringSeriesData` a partir do doc cru de `arenaRecurringBookings`
 *  — usado tanto pelo scheduler diário quanto por `resumeArenaRecurringBooking`. */
export function parseRecurringSeriesData(data: Record<string, unknown>): RecurringSeriesData {
  return {
    arenaId: String(data["arenaId"] ?? ""),
    arenaName: String(data["arenaName"] ?? "Arena"),
    courtId: String(data["courtId"] ?? ""),
    courtName: String(data["courtName"] ?? "Quadra"),
    weekday: Number(data["weekday"] ?? 0),
    startTime: String(data["startTime"] ?? ""),
    endTime: String(data["endTime"] ?? ""),
    athleteId: typeof data["athleteId"] === "string" ? data["athleteId"] : null,
    customerName: typeof data["customerName"] === "string" ? data["customerName"] : null,
    amountReais: Number(data["amountReais"] ?? 0),
    status: String(data["status"] ?? ""),
    startDate: String(data["startDate"] ?? ""),
    endDate: typeof data["endDate"] === "string" ? data["endDate"] : null,
    skippedDates: Array.isArray(data["skippedDates"]) ?
      (data["skippedDates"] as unknown[]).map(String) :
      [],
  };
}

// ---------------------------------------------------------------------------
// Helpers puros (exportados para testes)
// ---------------------------------------------------------------------------

export function toMinutes(hhmm: string): number {
  const parts = hhmm.trim().split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parts.length > 1 ? parseInt(parts[1] ?? "0", 10) : 0;
  return h * 60 + m;
}

export function calendarHoursSpanning(startMin: number, endMin: number): number[] {
  if (endMin <= startMin) return [];
  const startH = Math.floor(startMin / 60);
  const endH = Math.floor((endMin - 1) / 60);
  const hours: number[] = [];
  for (let h = startH; h <= endH; h++) hours.push(h);
  return hours;
}

export function fmtHourStart(h: number): string {
  return `${Math.min(23, Math.max(0, h)).toString().padStart(2, "0")}:00`;
}

export function fmtHourEnd(h: number): string {
  if (h >= 23) return "24:00";
  return `${(h + 1).toString().padStart(2, "0")}:00`;
}

function safeIdPart(s: string): string {
  return s.replace(/\//g, "_");
}

export function isValidDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  return !Number.isNaN(new Date(`${dateKey}T12:00:00Z`).getTime());
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Dia da semana ISO (1 = segunda … 7 = domingo) de um `YYYY-MM-DD`. */
export function isoWeekdayOfDateKey(dateKey: string): number {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay(); // 0=dom … 6=sáb
  return ((day + 6) % 7) + 1;
}

/** ID determinístico da ocorrência — garante idempotência da materialização. */
export function occurrenceBookingId(seriesId: string, dateKey: string): string {
  return `rec_${safeIdPart(seriesId)}_${dateKey}`;
}

/**
 * Datas da série em `(fromExclusive, untilInclusive]`, respeitando
 * `startDate`, `endDate` e `skippedDates`.
 */
export function occurrenceDatesBetween(
  series: Pick<RecurringSeriesData, "weekday" | "startDate" | "endDate" | "skippedDates">,
  fromExclusive: string,
  untilInclusive: string,
): string[] {
  const skipped = new Set(series.skippedDates ?? []);
  const first = series.startDate > fromExclusive ?
    series.startDate :
    addDaysToDateKey(fromExclusive, 1);
  const last = series.endDate && series.endDate < untilInclusive ?
    series.endDate :
    untilInclusive;

  const dates: string[] = [];
  for (let d = first; d <= last; d = addDaysToDateKey(d, 1)) {
    if (isoWeekdayOfDateKey(d) !== series.weekday) continue;
    if (skipped.has(d)) continue;
    dates.push(d);
  }
  return dates;
}

export const WEEKDAY_LABELS_PT: Record<number, string> = {
  1: "segunda-feira",
  2: "terça-feira",
  3: "quarta-feira",
  4: "quinta-feira",
  5: "sexta-feira",
  6: "sábado",
  7: "domingo",
};

// ---------------------------------------------------------------------------
// Materialização (compartilhada entre callable e scheduler)
// ---------------------------------------------------------------------------

export function lockRefsForOccurrence(
  db: Firestore,
  series: Pick<RecurringSeriesData, "arenaId" | "courtId" | "startTime" | "endTime">,
  dateKey: string,
) {
  const startMin = toMinutes(series.startTime);
  let endMin = toMinutes(series.endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  const hours = calendarHoursSpanning(startMin, endMin);
  const safeArena = safeIdPart(series.arenaId);
  const safeCourt = safeIdPart(series.courtId);
  return hours.map((h) => ({
    hour: h,
    ref: db
      .collection(ARENA_SLOT_LOCKS)
      .doc(`${safeArena}_${safeCourt}_${dateKey}_h${h.toString().padStart(2, "0")}`),
  }));
}

/** Slots `blocked` da quadra no dia — cobre docs com `date` string e Timestamp
 * (bloqueios criados pelo app gravam Timestamp; functions gravam string). */
export async function hasBlockedSlotOverlap(
  db: Firestore,
  series: Pick<RecurringSeriesData, "arenaId" | "courtId" | "startTime" | "endTime">,
  dateKey: string,
): Promise<boolean> {
  try {
    const base = db
      .collection(ARENA_SLOTS)
      .where("arenaId", "==", series.arenaId)
      .where("courtId", "==", series.courtId);

    const dayStart = new Date(`${dateKey}T00:00:00${ARENA_TIMEZONE_OFFSET}`);
    const dayEnd = new Date(`${dateKey}T23:59:59${ARENA_TIMEZONE_OFFSET}`);

    const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    const seen = new Set<string>();

    const pushUnique = (snap: FirebaseFirestore.QueryDocumentSnapshot) => {
      if (!seen.has(snap.id)) {
        seen.add(snap.id);
        docs.push(snap);
      }
    };

    try {
      const byString = await base.where("date", "==", dateKey).get();
      for (const doc of byString.docs) pushUnique(doc);
    } catch (e) {
      logger.warn("hasBlockedSlotOverlap: query date string falhou", {dateKey, error: e});
    }

    try {
      const byTimestamp = await base
        .where("date", ">=", Timestamp.fromDate(dayStart))
        .where("date", "<=", Timestamp.fromDate(dayEnd))
        .get();
      for (const doc of byTimestamp.docs) pushUnique(doc);
    } catch (e) {
      logger.warn("hasBlockedSlotOverlap: query date Timestamp falhou", {dateKey, error: e});
    }

    const startMin = toMinutes(series.startTime);
    let endMin = toMinutes(series.endTime);
    if (endMin === 0 && startMin > 0) endMin = 24 * 60;

    for (const doc of docs) {
      const data = doc.data();
      const status = String(data["status"] ?? "").toLowerCase();
      if (status !== "blocked" && status !== "bloqueado") continue;
      const slotStart = toMinutes(String(data["startTime"] ?? "00:00"));
      let slotEnd = toMinutes(String(data["endTime"] ?? "00:00"));
      if (slotEnd === 0 && slotStart > 0) slotEnd = 24 * 60;
      if (slotStart < endMin && slotEnd > startMin) return true;
    }
    return false;
  } catch (e) {
    logger.warn("hasBlockedSlotOverlap: falha geral, segue sem bloqueio prévio", {
      dateKey,
      error: e,
    });
    return false;
  }
}

export interface MaterializeResult {
  createdDates: string[];
  skippedDates: string[];
}

/**
 * Materializa as ocorrências da série como `arenaBookings` normais
 * (+ `arenaSlots` + `arenaSlotLocks`), uma transação por data.
 * Conflito (lock existente ou slot bloqueado) → data vai para `skippedDates`.
 */
export async function materializeSeriesOccurrences(
  db: Firestore,
  seriesId: string,
  series: RecurringSeriesData,
  fromExclusive: string,
  untilInclusive: string,
): Promise<MaterializeResult> {
  const createdDates: string[] = [];
  const skippedDates: string[] = [];

  for (const dateKey of occurrenceDatesBetween(series, fromExclusive, untilInclusive)) {
    const bookingRef = db.collection(ARENA_BOOKINGS).doc(occurrenceBookingId(seriesId, dateKey));
    const slotRef = db.collection(ARENA_SLOTS).doc(occurrenceBookingId(seriesId, dateKey));
    const locks = lockRefsForOccurrence(db, series, dateKey);
    if (locks.length === 0) continue;

    const blocked = await hasBlockedSlotOverlap(db, series, dateKey);
    if (blocked) {
      skippedDates.push(dateKey);
      continue;
    }

    const startAt = new Date(`${dateKey}T${series.startTime}:00${ARENA_TIMEZONE_OFFSET}`);
    const confirmationDeadline = new Date(startAt.getTime() - 2 * 60 * 60 * 1000);

    try {
      const outcome = await db.runTransaction(async (tx: Transaction) => {
        const existing = await tx.get(bookingRef);
        if (existing.exists) {
          const existingStatus = String(existing.data()?.["status"] ?? "").toLowerCase();
          if (existingStatus !== "cancelled") return "exists";
          // Doc existe mas foi liberado por cancelFutureOccurrences (edição/
          // retomada da mesma série) — sobrescreve com a config nova em vez
          // de bloquear.
        }
        for (const lock of locks) {
          const snap = await tx.get(lock.ref);
          if (snap.exists) return "conflict";
        }

        tx.set(bookingRef, {
          athleteId: series.athleteId,
          arenaId: series.arenaId,
          arenaName: series.arenaName,
          courtId: series.courtId,
          courtName: series.courtName,
          customerName: series.customerName,
          date: dateKey,
          startTime: series.startTime,
          endTime: series.endTime,
          amountReais: series.amountReais,
          amountToPayNowReais: 0,
          amountPaidOnlineReais: 0,
          amountDueOnsiteReais: series.amountReais,
          paymentChannel: "onsite",
          paymentReceiver: null,
          paymentFraction: null,
          paymentStatus: "none",
          status: "active",
          attendanceConfirmed: false,
          attendanceStatus: "pending",
          confirmationDeadline: Timestamp.fromDate(confirmationDeadline),
          paymentExpiresAt: null,
          source: "platform",
          isRecurring: true,
          recurringBookingId: seriesId,
          createdByRole: "arena_manager",
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.set(slotRef, {
          arenaId: series.arenaId,
          courtId: series.courtId,
          // String YYYY-MM-DD — alinhado a arenaBookings (evita deslocamento UTC no app).
          date: dateKey,
          dateKey,
          startTime: series.startTime,
          endTime: series.endTime,
          status: "booked",
          bookingAthleteId: series.athleteId,
          bookingId: bookingRef.id,
          isRecurring: true,
          recurringBookingId: seriesId,
          priceReais: series.amountReais,
          createdAt: FieldValue.serverTimestamp(),
        });

        for (const lock of locks) {
          tx.set(lock.ref, {
            arenaId: series.arenaId,
            courtId: series.courtId,
            date: dateKey,
            startTime: fmtHourStart(lock.hour),
            endTime: fmtHourEnd(lock.hour),
            bookingId: bookingRef.id,
            bookingAthleteId: series.athleteId,
            recurringBookingId: seriesId,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        return "created";
      });

      if (outcome === "created") createdDates.push(dateKey);
      if (outcome === "conflict") skippedDates.push(dateKey);
    } catch (e) {
      logger.error("materializeSeriesOccurrences: transação falhou", {
        seriesId,
        dateKey,
        error: e,
      });
      skippedDates.push(dateKey);
    }
  }

  return {createdDates, skippedDates};
}

/**
 * Cancela as ocorrências futuras (ainda não iniciadas) de uma série:
 * booking → `cancelled` e libera `arenaSlots` + `arenaSlotLocks`.
 */
export async function cancelFutureOccurrences(
  db: Firestore,
  seriesId: string,
  cancelReason: string,
): Promise<string[]> {
  const now = new Date();
  const todayKey = dayKeyFromEventDate(now);
  const snap = await db
    .collection(ARENA_BOOKINGS)
    .where("recurringBookingId", "==", seriesId)
    .get();

  const canceledDates: string[] = [];
  const batch = db.batch();

  for (const doc of snap.docs) {
    const data = doc.data();
    const dateKey = String(data["date"] ?? "");
    if (dateKey < todayKey) continue;

    const status = String(data["status"] ?? "").toLowerCase();
    if (status !== "active" && status !== "confirmed") continue;

    const startTime = String(data["startTime"] ?? "");
    const startAt = new Date(`${dateKey}T${startTime}:00${ARENA_TIMEZONE_OFFSET}`);
    if (!Number.isNaN(startAt.getTime()) && startAt.getTime() <= now.getTime()) {
      continue; // já começou/passou — preserva histórico
    }

    batch.set(doc.ref, {
      status: "cancelled",
      canceledAt: FieldValue.serverTimestamp(),
      canceledByRole: "arena_manager",
      cancelReason,
    }, {merge: true});

    batch.delete(db.collection(ARENA_SLOTS).doc(occurrenceBookingId(seriesId, dateKey)));

    const series = {
      arenaId: String(data["arenaId"] ?? ""),
      courtId: String(data["courtId"] ?? ""),
      startTime,
      endTime: String(data["endTime"] ?? ""),
    };
    for (const lock of lockRefsForOccurrence(db, series, dateKey)) {
      batch.delete(lock.ref);
    }
    canceledDates.push(dateKey);
  }

  if (canceledDates.length > 0) await batch.commit();
  return canceledDates;
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
      "Apenas o gestor da arena pode gerenciar horários fixos.",
    );
  }
  return arenaData;
}

/**
 * Confere que a quadra existe e, se houver atleta vinculado, que o usuário
 * existe — validação comum a criar e editar horário fixo. Lança
 * HttpsError("not-found", ...) no primeiro problema encontrado.
 */
async function resolveCourtAndAthlete(
  db: Firestore,
  arenaId: string,
  courtId: string,
  athleteId: string | null,
): Promise<{courtName: string}> {
  const courtSnap = await db
    .collection("arenas").doc(arenaId)
    .collection("courts").doc(courtId)
    .get();
  if (!courtSnap.exists) {
    throw new HttpsError("not-found", "Quadra não encontrada.");
  }
  if (athleteId != null) {
    const userSnap = await db.collection("users").doc(athleteId).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Atleta vinculado não encontrado.");
    }
  }
  const courtData = courtSnap.data() as Record<string, unknown>;
  const courtName = typeof courtData["name"] === "string" ?
    (courtData["name"] as string).trim() || "Quadra" :
    "Quadra";
  return {courtName};
}

async function notifyLinkedAthleteSafe(input: {
  athleteId: string | null;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
}): Promise<void> {
  const athleteId = input.athleteId?.trim();
  if (!athleteId) return;
  try {
    await deliverNotificationToUser({
      userId: athleteId,
      title: input.title,
      body: input.body,
      type: input.type,
      data: input.data,
      requireInteraction: false,
    });
  } catch (e) {
    logger.warn("arena-recurring: notificação ao atleta falhou", e);
  }
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

export interface RawRecurringInput {
  arenaId?: string;
  courtId?: string;
  weekday?: number;
  startTime?: string;
  endTime?: string;
  athleteId?: string;
  customerName?: string;
  amountReais?: number;
  startDate?: string;
  endDate?: string;
  paymentType?: string;
}

export interface ValidatedRecurringInput {
  arenaId: string;
  courtId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  athleteId: string | null;
  customerName: string | null;
  amountReais: number;
  startDate: string;
  endDate: string | null;
  paymentType: "per_occurrence" | "monthly";
}

/**
 * Valida e normaliza o payload comum a criar/editar horário fixo. Lança
 * HttpsError("invalid-argument", ...) no primeiro problema encontrado.
 * `allowPastStartDate` é usado pela edição: uma série já iniciada tem
 * `startDate` no passado por natureza, e reenviar o mesmo valor não deve
 * ser rejeitado.
 */
export function validateRecurringInput(
  input: RawRecurringInput,
  todayKey: string,
  opts: {allowPastStartDate?: boolean} = {},
): ValidatedRecurringInput {
  const arenaId = input.arenaId?.trim() ?? "";
  const courtId = input.courtId?.trim() ?? "";
  const weekday = Number(input.weekday);
  const startTime = input.startTime?.trim() ?? "";
  const endTime = input.endTime?.trim() ?? "";
  const athleteId = input.athleteId?.trim() || null;
  const customerName = input.customerName?.trim() || null;
  const amountReais = Number(input.amountReais);
  const startDate = input.startDate?.trim() || todayKey;
  const endDate = input.endDate?.trim() || null;
  const paymentType: "per_occurrence" | "monthly" = input.paymentType === "monthly" ? "monthly" : "per_occurrence";

  if (!arenaId || !courtId) {
    throw new HttpsError("invalid-argument", "Arena e quadra são obrigatórias.");
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
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
  if (!Number.isFinite(amountReais) || amountReais <= 0) {
    throw new HttpsError("invalid-argument", "Informe o valor por ocorrência.");
  }
  if (!isValidDateKey(startDate) || (!opts.allowPastStartDate && startDate < todayKey)) {
    throw new HttpsError("invalid-argument", "Data de início inválida.");
  }
  if (endDate != null && (!isValidDateKey(endDate) || endDate < startDate)) {
    throw new HttpsError("invalid-argument", "Data de término inválida.");
  }
  if (!athleteId && !customerName) {
    throw new HttpsError("invalid-argument", "Vincule um atleta ou informe o nome do mensalista.");
  }
  if (customerName != null && customerName.length > 80) {
    throw new HttpsError("invalid-argument", "Nome do mensalista muito longo.");
  }

  return {arenaId, courtId, weekday, startTime, endTime, athleteId, customerName, amountReais, startDate, endDate, paymentType};
}

export const createArenaRecurringBooking = onCall(async (request) => {
  try {
    return await createArenaRecurringBookingHandler(request);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("createArenaRecurringBooking: falha inesperada", e);
    throw new HttpsError(
      "internal",
      "Não foi possível criar o horário fixo. Tente novamente em instantes.",
    );
  }
});

async function createArenaRecurringBookingHandler(
  request: Parameters<Parameters<typeof onCall>[0]>[0],
) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const input = (request.data ?? {}) as RawRecurringInput;
  const todayKey = dayKeyFromEventDate(new Date());
  const {
    arenaId, courtId, weekday, startTime, endTime,
    athleteId, customerName, amountReais, startDate, endDate, paymentType,
  } = validateRecurringInput(input, todayKey);

  const db = getFirestore();
  const arenaData = await requireArenaManager(db, arenaId, uid);

  const {courtName} = await resolveCourtAndAthlete(db, arenaId, courtId, athleteId);

  // Gate de plano: Essencial (sem titularidade Pro/Parceiro) tem limite de séries ativas.
  if (!isArenaEntitledPro(arenaData, Date.now())) {
    // Pausada continua contando na cota — senão dá pra "furar" o limite
    // pausando uma série sem liberar de fato o slot do plano.
    const activeCount = await db
      .collection(ARENA_RECURRING_BOOKINGS)
      .where("arenaId", "==", arenaId)
      .where("status", "in", ["active", "paused"])
      .count()
      .get();
    if (activeCount.data().count >= ESSENCIAL_MAX_ACTIVE_RECURRING) {
      throw new HttpsError(
        "resource-exhausted",
        `Seu plano permite até ${ESSENCIAL_MAX_ACTIVE_RECURRING} horários fixos ativos. ` +
        "Faça upgrade para criar mais.",
      );
    }
  }

  const arenaName = typeof arenaData["name"] === "string" ?
    (arenaData["name"] as string).trim() || "Arena" :
    "Arena";

  const series: RecurringSeriesData = {
    arenaId,
    arenaName,
    courtId,
    courtName,
    weekday,
    startTime,
    endTime,
    athleteId,
    customerName,
    amountReais,
    status: "active",
    startDate,
    endDate,
    skippedDates: [],
  };

  const horizonKey = addDaysToDateKey(todayKey, RECURRING_HORIZON_DAYS);
  const seriesRef = db.collection(ARENA_RECURRING_BOOKINGS).doc();

  await seriesRef.set({
    ...series,
    paymentType,
    pausedAt: null,
    // Antes da materialização: o scheduler completa se algo falhar no meio.
    materializedUntil: addDaysToDateKey(todayKey, -1),
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    canceledAt: null,
    cancelReason: null,
  });

  const result = await materializeSeriesOccurrences(
    db,
    seriesRef.id,
    series,
    addDaysToDateKey(todayKey, -1),
    horizonKey,
  );

  await seriesRef.set({
    materializedUntil: horizonKey,
    skippedDates: result.skippedDates.length > 0 ?
      FieldValue.arrayUnion(...result.skippedDates) :
      [],
  }, {merge: true});

  await notifyLinkedAthleteSafe({
    athleteId,
    title: "Horário fixo confirmado 🎾",
    body: `Toda ${WEEKDAY_LABELS_PT[weekday]}, ${startTime} - ${endTime} · ` +
      `${courtName} · ${arenaName}`,
    type: "recurring_booking_created",
    data: {recurringBookingId: seriesRef.id, arenaId},
  });

  logger.info("createArenaRecurringBooking: série criada", {
    seriesId: seriesRef.id,
    arenaId,
    created: result.createdDates.length,
    skipped: result.skippedDates.length,
  });

  return {
    seriesId: seriesRef.id,
    createdDates: result.createdDates,
    skippedDates: result.skippedDates,
  };
}

interface CancelSeriesInput {
  seriesId?: string;
  reason?: string;
}

export const cancelArenaRecurringBooking = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as CancelSeriesInput;
  const seriesId = input.seriesId?.trim() ?? "";
  if (!seriesId) {
    throw new HttpsError("invalid-argument", "Horário fixo inválido.");
  }

  const db = getFirestore();
  const seriesRef = db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId);
  const seriesSnap = await seriesRef.get();
  if (!seriesSnap.exists) {
    throw new HttpsError("not-found", "Horário fixo não encontrado.");
  }
  const seriesData = seriesSnap.data() as Record<string, unknown>;
  const arenaId = String(seriesData["arenaId"] ?? "");
  await requireArenaManager(db, arenaId, uid);

  const currentStatus = String(seriesData["status"] ?? "");
  if (currentStatus !== "active" && currentStatus !== "paused") {
    throw new HttpsError("failed-precondition", "Este horário fixo já foi encerrado.");
  }

  const reason = input.reason?.trim().slice(0, 500) || null;
  await seriesRef.set({
    status: "canceled",
    canceledAt: FieldValue.serverTimestamp(),
    cancelReason: reason,
  }, {merge: true});

  const canceledDates = await cancelFutureOccurrences(
    db,
    seriesId,
    "recurring_series_canceled",
  );

  await notifyLinkedAthleteSafe({
    athleteId: (seriesData["athleteId"] as string | null) ?? null,
    title: "Horário fixo encerrado",
    body: `Seu horário fixo em ${String(seriesData["arenaName"] ?? "Arena")} foi ` +
      "encerrado pela arena. As reservas futuras foram canceladas.",
    type: "recurring_booking_canceled",
    data: {recurringBookingId: seriesId, arenaId},
  });

  logger.info("cancelArenaRecurringBooking: série encerrada", {
    seriesId,
    arenaId,
    canceledOccurrences: canceledDates.length,
  });

  return {seriesId, canceledDates};
});

interface CancelOccurrenceInput {
  bookingId?: string;
  reason?: string;
}

export const cancelArenaRecurringOccurrence = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as CancelOccurrenceInput;
  const bookingId = input.bookingId?.trim() ?? "";
  if (!bookingId) {
    throw new HttpsError("invalid-argument", "Reserva inválida.");
  }

  const db = getFirestore();
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada.");
  }
  const booking = bookingSnap.data() as Record<string, unknown>;
  const seriesId = String(booking["recurringBookingId"] ?? "");
  if (!seriesId) {
    throw new HttpsError(
      "failed-precondition",
      "Esta reserva não pertence a um horário fixo.",
    );
  }
  const arenaId = String(booking["arenaId"] ?? "");
  await requireArenaManager(db, arenaId, uid);

  const status = String(booking["status"] ?? "").toLowerCase();
  if (status !== "active" && status !== "confirmed") {
    throw new HttpsError("failed-precondition", "Esta reserva não está ativa.");
  }

  const dateKey = String(booking["date"] ?? "");
  const reason = input.reason?.trim().slice(0, 500) || null;

  const batch = db.batch();
  batch.set(bookingRef, {
    status: "cancelled",
    canceledAt: FieldValue.serverTimestamp(),
    canceledByRole: "arena_manager",
    cancelReason: reason ?? "recurring_occurrence_canceled",
  }, {merge: true});
  batch.delete(db.collection(ARENA_SLOTS).doc(occurrenceBookingId(seriesId, dateKey)));
  const lockSeries = {
    arenaId,
    courtId: String(booking["courtId"] ?? ""),
    startTime: String(booking["startTime"] ?? ""),
    endTime: String(booking["endTime"] ?? ""),
  };
  for (const lock of lockRefsForOccurrence(db, lockSeries, dateKey)) {
    batch.delete(lock.ref);
  }
  // Registra a exceção na série (visível no detalhe; a recriação já é
  // impedida pelo doc determinístico da ocorrência, que permanece cancelado).
  batch.set(db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId), {
    skippedDates: FieldValue.arrayUnion(dateKey),
  }, {merge: true});
  await batch.commit();

  await notifyLinkedAthleteSafe({
    athleteId: (booking["athleteId"] as string | null) ?? null,
    title: "Reserva do horário fixo cancelada",
    body: `A reserva de ${dateKey.split("-").reverse().join("/")} às ` +
      `${String(booking["startTime"] ?? "")} em ` +
      `${String(booking["arenaName"] ?? "Arena")} foi cancelada pela arena.`,
    type: "recurring_occurrence_canceled",
    data: {recurringBookingId: seriesId, bookingId, arenaId},
  });

  return {bookingId, seriesId, dateKey};
});

interface UpdateSeriesInput extends RawRecurringInput {
  seriesId?: string;
}

export const updateArenaRecurringBooking = onCall(async (request) => {
  try {
    return await updateArenaRecurringBookingHandler(request);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("updateArenaRecurringBooking: falha inesperada", e);
    throw new HttpsError(
      "internal",
      "Não foi possível salvar as alterações. Tente novamente em instantes.",
    );
  }
});

async function updateArenaRecurringBookingHandler(
  request: Parameters<Parameters<typeof onCall>[0]>[0],
) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const input = (request.data ?? {}) as UpdateSeriesInput;
  const seriesId = input.seriesId?.trim() ?? "";
  if (!seriesId) {
    throw new HttpsError("invalid-argument", "Horário fixo inválido.");
  }

  const db = getFirestore();
  const seriesRef = db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId);
  const seriesSnap = await seriesRef.get();
  if (!seriesSnap.exists) {
    throw new HttpsError("not-found", "Horário fixo não encontrado.");
  }
  const currentData = seriesSnap.data() as Record<string, unknown>;
  const currentStatus = String(currentData["status"] ?? "");
  if (currentStatus !== "active" && currentStatus !== "paused") {
    throw new HttpsError(
      "failed-precondition",
      "Este horário fixo já foi encerrado e não pode ser editado.",
    );
  }
  // arenaId sempre vem do doc já existente, nunca do payload do client
  // (evita um client mal-intencionado tentar editar sob outra arena).
  const arenaId = String(currentData["arenaId"] ?? "");
  await requireArenaManager(db, arenaId, uid);

  const todayKey = dayKeyFromEventDate(new Date());
  const validated = validateRecurringInput({...input, arenaId}, todayKey, {allowPastStartDate: true});

  const {courtName} = await resolveCourtAndAthlete(db, arenaId, validated.courtId, validated.athleteId);
  const arenaName = String(currentData["arenaName"] ?? "Arena");
  // Datas canceladas individualmente via cancelArenaRecurringOccurrence
  // precisam sobreviver à edição — do contrário a materialização recria a
  // ocorrência que o gestor cancelou de propósito.
  const carriedSkippedDates: string[] = Array.isArray(currentData["skippedDates"]) ?
    (currentData["skippedDates"] as unknown[]).map(String) :
    [];

  const series: RecurringSeriesData = {
    arenaId,
    arenaName,
    courtId: validated.courtId,
    courtName,
    weekday: validated.weekday,
    startTime: validated.startTime,
    endTime: validated.endTime,
    athleteId: validated.athleteId,
    customerName: validated.customerName,
    amountReais: validated.amountReais,
    status: currentStatus,
    startDate: validated.startDate,
    endDate: validated.endDate,
    skippedDates: carriedSkippedDates,
  };

  const todayMinusOne = addDaysToDateKey(todayKey, -1);
  const horizonKey = addDaysToDateKey(todayKey, RECURRING_HORIZON_DAYS);

  let canceledDates: string[] = [];
  let createdDates: string[] = [];
  let skippedDates: string[] = [];

  if (currentStatus === "active") {
    // Grava a config nova já ANTES de cancelar/materializar, com
    // `materializedUntil` propositalmente desatualizado — mesmo padrão de
    // createArenaRecurringBookingHandler. Se cancelFutureOccurrences ou
    // materializeSeriesOccurrences falhar no meio, o cron
    // (`materializeArenaRecurringBookings`, filtro `materializedUntil <
    // horizonKey`) retoma a série depois, já com a config nova.
    await seriesRef.set({
      ...series,
      paymentType: validated.paymentType,
      materializedUntil: todayMinusOne,
    }, {merge: true});

    // Config antiga sai da agenda, config nova entra — garante que nenhuma
    // ocorrência futura fica com dia/horário/quadra/valor desatualizados.
    canceledDates = await cancelFutureOccurrences(db, seriesId, "recurring_series_updated");
    const result = await materializeSeriesOccurrences(db, seriesId, series, todayMinusOne, horizonKey);
    createdDates = result.createdDates;
    // O que é PERSISTIDO no doc é só o que já estava lá (cancelamentos
    // deliberados via cancelArenaRecurringOccurrence) — os conflitos desta
    // rodada de materialização (`result.skippedDates`) são transitórios (o
    // horário estava travado naquele instante) e não podem ser excluídos
    // para sempre, senão a próxima edição/retomada nunca mais tenta essa
    // data de novo. O RETORNO ao chamador ainda reporta os conflitos desta
    // rodada, para feedback imediato na UI.
    skippedDates = result.skippedDates;

    await seriesRef.set({
      materializedUntil: horizonKey,
      skippedDates: carriedSkippedDates,
    }, {merge: true});
  } else {
    // Se `paused`: só os campos da série mudam agora — a rematerialização
    // acontece em resumeArenaRecurringBooking, com a config já atualizada.
    // Nenhuma operação multi-etapa acontece aqui, então um único write basta.
    skippedDates = carriedSkippedDates;
    await seriesRef.set({
      ...series,
      paymentType: validated.paymentType,
      skippedDates,
      materializedUntil: String(currentData["materializedUntil"] ?? todayMinusOne),
    }, {merge: true});
  }

  // Editar pode mover a reserva confirmada do atleta pra outro dia/horário/
  // quadra/valor — dispara tanto ativo quanto pausado, o atleta precisa
  // saber da mudança de config independente do estado atual da série.
  await notifyLinkedAthleteSafe({
    athleteId: validated.athleteId,
    title: "Horário fixo atualizado",
    body: `Seu horário fixo em ${arenaName} foi atualizado pela arena. ` +
      "Confira os novos detalhes.",
    type: "recurring_booking_updated",
    data: {recurringBookingId: seriesId, arenaId},
  });

  logger.info("updateArenaRecurringBooking: série atualizada", {
    seriesId,
    arenaId,
    status: currentStatus,
    canceled: canceledDates.length,
    created: createdDates.length,
    skipped: skippedDates.length,
  });

  return {seriesId, canceledDates, createdDates, skippedDates};
}

interface PauseSeriesInput {
  seriesId?: string;
  reason?: string;
}

export const pauseArenaRecurringBooking = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as PauseSeriesInput;
  const seriesId = input.seriesId?.trim() ?? "";
  if (!seriesId) {
    throw new HttpsError("invalid-argument", "Horário fixo inválido.");
  }

  const db = getFirestore();
  const seriesRef = db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId);
  const seriesSnap = await seriesRef.get();
  if (!seriesSnap.exists) {
    throw new HttpsError("not-found", "Horário fixo não encontrado.");
  }
  const seriesData = seriesSnap.data() as Record<string, unknown>;
  const arenaId = String(seriesData["arenaId"] ?? "");
  await requireArenaManager(db, arenaId, uid);

  if (String(seriesData["status"]) !== "active") {
    throw new HttpsError("failed-precondition", "Só é possível pausar um horário fixo ativo.");
  }

  const reason = input.reason?.trim().slice(0, 500) || null;
  await seriesRef.set({
    status: "paused",
    pausedAt: FieldValue.serverTimestamp(),
    pauseReason: reason,
  }, {merge: true});

  const releasedDates = await cancelFutureOccurrences(db, seriesId, "recurring_series_paused");

  await notifyLinkedAthleteSafe({
    athleteId: (seriesData["athleteId"] as string | null) ?? null,
    title: "Horário fixo pausado",
    body: `Seu horário fixo em ${String(seriesData["arenaName"] ?? "Arena")} foi pausado ` +
      "pela arena. As próximas reservas foram liberadas.",
    type: "recurring_booking_paused",
    data: {recurringBookingId: seriesId, arenaId},
  });

  logger.info("pauseArenaRecurringBooking: série pausada", {
    seriesId,
    arenaId,
    released: releasedDates.length,
  });

  return {seriesId, releasedDates};
});

interface ResumeSeriesInput {
  seriesId?: string;
}

export const resumeArenaRecurringBooking = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as ResumeSeriesInput;
  const seriesId = input.seriesId?.trim() ?? "";
  if (!seriesId) {
    throw new HttpsError("invalid-argument", "Horário fixo inválido.");
  }

  const db = getFirestore();
  const seriesRef = db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId);
  const seriesSnap = await seriesRef.get();
  if (!seriesSnap.exists) {
    throw new HttpsError("not-found", "Horário fixo não encontrado.");
  }
  const seriesData = seriesSnap.data() as Record<string, unknown>;
  const arenaId = String(seriesData["arenaId"] ?? "");
  await requireArenaManager(db, arenaId, uid);

  if (String(seriesData["status"]) !== "paused") {
    throw new HttpsError("failed-precondition", "Só é possível retomar um horário fixo pausado.");
  }

  await seriesRef.set({
    status: "active",
    pausedAt: null,
    pauseReason: null,
  }, {merge: true});

  const series = parseRecurringSeriesData({...seriesData, status: "active"});
  const todayKey = dayKeyFromEventDate(new Date());
  const horizonKey = addDaysToDateKey(todayKey, RECURRING_HORIZON_DAYS);
  const result = await materializeSeriesOccurrences(
    db,
    seriesId,
    series,
    addDaysToDateKey(todayKey, -1),
    horizonKey,
  );

  // `series.skippedDates` (via parseRecurringSeriesData) já carrega as datas
  // canceladas individualmente antes da pausa (cancelArenaRecurringOccurrence)
  // — é isso, e só isso, que fica PERSISTIDO. Conflitos desta rodada de
  // materialização (`result.skippedDates`) são transitórios e não devem ser
  // excluídos para sempre; o retorno ao chamador (abaixo) já reporta esses
  // conflitos para feedback imediato na UI.
  await seriesRef.set({
    materializedUntil: horizonKey,
    skippedDates: series.skippedDates,
  }, {merge: true});

  await notifyLinkedAthleteSafe({
    athleteId: series.athleteId,
    title: "Horário fixo retomado",
    body: `Seu horário fixo em ${series.arenaName} foi retomado pela arena.`,
    type: "recurring_booking_resumed",
    data: {recurringBookingId: seriesId, arenaId},
  });

  logger.info("resumeArenaRecurringBooking: série retomada", {
    seriesId,
    arenaId,
    created: result.createdDates.length,
    skipped: result.skippedDates.length,
  });

  return {seriesId, createdDates: result.createdDates, skippedDates: result.skippedDates};
});
