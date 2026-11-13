/**
 * Remarcar uma reserva avulsa — outro dia e/ou horário, pelo atleta ou pela arena.
 *
 * A reserva continua a mesma (id, pagamento, convidados, divisão); só o horário muda (e, se
 * pedido, a quadra). Numa transação: confere que o horário novo está livre, grava as
 * `arenaSlotLocks` novas, apaga as antigas, move o doc de `arenaSlots` e grava o horário novo +
 * histórico na reserva. É a mesma ideia da troca de quadra (`arena-booking-court-change.ts`),
 * agora no eixo do tempo.
 *
 * Regras:
 * - Só reserva avulsa: aula, plano de horário, horário fixo e clubinho calculam as travas pela
 *   própria série — mexer numa ocorrência deixaria a série desfazendo a mudança.
 * - Mesma duração. O valor da reserva NÃO muda (já foi cotado e, às vezes, pago).
 * - Atleta: só o titular, até [ATHLETE_RESCHEDULE_HOURS_BEFORE]h antes (o mesmo prazo do
 *   cancelamento grátis — remarcar não pode ser a saída de quem perderia o valor), no máximo
 *   [MAX_ATHLETE_RESCHEDULES] vez por reserva e só para um horário que não custe mais pela
 *   tabela da arena (senão, mantendo o valor, ele trocaria um horário barato por um caro).
 *   Respeita a mínima do horário de pico.
 * - Arena (equipe com escrita na agenda): qualquer horário livre até a reserva terminar; o valor
 *   também não muda — a diferença de tabela volta no resultado para o gestor acertar no balcão.
 * - Horizonte: até [RESCHEDULE_HORIZON_DAYS] dias, o mesmo teto da grade do atleta (um dia antes
 *   do que o horário fixo já materializou, senão a remarcação cairia em cima de um mensalista).
 * - Reserva sem quadra definida (modo "a arena define a quadra") continua flutuante: o servidor
 *   escolhe a quadra provisória no horário novo, como na criação.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertArenaAreaAccess} from "./arena-area-access";
import {computeSlotLockIds} from "./arena-booking-waitlist";
import {
  RECURRING_HORIZON_DAYS,
  calendarHoursSpanning,
  fmtHourEnd,
  fmtHourStart,
  hasBlockedSlotOverlap,
  toMinutes,
} from "./arena-recurring-booking";
import {arenaBookingStartAt} from "./arena-booking-start-at";
import {normalizeBookingStatus, parseDateKeyFromBooking} from "./slot-vacancy-alerts";
import {claimCourtLocks, targetCourtBlockReason, type ClaimResult} from "./arena-floating-booking";
import {
  CAPACITY_FULL_MESSAGE,
  rankCapacityCourts,
  readBookingAllocation,
  withCapacityPrice,
  type CapacityCourt,
} from "./arena-booking-allocation";
import {athleteSeesBookingCourt} from "./arena-booking-court-visibility";
import {hasBookedSlotOverlap} from "./arena-booking-court-change";
import {calculateBookingTotal, parsePromotionsFromDocs, readArenaFallbackPrice} from "./arena-pricing";
import {ensurePeakRuleSatisfied, parsePeakRulesFromDocs} from "./arena-peak-rules";
import {ATHLETE_FREE_CANCEL_HOURS} from "./arena-booking-athlete-cancel";
import {memberHoursWeek} from "./arena-member-hours";
import {addDays} from "./arena-crm-model";
import {dayKeyFromEventDate} from "./event-timezone";
import {BOOKING_REMINDER_15M_MINUTES_BEFORE} from "./arena-booking-reminder-15m";
import {PROFESSOR_LESSONS} from "./professor-lessons";
import {bookingWhenLabel, refreshInvitesOfRescheduledBookingCore} from "./arena-booking-invite";
import {deliverNotificationToUser} from "./notification-delivery";
import {artifactsPublicDataBase} from "./firebase-paths";
import {roundMoney} from "./mercadopago-arena-helpers";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";

/** Prazo do atleta: o mesmo do cancelamento grátis. */
export const ATHLETE_RESCHEDULE_HOURS_BEFORE = ATHLETE_FREE_CANCEL_HOURS;
/** Quantas vezes o atleta remarca a mesma reserva pelo app (a arena não tem limite). */
export const MAX_ATHLETE_RESCHEDULES = 1;
/** Mesmo teto da grade do atleta (`MAX_HORIZON_DAYS` do portal): um dia antes do horário fixo. */
export const RESCHEDULE_HORIZON_DAYS = RECURRING_HORIZON_DAYS - 1;
export const RESCHEDULE_HISTORY_MAX = 20;
export const BOOKING_RESCHEDULED_PUSH_TYPE = "arena_booking_rescheduled";

/** Status em que a reserva ainda segura o horário (os mesmos da troca de quadra). */
const MOVABLE_STATUSES = new Set(["active", "confirmed", "pending_payment"]);

export type RescheduleActor = "athlete" | "arena";

export interface RescheduleBookingInput {
  bookingId: string;
  /** Dia novo, `YYYY-MM-DD`. */
  date: string;
  /** Início novo, `HH:MM`. O fim sai da duração da reserva. */
  startTime: string;
  /** Quadra nova. Ausente = a mesma. Ignorada na reserva sem quadra definida (flutuante). */
  courtId: string | null;
  as: RescheduleActor;
  reason: string | null;
}

export interface RescheduleBookingResult {
  bookingId: string;
  date: string;
  startTime: string;
  endTime: string;
  courtId: string;
  courtName: string;
  courtChanged: boolean;
  /** Preço de tabela do horário novo menos o do antigo (a reserva manteve o valor). */
  tablePriceDiffReais: number;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function contactArena(booking: DocumentData): string {
  const name = str(booking["arenaName"]);
  return name ? `fale com a ${name}` : "fale com a arena";
}

function normalizeHm(raw: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function parseRescheduleBookingInput(raw: unknown): RescheduleBookingInput {
  const data = (raw ?? {}) as Record<string, unknown>;
  const bookingId = str(data["bookingId"]);
  if (!bookingId || bookingId.includes("/")) throw new HttpsError("invalid-argument", "Reserva inválida.");
  const date = str(data["date"]).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError("invalid-argument", "Escolha o novo dia.");
  const startTime = normalizeHm(str(data["startTime"]));
  if (!startTime) throw new HttpsError("invalid-argument", "Escolha o novo horário.");
  const courtId = str(data["courtId"]) || null;
  if (courtId?.includes("/")) throw new HttpsError("invalid-argument", "Quadra inválida.");
  return {
    bookingId,
    date,
    startTime,
    courtId,
    as: data["as"] === "arena" ? "arena" : "athlete",
    reason: str(data["reason"]).slice(0, 300) || null,
  };
}

/** Duração da reserva em minutos (fim 00:00 = meia-noite). `null` se ilegível. Puro. */
export function bookingDurationMinutes(booking: DocumentData): number | null {
  const start = normalizeHm(str(booking["startTime"]));
  const end = str(booking["endTime"]);
  if (!start || !/^\d{1,2}:\d{2}$/.test(end)) return null;
  const startMin = toMinutes(start);
  let endMin = toMinutes(end);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  return endMin > startMin ? endMin - startMin : null;
}

/** `HH:MM` + minutos; "24:00" vale como fim do dia; passou disso = `null`. Puro. */
export function addMinutesHm(hm: string, minutes: number): string | null {
  const total = toMinutes(hm) + minutes;
  if (total > 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function bookingStartEndMs(booking: DocumentData): {startMs: number; endMs: number} | null {
  const dateKey = parseDateKeyFromBooking(booking["date"]);
  const start = normalizeHm(str(booking["startTime"]));
  const duration = bookingDurationMinutes(booking);
  if (!dateKey || !start || duration == null) return null;
  const startMs = arenaBookingStartAt(dateKey, start).getTime();
  return {startMs, endMs: startMs + duration * 60_000};
}

/**
 * Por que esta reserva não pode ser remarcada por este papel, ou `null` se pode.
 * Puro — o app e os portais mostram o mesmo texto que o servidor devolve.
 */
export function rescheduleBlockReason(
  booking: DocumentData,
  actor: RescheduleActor,
  uid: string,
  nowMs: number,
): string | null {
  if (actor === "athlete" && str(booking["athleteId"]) !== uid) {
    return "Você não pode remarcar esta reserva.";
  }
  if (booking["isClassSession"] === true || str(booking["classSessionId"])) {
    return "Esta reserva é de uma aula. Mude o horário pela tela da aula.";
  }
  if (str(booking["scheduleSubscriptionId"])) {
    return "Esta reserva é de um plano de horário e não pode ser remarcada.";
  }
  if (booking["isRecurring"] === true || str(booking["recurringBookingId"])) {
    return actor === "athlete" ?
      `Horário fixo é remarcado com a arena: ${contactArena(booking)}.` :
      "Esta reserva é de um horário fixo. Mude o horário pela tela do horário fixo.";
  }
  if (str(booking["clubSessionId"])) {
    return "Esta reserva é de um clubinho. Mude o horário pela tela do clubinho.";
  }
  if (num(booking["scheduleFlexMinutes"]) > 0) {
    return "Esta reserva usou o plano de horário. Cancele e reserve de novo pelo plano.";
  }
  const status = normalizeBookingStatus(booking["status"]);
  if (!MOVABLE_STATUSES.has(status)) {
    return "Só dá para remarcar uma reserva ativa.";
  }
  const weather = booking["weatherRelease"] as Record<string, unknown> | undefined;
  if (weather?.["status"] === "pending_choice") {
    return "A arena liberou este horário por chuva: escolha crédito, remarcar ou manter no aviso da reserva.";
  }
  const attendance = str(booking["attendanceStatus"]);
  if (attendance === "checked_in" || attendance === "no_show") {
    return "Esta reserva já teve a presença registrada.";
  }
  const window = bookingStartEndMs(booking);
  if (!window) return "Esta reserva não tem horário válido.";
  if (actor === "arena") {
    return nowMs >= window.endMs ? "Esta reserva já terminou." : null;
  }
  if (nowMs >= window.startMs) return "Esta reserva já começou.";
  if (nowMs >= window.startMs - ATHLETE_RESCHEDULE_HOURS_BEFORE * 3600_000) {
    return `A remarcação pelo app vai até ${ATHLETE_RESCHEDULE_HOURS_BEFORE}h antes do horário. ` +
      `Para mudar agora, ${contactArena(booking)}.`;
  }
  if (num(booking["athleteRescheduleCount"]) >= MAX_ATHLETE_RESCHEDULES) {
    return `Esta reserva já foi remarcada. Para mudar de novo, ${contactArena(booking)}.`;
  }
  return null;
}

/** O horário novo serve? `null` = serve. Puro (a disponibilidade é conferida depois). */
export function newSlotProblem(params: {
  booking: DocumentData;
  dateKey: string;
  startTime: string;
  endTime: string | null;
  nowMs: number;
}): string | null {
  const {booking, dateKey, startTime, endTime, nowMs} = params;
  if (!endTime) return "Esse horário passa da meia-noite. Escolha um mais cedo.";
  const today = dayKeyFromEventDate(new Date(nowMs));
  if (dateKey < today) return "Escolha um dia a partir de hoje.";
  if (dateKey > addDays(today, RESCHEDULE_HORIZON_DAYS)) {
    return `Dá para remarcar até ${RESCHEDULE_HORIZON_DAYS} dias à frente.`;
  }
  if (arenaBookingStartAt(dateKey, startTime).getTime() <= nowMs) return "Esse horário já passou.";
  // Banco de horas do mensalista conta por semana: mudar de semana desequilibraria o saldo.
  const oldDate = parseDateKeyFromBooking(booking["date"]) ?? "";
  if (num(booking["memberHoursMinutes"]) > 0 && memberHoursWeek(oldDate).start !== memberHoursWeek(dateKey).start) {
    return "Reserva do banco de horas só pode ser remarcada dentro da mesma semana.";
  }
  return null;
}

/** Preço de tabela que a reserva pagou (promoção incluída, sem cupom nem desconto de perfil). */
export function bookingTablePrice(booking: DocumentData): number {
  const items = Array.isArray(booking["pricingLineItems"]) ? booking["pricingLineItems"] as unknown[] : [];
  if (items.length > 0) {
    return roundMoney(items.reduce<number>((sum, item) =>
      sum + num((item as Record<string, unknown> | null)?.["finalSlotPriceReais"]), 0));
  }
  return roundMoney(num(booking["amountReais"]));
}

/** "sáb, 15/11 às 19:00" para o push. */
function whenOf(dateKey: string, startTime: string): string {
  return bookingWhenLabel({date: dateKey, startTime});
}

interface PlannedTarget {
  floating: boolean;
  /** Quadra definida (fora da flutuante). */
  court: CapacityCourt | null;
  /** Candidatas em ordem (só na flutuante). */
  candidates: CapacityCourt[];
}

async function loadCourt(db: Firestore, arenaId: string, courtId: string): Promise<DocumentData | undefined> {
  const snap = await db.collection("arenas").doc(arenaId).collection("courts").doc(courtId).get();
  return snap.exists ? snap.data() as DocumentData : undefined;
}

/** Quadra(s) do horário novo + o que dá para conferir fora da transação. */
async function planTarget(
  db: Firestore,
  params: {
    bookingId: string;
    booking: DocumentData;
    arenaId: string;
    arenaData: DocumentData | undefined;
    input: RescheduleBookingInput;
    endTime: string;
  },
): Promise<PlannedTarget> {
  const {booking, arenaId, arenaData, input, endTime} = params;
  const sport = str(booking["sport"]) || null;
  const fromCourtId = str(booking["courtId"]);
  const slot = {arenaId, dateKey: input.date, startTime: input.startTime, endTime};

  if (booking["allocationStatus"] === "unassigned") {
    const ranked = await rankCapacityCourts(db, {...slot, arenaData, sport});
    // A própria quadra provisória pode ter travas desta reserva no horário novo (encosto):
    // o ranking a descarta, mas ela serve — entra por último.
    if (fromCourtId && !ranked.some((c) => c.id === fromCourtId)) {
      const data = await loadCourt(db, arenaId, fromCourtId);
      if (data && targetCourtBlockReason(data, sport) == null &&
          !await hasBlockedSlotOverlap(db, {arenaId, courtId: fromCourtId, startTime: input.startTime, endTime}, input.date)) {
        ranked.push({id: fromCourtId, name: str(data["name"]) || "Quadra", data});
      }
    }
    if (ranked.length === 0) throw new HttpsError("resource-exhausted", CAPACITY_FULL_MESSAGE);
    return {floating: true, court: null, candidates: ranked};
  }

  const toCourtId = input.courtId ?? fromCourtId;
  if (!toCourtId) throw new HttpsError("failed-precondition", "Esta reserva não tem quadra.");
  const courtData = await loadCourt(db, arenaId, toCourtId);
  const reason = targetCourtBlockReason(courtData, sport);
  if (reason) throw new HttpsError(courtData ? "failed-precondition" : "not-found", reason);
  if (await hasBlockedSlotOverlap(db, {arenaId, courtId: toCourtId, startTime: input.startTime, endTime}, input.date)) {
    throw new HttpsError("failed-precondition", "Esse horário está bloqueado pela arena.");
  }
  if (await hasBookedSlotOverlap(db, {
    arenaId, courtId: toCourtId, dateKey: input.date, startTime: input.startTime, endTime, bookingId: params.bookingId,
  })) {
    throw new HttpsError("already-exists", "Esse horário já está reservado. Escolha outro.");
  }
  return {floating: false, court: {id: toCourtId, name: str(courtData?.["name"]) || "Quadra", data: courtData ?? {}}, candidates: []};
}

/**
 * Preço de tabela do horário novo. Confere também que a quadra funciona no horário inteiro
 * (a grade de horários da quadra cobre a reserva toda).
 */
async function priceNewSlot(
  db: Firestore,
  params: {
    arenaId: string;
    arenaData: DocumentData | undefined;
    court: CapacityCourt;
    floating: boolean;
    sport: string | null;
    input: RescheduleBookingInput;
    endTime: string;
    durationMinutes: number;
    checkPeak: boolean;
  },
): Promise<number> {
  const {arenaId, input, endTime} = params;
  const arenaRef = db.collection("arenas").doc(arenaId);
  const [promoSnap, peakSnap] = await Promise.all([
    arenaRef.collection("promotions").where("active", "==", true).get(),
    arenaRef.collection("peakRules").where("active", "==", true).get(),
  ]);
  const courtData = params.floating ?
    withCapacityPrice(params.court.data, readBookingAllocation(params.arenaData), params.sport) ?? {} :
    params.court.data;
  const arenaFallback = readArenaFallbackPrice(params.arenaData as Record<string, unknown> | undefined);
  const promotions = parsePromotionsFromDocs(promoSnap.docs);
  const total = calculateBookingTotal({
    arenaId,
    courtId: params.court.id,
    dateKey: input.date,
    startTime: input.startTime,
    endTime,
    courtData,
    arenaFallback,
    promotions,
  });
  const covered = total.lineItems.reduce((sum, l) => sum + (toMinutes(l.endTime) || 24 * 60) - toMinutes(l.startTime), 0);
  if (total.amountReais <= 0 || covered < params.durationMinutes) {
    throw new HttpsError("failed-precondition", "A quadra não funciona nesse horário. Escolha outro.");
  }
  if (params.checkPeak) {
    await ensurePeakRuleSatisfied({
      db,
      arenaId,
      courtId: params.court.id,
      dateKey: input.date,
      peakRules: parsePeakRulesFromDocs(peakSnap.docs),
      courtData,
      arenaFallback,
      selectionStartTimes: total.lineItems.map((l) => l.startTime),
    });
  }
  return total.amountReais;
}

function lockRefsFor(db: Firestore, params: {arenaId: string; courtId: string; dateKey: string; startTime: string; endTime: string}): DocumentReference[] {
  return computeSlotLockIds(params).map((id) => db.collection(ARENA_SLOT_LOCKS).doc(id));
}

export async function rescheduleArenaBookingCore(
  db: Firestore,
  uid: string,
  input: RescheduleBookingInput,
  nowMs: number,
): Promise<RescheduleBookingResult> {
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(input.bookingId);
  const snap = await bookingRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Reserva não encontrada.");
  const booking = snap.data() as DocumentData;
  const arenaId = str(booking["arenaId"]);
  if (!arenaId) throw new HttpsError("failed-precondition", "Reserva sem arena.");
  if (input.as === "arena") await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");

  const blockReason = rescheduleBlockReason(booking, input.as, uid, nowMs);
  if (blockReason) {
    const code = blockReason === "Você não pode remarcar esta reserva." ? "permission-denied" : "failed-precondition";
    throw new HttpsError(code, blockReason);
  }
  // Atleta não escolhe a quadra numa arena que define a quadra para ele.
  if (input.as === "athlete" && booking["allocationStatus"] === "unassigned") input = {...input, courtId: null};

  const durationMinutes = bookingDurationMinutes(booking) as number;
  const endTime = addMinutesHm(input.startTime, durationMinutes);
  const slotProblem = newSlotProblem({booking, dateKey: input.date, startTime: input.startTime, endTime, nowMs});
  if (slotProblem) throw new HttpsError("invalid-argument", slotProblem);
  const newEnd = endTime as string;

  const fromDate = parseDateKeyFromBooking(booking["date"]) ?? "";
  const fromStart = normalizeHm(str(booking["startTime"]));
  const fromEnd = str(booking["endTime"]);
  const fromCourtId = str(booking["courtId"]);
  const fromCourtName = str(booking["courtName"]) || "Quadra";
  const sameTime = fromDate === input.date && fromStart === input.startTime;
  if (sameTime && (input.courtId == null || input.courtId === fromCourtId)) {
    throw new HttpsError("invalid-argument", "Escolha um dia ou horário diferente do atual.");
  }

  const arenaData = (await db.collection("arenas").doc(arenaId).get()).data();
  const target = await planTarget(db, {bookingId: input.bookingId, booking, arenaId, arenaData, input, endTime: newEnd});
  const sport = str(booking["sport"]) || null;
  const newTablePrice = await priceNewSlot(db, {
    arenaId,
    arenaData,
    court: target.court ?? target.candidates[0]!,
    floating: target.floating,
    sport,
    input,
    endTime: newEnd,
    durationMinutes,
    checkPeak: input.as === "athlete",
  });
  const oldTablePrice = bookingTablePrice(booking);
  const tablePriceDiffReais = roundMoney(newTablePrice - oldTablePrice);
  if (input.as === "athlete" && tablePriceDiffReais > 0.009) {
    throw new HttpsError(
      "failed-precondition",
      `Esse horário custa mais que o da sua reserva. Para trocar por ele, ${contactArena(booking)}.`,
    );
  }

  const oldLockRefs = fromCourtId ?
    lockRefsFor(db, {arenaId, courtId: fromCourtId, dateKey: fromDate, startTime: fromStart, endTime: fromEnd}) :
    [];
  const newStartMs = arenaBookingStartAt(input.date, input.startTime).getTime();
  const hours = calendarHoursSpanning(toMinutes(input.startTime), toMinutes(input.startTime) + durationMinutes);

  const chosen = await db.runTransaction(async (tx) => {
    // Fase de leitura.
    const fresh = await tx.get(bookingRef);
    if (!fresh.exists) throw new HttpsError("not-found", "Reserva não encontrada.");
    const freshData = fresh.data() as DocumentData;
    if (parseDateKeyFromBooking(freshData["date"]) !== fromDate ||
        normalizeHm(str(freshData["startTime"])) !== fromStart ||
        str(freshData["courtId"]) !== fromCourtId) {
      throw new HttpsError("aborted", "A reserva mudou enquanto você remarcava. Tente de novo.");
    }
    const freshReason = rescheduleBlockReason(freshData, input.as, uid, nowMs);
    if (freshReason) throw new HttpsError("failed-precondition", freshReason);

    let court: CapacityCourt | null = target.court;
    let newLockRefs: DocumentReference[] = [];
    let claim: ClaimResult | null = null;
    if (target.floating) {
      // Flutuante: a 1ª candidata com as horas livres (ou já desta reserva) vira a provisória.
      court = null;
      for (const candidate of target.candidates) {
        const refs = lockRefsFor(db, {arenaId, courtId: candidate.id, dateKey: input.date, startTime: input.startTime, endTime: newEnd});
        let free = refs.length > 0;
        for (const ref of refs) {
          const lock = await tx.get(ref);
          if (lock.exists && str(lock.data()?.["bookingId"]) !== input.bookingId) {
            free = false;
            break;
          }
        }
        if (free) {
          court = candidate;
          newLockRefs = refs;
          break;
        }
      }
      if (!court) throw new HttpsError("resource-exhausted", CAPACITY_FULL_MESSAGE);
    } else {
      newLockRefs = lockRefsFor(db, {arenaId, courtId: court!.id, dateKey: input.date, startTime: input.startTime, endTime: newEnd});
      // Reserva flutuante de outro atleta no horário novo vai para outra quadra livre — inclusive
      // a que esta reserva está deixando.
      claim = await claimCourtLocks(tx, db, {arenaId, courtId: court!.id, lockRefs: newLockRefs}, {
        ownBookingId: input.bookingId,
        freeBookingIds: [input.bookingId],
        reason: "Quadra ocupada por uma reserva remarcada",
        nowMs,
      });
      if (!claim.ok) {
        throw new HttpsError("already-exists", "Esse horário acabou de ser reservado. Escolha outro.");
      }
    }
    if (newLockRefs.length !== hours.length) {
      throw new HttpsError("failed-precondition", "Não foi possível calcular os horários.");
    }
    const oldLocks: DocumentSnapshot[] = [];
    for (const ref of oldLockRefs) oldLocks.push(await tx.get(ref));
    const slots = await tx.get(db.collection(ARENA_SLOTS).where("bookingId", "==", input.bookingId));
    const lessonRef = db.collection(PROFESSOR_LESSONS).doc(input.bookingId);
    const lesson = await tx.get(lessonRef);

    // Escritas.
    const athleteId = str(freshData["athleteId"]) || null;
    hours.forEach((h, i) => {
      tx.set(newLockRefs[i]!, {
        arenaId,
        courtId: court!.id,
        date: input.date,
        startTime: fmtHourStart(h),
        endTime: fmtHourEnd(h),
        bookingId: input.bookingId,
        bookingAthleteId: athleteId,
        ...(target.floating ? {floating: true} : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    const keep = new Set<string>([...newLockRefs.map((r) => r.path), ...(claim?.ok ? claim.relocatedLockPaths : [])]);
    for (const lock of oldLocks) {
      // Trava antiga só sai se for desta reserva (nunca derruba a de outra).
      if (lock.exists && str(lock.data()?.["bookingId"]) === input.bookingId && !keep.has(lock.ref.path)) {
        tx.delete(lock.ref);
      }
    }
    for (const doc of slots.docs) {
      tx.set(doc.ref, {
        courtId: court!.id,
        date: input.date,
        dateKey: input.date,
        startTime: input.startTime,
        endTime: newEnd,
      }, {merge: true});
    }

    const courtChanged = court!.id !== fromCourtId;
    const history = Array.isArray(freshData["rescheduleHistory"]) ? freshData["rescheduleHistory"] as unknown[] : [];
    const entry = {
      fromDate,
      fromStartTime: fromStart,
      fromEndTime: fromEnd,
      fromCourtId,
      fromCourtName,
      toDate: input.date,
      toStartTime: input.startTime,
      toEndTime: newEnd,
      toCourtId: court!.id,
      toCourtName: court!.name,
      by: uid,
      role: input.as,
      reason: input.reason,
      at: Timestamp.fromMillis(nowMs),
    };
    tx.set(bookingRef, {
      date: input.date,
      startTime: input.startTime,
      endTime: newEnd,
      ...(courtChanged ? {courtId: court!.id, courtName: court!.name} : {}),
      // Prazos derivados do início: confirmação de presença e lembretes valem para o horário novo.
      confirmationDeadline: Timestamp.fromMillis(newStartMs - 2 * 3600_000),
      reminder15mAt: Timestamp.fromMillis(newStartMs - BOOKING_REMINDER_15M_MINUTES_BEFORE * 60_000),
      reminder15mSentAt: null,
      attendanceReminder2hSentAt: null,
      attendanceReminder30mSentAt: null,
      attendanceConfirmed: false,
      attendanceStatus: "pending",
      rescheduleHistory: [...history, entry].slice(-RESCHEDULE_HISTORY_MAX),
      rescheduledAt: FieldValue.serverTimestamp(),
      rescheduledBy: uid,
      rescheduledByRole: input.as,
      ...(input.as === "athlete" ? {athleteRescheduleCount: num(freshData["athleteRescheduleCount"]) + 1} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    if (lesson.exists) {
      tx.set(lessonRef, {
        date: input.date,
        startTime: input.startTime,
        endTime: newEnd,
        ...(courtChanged ? {courtName: court!.name} : {}),
      }, {merge: true});
    }
    if (claim?.ok) claim.commit(tx);
    return {court: court!, courtChanged};
  });

  return {
    bookingId: input.bookingId,
    date: input.date,
    startTime: input.startTime,
    endTime: newEnd,
    courtId: chosen.court.id,
    courtName: chosen.court.name,
    courtChanged: chosen.courtChanged,
    tablePriceDiffReais,
  };
}

/** Os lembretes já enviados do horário antigo não podem segurar os do horário novo. */
async function releaseReminderLocks(db: Firestore, bookingId: string): Promise<void> {
  const base = artifactsPublicDataBase();
  const batch = db.batch();
  batch.delete(db.doc(`${base}/arenaBookingReminders15m/${bookingId}_15m`));
  for (const key of ["1h", "attendance_2h", "attendance_30m"]) {
    batch.delete(db.doc(`${base}/arenaBookingReminders/${bookingId}_${key}`));
  }
  await batch.commit();
}

export function rescheduledAthletePushBody(booking: DocumentData, nowMs: number): string {
  const arenaName = str(booking["arenaName"]) || "a arena";
  const when = whenOf(str(booking["date"]), str(booking["startTime"]));
  const court = athleteSeesBookingCourt(booking, nowMs) ? `, na ${str(booking["courtName"]) || "Quadra"}` : "";
  return `Sua reserva em ${arenaName} agora é ${when}${court}.`;
}

export function rescheduledArenaPushBody(previous: {date: string; startTime: string}, booking: DocumentData): string {
  const from = whenOf(previous.date, previous.startTime);
  const to = whenOf(str(booking["date"]), str(booking["startTime"]));
  return `Reserva de ${from} foi remarcada pelo atleta para ${to} · ${str(booking["courtName"]) || "Quadra"}.`;
}

export const rescheduleArenaBooking = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const db = getFirestore();
  const input = parseRescheduleBookingInput(request.data);
  const previous = (await db.collection(ARENA_BOOKINGS).doc(input.bookingId).get()).data() ?? {};
  const nowMs = Date.now();
  const result = await rescheduleArenaBookingCore(db, uid, input, nowMs);

  // Daqui pra baixo é acessório: a remarcação já foi gravada.
  try {
    await releaseReminderLocks(db, result.bookingId);
  } catch (e) {
    logger.warn("rescheduleArenaBooking: travas de lembrete ficaram", e);
  }
  const booking = (await db.collection(ARENA_BOOKINGS).doc(result.bookingId).get()).data() ?? {};
  try {
    await refreshInvitesOfRescheduledBookingCore(db, result.bookingId, booking, uid, nowMs);
  } catch (e) {
    logger.warn("rescheduleArenaBooking: convites não atualizados", e);
  }
  try {
    const arenaId = str(booking["arenaId"]);
    if (input.as === "arena") {
      const athleteId = str(booking["athleteId"]);
      if (athleteId && athleteId !== uid) {
        await deliverNotificationToUser({
          userId: athleteId,
          title: "Sua reserva foi remarcada",
          body: rescheduledAthletePushBody(booking, nowMs),
          type: BOOKING_RESCHEDULED_PUSH_TYPE,
          data: {type: BOOKING_RESCHEDULED_PUSH_TYPE, bookingId: result.bookingId, arenaId},
          requireInteraction: false,
        });
      }
    } else {
      const managerId = str((await db.collection("arenas").doc(arenaId).get()).data()?.["managerUserId"]);
      if (managerId && managerId !== uid) {
        await deliverNotificationToUser({
          userId: managerId,
          title: "Reserva remarcada",
          body: rescheduledArenaPushBody({date: str(previous["date"]), startTime: str(previous["startTime"])}, booking),
          type: BOOKING_RESCHEDULED_PUSH_TYPE,
          data: {
            type: BOOKING_RESCHEDULED_PUSH_TYPE,
            bookingId: result.bookingId,
            arenaId,
            // Agenda do gestor no app (a mesma do aviso de reserva nova).
            url: "/arena/schedule",
          },
          requireInteraction: false,
        });
      }
    }
  } catch (e) {
    logger.warn("rescheduleArenaBooking: push falhou", e);
  }

  logger.info("rescheduleArenaBooking: reserva remarcada", {
    bookingId: result.bookingId,
    as: input.as,
    by: uid,
    date: result.date,
    startTime: result.startTime,
    courtId: result.courtId,
  });
  return result;
});
