/**
 * Planos de horário — assinaturas: assinar (atleta, gestor ou fila), trocar horário, pausar,
 * retomar, encerrar (gestor) e cancelar (titular, no fim do período).
 *
 * Assinatura = uma série de horário fixo (`arenaRecurringBookings`) por dia escolhido, todas na
 * mesma quadra, carimbadas com `scheduleSubscriptionId`/`schedulePlanId`. A materialização,
 * as travas e os slots são os do horário fixo. A vaga do plano (`occupiedCount`) e a quadra são
 * decididas numa transação que também grava o doc do plano: duas assinaturas do mesmo plano ao
 * mesmo tempo se serializam ali.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {dayKeyFromEventDate} from "./event-timezone";
import {
  ARENA_RECURRING_BOOKINGS,
  RECURRING_HORIZON_DAYS,
  WEEKDAY_LABELS_PT,
  addDaysToDateKey,
  cancelFutureOccurrences,
  isValidDateKey,
  isoWeekdayOfDateKey,
  materializeSeriesOccurrences,
  parseRecurringSeriesData,
  toMinutes,
} from "./arena-recurring-booking";
import {dueDateFor, nextMonthKey, proratedAmount} from "./arena-class-billing";
import {monthKeyOf} from "./arena-class-ledger";
import {resolveAthleteDisplay} from "./arena-club-join";
import {athleteAccountPhone} from "./arena-class";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {offerNextForPlan} from "./arena-schedule-waitlist";
import {
  ARENA_SCHEDULE_ASAAS_PAYMENTS,
  ARENA_SCHEDULE_CHARGES,
  ARENA_SCHEDULE_SUBSCRIPTIONS,
  ARENA_SCHEDULE_WAITLIST,
  BILLING_METHODS,
  CYCLES,
  LIVE_SUBSCRIPTION_STATUSES,
  commitmentEndsOn,
  cycleMonthlyPrice,
  daysBetween,
  effectiveDueDay,
  endMinutes,
  firstDayOfMonth,
  fitsPrimeCap,
  formatDateBr,
  occurrenceStartMs,
  isCycleEnabled,
  lastDayOfMonth,
  parseSchedulePlan,
  pickCourt,
  primeCapacityMinutes,
  primeMinutesOfSlots,
  scheduleChargeId,
  splitCents,
  str,
  validateChosenSlots,
  type ParsedSchedulePlan,
  type ScheduleCycle,
} from "./arena-schedule-plan-constants";
import {
  arenaNameOf,
  authorizeSubscriptionActor,
  busyBlocksOf,
  liveOffersForPlan,
  loadArenaOrThrow,
  loadScheduleSettings,
  loadSubscriptionOrThrow,
  notifyScheduleSafe,
  planRef,
  planSeriesPrimeMinutes,
  readArenaOccupancy,
  requireScheduleEntitlement,
  requireScheduleManager,
  requireUid,
  rethrowSchedule,
} from "./arena-schedule-plans";

type Data = Record<string, unknown>;

export interface SubscriptionMember {
  athleteId: string | null;
  name: string;
  photoUrl: string | null;
  shareReais: number;
  role: "holder" | "member";
}

export interface SubscriptionSlot {
  weekday: number;
  startTime: string;
  endTime: string;
  courtId: string;
  courtName: string;
  seriesId: string;
}

// ---------------------------------------------------------------------------
// Mensalidades (montagem pura)
// ---------------------------------------------------------------------------

export type ChargeKind = "first" | "monthly" | "resume";

export interface PlannedFirstCharge {
  period: string;
  totalReais: number;
  dueDate: string;
  billedThrough: string;
}

/** Primeira data do dia da semana escolhido a partir de `fromKey` (inclusive). */
export function firstOccurrenceOnOrAfter(weekdays: readonly number[], fromKey: string): string {
  for (let i = 0; i < 7; i++) {
    const d = addDaysToDateKey(fromKey, i);
    if (weekdays.includes(isoWeekdayOfDateKey(d))) return d;
  }
  return fromKey;
}

/**
 * 1ª mensalidade: proporcional às ocorrências que sobram no mês (vence no 1º jogo). Sem ocorrência
 * sobrando, a 1ª é o mês seguinte cheio, no vencimento do plano.
 */
export function planFirstCharge(
  monthlyPriceReais: number,
  weekdays: readonly number[],
  startDate: string,
  dueDay: number,
): PlannedFirstCharge {
  const month = monthKeyOf(startDate);
  const pro = proratedAmount(monthlyPriceReais, weekdays, startDate);
  if (pro.amountReais > 0) {
    return {period: month, totalReais: pro.amountReais, dueDate: firstOccurrenceOnOrAfter(weekdays, startDate), billedThrough: month};
  }
  const next = nextMonthKey(month);
  return {period: next, totalReais: monthlyPriceReais, dueDate: dueDateFor(next, dueDay), billedThrough: next};
}

/** Uma mensalidade por pagador (rateio em centavos, resto no titular). Id `{assinatura}_{AAAA-MM}_{k}`. */
export function buildPayerCharges(
  sub: {id: string; arenaId: string; planName: string; holderName: string; holderAthleteId: string | null; members: readonly SubscriptionMember[]},
  period: string,
  kind: ChargeKind,
  totalReais: number,
  dueDate: string,
): Array<{id: string; data: Data}> {
  const members = sub.members.length > 0 ? sub.members :
    [{athleteId: sub.holderAthleteId, name: sub.holderName, photoUrl: null, shareReais: totalReais, role: "holder" as const}];
  const shares = splitCents(totalReais, members.length);
  return members.map((m, k) => ({
    id: scheduleChargeId(sub.id, period, k),
    data: {
      arenaId: sub.arenaId,
      subscriptionId: sub.id,
      planName: sub.planName,
      holderName: sub.holderName,
      period,
      kind,
      payerIndex: k,
      payerName: m.name,
      payerAthleteId: m.athleteId,
      visibleTo: [...new Set([m.athleteId, sub.holderAthleteId].filter((x): x is string => !!x))],
      amountReais: shares[k] ?? 0,
      dueDate,
      status: "open",
      paidAt: null,
      paidOn: null,
      paymentMethod: null,
      // Manual ou link Asaas: decide o gatilho `onArenaScheduleChargeWritten` (arena-schedule-asaas.ts).
      billingMode: null,
      registeredByUid: null,
      remindersSent: [],
      createdAt: FieldValue.serverTimestamp(),
    },
  }));
}

/**
 * Mensalidade nova pode ocupar o id? Livre, ou cancelada pela pausa (a pausa recuou `billedThrough`;
 * se a volta foi antes do mês, a mensalidade daquele mês tem de nascer de novo). Cancelada pelo
 * gestor fica cancelada.
 */
export function canWriteCharge(snap: {exists: boolean; data: () => Data | undefined}): boolean {
  if (!snap.exists) return true;
  const data = snap.data() ?? {};
  return data["status"] === "canceled" && data["cancelReason"] === "paused";
}

export function subChargeOwner(id: string, data: Data) {
  return {
    id,
    arenaId: str(data["arenaId"]),
    planName: str(data["planName"]),
    holderName: str(data["holderName"]),
    holderAthleteId: str(data["holderAthleteId"]) || null,
    members: Array.isArray(data["members"]) ? data["members"] as SubscriptionMember[] : [],
  };
}

export function seriesIdsOf(sub: Data): string[] {
  return Array.isArray(sub["slots"]) ?
    (sub["slots"] as Data[]).map((s) => str(s["seriesId"])).filter(Boolean) :
    [];
}

// ---------------------------------------------------------------------------
// Séries (agenda)
// ---------------------------------------------------------------------------

/**
 * Materializa as séries da assinatura até o horizonte. `persistConflicts` grava os conflitos desta
 * rodada em `skippedDates` (série nova, como `createArenaRecurringBooking`); na retomada eles são
 * transitórios e só o que já estava gravado fica (como `resumeArenaRecurringBooking`).
 */
export async function materializeSubscriptionSeries(
  db: Firestore,
  seriesIds: readonly string[],
  todayKey: string,
  persistConflicts: boolean,
  nowMs: number,
): Promise<string[]> {
  const skipped: string[] = [];
  const horizonKey = addDaysToDateKey(todayKey, RECURRING_HORIZON_DAYS);
  for (const seriesId of seriesIds) {
    const ref = db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const series = parseRecurringSeriesData(snap.data() as Data);
    if (series.status !== "active") continue;
    // O jogo de hoje que já começou não nasce de novo (retomada à noite não cria reserva no passado).
    const fromExclusive = occurrenceStartMs(todayKey, series.startTime) <= nowMs ? todayKey : addDaysToDateKey(todayKey, -1);
    try {
      const result = await materializeSeriesOccurrences(db, seriesId, series, fromExclusive, horizonKey);
      skipped.push(...result.skippedDates);
      await ref.set({
        materializedUntil: horizonKey,
        skippedDates: persistConflicts ?
          [...new Set([...series.skippedDates, ...result.skippedDates])].sort() :
          series.skippedDates,
      }, {merge: true});
    } catch (e) {
      // O materializador diário completa depois (`materializedUntil` ficou para trás).
      logger.error("arena-schedule: materialização falhou", {seriesId, error: e});
    }
  }
  return [...new Set(skipped)].sort();
}

/**
 * Libera a agenda das séries que saíram de jogo (pausada, suspensa, encerrada, trocada). Idempotente:
 * série que voltou a `active` não é tocada, e ocorrência já cancelada fica como está. A assinatura
 * marca `releasePending` na mesma transação da mudança de status; o agendador diário refaz a
 * liberação de quem ficou marcado (queda entre a transação e a liberação).
 */
export async function releaseSubscriptionSeries(
  db: Firestore,
  seriesIds: readonly string[],
  reason: string,
  subscriptionId?: string,
): Promise<number> {
  let released = 0;
  for (const seriesId of seriesIds) {
    const snap = await db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId).get();
    if (!snap.exists || snap.data()?.["status"] === "active") continue;
    released += (await cancelFutureOccurrences(db, seriesId, reason)).length;
  }
  if (subscriptionId) {
    await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subscriptionId)
      .set({releasePending: false, pendingReleaseSeriesIds: []}, {merge: true});
  }
  return released;
}

/** Campos que marcam a liberação pendente (gravados na transação que tira as séries de jogo). */
export function pendingRelease(seriesIds: readonly string[], reason: string): Data {
  return {releasePending: true, pendingReleaseSeriesIds: [...seriesIds], pendingReleaseReason: reason};
}

/**
 * Início real da assinatura/troca: se o horário de hoje já passou (horário de SP), começa amanhã —
 * nem reserva no passado nem proporcional cobrando um jogo que não houve.
 */
export function effectiveStartDate(startDate: string, startTime: string, todayKey: string, nowMs: number): string {
  if (startDate !== todayKey) return startDate;
  return occurrenceStartMs(todayKey, startTime) <= nowMs ? addDaysToDateKey(todayKey, 1) : todayKey;
}

function seriesDoc(input: {
  arenaId: string; arenaName: string; courtId: string; courtName: string; weekday: number;
  startTime: string; endTime: string; holderAthleteId: string | null; holderName: string;
  startDate: string; endDate: string | null; todayKey: string; uid: string; subscriptionId: string; planId: string;
}): Data {
  return {
    arenaId: input.arenaId,
    arenaName: input.arenaName,
    courtId: input.courtId,
    courtName: input.courtName,
    weekday: input.weekday,
    startTime: input.startTime,
    endTime: input.endTime,
    athleteId: input.holderAthleteId,
    customerName: input.holderName,
    // A ocorrência já está paga pela mensalidade do plano.
    amountReais: 0,
    status: "active",
    startDate: input.startDate,
    // Saída marcada ("Sai em dd/mm"): a série termina na véspera.
    endDate: input.endDate,
    skippedDates: [],
    paymentType: "monthly",
    pausedAt: null,
    // Antes da materialização: o materializador diário completa se algo falhar no meio.
    materializedUntil: addDaysToDateKey(input.todayKey, -1),
    createdBy: input.uid,
    createdAt: FieldValue.serverTimestamp(),
    canceledAt: null,
    cancelReason: null,
    scheduleSubscriptionId: input.subscriptionId,
    schedulePlanId: input.planId,
  };
}

// ---------------------------------------------------------------------------
// Assinar
// ---------------------------------------------------------------------------

export interface CreateSubscriptionRequest {
  arenaId: string;
  planId: string;
  holder: {athleteId: string | null; name: string; phone: string | null; photoUrl: string | null};
  /** Outros atletas do rateio (sem o titular). */
  memberAthleteIds: string[];
  weekdays: unknown;
  startTime: unknown;
  preferredCourtId: string | null;
  /** Gestor escolheu a quadra: ela ou nada. */
  strictCourt: boolean;
  cycle: unknown;
  paymentMethod: unknown;
  startDate: string;
  source: "arena" | "athlete" | "waitlist";
  createdByUid: string;
  audience: "manager" | "athlete";
  waitlistEntryId?: string | null;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  courtName: string;
  skippedDates: string[];
  firstCharge: {chargeId: string; period: string; kind: "first"; amountReais: number; totalReais: number; dueDate: string};
}

async function resolveMembers(
  db: Firestore,
  plan: ParsedSchedulePlan,
  holder: CreateSubscriptionRequest["holder"],
  memberAthleteIds: readonly string[],
): Promise<Array<Omit<SubscriptionMember, "shareReais">>> {
  const others = [...new Set(memberAthleteIds.map((id) => id.trim()).filter((id) => id && id !== holder.athleteId))];
  if (others.length > 0) {
    if (!plan.rules.split.enabled) throw new HttpsError("failed-precondition", "Este plano não permite dividir.");
    if (others.length + 1 > plan.rules.split.maxPlayers) {
      throw new HttpsError("invalid-argument", `Este plano divide entre até ${plan.rules.split.maxPlayers} atletas.`);
    }
  }
  const out: Array<Omit<SubscriptionMember, "shareReais">> = [
    {athleteId: holder.athleteId, name: holder.name, photoUrl: holder.photoUrl, role: "holder"},
  ];
  for (const athleteId of others) {
    const snap = await db.collection("users").doc(athleteId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Um dos atletas do rateio não tem conta no NexaGO.");
    const display = await resolveAthleteDisplay(db, athleteId);
    out.push({athleteId, name: display.name.slice(0, 80), photoUrl: display.photoUrl, role: "member"});
  }
  return out;
}

/** Titular com conta: nome, foto e telefone do cadastro. */
export async function resolveHolderAccount(db: Firestore, athleteId: string): Promise<CreateSubscriptionRequest["holder"]> {
  const snap = await db.collection("users").doc(athleteId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Atleta não encontrado.");
  const display = await resolveAthleteDisplay(db, athleteId);
  return {athleteId, name: display.name.slice(0, 80), phone: athleteAccountPhone(snap.data()), photoUrl: display.photoUrl};
}

export async function createSubscriptionCore(
  db: Firestore,
  req: CreateSubscriptionRequest,
  todayKey: string,
  nowMs: number,
): Promise<CreateSubscriptionResult> {
  const arena = await loadArenaOrThrow(db, req.arenaId);
  requireScheduleEntitlement(arena, nowMs, req.audience);
  if (!req.planId) throw new HttpsError("invalid-argument", "Plano inválido.");
  const pRef = planRef(db, req.arenaId, req.planId);
  const planSnap = await pRef.get();
  if (!planSnap.exists) throw new HttpsError("not-found", "Plano não encontrado.");
  const plan = parseSchedulePlan(planSnap.data() as Data);
  if (plan.status !== "active") throw new HttpsError("failed-precondition", "Este plano não está disponível.");

  const {weekdays, startTime, endTime} = validateChosenSlots(plan, req.weekdays, req.startTime);
  const cycle = str(req.cycle) as ScheduleCycle;
  if (!(CYCLES as readonly string[]).includes(cycle) || !isCycleEnabled(plan, cycle)) {
    throw new HttpsError("invalid-argument", "Ciclo indisponível neste plano.");
  }
  const paymentMethod = str(req.paymentMethod);
  if (!(BILLING_METHODS as readonly string[]).includes(paymentMethod) ||
    (req.audience === "athlete" && !(plan.billing.methods as string[]).includes(paymentMethod))) {
    throw new HttpsError("invalid-argument", "Forma de pagamento indisponível neste plano.");
  }
  if (!isValidDateKey(req.startDate) || req.startDate < todayKey) {
    throw new HttpsError("invalid-argument", "Data de início inválida.");
  }
  if (!req.holder.name) throw new HttpsError("invalid-argument", "Informe o titular.");
  const startDate = effectiveStartDate(req.startDate, startTime, todayKey, nowMs);

  const membersBase = await resolveMembers(db, plan, req.holder, req.memberAthleteIds);
  const settings = await loadScheduleSettings(db, req.arenaId);
  const monthlyPriceReais = cycleMonthlyPrice(plan, cycle);
  const shares = splitCents(monthlyPriceReais, membersBase.length);
  const members: SubscriptionMember[] = membersBase.map((m, i) => ({...m, shareReais: shares[i] ?? 0}));
  const dueDay = effectiveDueDay(plan.billing.dueDay, startDate);
  const first = planFirstCharge(monthlyPriceReais, weekdays, startDate, dueDay);
  const arenaName = arenaNameOf(arena);
  const startMin = toMinutes(startTime);
  const endMin = endMinutes(endTime);
  const entryId = req.waitlistEntryId ?? null;

  const subRef = db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc();
  const seriesRefs = weekdays.map(() => db.collection(ARENA_RECURRING_BOOKINGS).doc());

  const court = await db.runTransaction(async (tx: Transaction) => {
    const freshPlan = await tx.get(pRef);
    const fresh = parseSchedulePlan((freshPlan.data() ?? {}) as Data);
    const entrySnap = entryId ? await tx.get(db.collection(ARENA_SCHEDULE_WAITLIST).doc(entryId)) : null;
    const holderSubs = req.holder.athleteId ?
      await tx.get(db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).where("holderAthleteId", "==", req.holder.athleteId)) :
      null;
    const occ = await readArenaOccupancy(db, req.arenaId, (q) => tx.get(q));

    if (fresh.status !== "active") throw new HttpsError("failed-precondition", "Este plano não está disponível.");
    // Entrada da fila: o atleta aceita a oferta dele (viva); o gestor converte qualquer entrada aberta.
    let offerHoldsSeat = false;
    if (entrySnap) {
      const entry = (entrySnap.data() ?? {}) as Data;
      const offer = (entry["offer"] ?? {}) as Data;
      const offerLive = entry["status"] === "offered" && offer["expiresAt"] instanceof Timestamp &&
        offer["expiresAt"].toMillis() > nowMs;
      const samePlan = entrySnap.exists && entry["planId"] === req.planId && entry["arenaId"] === req.arenaId;
      const allowed = req.audience === "athlete" ?
        offerLive && str(entry["athleteId"]) === req.holder.athleteId :
        entry["status"] === "waiting" || entry["status"] === "offered";
      if (!samePlan || !allowed) {
        throw new HttpsError("failed-precondition", "Esta oferta não está mais disponível.");
      }
      // Oferta viva já segura a vaga (inclusive a do "Oferecer ao 1º" manual em plano cheio).
      offerHoldsSeat = offerLive;
    }
    const duplicate = (holderSubs?.docs ?? []).some((d) => d.data()["planId"] === req.planId &&
      (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(d.data()["status"])));
    if (duplicate) throw new HttpsError("already-exists", "Este atleta já tem este plano.");
    if (!offerHoldsSeat && fresh.occupiedCount + liveOffersForPlan(occ, req.planId, nowMs, entryId) >= fresh.capacity) {
      throw new HttpsError("resource-exhausted", "Este plano está lotado. Entre na lista de espera.");
    }
    const picked = pickCourt({
      courtIds: fresh.courtIds, courtNames: fresh.courtNames, weekdays, startMin, endMin,
      busy: busyBlocksOf(occ, {fromDate: startDate, nowMs, excludeEntryId: entryId}),
      preferredCourtId: req.preferredCourtId,
    });
    if (!picked || (req.strictCourt && picked.courtId !== req.preferredCourtId)) {
      throw new HttpsError(
        "resource-exhausted",
        req.strictCourt ?
          "A quadra escolhida não está livre em todos os dias nesse horário." :
          "Nenhuma quadra do plano está livre em todos os dias escolhidos nesse horário.",
      );
    }
    const slots = weekdays.map((weekday) => ({weekday, startTime, endTime}));
    if (!fitsPrimeCap({
      usedMinutes: planSeriesPrimeMinutes(occ, settings.primeWindows),
      addedMinutes: primeMinutesOfSlots(settings.primeWindows, slots),
      capacityMinutes: primeCapacityMinutes(settings.primeWindows, occ.activeCourts),
      capPercent: settings.primeCapPercent,
    })) {
      throw new HttpsError("resource-exhausted", "O horário nobre já está no limite de planos.");
    }

    const subSlots: SubscriptionSlot[] = weekdays.map((weekday, i) => ({
      weekday, startTime, endTime, courtId: picked.courtId, courtName: picked.courtName, seriesId: seriesRefs[i]!.id,
    }));
    weekdays.forEach((weekday, i) => {
      tx.set(seriesRefs[i]!, seriesDoc({
        arenaId: req.arenaId, arenaName, courtId: picked.courtId, courtName: picked.courtName, weekday, startTime, endTime,
        holderAthleteId: req.holder.athleteId, holderName: req.holder.name, startDate, endDate: null, todayKey,
        uid: req.createdByUid, subscriptionId: subRef.id, planId: req.planId,
      }));
    });
    tx.set(subRef, {
      arenaId: req.arenaId,
      arenaName,
      planId: req.planId,
      planName: fresh.name,
      planSnapshot: {
        timesPerWeek: fresh.timesPerWeek,
        durationMinutes: fresh.durationMinutes,
        rules: fresh.rules,
        overdueReleaseDays: fresh.billing.overdueReleaseDays,
        dueDay,
      },
      holderAthleteId: req.holder.athleteId,
      holderName: req.holder.name,
      holderPhone: req.holder.phone,
      holderPhotoUrl: req.holder.photoUrl,
      memberAthleteIds: members.map((m) => m.athleteId).filter((x): x is string => !!x),
      members,
      slots: subSlots,
      cycle,
      monthlyPriceReais,
      commitmentEndsOn: commitmentEndsOn(cycle, startDate),
      paymentMethod,
      billingMode: "manual",
      dueDay,
      status: "active",
      endsOn: null,
      pausedUntil: null,
      pausedAt: null,
      pauseDaysUsed: {year: todayKey.slice(0, 4), days: 0},
      suspendedAt: null,
      billedThrough: first.billedThrough,
      makeupBalance: 0,
      makeupsGranted: {month: monthKeyOf(todayKey), count: 0},
      startDate: startDate,
      source: req.source,
      waitlistEntryId: entryId,
      createdByUid: req.createdByUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      canceledAt: null,
      cancelReason: null,
    });
    const owner = {id: subRef.id, arenaId: req.arenaId, planName: fresh.name, holderName: req.holder.name, holderAthleteId: req.holder.athleteId, members};
    for (const c of buildPayerCharges(owner, first.period, "first", first.totalReais, first.dueDate)) {
      tx.set(db.collection(ARENA_SCHEDULE_CHARGES).doc(c.id), c.data);
    }
    tx.set(pRef, {
      occupiedCount: fresh.occupiedCount + 1,
      ...(entrySnap ? {waitingCount: Math.max(0, fresh.waitingCount - 1)} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    if (entrySnap) {
      tx.set(entrySnap.ref, {status: "accepted", subscriptionId: subRef.id, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
    return picked;
  });

  const skippedDates = await materializeSubscriptionSeries(db, seriesRefs.map((r) => r.id), todayKey, true, nowMs);

  const when = `${weekdays.map((d) => WEEKDAY_LABELS_PT[d]).join(", ")} · ${startTime}`;
  if (req.audience === "manager") {
    await notifyScheduleSafe(req.holder.athleteId, {
      title: "Plano de horário confirmado 🎾",
      body: `${plan.name} em ${arenaName}: ${when} · ${court.courtName}.`,
      type: "schedule_plan_subscribed",
      data: {subscriptionId: subRef.id, arenaId: req.arenaId},
    });
  }
  for (const m of members.filter((x) => x.role === "member")) {
    await notifyScheduleSafe(m.athleteId, {
      title: "Você entrou num plano de horário",
      body: `${req.holder.name} incluiu você no plano ${plan.name} em ${arenaName} (${when}).`,
      type: "schedule_plan_member_added",
      data: {subscriptionId: subRef.id, arenaId: req.arenaId},
    });
  }

  logger.info("arena-schedule: assinatura criada", {subscriptionId: subRef.id, arenaId: req.arenaId, skipped: skippedDates.length});
  const holderShare = splitCents(first.totalReais, members.length)[0] ?? first.totalReais;
  return {
    subscriptionId: subRef.id,
    courtName: court.courtName,
    skippedDates,
    firstCharge: {
      chargeId: scheduleChargeId(subRef.id, first.period, 0),
      period: first.period,
      kind: "first",
      amountReais: holderShare,
      totalReais: first.totalReais,
      dueDate: first.dueDate,
    },
  };
}

// ---------------------------------------------------------------------------
// Trocar horário
// ---------------------------------------------------------------------------

export async function changeSubscriptionSlotsCore(
  db: Firestore,
  uid: string,
  subscriptionId: string,
  rawWeekdays: unknown,
  rawStartTime: unknown,
  todayKey: string,
  nowMs: number,
): Promise<{courtName: string; skippedDates: string[]}> {
  const {ref, data} = await loadSubscriptionOrThrow(db, subscriptionId);
  const actor = await authorizeSubscriptionActor(db, data, uid);
  if (data["status"] !== "active") throw new HttpsError("failed-precondition", "Só dá para trocar o horário de um plano ativo.");
  const arenaId = str(data["arenaId"]);
  const planId = str(data["planId"]);
  const pRef = planRef(db, arenaId, planId);
  const planSnap = await pRef.get();
  if (!planSnap.exists) throw new HttpsError("not-found", "Plano não encontrado.");
  const plan = parseSchedulePlan(planSnap.data() as Data);
  const snapshot = (data["planSnapshot"] ?? {}) as Data;
  const timesPerWeek = Number(snapshot["timesPerWeek"] ?? plan.timesPerWeek);
  const durationMinutes = Number(snapshot["durationMinutes"] ?? plan.durationMinutes);
  const {weekdays, startTime, endTime} = validateChosenSlots(
    {windows: plan.windows, timesPerWeek, durationMinutes}, rawWeekdays, rawStartTime,
  );
  const settings = await loadScheduleSettings(db, arenaId);
  const oldSeriesIds = seriesIdsOf(data);
  const newSeriesRefs = weekdays.map(() => db.collection(ARENA_RECURRING_BOOKINGS).doc());
  const startMin = toMinutes(startTime);
  const endMin = endMinutes(endTime);
  const holderAthleteId = str(data["holderAthleteId"]) || null;
  const holderName = str(data["holderName"]);
  const arenaName = str(data["arenaName"]) || "Arena";
  const startDate = effectiveStartDate(todayKey, startTime, todayKey, nowMs);

  const court = await db.runTransaction(async (tx: Transaction) => {
    const subSnap = await tx.get(ref);
    // Saída marcada vale para as séries novas também.
    const endsOn = subSnap.data()?.["endsOn"];
    const endDate = typeof endsOn === "string" && endsOn ? addDaysToDateKey(endsOn, -1) : null;
    // Lê o plano só para serializar com quem estiver assinando o mesmo plano agora.
    await tx.get(pRef);
    const occ = await readArenaOccupancy(db, arenaId, (q) => tx.get(q));
    if (subSnap.data()?.["status"] !== "active") throw new HttpsError("failed-precondition", "Só dá para trocar o horário de um plano ativo.");
    const picked = pickCourt({
      courtIds: plan.courtIds, courtNames: plan.courtNames, weekdays, startMin, endMin,
      busy: busyBlocksOf(occ, {fromDate: todayKey, nowMs, excludeSeriesIds: oldSeriesIds}),
    });
    if (!picked) throw new HttpsError("resource-exhausted", "Nenhuma quadra do plano está livre em todos os dias escolhidos nesse horário.");
    if (!fitsPrimeCap({
      usedMinutes: planSeriesPrimeMinutes(occ, settings.primeWindows, oldSeriesIds),
      addedMinutes: primeMinutesOfSlots(settings.primeWindows, weekdays.map((weekday) => ({weekday, startTime, endTime}))),
      capacityMinutes: primeCapacityMinutes(settings.primeWindows, occ.activeCourts),
      capPercent: settings.primeCapPercent,
    })) {
      throw new HttpsError("resource-exhausted", "O horário nobre já está no limite de planos.");
    }
    for (const seriesId of oldSeriesIds) {
      tx.set(db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId), {
        status: "canceled", canceledAt: FieldValue.serverTimestamp(), cancelReason: "schedule_slots_changed",
      }, {merge: true});
    }
    weekdays.forEach((weekday, i) => {
      tx.set(newSeriesRefs[i]!, seriesDoc({
        arenaId, arenaName, courtId: picked.courtId, courtName: picked.courtName, weekday, startTime, endTime,
        holderAthleteId, holderName, startDate, endDate, todayKey, uid, subscriptionId, planId,
      }));
    });
    tx.set(ref, {
      slots: weekdays.map((weekday, i): SubscriptionSlot => ({
        weekday, startTime, endTime, courtId: picked.courtId, courtName: picked.courtName, seriesId: newSeriesRefs[i]!.id,
      })),
      ...pendingRelease(oldSeriesIds, "schedule_slots_changed"),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return picked;
  });

  await releaseSubscriptionSeries(db, oldSeriesIds, "schedule_slots_changed", subscriptionId);
  const skippedDates = await materializeSubscriptionSeries(db, newSeriesRefs.map((r) => r.id), todayKey, true, nowMs);
  if (actor === "manager") {
    await notifyScheduleSafe(holderAthleteId, {
      title: "Horário do plano alterado",
      body: `Seu plano ${str(data["planName"])} em ${arenaName} agora é ${weekdays.map((d) => WEEKDAY_LABELS_PT[d]).join(", ")} ` +
        `· ${startTime} · ${court.courtName}.`,
      type: "schedule_plan_slots_changed",
      data: {subscriptionId, arenaId},
    });
  }
  return {courtName: court.courtName, skippedDates};
}

// ---------------------------------------------------------------------------
// Pausar / retomar
// ---------------------------------------------------------------------------

function pauseRules(sub: Data): {enabled: boolean; maxDaysPerYear: number} {
  const rules = ((sub["planSnapshot"] ?? {}) as Data)["rules"] as Data | undefined;
  const pause = (rules?.["pause"] ?? {}) as Data;
  return {enabled: pause["enabled"] !== false, maxDaysPerYear: Number(pause["maxDaysPerYear"] ?? 30)};
}

/** Dias de pausa já usados no ano civil de `todayKey`. */
export function pauseDaysUsedIn(sub: Data, todayKey: string): number {
  const used = (sub["pauseDaysUsed"] ?? {}) as Data;
  return used["year"] === todayKey.slice(0, 4) ? Number(used["days"] ?? 0) : 0;
}

/** Meses inteiros dentro da pausa [today, until) — não geram mensalidade. */
export function fullyPausedMonths(todayKey: string, untilKey: string): string[] {
  const out: string[] = [];
  for (let m = monthKeyOf(todayKey); firstDayOfMonth(m) < untilKey && out.length < 24; m = nextMonthKey(m)) {
    if (firstDayOfMonth(m) >= todayKey && lastDayOfMonth(m) < untilKey) out.push(m);
  }
  return out;
}

export async function pauseSubscriptionCore(
  db: Firestore,
  uid: string,
  subscriptionId: string,
  untilRaw: unknown,
  todayKey: string,
): Promise<{pausedUntil: string; daysLeft: number}> {
  const {ref, data} = await loadSubscriptionOrThrow(db, subscriptionId);
  await authorizeSubscriptionActor(db, data, uid);
  const until = str(untilRaw);
  const rules = pauseRules(data);
  if (!rules.enabled) throw new HttpsError("failed-precondition", "Este plano não permite pausa.");
  if (!isValidDateKey(until) || until <= todayKey) throw new HttpsError("invalid-argument", "Escolha a data de volta.");
  const days = daysBetween(todayKey, until);

  const result = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const sub = (snap.data() ?? {}) as Data;
    if (sub["status"] !== "active") throw new HttpsError("failed-precondition", "Só dá para pausar um plano ativo.");
    const used = pauseDaysUsedIn(sub, todayKey);
    const left = rules.maxDaysPerYear - used;
    if (days > left) {
      throw new HttpsError("failed-precondition", left > 0 ?
        `Você pode pausar mais ${left} dia(s) este ano.` :
        "Os dias de pausa deste ano já foram usados.");
    }
    const months = fullyPausedMonths(todayKey, until);
    const charges = months.length > 0 ?
      await tx.get(db.collection(ARENA_SCHEDULE_CHARGES).where("subscriptionId", "==", subscriptionId)) :
      null;
    let billedThrough = typeof sub["billedThrough"] === "string" ? sub["billedThrough"] : null;
    for (const c of charges?.docs ?? []) {
      if (c.data()["status"] === "open" && months.includes(String(c.data()["period"]))) {
        tx.set(c.ref, {status: "canceled", canceledAt: FieldValue.serverTimestamp(), cancelReason: "paused"}, {merge: true});
      }
    }
    // Mês inteiro pausado sai do faturado: a volta gera o proporcional dela.
    if (months.length > 0 && billedThrough && billedThrough >= months[0]!) {
      billedThrough = monthKeyOf(addDaysToDateKey(firstDayOfMonth(months[0]!), -1));
    }
    for (const seriesId of seriesIdsOf(sub)) {
      tx.set(db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId), {status: "paused", pausedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
    tx.set(ref, {
      status: "paused",
      pausedUntil: until,
      pausedAt: FieldValue.serverTimestamp(),
      pauseDaysUsed: {year: todayKey.slice(0, 4), days: used + days},
      billedThrough,
      ...pendingRelease(seriesIdsOf(sub), "schedule_subscription_paused"),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {pausedUntil: until, daysLeft: left - days};
  });

  await releaseSubscriptionSeries(db, seriesIdsOf(data), "schedule_subscription_paused", subscriptionId);
  return result;
}

/** Volta da pausa (botão ou agendador em `pausedUntil`). `uid` null = agendador. */
export async function resumeSubscriptionCore(
  db: Firestore,
  uid: string | null,
  subscriptionId: string,
  todayKey: string,
  nowMs: number = Date.now(),
): Promise<{status: string}> {
  const {ref, data} = await loadSubscriptionOrThrow(db, subscriptionId);
  if (uid) await authorizeSubscriptionActor(db, data, uid);
  const month = monthKeyOf(todayKey);
  const startTime = str(((Array.isArray(data["slots"]) ? data["slots"][0] : null) as Data | null)?.["startTime"]);
  // Volta depois do horário de hoje: o proporcional conta a partir de amanhã.
  const fromKey = startTime ? effectiveStartDate(todayKey, startTime, todayKey, nowMs) : todayKey;

  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const sub = (snap.data() ?? {}) as Data;
    if (sub["status"] !== "paused") throw new HttpsError("failed-precondition", "Este plano não está pausado.");
    const owner = subChargeOwner(subscriptionId, sub);
    const billedThrough = typeof sub["billedThrough"] === "string" ? sub["billedThrough"] : null;
    const resumesBilling = billedThrough == null || billedThrough < month;
    const weekdays = Array.isArray(sub["slots"]) ? (sub["slots"] as Data[]).map((s) => Number(s["weekday"])) : [];
    const planned = resumesBilling ?
      buildPayerCharges(owner, month, "resume",
        monthKeyOf(fromKey) === month ? proratedAmount(Number(sub["monthlyPriceReais"] ?? 0), weekdays, fromKey).amountReais : 0,
        firstOccurrenceOnOrAfter(weekdays, fromKey)) :
      [];
    const existing = await Promise.all(planned.map((c) => tx.get(db.collection(ARENA_SCHEDULE_CHARGES).doc(c.id))));
    // A mensalidade regravada no mesmo id perde o espelho `asaas`: se o grupo dela ainda está vivo
    // (o gatilho da pausa atrasou), a anulação dele sai aqui, na mesma transação.
    const oldGroups = await Promise.all(existing.map((snap) => {
      const groupId = str(((snap.data()?.["asaas"] ?? {}) as Data)["groupId"]);
      return snap.exists && canWriteCharge(snap) && groupId ?
        tx.get(db.collection(ARENA_SCHEDULE_ASAAS_PAYMENTS).doc(groupId)) :
        Promise.resolve(null);
    }));

    // Volta antes do previsto devolve os dias não usados.
    const pausedUntil = typeof sub["pausedUntil"] === "string" ? sub["pausedUntil"] : null;
    const refund = pausedUntil && pausedUntil > todayKey ? daysBetween(todayKey, pausedUntil) : 0;
    const used = pauseDaysUsedIn(sub, todayKey);

    if (planned.length > 0 && Number(planned.reduce((s, c) => s + Number(c.data["amountReais"]), 0)) > 0) {
      planned.forEach((c, i) => {
        // Mensalidade cancelada pela pausa no mesmo id dá lugar à da volta.
        if (canWriteCharge(existing[i]!)) {
          tx.set(db.collection(ARENA_SCHEDULE_CHARGES).doc(c.id), c.data);
          const group = oldGroups[i];
          const state = str(group?.data()?.["state"]);
          if (group && ["pending", "creating", "open", "failed", "needs_cpf"].includes(state)) {
            const next = state === "needs_cpf" ? "void" : "voiding";
            tx.set(group.ref, {
              state: next, voidReason: "paused", ...(next === "void" ? {voidedAt: FieldValue.serverTimestamp()} : {}),
              updatedAt: FieldValue.serverTimestamp(),
            }, {merge: true});
          }
        }
      });
    }
    for (const seriesId of seriesIdsOf(sub)) {
      tx.set(db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId), {status: "active", pausedAt: null}, {merge: true});
    }
    tx.set(ref, {
      status: "active",
      pausedUntil: null,
      pausedAt: null,
      pauseDaysUsed: {year: todayKey.slice(0, 4), days: Math.max(0, used - refund)},
      releasePending: false,
      pendingReleaseSeriesIds: [],
      ...(resumesBilling ? {billedThrough: month} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });

  await materializeSubscriptionSeries(db, seriesIdsOf(data), todayKey, false, nowMs);
  if (!uid) {
    await notifyScheduleSafe(str(data["holderAthleteId"]), {
      title: "Seu plano voltou",
      body: `A pausa do plano ${str(data["planName"])} terminou. Seus horários estão de volta na agenda.`,
      type: "schedule_plan_resumed",
      data: {subscriptionId, arenaId: str(data["arenaId"])},
    });
  }
  return {status: "active"};
}

// ---------------------------------------------------------------------------
// Encerrar
// ---------------------------------------------------------------------------

/**
 * Encerra de vez (hoje ou no `endsOn` pelo agendador): séries canceladas, ocorrências futuras
 * liberadas, mensalidades abertas de meses depois do último dia canceladas e a vaga devolvida.
 */
export async function finalizeSubscriptionEndCore(
  db: Firestore,
  subscriptionId: string,
  todayKey: string,
  nowMs: number,
  reason: string | null,
  opts: {offerWaitlist?: boolean; message?: string} = {},
): Promise<{status: string; endsOn: string}> {
  const ref = db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subscriptionId);
  const lastDay = addDaysToDateKey(todayKey, -1);
  const result = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Assinatura não encontrada.");
    const sub = snap.data() as Data;
    if (!(LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(sub["status"]))) {
      throw new HttpsError("failed-precondition", "Esta assinatura já foi encerrada.");
    }
    const pRef = planRef(db, str(sub["arenaId"]), str(sub["planId"]));
    const planSnap = await tx.get(pRef);
    const charges = await tx.get(db.collection(ARENA_SCHEDULE_CHARGES).where("subscriptionId", "==", subscriptionId));
    for (const c of charges.docs) {
      if (c.data()["status"] === "open" && String(c.data()["period"]) > monthKeyOf(lastDay)) {
        tx.set(c.ref, {status: "canceled", canceledAt: FieldValue.serverTimestamp(), cancelReason: "subscription_ended"}, {merge: true});
      }
    }
    for (const seriesId of seriesIdsOf(sub)) {
      tx.set(db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId), {
        status: "canceled", canceledAt: FieldValue.serverTimestamp(), cancelReason: "schedule_subscription_ended",
      }, {merge: true});
    }
    if (planSnap.exists) {
      const occupied = Math.max(0, Number(planSnap.data()?.["occupiedCount"] ?? 0) - 1);
      tx.set(pRef, {occupiedCount: occupied, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
    const endsOn = typeof sub["endsOn"] === "string" && sub["endsOn"] <= todayKey ? sub["endsOn"] : todayKey;
    tx.set(ref, {
      status: "canceled",
      endsOn,
      canceledAt: FieldValue.serverTimestamp(),
      cancelReason: reason ?? sub["cancelReason"] ?? null,
      ...pendingRelease(seriesIdsOf(sub), "schedule_subscription_ended"),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {sub, endsOn};
  });

  await releaseSubscriptionSeries(db, seriesIdsOf(result.sub), "schedule_subscription_ended", subscriptionId);
  await notifyScheduleSafe(str(result.sub["holderAthleteId"]), {
    title: "Plano de horário encerrado",
    body: opts.message ??
      `Seu plano ${str(result.sub["planName"])} em ${str(result.sub["arenaName"]) || "Arena"} foi encerrado.`,
    type: "schedule_plan_ended",
    data: {subscriptionId, arenaId: str(result.sub["arenaId"])},
  });
  // Vaga livre: oferece ao 1º da fila (import circular com a fila: só em tempo de chamada).
  if (opts.offerWaitlist === false) return {status: "canceled", endsOn: result.endsOn};
  try {
    await offerNextForPlan(db, str(result.sub["arenaId"]), str(result.sub["planId"]), nowMs);
  } catch (e) {
    logger.warn("arena-schedule: oferta automática da fila falhou", {subscriptionId, error: e});
  }
  return {status: "canceled", endsOn: result.endsOn};
}

/**
 * Quadra do plano excluída (materializador diário): a assinatura acaba hoje — séries canceladas,
 * mensalidades futuras abertas canceladas, vaga devolvida. Sem oferta à fila (a quadra sumiu).
 * Retorna false se a assinatura já não estava viva.
 */
export async function endSubscriptionForRemovedCourt(
  db: Firestore,
  subscriptionId: string,
  todayKey: string,
  nowMs: number,
): Promise<boolean> {
  const snap = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subscriptionId).get();
  if (!snap.exists || !(LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(snap.data()?.["status"]))) return false;
  const sub = snap.data() as Data;
  await finalizeSubscriptionEndCore(db, subscriptionId, todayKey, nowMs, "court_removed", {
    offerWaitlist: false,
    message: `A quadra do seu plano ${str(sub["planName"])} em ${str(sub["arenaName"]) || "Arena"} foi removida ` +
      "e o plano foi encerrado. Fale com a arena.",
  });
  return true;
}

/**
 * Saída com data futura (dentro de transação): mensalidades abertas de meses depois do último dia
 * canceladas, séries cortadas na véspera e `endsOn` gravado. O agendador encerra no dia.
 */
function markFutureExit(
  tx: Transaction,
  db: Firestore,
  ref: FirebaseFirestore.DocumentReference,
  sub: Data,
  charges: FirebaseFirestore.QueryDocumentSnapshot[],
  endsOn: string,
  fields: Data,
): void {
  const lastDay = addDaysToDateKey(endsOn, -1);
  for (const c of charges) {
    if (c.data()["status"] === "open" && String(c.data()["period"]) > monthKeyOf(lastDay)) {
      tx.set(c.ref, {status: "canceled", canceledAt: FieldValue.serverTimestamp(), cancelReason: "subscription_ending"}, {merge: true});
    }
  }
  for (const seriesId of seriesIdsOf(sub)) {
    tx.set(db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId), {endDate: lastDay}, {merge: true});
  }
  tx.set(ref, {endsOn, ...fields, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
}

/** Depois de `markFutureExit`: libera as ocorrências já materializadas a partir da saída. */
async function releaseAfterExit(db: Firestore, sub: Data, endsOn: string): Promise<void> {
  const lastDay = addDaysToDateKey(endsOn, -1);
  for (const seriesId of seriesIdsOf(sub)) {
    await cancelFutureOccurrences(db, seriesId, "schedule_subscription_ending", {afterDateKey: lastDay});
  }
}

/**
 * Saída pedida pelo titular: o plano vai até o fim do mês corrente, do último mês já pago ou do mês
 * em que a fidelidade (trimestral/anual) termina — o que vier depois. Devolve o 1º dia sem o plano.
 */
export function athleteExitDate(todayKey: string, paidPeriods: readonly string[], commitmentEnds: string | null): string {
  let last = monthKeyOf(todayKey);
  for (const p of paidPeriods) if (p > last) last = p;
  if (commitmentEnds && commitmentEnds > todayKey) {
    const m = monthKeyOf(addDaysToDateKey(commitmentEnds, -1));
    if (m > last) last = m;
  }
  return firstDayOfMonth(nextMonthKey(last));
}

export const ATHLETE_EXIT_REASON = "Saída pedida pelo atleta";

/**
 * O titular cancela o próprio plano pelo app. Nunca encerra na hora: marca a saída em
 * `athleteExitDate` (sem estorno do que já foi pago) e o agendador encerra no dia.
 */
export async function cancelMySubscriptionCore(
  db: Firestore,
  uid: string,
  subscriptionId: string,
  todayKey: string,
): Promise<{endsOn: string}> {
  const {ref, data} = await loadSubscriptionOrThrow(db, subscriptionId);
  if (str(data["holderAthleteId"]) !== uid) {
    const members = Array.isArray(data["memberAthleteIds"]) ? (data["memberAthleteIds"] as unknown[]).map(String) : [];
    throw new HttpsError(
      "permission-denied",
      members.includes(uid) ? "Só o titular do plano pode cancelar." : "Você não participa deste plano.",
    );
  }
  const endsOn = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const sub = (snap.data() ?? {}) as Data;
    if (!(LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(sub["status"]))) {
      throw new HttpsError("failed-precondition", "Este plano já foi encerrado.");
    }
    if (typeof sub["endsOn"] === "string" && sub["endsOn"]) {
      throw new HttpsError("failed-precondition", `Seu plano já termina em ${formatDateBr(sub["endsOn"])}.`);
    }
    const charges = await tx.get(db.collection(ARENA_SCHEDULE_CHARGES).where("subscriptionId", "==", subscriptionId));
    const paid = charges.docs.filter((c) => c.data()["status"] === "paid").map((c) => String(c.data()["period"]));
    const commitment = typeof sub["commitmentEndsOn"] === "string" ? sub["commitmentEndsOn"] : null;
    const exit = athleteExitDate(todayKey, paid, commitment);
    markFutureExit(tx, db, ref, sub, charges.docs, exit, {
      cancelReason: ATHLETE_EXIT_REASON,
      endRequestedBy: "athlete",
      endRequestedAt: FieldValue.serverTimestamp(),
    });
    return exit;
  });
  await releaseAfterExit(db, data, endsOn);

  const members = Array.isArray(data["members"]) ? (data["members"] as Data[]) : [];
  for (const m of members.filter((x) => x["role"] === "member" && str(x["athleteId"]))) {
    await notifyScheduleSafe(str(m["athleteId"]), {
      title: "Seu plano tem data de saída",
      body: `${str(data["holderName"]) || "O titular"} cancelou o plano ${str(data["planName"])} em ` +
        `${str(data["arenaName"]) || "Arena"}. Ele termina em ${formatDateBr(endsOn)}.`,
      type: "schedule_plan_ending",
      data: {subscriptionId, arenaId: str(data["arenaId"])},
    });
  }
  logger.info("arena-schedule: titular cancelou o plano", {subscriptionId, endsOn});
  return {endsOn};
}

export async function endSubscriptionCore(
  db: Firestore,
  uid: string,
  subscriptionId: string,
  endsOnRaw: unknown,
  reasonRaw: unknown,
  todayKey: string,
  nowMs: number,
): Promise<{status: string; endsOn: string}> {
  const {ref, data} = await loadSubscriptionOrThrow(db, subscriptionId);
  await requireScheduleManager(db, str(data["arenaId"]), uid);
  const endsOn = str(endsOnRaw) || todayKey;
  const reason = str(reasonRaw).slice(0, 500) || null;
  if (!isValidDateKey(endsOn) || endsOn < todayKey) throw new HttpsError("invalid-argument", "Data de saída inválida.");
  if (!(LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(String(data["status"]))) {
    throw new HttpsError("failed-precondition", "Esta assinatura já foi encerrada.");
  }
  if (endsOn === todayKey) return finalizeSubscriptionEndCore(db, subscriptionId, todayKey, nowMs, reason);

  // Data futura: "Sai em dd/mm". O último dia de jogo é a véspera; o agendador encerra no dia.
  await db.runTransaction(async (tx: Transaction) => {
    const charges = await tx.get(db.collection(ARENA_SCHEDULE_CHARGES).where("subscriptionId", "==", subscriptionId));
    markFutureExit(tx, db, ref, data, charges.docs, endsOn, {cancelReason: reason});
  });
  await releaseAfterExit(db, data, endsOn);
  await notifyScheduleSafe(str(data["holderAthleteId"]), {
    title: "Seu plano tem data de saída",
    body: `O plano ${str(data["planName"])} em ${str(data["arenaName"]) || "Arena"} termina em ${formatDateBr(endsOn)}.`,
    type: "schedule_plan_ending",
    data: {subscriptionId, arenaId: str(data["arenaId"])},
  });
  return {status: String(data["status"]), endsOn};
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

function idList(raw: unknown): string[] {
  return Array.isArray(raw) ? (raw as unknown[]).map(str).filter(Boolean) : [];
}

export const cancelMyArenaScheduleSubscription = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await cancelMySubscriptionCore(getFirestore(), uid, str(input["subscriptionId"]), dayKeyFromEventDate(new Date()));
  } catch (e) {
    return rethrowSchedule("cancelMyArenaScheduleSubscription", e);
  }
});

export const createArenaScheduleSubscription = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  const db = getFirestore();
  const todayKey = dayKeyFromEventDate(new Date());
  try {
    const arenaId = str(input["arenaId"]);
    await requireScheduleManager(db, arenaId, uid);
    const holderAthleteId = str(input["holderAthleteId"]);
    const holder = holderAthleteId ?
      await resolveHolderAccount(db, holderAthleteId) :
      {athleteId: null, name: str(input["holderName"]).slice(0, 80), phone: str(input["holderPhone"]).slice(0, 30) || null, photoUrl: null};
    const courtId = str(input["courtId"]) || null;
    const result = await createSubscriptionCore(db, {
      arenaId, planId: str(input["planId"]), holder, memberAthleteIds: idList(input["memberAthleteIds"]),
      weekdays: input["weekdays"], startTime: input["startTime"], preferredCourtId: courtId, strictCourt: courtId != null,
      cycle: input["cycle"] ?? "monthly", paymentMethod: input["paymentMethod"] ?? "onsite",
      startDate: str(input["startDate"]) || todayKey, source: "arena", createdByUid: uid, audience: "manager",
      // Opcional: converte uma entrada da fila (esperando ou com oferta) nesta assinatura.
      waitlistEntryId: str(input["waitlistEntryId"]) || null,
    }, todayKey, Date.now());
    return {subscriptionId: result.subscriptionId, courtName: result.courtName, skippedDates: result.skippedDates};
  } catch (e) {
    return rethrowSchedule("createArenaScheduleSubscription", e);
  }
});

export const subscribeArenaSchedulePlan = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  const db = getFirestore();
  const todayKey = dayKeyFromEventDate(new Date());
  try {
    const holder = await resolveHolderAccount(db, uid);
    const result = await createSubscriptionCore(db, {
      arenaId: str(input["arenaId"]), planId: str(input["planId"]), holder, memberAthleteIds: idList(input["memberAthleteIds"]),
      weekdays: input["weekdays"], startTime: input["startTime"], preferredCourtId: null, strictCourt: false,
      cycle: input["cycle"], paymentMethod: input["paymentMethod"], startDate: todayKey, source: "athlete",
      createdByUid: uid, audience: "athlete",
    }, todayKey, Date.now());
    return {subscriptionId: result.subscriptionId, courtName: result.courtName, firstCharge: result.firstCharge};
  } catch (e) {
    return rethrowSchedule("subscribeArenaSchedulePlan", e);
  }
});

export const changeArenaScheduleSubscriptionSlots = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await changeSubscriptionSlotsCore(
      getFirestore(), uid, str(input["subscriptionId"]), input["weekdays"], input["startTime"],
      dayKeyFromEventDate(new Date()), Date.now(),
    );
  } catch (e) {
    return rethrowSchedule("changeArenaScheduleSubscriptionSlots", e);
  }
});

export const pauseArenaScheduleSubscription = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await pauseSubscriptionCore(getFirestore(), uid, str(input["subscriptionId"]), input["until"], dayKeyFromEventDate(new Date()));
  } catch (e) {
    return rethrowSchedule("pauseArenaScheduleSubscription", e);
  }
});

export const resumeArenaScheduleSubscription = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await resumeSubscriptionCore(getFirestore(), uid, str(input["subscriptionId"]), dayKeyFromEventDate(new Date()));
  } catch (e) {
    return rethrowSchedule("resumeArenaScheduleSubscription", e);
  }
});

export const endArenaScheduleSubscription = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await endSubscriptionCore(
      getFirestore(), uid, str(input["subscriptionId"]), input["endsOn"], input["reason"],
      dayKeyFromEventDate(new Date()), Date.now(),
    );
  } catch (e) {
    return rethrowSchedule("endArenaScheduleSubscription", e);
  }
});

