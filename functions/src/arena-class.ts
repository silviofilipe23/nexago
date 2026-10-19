/**
 * Aulas da arena — turmas recorrentes e aulas avulsas com professor, quadra,
 * alunos e chamada.
 *
 * `arenaClasses/{classId}` guarda a config (dias da semana + horário + quadra,
 * ou uma data só para aula avulsa). Cada data vira
 * `arenaClassSessions/{class_{classId}_{date}}` com o snapshot da config.
 *
 * O bloqueio de agenda é o mesmo do mensalista e do clubinho: por aula são
 * criados `arenaBookings` + `arenaSlots` + `arenaSlotLocks` com o mesmo id da
 * sessão. `createArenaBooking` recusa hora com lock, então o horário da aula
 * fica indisponível para aluguel no app, no portal do atleta e no balcão.
 *
 * Liberar bloqueio nunca apaga lock de outra reserva: só o lock cujo
 * `bookingId` é o da aula (o atleta pode ter reservado a hora no intervalo).
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
import {assertArenaAreaAccess} from "./arena-area-access";
import {deliverNotificationToUser} from "./notification-delivery";
import {dayKeyFromEventDate} from "./event-timezone";
import {
  addDaysToDateKey,
  fmtHourEnd,
  fmtHourStart,
  hasBlockedSlotOverlap,
  isValidDateKey,
  isoWeekdayOfDateKey,
  lockRefsForOccurrence,
  toMinutes,
} from "./arena-recurring-booking";
import {
  ARENA_CLASSES,
  ARENA_CLASS_SESSIONS,
  ATTENDANCE_MARKS,
  CLASS_HORIZON_DAYS,
  CLASS_LEVELS,
  CLASS_STUDENTS,
  CLASS_TEACHERS,
  CLASS_TYPES,
  MAX_CLASS_CAPACITY,
  MAX_CLASS_DURATION_MINUTES,
  classSessionId,
  type ArenaClassLevel,
  type ArenaClassType,
  type AttendanceMark,
} from "./arena-class-constants";
import {resolveAthleteDisplay} from "./arena-club-join";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_TIMEZONE_OFFSET = "-03:00";

/** Aula avulsa pode ser marcada até ~6 meses à frente. */
const MAX_SINGLE_DATE_AHEAD_DAYS = 180;

const WEEKDAY_SHORT_PT: Record<number, string> = {
  1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sáb", 7: "dom",
};

const TYPE_LABEL_PT: Record<ArenaClassType, string> = {
  turma: "Turma",
  particular: "Particular",
  dupla: "Dupla",
  experimental: "Experimental",
};

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export interface ArenaClassData {
  arenaId: string;
  arenaName: string;
  name: string;
  type: ArenaClassType;
  sport: string;
  level: ArenaClassLevel;
  teacherId: string;
  teacherName: string;
  teacherColor: string;
  /** ISO 1–7 ordenados; vazio = aula avulsa (uma data só, `startDate`). */
  weekdays: number[];
  startTime: string;
  endTime: string;
  courtId: string;
  courtName: string;
  capacity: number;
  startDate: string;
  endDate: string | null;
  status: string;
  notes: string | null;
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String) : [];
}

export function parseArenaClass(data: Record<string, unknown>): ArenaClassData {
  const type = String(data["type"] ?? "turma");
  const level = String(data["level"] ?? "livre");
  return {
    arenaId: String(data["arenaId"] ?? ""),
    arenaName: String(data["arenaName"] ?? "Arena"),
    name: String(data["name"] ?? "Aula"),
    type: (CLASS_TYPES as readonly string[]).includes(type) ? type as ArenaClassType : "turma",
    sport: String(data["sport"] ?? ""),
    level: (CLASS_LEVELS as readonly string[]).includes(level) ? level as ArenaClassLevel : "livre",
    teacherId: String(data["teacherId"] ?? ""),
    teacherName: String(data["teacherName"] ?? "Professor"),
    teacherColor: String(data["teacherColor"] ?? "#FF6A1A"),
    weekdays: Array.isArray(data["weekdays"]) ?
      (data["weekdays"] as unknown[]).map(Number).filter((n) => Number.isInteger(n)) :
      [],
    startTime: String(data["startTime"] ?? ""),
    endTime: String(data["endTime"] ?? ""),
    courtId: String(data["courtId"] ?? ""),
    courtName: String(data["courtName"] ?? "Quadra"),
    capacity: Number(data["capacity"] ?? 0),
    startDate: String(data["startDate"] ?? ""),
    endDate: typeof data["endDate"] === "string" ? data["endDate"] : null,
    status: String(data["status"] ?? ""),
    notes: typeof data["notes"] === "string" ? data["notes"] : null,
  };
}

export interface ClassSessionData {
  classId: string;
  arenaId: string;
  className: string;
  date: string;
  startTime: string;
  endTime: string;
  courtId: string;
  status: string;
  blockBookingId: string;
  /** studentId → marca da chamada. */
  attendance: Record<string, {mark: AttendanceMark; name: string}>;
}

export function parseClassSession(data: Record<string, unknown>): ClassSessionData {
  const attendance: ClassSessionData["attendance"] = {};
  const raw = data["attendance"];
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [studentId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value == null || typeof value !== "object") continue;
      const mark = String((value as Record<string, unknown>)["mark"] ?? "");
      if (!(ATTENDANCE_MARKS as readonly string[]).includes(mark)) continue;
      attendance[studentId] = {
        mark: mark as AttendanceMark,
        name: String((value as Record<string, unknown>)["name"] ?? "Aluno"),
      };
    }
  }
  return {
    classId: String(data["classId"] ?? ""),
    arenaId: String(data["arenaId"] ?? ""),
    className: String(data["className"] ?? "Aula"),
    date: String(data["date"] ?? ""),
    startTime: String(data["startTime"] ?? ""),
    endTime: String(data["endTime"] ?? ""),
    courtId: String(data["courtId"] ?? ""),
    status: String(data["status"] ?? ""),
    blockBookingId: String(data["blockBookingId"] ?? ""),
    attendance,
  };
}

export function classSessionStartAt(dateKey: string, startTime: string): Date {
  return new Date(`${dateKey}T${startTime}:00${ARENA_TIMEZONE_OFFSET}`);
}

/** "seg e qua · 07:00–08:00" (turma) ou "21/10 · 17:00–18:00" (avulsa). */
export function classScheduleLabel(
  cls: Pick<ArenaClassData, "weekdays" | "startDate" | "startTime" | "endTime">,
): string {
  const when = cls.weekdays.length === 0 ?
    formatDateBr(cls.startDate).slice(0, 5) :
    joinPt(cls.weekdays.map((d) => WEEKDAY_SHORT_PT[d] ?? "?"));
  return `${when} · ${cls.startTime}–${cls.endTime}`;
}

function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function formatDateBr(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Rótulo que a agenda de reservas mostra no bloqueio da quadra. */
export function classBlockLabel(cls: Pick<ArenaClassData, "name" | "type">): string {
  return cls.type === "turma" ? `Aula · ${cls.name}` : `Aula ${TYPE_LABEL_PT[cls.type].toLowerCase()} · ${cls.name}`;
}

// ---------------------------------------------------------------------------
// Datas da série
// ---------------------------------------------------------------------------

/**
 * Datas da aula em `(fromExclusive, untilInclusive]`. Turma: os dias da semana
 * entre `startDate` e `endDate`. Avulsa (`weekdays` vazio): só `startDate`.
 */
export function classOccurrenceDates(
  cls: Pick<ArenaClassData, "weekdays" | "startDate" | "endDate">,
  fromExclusive: string,
  untilInclusive: string,
): string[] {
  if (cls.weekdays.length === 0) {
    return cls.startDate > fromExclusive && cls.startDate <= untilInclusive ? [cls.startDate] : [];
  }
  const days = new Set(cls.weekdays);
  const first = cls.startDate > fromExclusive ? cls.startDate : addDaysToDateKey(fromExclusive, 1);
  const last = cls.endDate && cls.endDate < untilInclusive ? cls.endDate : untilInclusive;
  const dates: string[] = [];
  for (let d = first; d <= last; d = addDaysToDateKey(d, 1)) {
    if (days.has(isoWeekdayOfDateKey(d))) dates.push(d);
  }
  return dates;
}

/** Campos cuja mudança move as aulas futuras de lugar na agenda. */
export function isClassScheduleChange(
  before: Pick<ArenaClassData, "weekdays" | "startTime" | "endTime" | "courtId" | "startDate" | "endDate">,
  after: Pick<ArenaClassData, "weekdays" | "startTime" | "endTime" | "courtId" | "startDate" | "endDate">,
): boolean {
  return before.weekdays.join(",") !== after.weekdays.join(",") ||
    before.startTime !== after.startTime ||
    before.endTime !== after.endTime ||
    before.courtId !== after.courtId ||
    before.startDate !== after.startDate ||
    (before.endDate ?? null) !== (after.endDate ?? null);
}

// ---------------------------------------------------------------------------
// Validação do formulário
// ---------------------------------------------------------------------------

export interface RawClassInput {
  name?: unknown;
  type?: unknown;
  sport?: unknown;
  level?: unknown;
  teacherId?: unknown;
  weekdays?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  courtId?: unknown;
  capacity?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  notes?: unknown;
}

export interface ValidatedClassInput {
  name: string;
  type: ArenaClassType;
  sport: string;
  level: ArenaClassLevel;
  teacherId: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  courtId: string;
  capacity: number;
  startDate: string;
  endDate: string | null;
  notes: string | null;
}

function str(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** Valida e normaliza a turma/aula. Lança `HttpsError(invalid-argument)`. */
export function validateClassInput(raw: RawClassInput, todayKey: string): ValidatedClassInput {
  const name = str(raw.name);
  if (!name || name.length > 60) {
    throw new HttpsError("invalid-argument", "Informe um nome de até 60 caracteres.");
  }
  const type = str(raw.type) || "turma";
  if (!(CLASS_TYPES as readonly string[]).includes(type)) {
    throw new HttpsError("invalid-argument", "Tipo de aula inválido.");
  }
  const sport = str(raw.sport);
  if (!sport || sport.length > 40) {
    throw new HttpsError("invalid-argument", "Informe a modalidade.");
  }
  const level = str(raw.level) || "livre";
  if (!(CLASS_LEVELS as readonly string[]).includes(level)) {
    throw new HttpsError("invalid-argument", "Nível inválido.");
  }
  const teacherId = str(raw.teacherId);
  if (!teacherId) {
    throw new HttpsError("invalid-argument", "Escolha o professor.");
  }

  const weekdays = Array.isArray(raw.weekdays) ?
    [...new Set(raw.weekdays.map(Number))].sort((a, b) => a - b) :
    [];
  if (weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    throw new HttpsError("invalid-argument", "Dia da semana inválido.");
  }
  if (type === "turma" && weekdays.length === 0) {
    throw new HttpsError("invalid-argument", "Escolha pelo menos um dia da semana.");
  }

  const startTime = str(raw.startTime);
  const endTime = str(raw.endTime);
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    throw new HttpsError("invalid-argument", "Horário inválido.");
  }
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  if (startMin >= 24 * 60 || endMin <= startMin) {
    throw new HttpsError("invalid-argument", "O fim da aula precisa ser depois do início.");
  }
  if (endMin - startMin > MAX_CLASS_DURATION_MINUTES) {
    throw new HttpsError("invalid-argument", "A aula pode durar no máximo 4 horas.");
  }

  const courtId = str(raw.courtId);
  if (!courtId) {
    throw new HttpsError("invalid-argument", "Escolha a quadra.");
  }

  const capacity = Number(raw.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CLASS_CAPACITY) {
    throw new HttpsError("invalid-argument", `Informe as vagas (1 a ${MAX_CLASS_CAPACITY}).`);
  }

  const startDate = str(raw.startDate) || todayKey;
  if (!isValidDateKey(startDate)) {
    throw new HttpsError("invalid-argument", "Data de início inválida.");
  }
  if (weekdays.length === 0) {
    if (startDate < todayKey) {
      throw new HttpsError("invalid-argument", "A data da aula já passou.");
    }
    if (startDate > addDaysToDateKey(todayKey, MAX_SINGLE_DATE_AHEAD_DAYS)) {
      throw new HttpsError("invalid-argument", "Marque a aula com até 180 dias de antecedência.");
    }
  }
  const endDateRaw = str(raw.endDate);
  const endDate = weekdays.length === 0 ? startDate : endDateRaw || null;
  if (endDate != null && (!isValidDateKey(endDate) || endDate < startDate)) {
    throw new HttpsError("invalid-argument", "Data de término inválida.");
  }

  const notes = str(raw.notes).slice(0, 500) || null;

  return {
    name,
    type: type as ArenaClassType,
    sport,
    level: level as ArenaClassLevel,
    teacherId,
    weekdays,
    startTime,
    endTime,
    courtId,
    capacity,
    startDate,
    endDate,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Materialização de uma aula (compartilhada: callables e scheduler)
// ---------------------------------------------------------------------------

export type MaterializeClassOutcome = "created" | "exists" | "conflict";

/**
 * Cria a aula do dia + bloqueio da quadra (booking/slot/locks) numa transação.
 * Hora com lock de outra reserva, ou slot `blocked` do gestor, é conflito: a
 * aula daquele dia não é criada.
 */
export async function materializeClassSession(
  db: Firestore,
  classId: string,
  cls: ArenaClassData,
  dateKey: string,
  source: "series" | "manual",
): Promise<MaterializeClassOutcome> {
  const sessionId = classSessionId(classId, dateKey);
  const sessionRef = db.collection(ARENA_CLASS_SESSIONS).doc(sessionId);
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(sessionId);
  const slotRef = db.collection(ARENA_SLOTS).doc(sessionId);
  const occurrence = {
    arenaId: cls.arenaId,
    courtId: cls.courtId,
    startTime: cls.startTime,
    endTime: cls.endTime,
  };
  const locks = lockRefsForOccurrence(db, occurrence, dateKey);
  if (locks.length === 0) return "conflict";

  // Pré-checagem de bloqueio manual (fora da transação, como mensalista/clubinho).
  if (await hasBlockedSlotOverlap(db, occurrence, dateKey)) return "conflict";

  const startAt = classSessionStartAt(dateKey, cls.startTime);
  const blockLabel = classBlockLabel(cls);

  try {
    return await db.runTransaction(async (tx: Transaction) => {
      const existing = await tx.get(sessionRef);
      if (existing.exists) return "exists" as const;

      const booking = await tx.get(bookingRef);
      if (booking.exists) {
        const status = String(booking.data()?.["status"] ?? "").toLowerCase();
        if (status !== "cancelled" && status !== "canceled") return "exists" as const;
      }

      for (const lock of locks) {
        const snap = await tx.get(lock.ref);
        // Lock que já é desta aula (sobra de liberação interrompida) não é conflito.
        if (snap.exists && snap.data()?.["bookingId"] !== sessionId) return "conflict" as const;
      }

      tx.set(bookingRef, {
        athleteId: null,
        arenaId: cls.arenaId,
        arenaName: cls.arenaName,
        courtId: cls.courtId,
        courtName: cls.courtName,
        customerName: blockLabel,
        date: dateKey,
        startTime: cls.startTime,
        endTime: cls.endTime,
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
        source: "class",
        isClassSession: true,
        classId,
        classSessionId: sessionId,
        createdByRole: "arena_manager",
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.set(slotRef, {
        arenaId: cls.arenaId,
        courtId: cls.courtId,
        // String YYYY-MM-DD — alinhado a arenaBookings (evita deslocamento UTC no app).
        date: dateKey,
        dateKey,
        startTime: cls.startTime,
        endTime: cls.endTime,
        status: "booked",
        bookingAthleteId: null,
        bookingId: sessionId,
        isClassSession: true,
        classId,
        classSessionId: sessionId,
        className: cls.name,
        priceReais: 0,
        createdAt: FieldValue.serverTimestamp(),
      });

      for (const lock of locks) {
        tx.set(lock.ref, {
          arenaId: cls.arenaId,
          courtId: cls.courtId,
          date: dateKey,
          startTime: fmtHourStart(lock.hour),
          endTime: fmtHourEnd(lock.hour),
          bookingId: sessionId,
          bookingAthleteId: null,
          classSessionId: sessionId,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      tx.set(sessionRef, {
        classId,
        arenaId: cls.arenaId,
        arenaName: cls.arenaName,
        className: cls.name,
        type: cls.type,
        sport: cls.sport,
        level: cls.level,
        teacherId: cls.teacherId,
        teacherName: cls.teacherName,
        teacherColor: cls.teacherColor,
        courtId: cls.courtId,
        courtName: cls.courtName,
        date: dateKey,
        startTime: cls.startTime,
        endTime: cls.endTime,
        startAt: Timestamp.fromDate(startAt),
        capacity: cls.capacity,
        status: "scheduled",
        source,
        blockBookingId: sessionId,
        attendance: {},
        teacherNote: null,
        closedAt: null,
        closedByUid: null,
        canceledAt: null,
        cancelReason: null,
        cancelNote: null,
        createdAt: FieldValue.serverTimestamp(),
      });

      return "created" as const;
    });
  } catch (e) {
    logger.error("materializeClassSession: transação falhou", {classId, dateKey, error: e});
    return "conflict";
  }
}

export interface MaterializeClassRangeResult {
  createdDates: string[];
  /** Datas em que a quadra estava ocupada — a aula daquele dia não existe. */
  conflictDates: string[];
}

export async function materializeClassRange(
  db: Firestore,
  classId: string,
  cls: ArenaClassData,
  fromExclusive: string,
  untilInclusive: string,
): Promise<MaterializeClassRangeResult> {
  const result: MaterializeClassRangeResult = {createdDates: [], conflictDates: []};
  for (const dateKey of classOccurrenceDates(cls, fromExclusive, untilInclusive)) {
    const outcome = await materializeClassSession(db, classId, cls, dateKey, "series");
    if (outcome === "created") result.createdDates.push(dateKey);
    if (outcome === "conflict") result.conflictDates.push(dateKey);
  }
  return result;
}

/** Fim da janela de materialização: avulsa vai até a própria data. */
export function classHorizonKey(cls: Pick<ArenaClassData, "weekdays" | "startDate">, todayKey: string): string {
  const rolling = addDaysToDateKey(todayKey, CLASS_HORIZON_DAYS);
  if (cls.weekdays.length === 0 && cls.startDate > rolling) return cls.startDate;
  return rolling;
}

/** Datas de conflito passadas ficam no histórico; as futuras são recalculadas. */
export function mergeConflictDates(previous: string[], recomputed: string[], todayKey: string): string[] {
  return [...new Set([...previous.filter((d) => d < todayKey), ...recomputed])].sort();
}

// ---------------------------------------------------------------------------
// Liberação de bloqueios
// ---------------------------------------------------------------------------

/**
 * Libera a quadra da aula: apaga `arenaSlots` e só os locks que ainda são
 * desta aula. `mode: "cancel"` deixa o booking `cancelled` (histórico e aviso
 * de vaga para quem espera horário); `"delete"` apaga o booking — usado ao
 * remarcar/pausar, quando a aula é recriada depois com o mesmo id e um
 * booking cancelado acionaria o "desfazer cancelamento" do trigger de slots.
 */
export async function releaseClassSessionBlock(
  db: Firestore,
  session: Pick<ClassSessionData, "arenaId" | "courtId" | "date" | "startTime" | "endTime" | "blockBookingId">,
  mode: "cancel" | "delete",
  cancelReason: string,
): Promise<void> {
  const bookingId = session.blockBookingId;
  if (!bookingId) return;
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (bookingSnap.exists) {
    if (mode === "delete") {
      await bookingRef.delete();
    } else {
      const status = String(bookingSnap.data()?.["status"] ?? "").toLowerCase();
      if (status === "active") {
        await bookingRef.set({
          status: "cancelled",
          canceledAt: FieldValue.serverTimestamp(),
          canceledByRole: "arena_manager",
          cancelReason,
        }, {merge: true});
      }
    }
  }
  for (const lock of lockRefsForOccurrence(db, session, session.date)) {
    const snap = await lock.ref.get();
    if (snap.exists && snap.data()?.["bookingId"] === bookingId) await lock.ref.delete();
  }
  const slotRef = db.collection(ARENA_SLOTS).doc(bookingId);
  const slotSnap = await slotRef.get();
  if (slotSnap.exists && slotSnap.data()?.["bookingId"] === bookingId) await slotRef.delete();
}

/** Aula que ainda pode sair da agenda sem perder histórico. */
export function isClassSessionReleasable(session: ClassSessionData, nowMs: number): boolean {
  if (session.status !== "scheduled") return false;
  if (Object.keys(session.attendance).length > 0) return false;
  const startAt = classSessionStartAt(session.date, session.startTime).getTime();
  return Number.isNaN(startAt) || startAt > nowMs;
}

/**
 * Tira da agenda as aulas futuras da turma (remarcar, pausar, encerrar):
 * apaga a aula e o bloqueio. Aulas já começadas, com chamada ou canceladas
 * pelo gestor (feriado, chuva) ficam — a cancelada continua impedindo que a
 * série recrie aquela data.
 */
export async function releaseFutureClassSessions(
  db: Firestore,
  classId: string,
  nowMs: number,
): Promise<string[]> {
  const todayKey = dayKeyFromEventDate(new Date(nowMs));
  const snap = await db.collection(ARENA_CLASS_SESSIONS).where("classId", "==", classId).get();
  const released: string[] = [];
  for (const doc of snap.docs) {
    const session = parseClassSession(doc.data() as Record<string, unknown>);
    if (session.date < todayKey || !isClassSessionReleasable(session, nowMs)) continue;
    await releaseClassSessionBlock(db, session, "delete", "class_rescheduled");
    await doc.ref.delete();
    released.push(session.date);
  }
  return released.sort();
}

// ---------------------------------------------------------------------------
// Prévia de conflitos (formulário da turma)
// ---------------------------------------------------------------------------

export interface ClassConflict {
  date: string;
  label: string;
}

function describeBookingForConflict(data: Record<string, unknown> | undefined): string {
  if (!data) return "Horário reservado";
  const name = typeof data["customerName"] === "string" && data["customerName"].trim() ?
    data["customerName"].trim() :
    typeof data["athleteName"] === "string" && data["athleteName"].trim() ?
      data["athleteName"].trim() :
      "";
  if (data["isClassSession"] === true) return name || "Outra aula";
  if (data["isClubSession"] === true) return name ? `Clubinho · ${name}` : "Clubinho";
  if (data["isRecurring"] === true || data["recurringBookingId"]) {
    return name ? `Horário fixo · ${name}` : "Horário fixo";
  }
  return name ? `Reserva · ${name}` : "Reserva";
}

/**
 * Para cada data da janela, diz o que ocupa a quadra no horário da aula.
 * Ignora o bloqueio da própria aula (edição de turma existente).
 */
export async function findClassConflicts(
  db: Firestore,
  classId: string | null,
  cls: Pick<ArenaClassData, "arenaId" | "courtId" | "startTime" | "endTime" | "weekdays" | "startDate" | "endDate">,
  fromExclusive: string,
  untilInclusive: string,
): Promise<{dates: string[]; conflicts: ClassConflict[]}> {
  const dates = classOccurrenceDates(cls, fromExclusive, untilInclusive);
  const conflicts: ClassConflict[] = [];
  for (const dateKey of dates) {
    const ownId = classId ? classSessionId(classId, dateKey) : null;
    const locks = lockRefsForOccurrence(db, cls, dateKey);
    const lockSnaps = locks.length > 0 ? await db.getAll(...locks.map((l) => l.ref)) : [];
    const foreignBookingIds = [...new Set(lockSnaps
      .filter((s) => s.exists && s.data()?.["bookingId"] !== ownId)
      .map((s) => String(s.data()?.["bookingId"] ?? "")))];
    if (foreignBookingIds.length > 0) {
      const ids = foreignBookingIds.filter(Boolean);
      const bookingSnaps = ids.length > 0 ?
        await db.getAll(...ids.map((id) => db.collection(ARENA_BOOKINGS).doc(id))) :
        [];
      const labels = bookingSnaps.length > 0 ?
        bookingSnaps.map((s) => describeBookingForConflict(s.data() as Record<string, unknown> | undefined)) :
        ["Horário reservado"];
      conflicts.push({date: dateKey, label: [...new Set(labels)].join(" · ")});
      continue;
    }
    if (await hasBlockedSlotOverlap(db, cls, dateKey)) {
      conflicts.push({date: dateKey, label: "Horário bloqueado na agenda"});
    }
  }
  return {dates, conflicts};
}

// ---------------------------------------------------------------------------
// Alunos
// ---------------------------------------------------------------------------

export interface AddClassStudentInput {
  athleteId: string | null;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  addedByUid: string;
}

/** Matricula na turma com checagem de vagas na mesma transação do contador. */
export async function addClassStudentCore(
  db: Firestore,
  classId: string,
  input: AddClassStudentInput,
): Promise<{studentId: string; studentCount: number}> {
  const classRef = db.collection(ARENA_CLASSES).doc(classId);
  const studentRef = input.athleteId ?
    classRef.collection(CLASS_STUDENTS).doc(input.athleteId) :
    classRef.collection(CLASS_STUDENTS).doc();

  return db.runTransaction(async (tx: Transaction) => {
    const classSnap = await tx.get(classRef);
    if (!classSnap.exists) throw new HttpsError("not-found", "Turma não encontrada.");
    const data = classSnap.data() as Record<string, unknown>;
    const cls = parseArenaClass(data);
    if (cls.status === "archived") {
      throw new HttpsError("failed-precondition", "Turma encerrada não recebe alunos.");
    }
    const existing = await tx.get(studentRef);
    if (existing.exists && existing.data()?.["status"] === "active") {
      throw new HttpsError("already-exists", "Este aluno já está na turma.");
    }
    const count = Number(data["studentCount"] ?? 0);
    if (count >= cls.capacity) {
      throw new HttpsError("failed-precondition", "A turma está lotada.");
    }
    tx.set(studentRef, {
      arenaId: cls.arenaId,
      classId,
      athleteId: input.athleteId,
      name: input.name,
      phone: input.phone,
      photoUrl: input.photoUrl,
      status: "active",
      enrolledAt: FieldValue.serverTimestamp(),
      removedAt: null,
      addedByUid: input.addedByUid,
    });
    tx.set(classRef, {studentCount: count + 1, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {studentId: studentRef.id, studentCount: count + 1};
  });
}

export async function removeClassStudentCore(
  db: Firestore,
  classId: string,
  studentId: string,
): Promise<{studentCount: number}> {
  const classRef = db.collection(ARENA_CLASSES).doc(classId);
  const studentRef = classRef.collection(CLASS_STUDENTS).doc(studentId);
  return db.runTransaction(async (tx: Transaction) => {
    const classSnap = await tx.get(classRef);
    if (!classSnap.exists) throw new HttpsError("not-found", "Turma não encontrada.");
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists || studentSnap.data()?.["status"] !== "active") {
      throw new HttpsError("not-found", "Aluno não está na turma.");
    }
    const count = Math.max(0, Number(classSnap.data()?.["studentCount"] ?? 0) - 1);
    tx.set(studentRef, {status: "removed", removedAt: FieldValue.serverTimestamp()}, {merge: true});
    tx.set(classRef, {studentCount: count, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {studentCount: count};
  });
}

// ---------------------------------------------------------------------------
// Chamada
// ---------------------------------------------------------------------------

export interface SaveAttendanceInput {
  marks: Record<string, AttendanceMark | null>;
  teacherNote: string | null | undefined;
  close: boolean;
  uid: string;
}

/** Grava presença por aluno (null apaga a marca) e, se pedido, fecha a chamada. */
export async function saveClassAttendanceCore(
  db: Firestore,
  sessionId: string,
  input: SaveAttendanceInput,
  todayKey: string,
): Promise<{status: string; marked: number}> {
  const sessionRef = db.collection(ARENA_CLASS_SESSIONS).doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const session = parseClassSession(sessionSnap.data() as Record<string, unknown>);
  if (session.status === "canceled") {
    throw new HttpsError("failed-precondition", "Esta aula foi cancelada.");
  }
  if (session.date > todayKey) {
    throw new HttpsError("failed-precondition", "A chamada abre no dia da aula.");
  }

  const studentIds = Object.keys(input.marks);
  const studentsCol = db.collection(ARENA_CLASSES).doc(session.classId).collection(CLASS_STUDENTS);
  const studentSnaps = studentIds.length > 0 ?
    await db.getAll(...studentIds.map((id) => studentsCol.doc(id))) :
    [];

  const attendance: Record<string, unknown> = {};
  studentSnaps.forEach((snap, i) => {
    const studentId = studentIds[i]!;
    if (!snap.exists) {
      throw new HttpsError("invalid-argument", "Aluno fora da turma na chamada.");
    }
    const mark = input.marks[studentId];
    if (mark == null) {
      attendance[studentId] = FieldValue.delete();
      return;
    }
    if (!(ATTENDANCE_MARKS as readonly string[]).includes(mark)) {
      throw new HttpsError("invalid-argument", "Marca de presença inválida.");
    }
    attendance[studentId] = {mark, name: String(snap.data()?.["name"] ?? "Aluno")};
  });

  const update: Record<string, unknown> = {attendance, updatedAt: FieldValue.serverTimestamp()};
  if (input.teacherNote !== undefined) {
    update["teacherNote"] = input.teacherNote ? input.teacherNote.slice(0, 1000) : null;
  }
  let status = session.status;
  if (input.close && session.status !== "completed") {
    status = "completed";
    update["status"] = "completed";
    update["closedAt"] = FieldValue.serverTimestamp();
    update["closedByUid"] = input.uid;
  }
  await sessionRef.set(update, {merge: true});
  const marked = Object.values(input.marks).filter((m) => m != null).length;
  return {status, marked};
}

// ---------------------------------------------------------------------------
// Cancelamento de uma aula
// ---------------------------------------------------------------------------

export const CANCEL_REASON_LABELS: Record<string, string> = {
  rain: "chuva",
  teacher_absent: "ausência do professor",
  maintenance: "manutenção da quadra",
  holiday: "feriado",
  other: "",
};

export interface CancelClassSessionDeps {
  notify: (input: {
    userId: string;
    title: string;
    body: string;
    type: string;
    data: Record<string, string>;
  }) => Promise<void>;
}

const defaultCancelDeps: CancelClassSessionDeps = {
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

/**
 * Cancela a aula do dia: libera a quadra e avisa por push os alunos com conta
 * NexaGO. A aula fica `canceled` (a série não recria a data).
 */
export async function cancelClassSessionCore(
  db: Firestore,
  sessionId: string,
  reason: string,
  note: string | null,
  deps: CancelClassSessionDeps = defaultCancelDeps,
): Promise<{sessionId: string; notified: number}> {
  const sessionRef = db.collection(ARENA_CLASS_SESSIONS).doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const session = parseClassSession(sessionSnap.data() as Record<string, unknown>);
  if (session.status === "completed") {
    throw new HttpsError("failed-precondition", "A chamada desta aula já foi fechada.");
  }
  if (session.status === "canceled") return {sessionId, notified: 0};

  await sessionRef.set({
    status: "canceled",
    canceledAt: FieldValue.serverTimestamp(),
    cancelReason: reason,
    cancelNote: note,
  }, {merge: true});
  await releaseClassSessionBlock(db, session, "cancel", "class_session_canceled");

  const studentsSnap = await db
    .collection(ARENA_CLASSES).doc(session.classId)
    .collection(CLASS_STUDENTS)
    .where("status", "==", "active")
    .get();
  const reasonLabel = CANCEL_REASON_LABELS[reason] ?? "";
  const body = `A aula ${session.className} de ${formatDateBr(session.date).slice(0, 5)} às ` +
    `${session.startTime} foi cancelada pela arena${reasonLabel ? ` (${reasonLabel})` : ""}.`;
  let notified = 0;
  for (const doc of studentsSnap.docs) {
    const athleteId = doc.data()["athleteId"];
    if (typeof athleteId !== "string" || !athleteId) continue;
    try {
      await deps.notify({
        userId: athleteId,
        title: "Aula cancelada",
        body,
        type: "arena_class_canceled",
        data: {classSessionId: sessionId, arenaId: session.arenaId},
      });
      notified += 1;
    } catch (e) {
      logger.warn("cancelClassSessionCore: notificação falhou", {sessionId, athleteId, error: e});
    }
  }
  return {sessionId, notified};
}

// ---------------------------------------------------------------------------
// Acesso
// ---------------------------------------------------------------------------

// Aulas usam a área "agenda" (gestor/recepção escrevem; manutenção lê) — a
// turma ocupa a quadra como uma reserva. Sem bypass de admin, como clubinho.
async function requireClassManager(
  db: Firestore,
  arenaId: string,
  uid: string,
): Promise<Record<string, unknown>> {
  const arenaSnap = await db.collection("arenas").doc(arenaId).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");
  return arenaSnap.data() as Record<string, unknown>;
}

function requireClassEntitlement(arenaData: Record<string, unknown>): void {
  if (!isArenaEntitledPro(arenaData, Date.now())) {
    throw new HttpsError(
      "permission-denied",
      "As Aulas estão disponíveis nos planos Pro e Elite. Faça upgrade para usar.",
    );
  }
}

function requireUid(auth: {uid?: string} | undefined): string {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

async function loadClassOrThrow(
  db: Firestore,
  classId: string,
): Promise<{ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; cls: ArenaClassData}> {
  if (!classId) throw new HttpsError("invalid-argument", "Turma inválida.");
  const ref = db.collection(ARENA_CLASSES).doc(classId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Turma não encontrada.");
  const data = snap.data() as Record<string, unknown>;
  return {ref, data, cls: parseArenaClass(data)};
}

async function resolveCourtName(db: Firestore, arenaId: string, courtId: string): Promise<string> {
  const courtSnap = await db.collection("arenas").doc(arenaId).collection("courts").doc(courtId).get();
  if (!courtSnap.exists) {
    throw new HttpsError("not-found", "A quadra escolhida não existe mais.");
  }
  const name = courtSnap.data()?.["name"];
  return typeof name === "string" && name.trim() ? name.trim() : "Quadra";
}

async function resolveTeacher(
  db: Firestore,
  arenaId: string,
  teacherId: string,
): Promise<{name: string; color: string}> {
  const snap = await db.collection("arenas").doc(arenaId).collection(CLASS_TEACHERS).doc(teacherId).get();
  if (!snap.exists || snap.data()?.["status"] === "archived") {
    throw new HttpsError("not-found", "Professor não encontrado.");
  }
  const data = snap.data() ?? {};
  return {
    name: typeof data["name"] === "string" ? data["name"] : "Professor",
    color: typeof data["color"] === "string" ? data["color"] : "#FF6A1A",
  };
}

// ---------------------------------------------------------------------------
// Callables — professores
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export const upsertArenaClassTeacher = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const arenaId = str(input["arenaId"]);
  const teacherId = str(input["teacherId"]) || null;
  const name = str(input["name"]);
  const specialty = str(input["specialty"]).slice(0, 60) || null;
  const phone = str(input["phone"]).slice(0, 30) || null;
  const color = str(input["color"]) || "#FF6A1A";
  const status = str(input["status"]) || "active";
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  if (!name || name.length > 60) {
    throw new HttpsError("invalid-argument", "Informe o nome do professor (até 60 caracteres).");
  }
  if (!HEX_COLOR.test(color)) throw new HttpsError("invalid-argument", "Cor inválida.");
  if (status !== "active" && status !== "archived") {
    throw new HttpsError("invalid-argument", "Status inválido.");
  }

  const db = getFirestore();
  const arenaData = await requireClassManager(db, arenaId, uid);
  const col = db.collection("arenas").doc(arenaId).collection(CLASS_TEACHERS);

  if (teacherId == null) {
    requireClassEntitlement(arenaData);
    const ref = col.doc();
    await ref.set({
      arenaId, name, specialty, phone, color, status: "active",
      createdByUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {teacherId: ref.id};
  }

  const ref = col.doc(teacherId);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Professor não encontrado.");
  await ref.set({name, specialty, phone, color, status, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {teacherId};
});

// ---------------------------------------------------------------------------
// Callables — turmas
// ---------------------------------------------------------------------------

export const previewArenaClassSchedule = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const arenaId = str(input["arenaId"]);
  const classId = str(input["classId"]) || null;
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  const todayKey = dayKeyFromEventDate(new Date());
  // Valida só o que a agenda precisa — nome/professor podem estar em branco na prévia.
  const v = validateClassInput({
    ...input,
    name: str(input["name"]) || "Prévia",
    teacherId: str(input["teacherId"]) || "preview",
    sport: str(input["sport"]) || "preview",
    capacity: Number(input["capacity"]) || 1,
  } as RawClassInput, todayKey);

  const db = getFirestore();
  await requireClassManager(db, arenaId, uid);
  const cls = {
    arenaId, courtId: v.courtId, startTime: v.startTime, endTime: v.endTime,
    weekdays: v.weekdays, startDate: v.startDate, endDate: v.endDate,
  };
  const result = await findClassConflicts(
    db, classId, cls, addDaysToDateKey(todayKey, -1), classHorizonKey(cls, todayKey),
  );
  return {totalDates: result.dates.length, conflicts: result.conflicts};
});

interface UpsertClassStudentInput {
  athleteId?: unknown;
  name?: unknown;
  phone?: unknown;
}

export const upsertArenaClass = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const arenaId = str(input["arenaId"]);
  const classId = str(input["classId"]) || null;
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  const todayKey = dayKeyFromEventDate(new Date());
  const v = validateClassInput(input as RawClassInput, todayKey);

  const db = getFirestore();
  const arenaData = await requireClassManager(db, arenaId, uid);
  requireClassEntitlement(arenaData);
  const courtName = await resolveCourtName(db, arenaId, v.courtId);
  const teacher = await resolveTeacher(db, arenaId, v.teacherId);
  const arenaName = typeof arenaData["name"] === "string" && arenaData["name"].trim() ?
    arenaData["name"].trim() :
    "Arena";

  const next: ArenaClassData = {
    arenaId,
    arenaName,
    name: v.name,
    type: v.type,
    sport: v.sport,
    level: v.level,
    teacherId: v.teacherId,
    teacherName: teacher.name,
    teacherColor: teacher.color,
    weekdays: v.weekdays,
    startTime: v.startTime,
    endTime: v.endTime,
    courtId: v.courtId,
    courtName,
    capacity: v.capacity,
    startDate: v.startDate,
    endDate: v.endDate,
    status: "active",
    notes: v.notes,
  };
  const horizonKey = classHorizonKey(next, todayKey);
  const fromKey = addDaysToDateKey(todayKey, -1);

  if (classId == null) {
    const rawStudents = Array.isArray(input["students"]) ? input["students"] as UpsertClassStudentInput[] : [];
    if (rawStudents.length > v.capacity) {
      throw new HttpsError("invalid-argument", "Mais alunos do que vagas.");
    }
    // Valida os alunos antes de gravar qualquer coisa.
    const students: Array<Omit<AddClassStudentInput, "addedByUid">> = [];
    for (const raw of rawStudents) students.push(await resolveStudentInput(db, raw));

    const classRef = db.collection(ARENA_CLASSES).doc();
    await classRef.set({
      ...next,
      studentCount: 0,
      conflictDates: [],
      materializedUntil: fromKey,
      createdByUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const result = await materializeClassRange(db, classRef.id, next, fromKey, horizonKey);
    if (next.weekdays.length === 0 && result.createdDates.length === 0) {
      // Aula avulsa sem quadra não existe — desfaz em vez de deixar uma turma sem aula.
      await classRef.delete();
      throw new HttpsError("failed-precondition", "A quadra já está ocupada nesse horário.");
    }
    for (const student of students) {
      await addClassStudentCore(db, classRef.id, {...student, addedByUid: uid});
    }
    await classRef.set({materializedUntil: horizonKey, conflictDates: result.conflictDates}, {merge: true});
    logger.info("upsertArenaClass: turma criada", {
      classId: classRef.id, arenaId, created: result.createdDates.length, conflicts: result.conflictDates.length,
    });
    return {classId: classRef.id, createdDates: result.createdDates, conflictDates: result.conflictDates};
  }

  const {ref: classRef, data: existingData, cls: existing} = await loadClassOrThrow(db, classId);
  if (existing.arenaId !== arenaId) throw new HttpsError("permission-denied", "Turma de outra arena.");
  if (existing.status === "archived") {
    throw new HttpsError("failed-precondition", "Turma encerrada não pode ser editada.");
  }
  const studentCount = Number(existingData["studentCount"] ?? 0);
  if (v.capacity < studentCount) {
    throw new HttpsError(
      "failed-precondition",
      `A turma tem ${studentCount} alunos — remova alunos antes de reduzir as vagas.`,
    );
  }

  const updated: ArenaClassData = {...next, status: existing.status};
  await classRef.set({...updated, updatedAt: FieldValue.serverTimestamp()}, {merge: true});

  const previousConflicts = asStringArray(existingData["conflictDates"]);
  if (existing.status !== "active") {
    return {classId, createdDates: [], conflictDates: previousConflicts};
  }

  if (isClassScheduleChange(existing, updated)) {
    await releaseFutureClassSessions(db, classId, Date.now());
    const result = await materializeClassRange(db, classId, updated, fromKey, horizonKey);
    const conflictDates = mergeConflictDates(previousConflicts, result.conflictDates, todayKey);
    await classRef.set({materializedUntil: horizonKey, conflictDates}, {merge: true});
    return {classId, createdDates: result.createdDates, conflictDates: result.conflictDates};
  }

  // Sem mudança de agenda: atualiza o snapshot das aulas futuras e o rótulo do bloqueio.
  await refreshFutureSessionSnapshots(db, classId, updated, todayKey);
  return {classId, createdDates: [], conflictDates: previousConflicts.filter((d) => d >= todayKey)};
});

async function refreshFutureSessionSnapshots(
  db: Firestore,
  classId: string,
  cls: ArenaClassData,
  todayKey: string,
): Promise<void> {
  const snap = await db.collection(ARENA_CLASS_SESSIONS).where("classId", "==", classId).get();
  for (const doc of snap.docs) {
    const session = parseClassSession(doc.data() as Record<string, unknown>);
    if (session.date < todayKey || session.status !== "scheduled") continue;
    await doc.ref.set({
      className: cls.name,
      type: cls.type,
      sport: cls.sport,
      level: cls.level,
      teacherId: cls.teacherId,
      teacherName: cls.teacherName,
      teacherColor: cls.teacherColor,
      capacity: cls.capacity,
    }, {merge: true});
    const bookingRef = db.collection(ARENA_BOOKINGS).doc(session.blockBookingId || doc.id);
    if ((await bookingRef.get()).exists) {
      await bookingRef.set({customerName: classBlockLabel(cls)}, {merge: true});
    }
  }
}

async function resolveStudentInput(
  db: Firestore,
  raw: UpsertClassStudentInput,
): Promise<Omit<AddClassStudentInput, "addedByUid">> {
  const athleteId = str(raw.athleteId) || null;
  const phone = str(raw.phone).slice(0, 30) || null;
  if (athleteId) {
    const userSnap = await db.collection("users").doc(athleteId).get();
    if (!userSnap.exists) throw new HttpsError("not-found", "Atleta não encontrado.");
    const display = await resolveAthleteDisplay(db, athleteId);
    return {athleteId, name: display.name.slice(0, 80), phone, photoUrl: display.photoUrl};
  }
  const name = str(raw.name).slice(0, 80);
  if (!name) throw new HttpsError("invalid-argument", "Informe o nome do aluno.");
  return {athleteId: null, name, phone, photoUrl: null};
}

export const setArenaClassStatus = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const status = str(input["status"]);
  if (status !== "active" && status !== "paused" && status !== "archived") {
    throw new HttpsError("invalid-argument", "Status inválido.");
  }
  const db = getFirestore();
  const {ref, data, cls} = await loadClassOrThrow(db, str(input["classId"]));
  const arenaData = await requireClassManager(db, cls.arenaId, uid);
  if (cls.status === "archived" && status !== "archived") {
    throw new HttpsError("failed-precondition", "Turma encerrada não pode ser reativada.");
  }
  const todayKey = dayKeyFromEventDate(new Date());

  if (status === "active") {
    requireClassEntitlement(arenaData);
    if (cls.status === "active") return {classId: ref.id, status, createdDates: [], conflictDates: []};
    const horizonKey = classHorizonKey(cls, todayKey);
    await ref.set({status, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    const result = await materializeClassRange(
      db, ref.id, {...cls, status}, addDaysToDateKey(todayKey, -1), horizonKey,
    );
    const conflictDates = mergeConflictDates(asStringArray(data["conflictDates"]), result.conflictDates, todayKey);
    await ref.set({materializedUntil: horizonKey, conflictDates}, {merge: true});
    return {classId: ref.id, status, createdDates: result.createdDates, conflictDates: result.conflictDates};
  }

  // Pausar/encerrar tira as aulas futuras da agenda e libera a quadra.
  const released = await releaseFutureClassSessions(db, ref.id, Date.now());
  await ref.set({
    status,
    materializedUntil: addDaysToDateKey(todayKey, -1),
    conflictDates: asStringArray(data["conflictDates"]).filter((d) => d < todayKey),
    updatedAt: FieldValue.serverTimestamp(),
    ...(status === "archived" ? {archivedAt: FieldValue.serverTimestamp()} : {}),
  }, {merge: true});
  return {classId: ref.id, status, releasedDates: released};
});

/** Tenta agendar de novo uma data que deu conflito (o gestor liberou a quadra). */
export const scheduleArenaClassDate = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const date = str(input["date"]);
  const db = getFirestore();
  const {ref, data, cls} = await loadClassOrThrow(db, str(input["classId"]));
  const arenaData = await requireClassManager(db, cls.arenaId, uid);
  requireClassEntitlement(arenaData);
  if (cls.status !== "active") {
    throw new HttpsError("failed-precondition", "Reative a turma para agendar aulas.");
  }
  const todayKey = dayKeyFromEventDate(new Date());
  if (!isValidDateKey(date) || date < todayKey) throw new HttpsError("invalid-argument", "Data inválida.");
  if (!classOccurrenceDates(cls, addDaysToDateKey(date, -1), date).includes(date)) {
    throw new HttpsError("invalid-argument", "A turma não tem aula nesse dia.");
  }
  const outcome = await materializeClassSession(db, ref.id, cls, date, "manual");
  if (outcome === "conflict") {
    throw new HttpsError("failed-precondition", "A quadra continua ocupada nesse horário.");
  }
  await ref.set({
    conflictDates: asStringArray(data["conflictDates"]).filter((d) => d !== date),
  }, {merge: true});
  return {sessionId: classSessionId(ref.id, date), outcome};
});

export const cancelArenaClassSession = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const sessionId = str(input["sessionId"]);
  const reason = str(input["reason"]) || "other";
  const note = str(input["note"]).slice(0, 300) || null;
  if (!sessionId) throw new HttpsError("invalid-argument", "Aula inválida.");
  if (!(reason in CANCEL_REASON_LABELS)) throw new HttpsError("invalid-argument", "Motivo inválido.");
  const db = getFirestore();
  const snap = await db.collection(ARENA_CLASS_SESSIONS).doc(sessionId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  // Sem gate de plano: cancelar e liberar a quadra vale mesmo com plano vencido.
  await requireClassManager(db, String(snap.data()?.["arenaId"] ?? ""), uid);
  const result = await cancelClassSessionCore(db, sessionId, reason, note);
  logger.info("cancelArenaClassSession", result);
  return result;
});

// ---------------------------------------------------------------------------
// Callables — alunos e chamada
// ---------------------------------------------------------------------------

export const addArenaClassStudent = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const db = getFirestore();
  const {ref, cls} = await loadClassOrThrow(db, str(input["classId"]));
  await requireClassManager(db, cls.arenaId, uid);
  const student = await resolveStudentInput(db, input as UpsertClassStudentInput);
  const result = await addClassStudentCore(db, ref.id, {...student, addedByUid: uid});
  return {classId: ref.id, ...result};
});

export const removeArenaClassStudent = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const studentId = str(input["studentId"]);
  if (!studentId) throw new HttpsError("invalid-argument", "Aluno inválido.");
  const db = getFirestore();
  const {ref, cls} = await loadClassOrThrow(db, str(input["classId"]));
  await requireClassManager(db, cls.arenaId, uid);
  const result = await removeClassStudentCore(db, ref.id, studentId);
  return {classId: ref.id, ...result};
});

export const saveArenaClassAttendance = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const sessionId = str(input["sessionId"]);
  if (!sessionId) throw new HttpsError("invalid-argument", "Aula inválida.");
  const rawMarks = input["marks"];
  const marks: Record<string, AttendanceMark | null> = {};
  if (rawMarks != null && typeof rawMarks === "object" && !Array.isArray(rawMarks)) {
    for (const [studentId, mark] of Object.entries(rawMarks as Record<string, unknown>)) {
      marks[studentId] = mark == null ? null : String(mark) as AttendanceMark;
    }
  }
  if (Object.keys(marks).length > MAX_CLASS_CAPACITY * 2) {
    throw new HttpsError("invalid-argument", "Chamada grande demais.");
  }
  const teacherNote = input["teacherNote"] === undefined ? undefined :
    str(input["teacherNote"]) || null;

  const db = getFirestore();
  const snap = await db.collection(ARENA_CLASS_SESSIONS).doc(sessionId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  await requireClassManager(db, String(snap.data()?.["arenaId"] ?? ""), uid);
  return saveClassAttendanceCore(db, sessionId, {
    marks,
    teacherNote,
    close: input["close"] === true,
    uid,
  }, dayKeyFromEventDate(new Date()));
});
