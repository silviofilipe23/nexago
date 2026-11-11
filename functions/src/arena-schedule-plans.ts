/**
 * Planos de horário — catálogo de planos, regras da arena (nobre, fila) e a disponibilidade que o
 * app mostra no A2. Também guarda os helpers de Firestore que as assinaturas, a cobrança, a
 * reposição e a fila compartilham (acesso, ocupação das quadras, push).
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {isArenaEntitledPro} from "./arena-entitlement";
import {assertArenaAreaAccess} from "./arena-area-access";
import {deliverNotificationToUser} from "./notification-delivery";
import {dayKeyFromEventDate} from "./event-timezone";
import {ARENA_RECURRING_BOOKINGS, toMinutes} from "./arena-recurring-booking";
import {ARENA_CLASSES} from "./arena-class-constants";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {readBookingAllocation} from "./arena-booking-allocation";
import {floatingCandidateCourts} from "./arena-floating-booking";
import {assertArenaCanBillOnline} from "./arena-class-billing";
import {
  ARENA_SCHEDULE_SUBSCRIPTIONS,
  ARENA_SCHEDULE_WAITLIST,
  ATHLETE_PLANS_URL,
  SCHEDULE_PLANS,
  SCHEDULE_RULES_DOC,
  SCHEDULE_SETTINGS,
  candidateStartTimes,
  countFreeCourts,
  endMinutes,
  mergeScheduleSettingsInput,
  parseSchedulePlan,
  parseScheduleSettings,
  primeCapacityMinutes,
  fmtMinutes,
  primeOverlapMinutes,
  primeUsagePercent,
  str,
  upcomingNationalHolidays,
  validateSchedulePlanInput,
  type BusyBlock,
  type ParsedSchedulePlan,
  type PlanWindow,
  type ScheduleSettings,
} from "./arena-schedule-plan-constants";

type Data = Record<string, unknown>;
type QueryGetter = (q: FirebaseFirestore.Query) => Promise<FirebaseFirestore.QuerySnapshot>;

// ---------------------------------------------------------------------------
// Push (injetável nos testes)
// ---------------------------------------------------------------------------

export const scheduleNotifier = {
  send: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) =>
    deliverNotificationToUser({...input, requireInteraction: false}),
};

/** Push ao atleta sem derrubar a operação (igual `notifyLinkedAthleteSafe`). Pushes do atleta abrem "Meu plano". */
export async function notifyScheduleSafe(
  userId: string | null | undefined,
  input: {title: string; body: string; type: string; data?: Record<string, string>},
): Promise<void> {
  const target = userId?.trim();
  if (!target) return;
  try {
    await scheduleNotifier.send({
      userId: target,
      title: input.title,
      body: input.body,
      type: input.type,
      data: {url: ATHLETE_PLANS_URL, ...(input.data ?? {})},
    });
  } catch (e) {
    logger.warn("arena-schedule: notificação falhou", {type: input.type, error: e});
  }
}

// ---------------------------------------------------------------------------
// Acesso
// ---------------------------------------------------------------------------

export function requireUid(auth: {uid?: string} | undefined): string {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

export async function loadArenaOrThrow(db: Firestore, arenaId: string): Promise<Data> {
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena inválida.");
  const snap = await db.collection("arenas").doc(arenaId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  return snap.data() as Data;
}

/** Planos de horário são área `agenda` (gestor e recepção escrevem), como horário fixo e Aulas. */
export async function requireScheduleManager(db: Firestore, arenaId: string, uid: string): Promise<Data> {
  const arena = await loadArenaOrThrow(db, arenaId);
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");
  return arena;
}

export async function isScheduleManager(db: Firestore, arenaId: string, uid: string): Promise<boolean> {
  try {
    await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");
    return true;
  } catch (e) {
    if (e instanceof HttpsError && e.code === "permission-denied") return false;
    throw e;
  }
}

export function requireScheduleEntitlement(arena: Data, nowMs: number, audience: "manager" | "athlete"): void {
  if (isArenaEntitledPro(arena, nowMs)) return;
  throw new HttpsError(
    "permission-denied",
    audience === "manager" ?
      "Os Planos de horário estão disponíveis nos planos Pro e Elite. Faça upgrade para usar." :
      "Esta arena não está aceitando planos de horário no momento.",
  );
}

export function arenaNameOf(arena: Data): string {
  return str(arena["name"]) || "Arena";
}

export type SubscriptionActor = "holder" | "manager" | "member";

/**
 * Quem age na assinatura, decidido pelo uid: titular, equipe da arena (área `agenda`) ou membro do
 * rateio. `allowMember` libera o membro (faltar/usar reposição); o resto é titular ou gestor.
 */
export async function authorizeSubscriptionActor(
  db: Firestore,
  sub: Data,
  uid: string,
  opts: {allowMember?: boolean} = {},
): Promise<SubscriptionActor> {
  if (str(sub["holderAthleteId"]) === uid) return "holder";
  if (await isScheduleManager(db, str(sub["arenaId"]), uid)) return "manager";
  const members = Array.isArray(sub["memberAthleteIds"]) ? (sub["memberAthleteIds"] as unknown[]).map(String) : [];
  if (opts.allowMember && members.includes(uid)) return "member";
  throw new HttpsError(
    "permission-denied",
    members.includes(uid) ? "Só o titular do plano pode fazer isso." : "Você não participa deste plano.",
  );
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export function planRef(db: Firestore, arenaId: string, planId: string) {
  return db.collection("arenas").doc(arenaId).collection(SCHEDULE_PLANS).doc(planId);
}

export function scheduleSettingsRef(db: Firestore, arenaId: string) {
  return db.collection("arenas").doc(arenaId).collection(SCHEDULE_SETTINGS).doc(SCHEDULE_RULES_DOC);
}

export async function loadScheduleSettings(db: Firestore, arenaId: string): Promise<ScheduleSettings> {
  const snap = await scheduleSettingsRef(db, arenaId).get();
  return parseScheduleSettings(snap.exists ? snap.data() as Data : undefined);
}

export async function loadSubscriptionOrThrow(db: Firestore, subscriptionId: string) {
  if (!subscriptionId) throw new HttpsError("invalid-argument", "Assinatura inválida.");
  const ref = db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).doc(subscriptionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Assinatura não encontrada.");
  return {ref, data: snap.data() as Data};
}

/** Quadra conta no nobre se não foi desativada (manutenção é temporária e continua contando). */
export function isCourtActive(data: Data): boolean {
  if (data["active"] === false) return false;
  const status = str(data["status"]).toLowerCase();
  return status !== "inactive" && status !== "archived" && status !== "deleted";
}

export interface ArenaOccupancy {
  series: FirebaseFirestore.QueryDocumentSnapshot[];
  classes: FirebaseFirestore.QueryDocumentSnapshot[];
  offers: FirebaseFirestore.QueryDocumentSnapshot[];
  activeCourts: number;
  /** Quadras da arena (todas; `planCourtsOf` filtra). */
  courts: Array<{id: string; data: Data}>;
}

/** A arena define a quadra (`bookingAllocation.mode == "capacity"`): o plano não tem quadra própria. */
export function arenaDefinesCourt(arena: Data | undefined): boolean {
  return readBookingAllocation(arena).mode === "capacity";
}

/**
 * Quadras onde o plano pode cair. Arena que define a quadra: as da distribuição (ativas e fora de
 * manutenção, na ordem gravada) — o plano não guarda quadra e o servidor escolhe, como na reserva.
 * Senão, as escolhidas no plano.
 */
export function planCourtsOf(
  arena: Data | undefined,
  plan: {courtIds: readonly string[]; courtNames: readonly string[]},
  courts: ReadonlyArray<{id: string; data: Data}>,
): {courtIds: string[]; courtNames: string[]} {
  if (!arenaDefinesCourt(arena)) return {courtIds: [...plan.courtIds], courtNames: [...plan.courtNames]};
  const picked = floatingCandidateCourts(arena, courts.filter((c) => isCourtActive(c.data)), null, []);
  return {courtIds: picked.map((c) => c.id), courtNames: picked.map((c) => c.name)};
}

/**
 * Tudo que ocupa quadra por semana na arena: séries de horário fixo vivas (plano ou não), turmas
 * ativas e ofertas da fila ainda válidas. `get` é `tx.get` dentro de transação (serializa com
 * outras assinaturas do mesmo plano, que também escrevem o doc do plano).
 */
export async function readArenaOccupancy(db: Firestore, arenaId: string, get?: QueryGetter): Promise<ArenaOccupancy> {
  const run: QueryGetter = get ?? ((q) => q.get());
  const [series, classes, offers, courts] = await Promise.all([
    run(db.collection(ARENA_RECURRING_BOOKINGS).where("arenaId", "==", arenaId).where("status", "in", ["active", "paused"])),
    run(db.collection(ARENA_CLASSES).where("arenaId", "==", arenaId).where("status", "==", "active")),
    run(db.collection(ARENA_SCHEDULE_WAITLIST).where("arenaId", "==", arenaId).where("status", "==", "offered")),
    run(db.collection("arenas").doc(arenaId).collection("courts")),
  ]);
  return {
    series: series.docs,
    classes: classes.docs,
    offers: offers.docs,
    activeCourts: courts.docs.filter((d) => isCourtActive(d.data() as Data)).length,
    courts: courts.docs.map((d) => ({id: d.id, data: d.data() as Data})),
  };
}

function offerExpiresMs(entry: Data): number {
  const offer = (entry["offer"] ?? {}) as Data;
  const raw = offer["expiresAt"];
  if (raw instanceof Timestamp) return raw.toMillis();
  if (raw instanceof Date) return raw.getTime();
  return 0;
}

/** Ocupação semanal → blocos por quadra. Série/turma que termina antes de `fromDate` não ocupa. */
export function busyBlocksOf(
  occ: ArenaOccupancy,
  opts: {fromDate: string; nowMs: number; excludeSeriesIds?: readonly string[]; excludeEntryId?: string | null},
): BusyBlock[] {
  const out: BusyBlock[] = [];
  const excluded = new Set(opts.excludeSeriesIds ?? []);
  for (const doc of occ.series) {
    if (excluded.has(doc.id)) continue;
    const d = doc.data() as Data;
    const endDate = typeof d["endDate"] === "string" ? d["endDate"] : null;
    if (endDate && endDate < opts.fromDate) continue;
    out.push({
      courtId: str(d["courtId"]), weekday: Number(d["weekday"]),
      startMin: toMinutes(str(d["startTime"])), endMin: endMinutes(str(d["endTime"])),
    });
  }
  for (const doc of occ.classes) {
    const d = doc.data() as Data;
    const endDate = typeof d["endDate"] === "string" ? d["endDate"] : null;
    if (endDate && endDate < opts.fromDate) continue;
    const weekdays = Array.isArray(d["weekdays"]) ? (d["weekdays"] as unknown[]).map(Number) : [];
    for (const weekday of weekdays) {
      out.push({
        courtId: str(d["courtId"]), weekday,
        startMin: toMinutes(str(d["startTime"])), endMin: endMinutes(str(d["endTime"])),
      });
    }
  }
  for (const doc of occ.offers) {
    if (doc.id === opts.excludeEntryId) continue;
    const d = doc.data() as Data;
    if (offerExpiresMs(d) <= opts.nowMs) continue;
    const offer = (d["offer"] ?? {}) as Data;
    const weekdays = Array.isArray(d["weekdays"]) ? (d["weekdays"] as unknown[]).map(Number) : [];
    for (const weekday of weekdays) {
      out.push({
        courtId: str(offer["courtId"]), weekday,
        startMin: toMinutes(str(d["startTime"])), endMin: endMinutes(str(d["endTime"])),
      });
    }
  }
  return out;
}

/**
 * Ocupação de UMA data (reposição): série que ainda não começou, já terminou ou pulou a data
 * (`skippedDates` — falta avisada, feriado, cancelada pela agenda) não ocupa; turma idem pelo início.
 * Vale além do horizonte de materialização, onde ainda não existe trava para conferir.
 */
export function busyBlocksOnDate(occ: ArenaOccupancy, date: string, nowMs: number): BusyBlock[] {
  const startsBy = (d: Data) => !str(d["startDate"]) || str(d["startDate"]) <= date;
  return busyBlocksOf({
    ...occ,
    series: occ.series.filter((doc) => {
      const d = doc.data() as Data;
      const skipped = Array.isArray(d["skippedDates"]) ? (d["skippedDates"] as unknown[]).map(String) : [];
      return startsBy(d) && !skipped.includes(date);
    }),
    classes: occ.classes.filter((doc) => startsBy(doc.data() as Data)),
  }, {fromDate: date, nowMs});
}

/** Minutos-quadra de séries de PLANO no nobre (séries soltas da tela antiga não contam). */
export function planSeriesPrimeMinutes(
  occ: ArenaOccupancy,
  primeWindows: readonly PlanWindow[],
  excludeSeriesIds: readonly string[] = [],
): number {
  const excluded = new Set(excludeSeriesIds);
  return occ.series.reduce((sum, doc) => {
    const d = doc.data() as Data;
    if (excluded.has(doc.id) || !str(d["scheduleSubscriptionId"])) return sum;
    return sum + primeOverlapMinutes(primeWindows, Number(d["weekday"]), toMinutes(str(d["startTime"])), endMinutes(str(d["endTime"])));
  }, 0);
}

/** Ofertas da fila ainda válidas de um plano (seguram vaga até expirar). */
export function liveOffersForPlan(occ: ArenaOccupancy, planId: string, nowMs: number, excludeEntryId?: string | null): number {
  return occ.offers.filter((doc) => doc.id !== excludeEntryId && str(doc.data()["planId"]) === planId &&
    offerExpiresMs(doc.data() as Data) > nowMs).length;
}

// ---------------------------------------------------------------------------
// Plano (gestor)
// ---------------------------------------------------------------------------

export async function upsertSchedulePlanCore(
  db: Firestore,
  uid: string,
  input: Data,
  nowMs: number,
): Promise<{planId: string}> {
  const arenaId = str(input["arenaId"]);
  const arena = await requireScheduleManager(db, arenaId, uid);
  // Arena que define a quadra: o plano não escolhe quadra (usa a distribuição).
  const definesCourt = arenaDefinesCourt(arena);
  const plan = validateSchedulePlanInput(input, {courtsOptional: definesCourt});
  if (definesCourt) plan.courtIds = [];
  // Arquivar não exige plano Pro (a arena que caiu de plano ainda arruma o catálogo).
  if (plan.status !== "archived") requireScheduleEntitlement(arena, nowMs, "manager");

  const courtSnaps = await Promise.all(plan.courtIds.map((id) => db.collection("arenas").doc(arenaId).collection("courts").doc(id).get()));
  const courtNames = courtSnaps.map((snap) => {
    if (!snap.exists) throw new HttpsError("not-found", "Uma das quadras do plano não existe mais.");
    return str(snap.data()?.["name"]) || "Quadra";
  });

  const planId = str(input["planId"]);
  const ref = planId ? planRef(db, arenaId, planId) : db.collection("arenas").doc(arenaId).collection(SCHEDULE_PLANS).doc();
  if (planId) {
    const existing = await ref.get();
    if (!existing.exists) throw new HttpsError("not-found", "Plano não encontrado.");
    await ref.set({...plan, courtNames, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  } else {
    await ref.set({
      ...plan, courtNames, arenaId, occupiedCount: 0, waitingCount: 0,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdByUid: uid,
    });
  }
  return {planId: ref.id};
}

export async function saveScheduleRulesCore(db: Firestore, uid: string, input: Data): Promise<ScheduleSettings> {
  const arenaId = str(input["arenaId"]);
  const arena = await requireScheduleManager(db, arenaId, uid);
  const ref = scheduleSettingsRef(db, arenaId);
  const snap = await ref.get();
  const stored = parseScheduleSettings(snap.exists ? snap.data() as Data : undefined);
  // Campo ausente (app/portal antigo) mantém o gravado; ligar exige o que as Aulas exigem.
  const merged = mergeScheduleSettingsInput(stored, input);
  if (merged.onlineBillingEnabled && !stored.onlineBillingEnabled) assertArenaCanBillOnline(arena, "os planos de horário");
  await ref.set({...merged, updatedAt: FieldValue.serverTimestamp(), updatedByUid: uid}, {merge: true});
  return merged;
}

// ---------------------------------------------------------------------------
// Disponibilidade (A2)
// ---------------------------------------------------------------------------

/** A arena ainda recebe online (pagamento online ligado e chave PIX de repasse)? */
export function arenaCanBillOnline(arena: Data): boolean {
  try {
    assertArenaCanBillOnline(arena);
    return true;
  } catch {
    return false;
  }
}

/** Mensalidades novas viram link Asaas? Regra ligada e a arena ainda apta a receber online. */
export function scheduleOnlineBillingOn(settings: ScheduleSettings, arena: Data): boolean {
  return settings.onlineBillingEnabled && arenaCanBillOnline(arena);
}

export interface AvailabilityTime {
  startTime: string;
  endTime: string;
  freeCourts: number;
  waitlistCount: number;
  prime: boolean;
}

export async function getPlanAvailabilityCore(
  db: Firestore,
  uid: string,
  arenaId: string,
  planId: string,
  todayKey: string,
  nowMs: number,
) {
  if (!planId) throw new HttpsError("invalid-argument", "Plano inválido.");
  const arena = await loadArenaOrThrow(db, arenaId);
  const snap = await planRef(db, arenaId, planId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Plano não encontrado.");
  const plan = parseSchedulePlan(snap.data() as Data);
  if (plan.status !== "active" && !(await isScheduleManager(db, arenaId, uid))) {
    throw new HttpsError("not-found", "Plano não encontrado.");
  }
  const [settings, occ, waiting] = await Promise.all([
    loadScheduleSettings(db, arenaId),
    readArenaOccupancy(db, arenaId),
    db.collection(ARENA_SCHEDULE_WAITLIST).where("planId", "==", planId).where("status", "==", "waiting").get(),
  ]);
  const busy = busyBlocksOf(occ, {fromDate: todayKey, nowMs});
  const courts = planCourtsOf(arena, plan, occ.courts);
  const capacityMinutes = primeCapacityMinutes(settings.primeWindows, occ.activeCourts);
  const usedMinutes = planSeriesPrimeMinutes(occ, settings.primeWindows);
  const primeCapReached = capacityMinutes > 0 &&
    usedMinutes * 100 >= settings.primeCapPercent * capacityMinutes;

  const weekdays = [...new Set(plan.windows.map((w) => w.weekday))].sort((a, b) => a - b);
  const days = weekdays.map((weekday) => ({
    weekday,
    times: candidateStartTimes(plan.windows, weekday, plan.durationMinutes).map((startTime): AvailabilityTime => {
      const startMin = toMinutes(startTime);
      const endMin = startMin + plan.durationMinutes;
      return {
        startTime,
        endTime: fmtMinutes(endMin),
        freeCourts: countFreeCourts(courts.courtIds, busy, weekday, startMin, endMin),
        waitlistCount: waiting.docs.filter((d) => str(d.data()["startTime"]) === startTime &&
          Array.isArray(d.data()["weekdays"]) && (d.data()["weekdays"] as unknown[]).map(Number).includes(weekday)).length,
        prime: primeOverlapMinutes(settings.primeWindows, weekday, startMin, endMin) > 0,
      };
    }),
  }));
  const seatsLeft = Math.max(0, plan.capacity - plan.occupiedCount - liveOffersForPlan(occ, planId, nowMs));
  return {
    plan: planOutput(planId, plan),
    primeCapReached,
    primeUsagePercent: primeUsagePercent(usedMinutes, capacityMinutes),
    seatsLeft,
    days,
    // Pix/cartão viram "link mensal" quando ligada; senão "combine com a arena".
    onlineBilling: scheduleOnlineBillingOn(settings, arena),
    // O app não mostra quadra (a arena define a cada jogo).
    arenaDefinesCourt: arenaDefinesCourt(arena),
  };
}

export function planOutput(planId: string, plan: ParsedSchedulePlan) {
  return {planId, ...plan};
}

/** Uso do nobre e feriados nacionais próximos — o "Revisar" da grade da semana no portal. */
export async function getScheduleOverviewCore(db: Firestore, uid: string, arenaId: string, todayKey: string) {
  await requireScheduleManager(db, arenaId, uid);
  const [settings, occ] = await Promise.all([loadScheduleSettings(db, arenaId), readArenaOccupancy(db, arenaId)]);
  const capacityMinutes = primeCapacityMinutes(settings.primeWindows, occ.activeCourts);
  const usedMinutes = planSeriesPrimeMinutes(occ, settings.primeWindows);
  return {
    settings,
    primeUsagePercent: primeUsagePercent(usedMinutes, capacityMinutes),
    holidays: upcomingNationalHolidays(todayKey, 60)
      .map((h) => ({...h, applied: settings.appliedHolidays.includes(h.date)})),
  };
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

export function rethrowSchedule(name: string, e: unknown): never {
  if (e instanceof HttpsError) throw e;
  logger.error(`${name}: falha inesperada`, e);
  throw new HttpsError("internal", "Não foi possível concluir agora. Tente novamente em instantes.");
}

export const upsertArenaSchedulePlan = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  try {
    return await upsertSchedulePlanCore(getFirestore(), uid, (request.data ?? {}) as Data, Date.now());
  } catch (e) {
    return rethrowSchedule("upsertArenaSchedulePlan", e);
  }
});

export const saveArenaScheduleRules = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  try {
    return await saveScheduleRulesCore(getFirestore(), uid, (request.data ?? {}) as Data);
  } catch (e) {
    return rethrowSchedule("saveArenaScheduleRules", e);
  }
});

export const getArenaSchedulePlanAvailability = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await getPlanAvailabilityCore(
      getFirestore(), uid, str(input["arenaId"]), str(input["planId"]), dayKeyFromEventDate(new Date()), Date.now(),
    );
  } catch (e) {
    return rethrowSchedule("getArenaSchedulePlanAvailability", e);
  }
});


export const getArenaScheduleOverview = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  try {
    return await getScheduleOverviewCore(getFirestore(), uid, str(input["arenaId"]), dayKeyFromEventDate(new Date()));
  } catch (e) {
    return rethrowSchedule("getArenaScheduleOverview", e);
  }
});
