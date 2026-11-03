/**
 * Planos de horário — reposição: "Não vou nesta semana", crédito da arena (cancelamento pela agenda,
 * feriado, "Dar reposição") e o uso do crédito numa quadra do plano.
 *
 * Crédito = `arenaScheduleCredits/{id}` (id = bookingId de origem, `man_…` ou `hol_{sub}_{data}`,
 * idempotente). `makeupBalance` da assinatura acompanha os disponíveis (lido e regravado na mesma
 * transação).
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import {dayKeyFromEventDate} from "./event-timezone";
import {
  ARENA_RECURRING_BOOKINGS,
  addDaysToDateKey,
  fmtHourEnd,
  fmtHourStart,
  hasBlockedSlotOverlap,
  isValidDateKey,
  isoWeekdayOfDateKey,
  lockRefsForOccurrence,
  occurrenceBookingId,
  RECURRING_HORIZON_DAYS,
  toMinutes,
} from "./arena-recurring-booking";
import {monthKeyOf} from "./arena-class-ledger";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  ARENA_SCHEDULE_CREDITS,
  ARENA_SCHEDULE_SUBSCRIPTIONS,
  DEFAULT_PLAN_RULES,
  LIVE_SUBSCRIPTION_STATUSES,
  addMinutesToTime,
  candidateStartTimes,
  endMinutes,
  isCourtFree,
  occurrenceStartMs,
  parseSchedulePlan,
  startFitsWindows,
  str,
  type SchedulePlanRules,
} from "./arena-schedule-plan-constants";
import {
  busyBlocksOnDate,
  loadSubscriptionOrThrow,
  notifyScheduleSafe,
  planRef,
  readArenaOccupancy,
  requireScheduleManager,
  requireUid,
  rethrowSchedule,
  scheduleSettingsRef,
} from "./arena-schedule-plans";

type Data = Record<string, unknown>;
const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";

export type SkipOutcome = "granted" | "late_notice" | "monthly_limit" | "disabled";

export function planRulesOf(sub: Data): SchedulePlanRules {
  const rules = ((sub["planSnapshot"] ?? {}) as Data)["rules"] as Partial<SchedulePlanRules> | undefined;
  return {
    ...DEFAULT_PLAN_RULES,
    ...(rules ?? {}),
    makeup: {...DEFAULT_PLAN_RULES.makeup, ...(rules?.makeup ?? {})},
  };
}

/** Quantas reposições por aviso já saíram no mês (o contador zera quando o mês muda). */
export function grantedThisMonth(sub: Data, monthKey: string): number {
  const g = (sub["makeupsGranted"] ?? {}) as Data;
  return g["month"] === monthKey ? Number(g["count"] ?? 0) : 0;
}

/** Decide o crédito do "Não vou": regra desligada, aviso em cima da hora, limite do mês ou crédito. */
export function decideSkipCredit(input: {
  rules: SchedulePlanRules["makeup"];
  startMs: number;
  nowMs: number;
  grantedThisMonth: number;
}): SkipOutcome {
  if (!input.rules.enabled) return "disabled";
  if (input.startMs - input.nowMs < input.rules.noticeHours * 3_600_000) return "late_notice";
  if (input.grantedThisMonth >= input.rules.perMonth) return "monthly_limit";
  return "granted";
}

function creditData(input: {
  sub: Data; subscriptionId: string; reason: "skip" | "holiday" | "arena" | "manual";
  sourceBookingId: string | null; sourceDate: string | null; expiresOn: string; note?: string | null;
}): Data {
  return {
    arenaId: str(input.sub["arenaId"]),
    subscriptionId: input.subscriptionId,
    planId: str(input.sub["planId"]),
    holderName: str(input.sub["holderName"]),
    athleteIds: Array.isArray(input.sub["memberAthleteIds"]) ? input.sub["memberAthleteIds"] : [],
    reason: input.reason,
    sourceBookingId: input.sourceBookingId,
    sourceDate: input.sourceDate,
    status: "available",
    expiresOn: input.expiresOn,
    usedBookingId: null,
    usedDate: null,
    ...(input.note ? {note: input.note} : {}),
    createdAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Cancela uma ocorrência de plano dentro da transação, como `cancelArenaRecurringOccurrence`:
 * reserva cancelada, slot e travas liberados (só as travas desta reserva), data em `skippedDates`.
 * Leituras (`locks`, `series`) já feitas pelo chamador — transação lê tudo antes de escrever.
 */
function cancelOccurrenceInTx(
  tx: Transaction,
  db: Firestore,
  bookingId: string,
  booking: Data,
  locks: FirebaseFirestore.DocumentSnapshot[],
  series: FirebaseFirestore.DocumentSnapshot | null,
  role: string,
  reason: string,
): void {
  tx.set(db.collection(ARENA_BOOKINGS).doc(bookingId), {
    status: "cancelled",
    canceledAt: FieldValue.serverTimestamp(),
    canceledByRole: role,
    cancelReason: reason,
  }, {merge: true});
  tx.delete(db.collection(ARENA_SLOTS).doc(bookingId));
  for (const lock of locks) {
    if (lock.exists && lock.data()?.["bookingId"] === bookingId) tx.delete(lock.ref);
  }
  if (series?.exists) {
    const skipped = Array.isArray(series.data()?.["skippedDates"]) ? (series.data()?.["skippedDates"] as unknown[]).map(String) : [];
    const date = str(booking["date"]);
    if (!skipped.includes(date)) tx.set(series.ref, {skippedDates: [...skipped, date].sort()}, {merge: true});
  }
}

function lockRefsOfBooking(db: Firestore, booking: Data) {
  return lockRefsForOccurrence(db, {
    arenaId: str(booking["arenaId"]), courtId: str(booking["courtId"]),
    startTime: str(booking["startTime"]), endTime: str(booking["endTime"]),
  }, str(booking["date"])).map((l) => l.ref);
}

// ---------------------------------------------------------------------------
// "Não vou nesta semana"
// ---------------------------------------------------------------------------

export async function skipOccurrenceCore(
  db: Firestore,
  uid: string,
  bookingId: string,
  nowMs: number,
): Promise<{creditId: string | null; reason: SkipOutcome}> {
  if (!bookingId) throw new HttpsError("invalid-argument", "Reserva inválida.");
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const first = await bookingRef.get();
  if (!first.exists) throw new HttpsError("not-found", "Reserva não encontrada.");
  const booking0 = first.data() as Data;
  const subscriptionId = str(booking0["scheduleSubscriptionId"]);
  if (!subscriptionId) throw new HttpsError("failed-precondition", "Esta reserva não é de um plano de horário.");
  if (booking0["scheduleMakeupCreditId"]) {
    throw new HttpsError("failed-precondition", "Para desmarcar uma reposição, fale com a arena.");
  }
  const subRef = db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subscriptionId);
  const lockRefs = lockRefsOfBooking(db, booking0);
  const seriesId = str(booking0["recurringBookingId"]);

  const outcome = await db.runTransaction(async (tx: Transaction) => {
    const bookingSnap = await tx.get(bookingRef);
    const subSnap = await tx.get(subRef);
    const creditRef = db.collection(ARENA_SCHEDULE_CREDITS).doc(bookingId);
    const creditSnap = await tx.get(creditRef);
    const locks = await Promise.all(lockRefs.map((r) => tx.get(r)));
    const seriesSnap = seriesId ? await tx.get(db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId)) : null;
    if (!subSnap.exists) throw new HttpsError("not-found", "Assinatura não encontrada.");
    const sub = subSnap.data() as Data;
    const members = Array.isArray(sub["memberAthleteIds"]) ? (sub["memberAthleteIds"] as unknown[]).map(String) : [];
    if (!members.includes(uid)) throw new HttpsError("permission-denied", "Você não participa deste plano.");
    const booking = (bookingSnap.data() ?? {}) as Data;
    const status = str(booking["status"]).toLowerCase();
    if (status !== "active" && status !== "confirmed") {
      if (creditSnap.exists) return {creditId: bookingId, reason: "granted" as SkipOutcome};
      throw new HttpsError("failed-precondition", "Esta reserva não está mais ativa.");
    }
    const startMs = occurrenceStartMs(str(booking["date"]), str(booking["startTime"]));
    if (startMs <= nowMs) throw new HttpsError("failed-precondition", "Esse horário já começou.");

    const todayMonth = monthKeyOf(dayKeyFromEventDate(new Date(nowMs)));
    const rules = planRulesOf(sub);
    const granted = grantedThisMonth(sub, todayMonth);
    const reason = decideSkipCredit({rules: rules.makeup, startMs, nowMs, grantedThisMonth: granted});

    cancelOccurrenceInTx(tx, db, bookingId, booking, locks, seriesSnap, "athlete", "schedule_skip");
    if (reason !== "granted") return {creditId: null, reason};
    tx.set(creditRef, creditData({
      sub, subscriptionId, reason: "skip", sourceBookingId: bookingId, sourceDate: str(booking["date"]),
      expiresOn: addDaysToDateKey(str(booking["date"]), rules.makeup.validityDays),
    }));
    tx.set(subRef, {
      makeupBalance: Number(sub["makeupBalance"] ?? 0) + 1,
      makeupsGranted: {month: todayMonth, count: granted + 1},
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {creditId: bookingId, reason};
  });
  return outcome;
}

/**
 * Ocorrência de plano cancelada pela arena (agenda): vira crédito `arena` se o plano dá reposição.
 * Fora do limite do mês (não foi o atleta que faltou). Chamado por `cancelArenaRecurringOccurrence`.
 */
export async function grantArenaCanceledOccurrenceCredit(db: Firestore, bookingId: string, booking: Data): Promise<string | null> {
  const subscriptionId = str(booking["scheduleSubscriptionId"]);
  if (!subscriptionId || booking["scheduleMakeupCreditId"]) return null;
  const subRef = db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subscriptionId);
  const creditRef = db.collection(ARENA_SCHEDULE_CREDITS).doc(bookingId);
  const granted = await db.runTransaction(async (tx: Transaction) => {
    const subSnap = await tx.get(subRef);
    const creditSnap = await tx.get(creditRef);
    if (!subSnap.exists || creditSnap.exists) return false;
    const sub = subSnap.data() as Data;
    if (!(LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(sub["status"]))) return false;
    const rules = planRulesOf(sub);
    if (!rules.makeup.enabled) return false;
    const date = str(booking["date"]);
    tx.set(creditRef, creditData({
      sub, subscriptionId, reason: "arena", sourceBookingId: bookingId, sourceDate: date,
      expiresOn: addDaysToDateKey(date, rules.makeup.validityDays),
    }));
    tx.set(subRef, {makeupBalance: Number(sub["makeupBalance"] ?? 0) + 1, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return true;
  });
  return granted ? bookingId : null;
}

export async function grantManualMakeupCore(
  db: Firestore,
  uid: string,
  subscriptionId: string,
  noteRaw: unknown,
  todayKey: string,
): Promise<{creditId: string}> {
  const {ref, data} = await loadSubscriptionOrThrow(db, subscriptionId);
  await requireScheduleManager(db, str(data["arenaId"]), uid);
  if (!(LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(data["status"]))) {
    throw new HttpsError("failed-precondition", "Esta assinatura foi encerrada.");
  }
  const creditRef = db.collection(ARENA_SCHEDULE_CREDITS).doc(`man_${db.collection(ARENA_SCHEDULE_CREDITS).doc().id}`);
  await db.runTransaction(async (tx: Transaction) => {
    const subSnap = await tx.get(ref);
    const sub = (subSnap.data() ?? {}) as Data;
    tx.set(creditRef, creditData({
      sub, subscriptionId, reason: "manual", sourceBookingId: null, sourceDate: null,
      expiresOn: addDaysToDateKey(todayKey, planRulesOf(sub).makeup.validityDays),
      note: str(noteRaw).slice(0, 300) || null,
    }));
    tx.set(ref, {makeupBalance: Number(sub["makeupBalance"] ?? 0) + 1, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  });
  await notifyScheduleSafe(str(data["holderAthleteId"]), {
    title: "Você ganhou uma reposição",
    body: `A arena liberou uma reposição no plano ${str(data["planName"])}. Escolha o dia em "Meu plano".`,
    type: "schedule_plan_makeup_granted",
    data: {subscriptionId, creditId: creditRef.id},
  });
  return {creditId: creditRef.id};
}

// ---------------------------------------------------------------------------
// Feriado
// ---------------------------------------------------------------------------

export async function applyHolidayCore(
  db: Firestore,
  uid: string,
  arenaId: string,
  date: string,
  todayKey: string,
): Promise<{canceled: number; credits: number}> {
  await requireScheduleManager(db, arenaId, uid);
  if (!isValidDateKey(date) || date < todayKey) throw new HttpsError("invalid-argument", "Data do feriado inválida.");
  const weekday = isoWeekdayOfDateKey(date);
  const subs = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS)
    .where("arenaId", "==", arenaId)
    .where("status", "in", [...LIVE_SUBSCRIPTION_STATUSES])
    .get();
  let canceled = 0;
  let credits = 0;
  for (const doc of subs.docs) {
    const sub0 = doc.data() as Data;
    const rules = planRulesOf(sub0);
    // Plano "joga no feriado" não é afetado.
    if (rules.holiday !== "makeup") continue;
    if (str(sub0["startDate"]) > date) continue;
    const endsOn = typeof sub0["endsOn"] === "string" ? sub0["endsOn"] : null;
    if (endsOn && date >= endsOn) continue;
    const slot = (Array.isArray(sub0["slots"]) ? sub0["slots"] as Data[] : []).find((s) => Number(s["weekday"]) === weekday);
    if (!slot) continue;
    const seriesId = str(slot["seriesId"]);
    const bookingId = occurrenceBookingId(seriesId, date);
    const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
    const booking0 = await bookingRef.get();
    const lockRefs = booking0.exists ? lockRefsOfBooking(db, booking0.data() as Data) : [];
    const creditRef = db.collection(ARENA_SCHEDULE_CREDITS).doc(`hol_${doc.id}_${date}`);
    const bookingCreditRef = db.collection(ARENA_SCHEDULE_CREDITS).doc(bookingId);

    const outcome = await db.runTransaction(async (tx: Transaction) => {
      const subSnap = await tx.get(doc.ref);
      const bookingSnap = await tx.get(bookingRef);
      const seriesSnap = await tx.get(db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId));
      const creditSnap = await tx.get(creditRef);
      const bookingCreditSnap = await tx.get(bookingCreditRef);
      const locks = await Promise.all(lockRefs.map((r) => tx.get(r)));
      const sub = (subSnap.data() ?? {}) as Data;
      const booking = (bookingSnap.data() ?? {}) as Data;
      const live = bookingSnap.exists && ["active", "confirmed"].includes(str(booking["status"]).toLowerCase());
      const skippedBefore = Array.isArray(seriesSnap.data()?.["skippedDates"]) ?
        (seriesSnap.data()?.["skippedDates"] as unknown[]).map(String).includes(date) :
        false;
      // O jogo ainda ia acontecer: reserva ativa, ou data além do horizonte que ninguém tirou da série.
      // Já desmarcado/cancelado (com ou sem crédito) não ganha crédito de feriado por cima.
      const stillOn = live || (!bookingSnap.exists && !skippedBefore);
      let didCancel = false;
      if (live) {
        cancelOccurrenceInTx(tx, db, bookingId, booking, locks, seriesSnap, "arena_manager", "schedule_holiday");
        didCancel = true;
      } else if (seriesSnap.exists) {
        // Ainda não materializada (além do horizonte): a data já sai da série.
        const skipped = Array.isArray(seriesSnap.data()?.["skippedDates"]) ? (seriesSnap.data()?.["skippedDates"] as unknown[]).map(String) : [];
        if (!skipped.includes(date)) tx.set(seriesSnap.ref, {skippedDates: [...skipped, date].sort()}, {merge: true});
      }
      let didCredit = false;
      if (sub["status"] === "active" && stillOn && !creditSnap.exists && !bookingCreditSnap.exists) {
        tx.set(creditRef, creditData({
          sub, subscriptionId: doc.id, reason: "holiday", sourceBookingId: bookingSnap.exists ? bookingId : null,
          sourceDate: date, expiresOn: addDaysToDateKey(date, rules.makeup.validityDays),
        }));
        tx.set(doc.ref, {makeupBalance: Number(sub["makeupBalance"] ?? 0) + 1, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
        didCredit = true;
      }
      return {didCancel, didCredit};
    });
    if (outcome.didCancel) canceled += 1;
    if (outcome.didCredit) {
      credits += 1;
      for (const athleteId of Array.isArray(sub0["memberAthleteIds"]) ? sub0["memberAthleteIds"] as string[] : []) {
        await notifyScheduleSafe(athleteId, {
          title: "Feriado: seu horário vira reposição",
          body: `No dia ${date.split("-").reverse().join("/")} a arena não terá o seu horário do plano ${str(sub0["planName"])}. ` +
            "Você ganhou uma reposição.",
          type: "schedule_plan_holiday",
          data: {subscriptionId: doc.id, creditId: creditRef.id},
        });
      }
    }
  }
  const settingsRef = scheduleSettingsRef(db, arenaId);
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(settingsRef);
    const applied = Array.isArray(snap.data()?.["appliedHolidays"]) ? (snap.data()?.["appliedHolidays"] as unknown[]).map(String) : [];
    if (!applied.includes(date)) tx.set(settingsRef, {appliedHolidays: [...applied, date].sort()}, {merge: true});
  });
  return {canceled, credits};
}

// ---------------------------------------------------------------------------
// Usar a reposição
// ---------------------------------------------------------------------------

async function loadUsableCredit(db: Firestore, uid: string, creditId: string, date: string, todayKey: string) {
  if (!creditId) throw new HttpsError("invalid-argument", "Crédito inválido.");
  const creditSnap = await db.collection(ARENA_SCHEDULE_CREDITS).doc(creditId).get();
  if (!creditSnap.exists) throw new HttpsError("not-found", "Crédito não encontrado.");
  const credit = creditSnap.data() as Data;
  const athleteIds = Array.isArray(credit["athleteIds"]) ? (credit["athleteIds"] as unknown[]).map(String) : [];
  if (!athleteIds.includes(uid)) throw new HttpsError("permission-denied", "Este crédito não é seu.");
  if (credit["status"] !== "available") throw new HttpsError("failed-precondition", "Este crédito já foi usado ou venceu.");
  if (!isValidDateKey(date) || date < todayKey || date > str(credit["expiresOn"])) {
    throw new HttpsError("invalid-argument", "Escolha uma data até o vencimento do crédito.");
  }
  // Mesma janela da agenda (35 dias): além dela os horários fixos ainda não viraram reserva.
  if (date > addDaysToDateKey(todayKey, RECURRING_HORIZON_DAYS)) {
    throw new HttpsError("invalid-argument", `Escolha uma data nos próximos ${RECURRING_HORIZON_DAYS} dias.`);
  }
  const {data: sub} = await loadSubscriptionOrThrow(db, str(credit["subscriptionId"]));
  if (!(LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(sub["status"]))) {
    throw new HttpsError("failed-precondition", "Esta assinatura foi encerrada.");
  }
  const planSnap = await planRef(db, str(sub["arenaId"]), str(sub["planId"])).get();
  if (!planSnap.exists) throw new HttpsError("not-found", "Plano não encontrado.");
  const plan = parseSchedulePlan(planSnap.data() as Data);
  const durationMinutes = Number(((sub["planSnapshot"] ?? {}) as Data)["durationMinutes"] ?? plan.durationMinutes);
  return {credit, sub, plan, durationMinutes};
}

export async function getMakeupOptionsCore(
  db: Firestore,
  uid: string,
  creditId: string,
  date: string,
  todayKey: string,
  nowMs: number,
): Promise<{options: Array<{courtId: string; courtName: string; startTime: string; endTime: string}>}> {
  const {sub, plan, durationMinutes} = await loadUsableCredit(db, uid, creditId, date, todayKey);
  const arenaId = str(sub["arenaId"]);
  const weekday = isoWeekdayOfDateKey(date);
  const starts = candidateStartTimes(plan.windows, weekday, durationMinutes)
    .filter((t) => occurrenceStartMs(date, t) > nowMs);
  // Horário fixo de outro assinante, turma ou oferta da fila também ocupa (não só as travas).
  const busy = busyBlocksOnDate(await readArenaOccupancy(db, arenaId), date, nowMs);
  const lockCache = new Map<string, boolean>();
  const options: Array<{courtId: string; courtName: string; startTime: string; endTime: string}> = [];
  for (const startTime of starts) {
    const endTime = addMinutesToTime(startTime, durationMinutes);
    for (let i = 0; i < plan.courtIds.length; i++) {
      const courtId = plan.courtIds[i]!;
      if (!isCourtFree(busy, courtId, [weekday], toMinutes(startTime), endMinutes(endTime))) continue;
      const refs = lockRefsForOccurrence(db, {arenaId, courtId, startTime, endTime}, date).map((l) => l.ref);
      let free = true;
      for (const ref of refs) {
        if (!lockCache.has(ref.path)) lockCache.set(ref.path, (await ref.get()).exists);
        if (lockCache.get(ref.path)) free = false;
      }
      if (free) options.push({courtId, courtName: plan.courtNames[i] || "Quadra", startTime, endTime});
    }
  }
  return {options};
}

export async function useMakeupCore(
  db: Firestore,
  uid: string,
  input: {creditId: string; date: string; courtId: string; startTime: string},
  todayKey: string,
  nowMs: number,
): Promise<{bookingId: string}> {
  const {credit, sub, plan, durationMinutes} = await loadUsableCredit(db, uid, input.creditId, input.date, todayKey);
  const arenaId = str(sub["arenaId"]);
  const courtIdx = plan.courtIds.indexOf(input.courtId);
  if (courtIdx < 0) throw new HttpsError("invalid-argument", "Escolha uma quadra do plano.");
  const weekday = isoWeekdayOfDateKey(input.date);
  if (!startFitsWindows(plan.windows, weekday, input.startTime, durationMinutes)) {
    throw new HttpsError("invalid-argument", "Esse horário está fora das janelas do plano.");
  }
  if (occurrenceStartMs(input.date, input.startTime) <= nowMs) throw new HttpsError("invalid-argument", "Esse horário já passou.");
  const endTime = addMinutesToTime(input.startTime, durationMinutes);
  const courtName = plan.courtNames[courtIdx] || "Quadra";
  const occ = {arenaId, courtId: input.courtId, startTime: input.startTime, endTime};
  if (await hasBlockedSlotOverlap(db, occ, input.date)) {
    throw new HttpsError("failed-precondition", "Esse horário está bloqueado pela arena.");
  }
  const bookingId = `mk_${input.creditId}`;
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const slotRef = db.collection(ARENA_SLOTS).doc(bookingId);
  const creditRef = db.collection(ARENA_SCHEDULE_CREDITS).doc(input.creditId);
  const subRef = db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(str(credit["subscriptionId"]));
  const locks = lockRefsForOccurrence(db, occ, input.date);
  const startAt = new Date(occurrenceStartMs(input.date, input.startTime));

  await db.runTransaction(async (tx: Transaction) => {
    const creditSnap = await tx.get(creditRef);
    const subSnap = await tx.get(subRef);
    const lockSnaps = await Promise.all(locks.map((l) => tx.get(l.ref)));
    const occupancy = await readArenaOccupancy(db, arenaId, (q) => tx.get(q));
    if (creditSnap.data()?.["status"] !== "available") throw new HttpsError("failed-precondition", "Este crédito já foi usado ou venceu.");
    if (lockSnaps.some((s) => s.exists)) throw new HttpsError("failed-precondition", "Esse horário acabou de ser reservado. Escolha outro.");
    if (!isCourtFree(busyBlocksOnDate(occupancy, input.date, nowMs), input.courtId, [weekday],
      toMinutes(input.startTime), endMinutes(endTime))) {
      throw new HttpsError("failed-precondition", "Esse horário é fixo de outro atleta nesse dia. Escolha outro.");
    }

    tx.set(bookingRef, {
      athleteId: uid,
      arenaId,
      arenaName: str(sub["arenaName"]) || "Arena",
      courtId: input.courtId,
      courtName,
      customerName: str(sub["holderName"]) || null,
      date: input.date,
      startTime: input.startTime,
      endTime,
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
      confirmationDeadline: Timestamp.fromDate(new Date(startAt.getTime() - 2 * 60 * 60 * 1000)),
      paymentExpiresAt: null,
      source: "platform",
      isRecurring: false,
      recurringBookingId: null,
      scheduleSubscriptionId: subRef.id,
      scheduleMakeupCreditId: input.creditId,
      coveredByPlan: true,
      createdByRole: "athlete",
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(slotRef, {
      arenaId,
      courtId: input.courtId,
      date: input.date,
      dateKey: input.date,
      startTime: input.startTime,
      endTime,
      status: "booked",
      bookingAthleteId: uid,
      bookingId,
      isRecurring: false,
      priceReais: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    for (const lock of locks) {
      tx.set(lock.ref, {
        arenaId,
        courtId: input.courtId,
        date: input.date,
        startTime: fmtHourStart(lock.hour),
        endTime: fmtHourEnd(lock.hour),
        bookingId,
        bookingAthleteId: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(creditRef, {
      status: "used", usedBookingId: bookingId, usedDate: input.date, usedByUid: uid, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(subRef, {
      makeupBalance: Math.max(0, Number(subSnap.data()?.["makeupBalance"] ?? 0) - 1), updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
  return {bookingId};
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

export const skipArenaScheduleOccurrence = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await skipOccurrenceCore(getFirestore(), uid, str(input["bookingId"]), Date.now());
  } catch (e) {
    return rethrowSchedule("skipArenaScheduleOccurrence", e);
  }
});

export const grantArenaScheduleMakeup = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await grantManualMakeupCore(getFirestore(), uid, str(input["subscriptionId"]), input["note"], dayKeyFromEventDate(new Date()));
  } catch (e) {
    return rethrowSchedule("grantArenaScheduleMakeup", e);
  }
});

export const applyArenaScheduleHoliday = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 300}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await applyHolidayCore(getFirestore(), uid, str(input["arenaId"]), str(input["date"]), dayKeyFromEventDate(new Date()));
  } catch (e) {
    return rethrowSchedule("applyArenaScheduleHoliday", e);
  }
});

export const getArenaScheduleMakeupOptions = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await getMakeupOptionsCore(
      getFirestore(), uid, str(input["creditId"]), str(input["date"]), dayKeyFromEventDate(new Date()), Date.now(),
    );
  } catch (e) {
    return rethrowSchedule("getArenaScheduleMakeupOptions", e);
  }
});

export const useArenaScheduleMakeup = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await useMakeupCore(getFirestore(), uid, {
      creditId: str(input["creditId"]), date: str(input["date"]),
      courtId: str(input["courtId"]), startTime: str(input["startTime"]),
    }, dayKeyFromEventDate(new Date()), Date.now());
  } catch (e) {
    return rethrowSchedule("useArenaScheduleMakeup", e);
  }
});

