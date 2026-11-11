/**
 * Reserva do mensalista desconta do banco de horas (opcional, por arena).
 *
 * Tipos de cliente da arena:
 *   - Avulso: preço normal da quadra.
 *   - Aluno: preço do perfil (`arena-athlete-pricing.ts`), lista manual ou matrícula ativa em turma.
 *   - Mensalista: contrato do CRM (`arenaCrmContracts`) com `weeklyHours` — um banco de horas por
 *     semana (seg a dom). Com `arenas/{id}.memberHoursBank.enabled`, a reserva dele sai a R$ 0
 *     enquanto houver horas na semana da reserva; o que passar do banco é cobrado normal.
 *
 * Arena sem a chave não lê nada a mais e nada muda (nem para o mensalista).
 *
 * Quanto do banco já foi usado = soma de `memberHoursMinutes` das reservas não canceladas do
 * atleta na arena naquela semana. Cancelou, a hora volta sozinha (nada a estornar: saiu a R$ 0).
 * Reserva paga que ele fez antes da chave não consome o banco.
 *
 * Duas reservas ao mesmo tempo: a transação lê e grava `arenaMemberHoursWeeks/{contrato}_{semana}`,
 * então a segunda repete e já enxerga a primeira.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type {BookingTotalResult, VirtualSlotPricing} from "./arena-pricing";
import type {CouponPricingOutcome} from "./arena-coupons";
import {roundMoney} from "./mercadopago-arena-helpers";
import {assertArenaAreaAccess} from "./arena-area-access";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {addDays, contractView, CRM_CONTRACTS, termEndDate, weekStartOf, type CrmContractRecord} from "./arena-crm-model";
import {contractFromDoc} from "./arena-crm";

export const ARENA_MEMBER_HOURS_WEEKS = "arenaMemberHoursWeeks";
const ARENA_BOOKINGS = "arenaBookings";

/** Política da arena (`arenas/{id}.memberHoursBank`). Ausente = desligada. */
export interface MemberHoursPolicy {
  enabled: boolean;
  /** Mensalidade atrasada: reserva sai pelo preço normal até pagar. Padrão: ligado. */
  blockWhenOverdue: boolean;
}

export function readMemberHoursPolicy(arenaData: DocumentData | undefined): MemberHoursPolicy {
  const raw = arenaData?.["memberHoursBank"];
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    enabled: data["enabled"] === true,
    blockWhenOverdue: data["blockWhenOverdue"] !== false,
  };
}

/** Por que o mensalista não usou o banco nesta reserva. */
export type MemberHoursBlockedReason = "overdue" | "exhausted" | "coupon_cheaper";

/** O contrato que vale para a data da reserva. */
export interface MemberHoursContract {
  contractId: string;
  planName: string;
  weeklyMinutes: number;
  overdue: boolean;
}

/** Semana do banco (seg a dom) da data. Puro. */
export function memberHoursWeek(dateKey: string): {start: string; end: string} {
  const start = weekStartOf(dateKey);
  return {start, end: addDays(start, 6)};
}

/**
 * Contrato do CRM que cobre a data: não cancelado, começou até a data e (sem renovação automática)
 * não acabou antes dela. Mais de um: o de mais horas. Atraso é medido em `today`. Puro.
 */
export function pickMemberContract(
  records: CrmContractRecord[],
  arenaId: string,
  dateKey: string,
  today: string,
): MemberHoursContract | null {
  let best: MemberHoursContract | null = null;
  for (const c of records) {
    if (c.arenaId !== arenaId || c.status === "canceled" || !c.startDate) continue;
    if (dateKey < c.startDate) continue;
    if (!c.autoRenew && dateKey > termEndDate(c.startDate, c.period)) continue;
    const weeklyMinutes = Math.round(c.weeklyHours * 60);
    if (weeklyMinutes <= 0) continue;
    if (best && best.weeklyMinutes >= weeklyMinutes) continue;
    best = {
      contractId: c.id,
      planName: c.planName,
      weeklyMinutes,
      overdue: contractView(c, today).status === "overdue",
    };
  }
  return best;
}

function isCanceledBooking(d: DocumentData): boolean {
  return String(d["status"] ?? "").startsWith("cancel");
}

/** Minutos do banco já usados na semana pelas reservas vivas. Puro. */
export function usedMemberMinutes(bookings: DocumentData[]): number {
  let total = 0;
  for (const b of bookings) {
    if (isCanceledBooking(b)) continue;
    const m = Number(b["memberHoursMinutes"]);
    if (Number.isFinite(m) && m > 0) total += Math.round(m);
  }
  return total;
}

function minutesOf(hm: string): number | null {
  const [h, m] = hm.trim().split(":");
  const hh = Number(h);
  const mm = Number(m ?? "0");
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  return hh * 60 + mm;
}

export function spanMinutes(startTime: string, endTime: string): number {
  const start = minutesOf(startTime);
  let end = minutesOf(endTime);
  if (start == null || end == null) return 0;
  if (end <= start) end += 24 * 60;
  return end - start;
}

export interface MemberHoursOutcome {
  /** Minutos que saíram do banco nesta reserva (0 = não usou). */
  memberHoursMinutes: number;
  /** Quanto o banco tirou do preço. */
  memberHoursDiscountReais: number;
  memberContractId: string | null;
}

export const NO_MEMBER_HOURS: MemberHoursOutcome = {
  memberHoursMinutes: 0,
  memberHoursDiscountReais: 0,
  memberContractId: null,
};

const NO_COUPON: CouponPricingOutcome = {
  couponApplied: false,
  couponId: null,
  couponCode: null,
  couponDiscountReais: 0,
};

/**
 * Cobre os horários, na ordem, com o saldo do banco: o coberto sai a R$ 0, o resto pelo preço que
 * já estava (promoção, perfil do aluno...). Meio horário coberto = metade do preço.
 *
 * Com cupom, o cupom é sobre o total: se ele já deixa mais barato do que usar o banco, fica o
 * cupom e o banco não é tocado (`coupon_cheaper`); senão o cupom sai (não é consumido). Puro.
 */
export function applyMemberHours(
  current: {result: BookingTotalResult; coupon: CouponPricingOutcome},
  availableMinutes: number,
  contractId: string,
): {
  result: BookingTotalResult;
  coupon: CouponPricingOutcome;
  member: MemberHoursOutcome;
  blockedReason: MemberHoursBlockedReason | null;
} {
  if (current.result.lineItems.length === 0) {
    return {...current, member: NO_MEMBER_HOURS, blockedReason: null};
  }
  if (availableMinutes <= 0) {
    return {...current, member: NO_MEMBER_HOURS, blockedReason: "exhausted"};
  }
  let remaining = Math.floor(availableMinutes);
  let covered = 0;
  const lines = [...current.result.lineItems].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const lineItems: VirtualSlotPricing[] = lines.map((l) => {
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
    return {...current, member: NO_MEMBER_HOURS, blockedReason: "coupon_cheaper"};
  }
  return {
    result: {...current.result, amountReais, lineItems},
    coupon: current.coupon.couponApplied ? NO_COUPON : current.coupon,
    member: {
      memberHoursMinutes: covered,
      memberHoursDiscountReais: roundMoney(Math.max(0, linesBefore - amountReais)),
      memberContractId: contractId,
    },
    blockedReason: null,
  };
}

/** O que a reserva precisa saber do mensalista antes da transação. */
export interface MemberHoursContext {
  arenaId: string;
  athleteId: string;
  contract: MemberHoursContract;
  week: {start: string; end: string};
  /** Atrasado com a arena barrando: não usa o banco. */
  blocked: boolean;
}

/**
 * Contrato do mensalista para a reserva. Arena sem a chave não lê nada. `null` = não é
 * mensalista (ou contrato não cobre a data): reserva normal.
 */
export async function loadMemberHoursContext(
  db: Firestore,
  params: {arenaId: string; arenaData: DocumentData | undefined; athleteId: string | null; dateKey: string; today: string},
): Promise<MemberHoursContext | null> {
  const policy = readMemberHoursPolicy(params.arenaData);
  if (!policy.enabled || !params.athleteId || !params.arenaId) return null;
  const snap = await db.collection(CRM_CONTRACTS).where("athleteId", "==", params.athleteId).get();
  const records = snap.docs.map((d) => contractFromDoc(d.id, d.data()));
  const contract = pickMemberContract(records, params.arenaId, params.dateKey, params.today);
  if (!contract) return null;
  return {
    arenaId: params.arenaId,
    athleteId: params.athleteId,
    contract,
    week: memberHoursWeek(params.dateKey),
    blocked: contract.overdue && policy.blockWhenOverdue,
  };
}

function weekBookingsQuery(db: Firestore, ctx: MemberHoursContext) {
  return db.collection(ARENA_BOOKINGS)
    .where("arenaId", "==", ctx.arenaId)
    .where("athleteId", "==", ctx.athleteId)
    .where("date", ">=", ctx.week.start)
    .where("date", "<=", ctx.week.end);
}

/** Saldo da semana fora de transação (cotação e tela). */
export async function memberAvailableMinutes(db: Firestore, ctx: MemberHoursContext): Promise<number> {
  const snap = await weekBookingsQuery(db, ctx).get();
  return Math.max(0, ctx.contract.weeklyMinutes - usedMemberMinutes(snap.docs.map((d) => d.data())));
}

/**
 * Saldo da semana dentro da transação da reserva (fase de leitura). Devolve a escrita da trava
 * para rodar junto das outras escritas.
 */
export async function reserveMemberMinutesInTransaction(
  tx: Transaction,
  db: Firestore,
  ctx: MemberHoursContext,
  bookingId: string,
): Promise<{availableMinutes: number; commit: (minutes: number) => void}> {
  const weekRef = db.collection(ARENA_MEMBER_HOURS_WEEKS).doc(`${ctx.contract.contractId}_${ctx.week.start}`);
  await tx.get(weekRef);
  const snap = await tx.get(weekBookingsQuery(db, ctx));
  const used = usedMemberMinutes(snap.docs.map((d) => d.data()));
  return {
    availableMinutes: Math.max(0, ctx.contract.weeklyMinutes - used),
    commit: (minutes: number) => {
      tx.set(weekRef, {
        arenaId: ctx.arenaId,
        athleteId: ctx.athleteId,
        contractId: ctx.contract.contractId,
        weekStart: ctx.week.start,
        weeklyMinutes: ctx.contract.weeklyMinutes,
        lastBookingId: bookingId,
        lastMinutes: minutes,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    },
  };
}

/** Resumo para o app/portal mostrar ("Banco de horas: 1h30 de 3h nesta semana"). */
export interface MemberHoursQuote {
  memberHoursWeeklyMinutes: number;
  memberHoursAvailableMinutes: number;
  memberHoursMinutes: number;
  memberHoursDiscountReais: number;
  memberHoursPlanName: string | null;
  memberHoursBlockedReason: MemberHoursBlockedReason | null;
}

export const NO_MEMBER_HOURS_QUOTE: MemberHoursQuote = {
  memberHoursWeeklyMinutes: 0,
  memberHoursAvailableMinutes: 0,
  memberHoursMinutes: 0,
  memberHoursDiscountReais: 0,
  memberHoursPlanName: null,
  memberHoursBlockedReason: null,
};

/**
 * Cotação com o banco: aplica o saldo de agora (sem transação). `null` no contexto = sem mudança.
 */
export async function quoteMemberHours(
  db: Firestore,
  ctx: MemberHoursContext | null,
  current: {result: BookingTotalResult; coupon: CouponPricingOutcome},
): Promise<{result: BookingTotalResult; coupon: CouponPricingOutcome; quote: MemberHoursQuote}> {
  if (!ctx) return {...current, quote: NO_MEMBER_HOURS_QUOTE};
  const available = await memberAvailableMinutes(db, ctx);
  const base = {
    memberHoursWeeklyMinutes: ctx.contract.weeklyMinutes,
    memberHoursAvailableMinutes: available,
    memberHoursPlanName: ctx.contract.planName,
  };
  if (ctx.blocked) {
    return {...current, quote: {...base, memberHoursMinutes: 0, memberHoursDiscountReais: 0, memberHoursBlockedReason: "overdue"}};
  }
  const applied = applyMemberHours(current, available, ctx.contract.contractId);
  return {
    result: applied.result,
    coupon: applied.coupon,
    quote: {
      ...base,
      memberHoursMinutes: applied.member.memberHoursMinutes,
      memberHoursDiscountReais: applied.member.memberHoursDiscountReais,
      memberHoursBlockedReason: applied.blockedReason,
    },
  };
}

// ---------------------------------------------------------------------------
// Callable do portal da arena (área "agenda", a mesma do CRM)
// ---------------------------------------------------------------------------

export function parseSetMemberHoursPolicyInput(raw: unknown): {arenaId: string; policy: MemberHoursPolicy} {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const arenaId = typeof data["arenaId"] === "string" ? data["arenaId"].trim() : "";
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena inválida.");
  return {
    arenaId,
    policy: {
      enabled: data["enabled"] === true,
      blockWhenOverdue: data["blockWhenOverdue"] !== false,
    },
  };
}

export async function setArenaMemberHoursPolicyCore(
  db: Firestore,
  uid: string,
  input: {arenaId: string; policy: MemberHoursPolicy},
): Promise<{policy: MemberHoursPolicy}> {
  await assertArenaAreaAccess(db, input.arenaId, uid, "agenda", "write");
  await db.collection("arenas").doc(input.arenaId).update({
    memberHoursBank: {
      ...input.policy,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    },
  });
  return {policy: input.policy};
}

export const setArenaMemberHoursPolicy = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return setArenaMemberHoursPolicyCore(getFirestore(), uid, parseSetMemberHoursPolicyInput(request.data));
});

/**
 * Banco de horas de um atleta para a reserva manual do portal (o gestor escolheu o atleta).
 * `null` = arena sem a chave ou atleta sem contrato que cubra a data.
 */
export async function memberHoursForManualQuote(
  db: Firestore,
  params: {arenaId: string; arenaData: DocumentData | undefined; athleteId: string | null; dateKey: string; today: string; startTime: string; endTime: string},
): Promise<{weeklyMinutes: number; availableMinutes: number; coverMinutes: number; planName: string; blocked: boolean} | null> {
  const ctx = await loadMemberHoursContext(db, params);
  if (!ctx) return null;
  const available = await memberAvailableMinutes(db, ctx);
  return {
    weeklyMinutes: ctx.contract.weeklyMinutes,
    availableMinutes: available,
    coverMinutes: ctx.blocked ? 0 : Math.min(available, spanMinutes(params.startTime, params.endTime)),
    planName: ctx.contract.planName,
    blocked: ctx.blocked,
  };
}
