/**
 * Plano de horário LIVRE: o assinante reserva quando quiser, pelo fluxo normal de reserva, dentro
 * das janelas do plano, até `timesPerWeek` vezes por semana (seg a dom). Cada uso cobre até
 * `durationMinutes` dos horários que caem na janela: o coberto sai a R$ 0, o resto pelo preço normal.
 *
 * Quem assinou o plano fixo (`bookingMode` ausente ou `fixed`) segue com as séries de horário fixo
 * (`arena-schedule-subscriptions.ts`); nada aqui mexe nelas.
 *
 * A reserva coberta grava `scheduleFlexSubscriptionId` (NÃO `scheduleSubscriptionId`, que marca a
 * ocorrência de série fixa e liga reposição, troca de quadra e pagamento do plano). Uso da semana =
 * reservas vivas com `scheduleFlexMinutes > 0` da assinatura na semana. Cancelou, o uso volta sozinho.
 *
 * Duas reservas ao mesmo tempo: a transação lê e grava `arenaScheduleFlexWeeks/{assinatura}_{segunda}`,
 * então a segunda repete e já enxerga a primeira (mesmo desenho do banco de horas do mensalista).
 */
import {
  FieldValue,
  type DocumentData,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type {BookingTotalResult, VirtualSlotPricing} from "./arena-pricing";
import type {CouponPricingOutcome} from "./arena-coupons";
import {roundMoney} from "./mercadopago-arena-helpers";
import {isArenaBookingInactive} from "./arena-booking-app-payment";
import {addDays, weekStartOf} from "./arena-crm-model";
import {isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {spanMinutes} from "./arena-member-hours";
import {ARENA_SCHEDULE_SUBSCRIPTIONS, type PlanWindow} from "./arena-schedule-plan-constants";

export const ARENA_SCHEDULE_FLEX_WEEKS = "arenaScheduleFlexWeeks";
const ARENA_BOOKINGS = "arenaBookings";

/** O que a reserva precisa saber de uma assinatura livre. */
export interface FlexPlanSubscription {
  subscriptionId: string;
  planId: string;
  planName: string;
  timesPerWeek: number;
  durationMinutes: number;
  windows: PlanWindow[];
  /** Vazio = qualquer quadra (arena que define a quadra). */
  courtIds: string[];
}

export interface FlexPlanContext {
  arenaId: string;
  dateKey: string;
  weekday: number;
  week: {start: string; end: string};
  subscriptions: FlexPlanSubscription[];
}

export type FlexPlanBlockedReason = "exhausted" | "outside_window" | "coupon_cheaper";

export interface FlexPlanOutcome {
  /** Minutos que o plano cobriu nesta reserva (0 = não usou). */
  scheduleFlexMinutes: number;
  scheduleFlexDiscountReais: number;
  scheduleFlexSubscriptionId: string | null;
  schedulePlanName: string | null;
}

export const NO_FLEX_PLAN: FlexPlanOutcome = {
  scheduleFlexMinutes: 0,
  scheduleFlexDiscountReais: 0,
  scheduleFlexSubscriptionId: null,
  schedulePlanName: null,
};

const NO_COUPON: CouponPricingOutcome = {
  couponApplied: false,
  couponId: null,
  couponCode: null,
  couponDiscountReais: 0,
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function minutesOf(hm: string): number | null {
  const [h, m] = hm.trim().split(":");
  const hh = Number(h);
  const mm = Number(m ?? "0");
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  return hh * 60 + mm;
}

/** Fim "00:00" = meia-noite (24:00). */
function endMinutesOf(hm: string): number | null {
  const m = minutesOf(hm);
  return m === 0 ? 24 * 60 : m;
}

function parseWindows(raw: unknown): PlanWindow[] {
  if (!Array.isArray(raw)) return [];
  return (raw as DocumentData[])
    .map((w) => ({weekday: Number(w?.["weekday"]), startTime: str(w?.["startTime"]), endTime: str(w?.["endTime"])}))
    .filter((w) => Number.isInteger(w.weekday) && w.weekday >= 1 && w.weekday <= 7 && w.startTime && w.endTime);
}

/**
 * A assinatura livre que vale na data: da arena, viva (`active`), já começou e não saiu antes
 * dela. Pausada, suspensa, aguardando pagamento ou cancelada não cobrem. Puro.
 */
export function flexSubscriptionFrom(
  id: string,
  data: DocumentData,
  arenaId: string,
  dateKey: string,
): FlexPlanSubscription | null {
  if (str(data["arenaId"]) !== arenaId || data["status"] !== "active") return null;
  const snapshot = data["planSnapshot"] && typeof data["planSnapshot"] === "object" ?
    data["planSnapshot"] as DocumentData : {};
  if (snapshot["bookingMode"] !== "flexible") return null;
  const startDate = str(data["startDate"]);
  if (!startDate || dateKey < startDate) return null;
  const endsOn = str(data["endsOn"]);
  if (endsOn && dateKey >= endsOn) return null;
  const windows = parseWindows(snapshot["windows"]);
  const timesPerWeek = Math.floor(Number(snapshot["timesPerWeek"] ?? 0));
  const durationMinutes = Math.floor(Number(snapshot["durationMinutes"] ?? 0));
  if (windows.length === 0 || timesPerWeek <= 0 || durationMinutes <= 0) return null;
  return {
    subscriptionId: id,
    planId: str(data["planId"]),
    planName: str(data["planName"]) || "Plano de horário",
    timesPerWeek,
    durationMinutes,
    windows,
    courtIds: Array.isArray(snapshot["courtIds"]) ? (snapshot["courtIds"] as unknown[]).map(str).filter(Boolean) : [],
  };
}

/**
 * Assinaturas livres do atleta (titular ou membro do rateio) que cobrem a data. `null` = nenhuma:
 * reserva normal. Uma leitura das assinaturas do atleta (poucas).
 */
export async function loadFlexPlanContext(
  db: Firestore,
  params: {arenaId: string; athleteId: string | null; dateKey: string},
): Promise<FlexPlanContext | null> {
  if (!params.athleteId || !params.arenaId || !params.dateKey) return null;
  const snap = await db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS)
    .where("memberAthleteIds", "array-contains", params.athleteId)
    .get();
  const subscriptions = snap.docs
    .map((d) => flexSubscriptionFrom(d.id, d.data(), params.arenaId, params.dateKey))
    .filter((s): s is FlexPlanSubscription => s != null);
  if (subscriptions.length === 0) return null;
  const start = weekStartOf(params.dateKey);
  return {
    arenaId: params.arenaId,
    dateKey: params.dateKey,
    weekday: isoWeekdayOfDateKey(params.dateKey),
    week: {start, end: addDays(start, 6)},
    subscriptions,
  };
}

/** Usos da semana: reservas vivas que o plano cobriu. Puro. */
export function usedFlexUses(bookings: DocumentData[]): number {
  let used = 0;
  for (const b of bookings) {
    if (isArenaBookingInactive(b)) continue;
    if (Number(b["scheduleFlexMinutes"]) > 0) used++;
  }
  return used;
}

/** O horário cabe inteiro numa janela do plano naquele dia da semana. Puro. */
export function lineInsideWindows(line: {startTime: string; endTime: string}, windows: PlanWindow[], weekday: number): boolean {
  const start = minutesOf(line.startTime);
  const end = endMinutesOf(line.endTime);
  if (start == null || end == null || end <= start) return false;
  return windows.some((w) => {
    if (w.weekday !== weekday) return false;
    const ws = minutesOf(w.startTime);
    const we = endMinutesOf(w.endTime);
    return ws != null && we != null && start >= ws && end <= we;
  });
}

/**
 * Cobre a reserva com um uso do plano: os horários dentro da janela, na ordem, até a duração do
 * plano, saem a R$ 0; o resto fica pelo preço que já estava. Quadra fora do plano não cobre.
 * Com cupom: se o cupom já deixa mais barato, fica o cupom e o plano não é usado. Puro.
 */
export function applyFlexPlan(
  current: {result: BookingTotalResult; coupon: CouponPricingOutcome},
  sub: FlexPlanSubscription,
  params: {weekday: number; courtId: string | null; usesLeft: number},
): {
  result: BookingTotalResult;
  coupon: CouponPricingOutcome;
  flex: FlexPlanOutcome;
  blockedReason: FlexPlanBlockedReason | null;
} {
  if (current.result.lineItems.length === 0) {
    return {...current, flex: NO_FLEX_PLAN, blockedReason: null};
  }
  const courtOk = sub.courtIds.length === 0 || !params.courtId || sub.courtIds.includes(params.courtId);
  const eligible = courtOk ?
    current.result.lineItems.filter((l) => lineInsideWindows(l, sub.windows, params.weekday)) :
    [];
  if (eligible.length === 0) {
    return {...current, flex: NO_FLEX_PLAN, blockedReason: "outside_window"};
  }
  if (params.usesLeft <= 0) {
    return {...current, flex: NO_FLEX_PLAN, blockedReason: "exhausted"};
  }
  let remaining = sub.durationMinutes;
  let covered = 0;
  const eligibleSet = new Set(eligible);
  const lines = [...current.result.lineItems].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const lineItems: VirtualSlotPricing[] = lines.map((l) => {
    if (!eligibleSet.has(l)) return l;
    const minutes = spanMinutes(l.startTime, l.endTime);
    const take = Math.min(remaining, minutes);
    if (take <= 0 || minutes <= 0) return l;
    remaining -= take;
    covered += take;
    return {...l, finalSlotPriceReais: roundMoney(l.finalSlotPriceReais * (minutes - take) / minutes)};
  });
  const amountReais = roundMoney(lineItems.reduce((sum, l) => sum + l.finalSlotPriceReais, 0));
  const linesBefore = roundMoney(current.result.lineItems.reduce((sum, l) => sum + l.finalSlotPriceReais, 0));
  if (current.coupon.couponApplied && amountReais >= current.result.amountReais) {
    return {...current, flex: NO_FLEX_PLAN, blockedReason: "coupon_cheaper"};
  }
  return {
    result: {...current.result, amountReais, lineItems},
    coupon: current.coupon.couponApplied ? NO_COUPON : current.coupon,
    flex: {
      scheduleFlexMinutes: covered,
      scheduleFlexDiscountReais: roundMoney(Math.max(0, linesBefore - amountReais)),
      scheduleFlexSubscriptionId: sub.subscriptionId,
      schedulePlanName: sub.planName,
    },
    blockedReason: null,
  };
}

function weekBookingsQuery(db: Firestore, subscriptionId: string, week: {start: string; end: string}) {
  return db.collection(ARENA_BOOKINGS)
    .where("scheduleFlexSubscriptionId", "==", subscriptionId)
    .where("date", ">=", week.start)
    .where("date", "<=", week.end);
}

/** Usos que sobram na semana (fora de transação: cotação e tela). */
export async function flexUsesLeft(
  db: Firestore,
  sub: FlexPlanSubscription,
  week: {start: string; end: string},
): Promise<number> {
  const snap = await weekBookingsQuery(db, sub.subscriptionId, week).get();
  return Math.max(0, sub.timesPerWeek - usedFlexUses(snap.docs.map((d) => d.data())));
}

/** Resumo para o app mostrar ("Plano Manhã cobre esta reserva · 1 de 2 nesta semana"). */
export interface FlexPlanQuote {
  schedulePlanName: string | null;
  schedulePlanTimesPerWeek: number;
  schedulePlanUsesLeft: number;
  scheduleFlexMinutes: number;
  scheduleFlexDiscountReais: number;
  schedulePlanBlockedReason: FlexPlanBlockedReason | null;
}

export const NO_FLEX_PLAN_QUOTE: FlexPlanQuote = {
  schedulePlanName: null,
  schedulePlanTimesPerWeek: 0,
  schedulePlanUsesLeft: 0,
  scheduleFlexMinutes: 0,
  scheduleFlexDiscountReais: 0,
  schedulePlanBlockedReason: null,
};

/** Ordem do motivo quando nenhuma assinatura cobre: o mais útil para o atleta primeiro. */
const REASON_RANK: Record<FlexPlanBlockedReason, number> = {coupon_cheaper: 0, exhausted: 1, outside_window: 2};

/**
 * Escolhe a assinatura que cobre a reserva (a primeira que cobre) e aplica, com os usos de agora.
 * Sem nenhuma que cubra, devolve o preço intacto e o motivo. `null` no contexto = sem mudança.
 */
export async function quoteFlexPlan(
  db: Firestore,
  ctx: FlexPlanContext | null,
  current: {result: BookingTotalResult; coupon: CouponPricingOutcome},
  courtId: string | null,
): Promise<{
  result: BookingTotalResult;
  coupon: CouponPricingOutcome;
  quote: FlexPlanQuote;
  subscription: FlexPlanSubscription | null;
}> {
  if (!ctx) return {...current, quote: NO_FLEX_PLAN_QUOTE, subscription: null};
  let fallback: {quote: FlexPlanQuote; rank: number} | null = null;
  for (const sub of ctx.subscriptions) {
    const usesLeft = await flexUsesLeft(db, sub, ctx.week);
    const applied = applyFlexPlan(current, sub, {weekday: ctx.weekday, courtId, usesLeft});
    const base = {
      schedulePlanName: sub.planName,
      schedulePlanTimesPerWeek: sub.timesPerWeek,
      schedulePlanUsesLeft: usesLeft,
    };
    if (applied.flex.scheduleFlexMinutes > 0) {
      return {
        result: applied.result,
        coupon: applied.coupon,
        subscription: sub,
        quote: {
          ...base,
          scheduleFlexMinutes: applied.flex.scheduleFlexMinutes,
          scheduleFlexDiscountReais: applied.flex.scheduleFlexDiscountReais,
          schedulePlanBlockedReason: null,
        },
      };
    }
    const reason = applied.blockedReason;
    if (reason && (!fallback || REASON_RANK[reason] < fallback.rank)) {
      fallback = {
        rank: REASON_RANK[reason],
        quote: {...base, scheduleFlexMinutes: 0, scheduleFlexDiscountReais: 0, schedulePlanBlockedReason: reason},
      };
    }
  }
  return {...current, quote: fallback?.quote ?? NO_FLEX_PLAN_QUOTE, subscription: null};
}

/**
 * Usos da semana dentro da transação da reserva (fase de leitura). Devolve a escrita da trava para
 * rodar junto das outras escritas.
 */
export async function reserveFlexUseInTransaction(
  tx: Transaction,
  db: Firestore,
  ctx: FlexPlanContext,
  sub: FlexPlanSubscription,
  bookingId: string,
): Promise<{usesLeft: number; commit: () => void}> {
  const weekRef = db.collection(ARENA_SCHEDULE_FLEX_WEEKS).doc(`${sub.subscriptionId}_${ctx.week.start}`);
  await tx.get(weekRef);
  const snap = await tx.get(weekBookingsQuery(db, sub.subscriptionId, ctx.week));
  const used = usedFlexUses(snap.docs.map((d) => d.data()));
  return {
    usesLeft: Math.max(0, sub.timesPerWeek - used),
    commit: () => {
      tx.set(weekRef, {
        arenaId: ctx.arenaId,
        subscriptionId: sub.subscriptionId,
        weekStart: ctx.week.start,
        timesPerWeek: sub.timesPerWeek,
        lastBookingId: bookingId,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    },
  };
}
