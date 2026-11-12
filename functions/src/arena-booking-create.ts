import {recordProfessorLesson, resolveProfessorLessonStudent} from "./professor-lessons";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  calculateBookingTotal,
  type BookingTotalResult,
  parsePromotionsFromDocs,
  readArenaFallbackPrice,
} from "./arena-pricing";
import {
  readArenaPaymentFlags,
  readArenaPaymentReceiver,
  requireArenaPayoutPixKey,
  roundMoney,
} from "./mercadopago-arena-helpers";
import {ARENA_BOOKING_PAYMENT_EXPIRY_MINUTES} from "./arena-booking-constants";
import {ARENA_BOOKING_PRICING} from "./arena-booking-pricing";
import {
  resolveCouponForBooking,
  reserveCouponRedemptionInTransaction,
  type CouponPricingOutcome,
} from "./arena-coupons";
import {ensurePeakRuleSatisfied, parsePeakRulesFromDocs} from "./arena-peak-rules";
import {bookingSportCode, resolveBookingSport} from "./arena-booking-sport";
import {claimCourtLocks} from "./arena-floating-booking";
import {
  CAPACITY_FULL_MESSAGE,
  rankCapacityCourts,
  readBookingAllocation,
  resolveAllocationRequest,
  takeFirstFreeCourt,
  withCapacityPrice,
  type CapacityCourt,
} from "./arena-booking-allocation";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {professorCourtDiscountForQuote, resolveProfessorBooking} from "./arena-professor-permissions";
import {applyProfessorCourtDiscount, type ProfessorCourtDiscountOutcome} from "./arena-professor-court-discount";
import {
  applyAthletePricing,
  loadAthletePricingRule,
  NO_ATHLETE_PRICING,
  type AthletePricingOutcome,
  type AthletePricingRule,
} from "./arena-athlete-pricing";
import {reserveWeatherCreditInTransaction, weatherCreditSummary} from "./arena-weather-credits";
import {weatherCreditToApply, type WeatherCreditUse} from "./arena-weather-model";
import {hasBlockedSlotOverlap} from "./arena-recurring-booking";
import {dayKeyFromEventDate} from "./event-timezone";
import {arenaBookingStartAt} from "./arena-booking-start-at";
import {athleteCancelPolicySnapshot} from "./arena-athlete-cancel-policy";
import {arenaBlockApplies} from "./arena-block-guard";
import {
  applyMemberHours,
  loadMemberHoursContext,
  NO_MEMBER_HOURS,
  NO_MEMBER_HOURS_QUOTE,
  quoteMemberHours,
  reserveMemberMinutesInTransaction,
  type MemberHoursOutcome,
  type MemberHoursQuote,
} from "./arena-member-hours";
import {
  applyFlexPlan,
  loadFlexPlanContext,
  NO_FLEX_PLAN,
  quoteFlexPlan,
  reserveFlexUseInTransaction,
  type FlexPlanOutcome,
  type FlexPlanQuote,
} from "./arena-schedule-flex";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";
const ARENA_BLOCKS = "arena_blocks";

type PaymentMode = "onsite" | "pix";

interface BookingInput {
  arenaId: string;
  arenaName: string;
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Inícios dos slots escolhidos na grade (`["18:00"]` ou `["18:00","19:00"]`). */
  selectedSlotStartTimes?: string[];
  clientAmountReais?: number;
  paymentMode?: PaymentMode;
  /** 0.5 ou 1 — obrigatório quando paymentMode === pix */
  paymentFraction?: number;
  /** Código de cupom de marketing digitado pelo atleta (opcional). */
  couponCode?: string;
  /** Esporte escolhido entre os da quadra (código do catálogo). Apps antigos não enviam. */
  sport?: string;
  /**
   * Reservar como professor (vínculo `ACTIVE` com "Reservar quadras" naquela arena). Ausente =
   * reserva de atleta, como sempre. Mesmas regras; carimba a reserva para a arena ver e aplica o
   * desconto do vínculo no aluguel (`courtDiscountPercent`), se a arena deu um. Na cotação só
   * aplica o desconto (sem vínculo válido, preço de atleta).
   */
  asProfessor?: boolean;
  /**
   * Aula para um aluno da carteira (professor independente, só com `asProfessor`). A ligação vai
   * para `professorLessons/{bookingId}` — a reserva em si não leva o aluno.
   */
  professorStudentId?: string;
  /**
   * Abater o crédito de chuva do atleta nesta arena (Cancelamento por chuva).
   * Apps antigos não enviam: nada muda para eles.
   */
  useWeatherCredit?: boolean;
  /**
   * `"capacity"`: o cliente sabe reservar sem quadra (arena "a arena define a quadra"). Sem
   * `courtId`, a reserva nasce flutuante. Apps antigos não mandam — numa arena nesse modo
   * recebem "Atualize o app" (salvo modo misto com quadra escolhida).
   */
  allocation?: "capacity";
}

function parseDateKey(dateRaw: string): string {
  const t = dateRaw.trim();
  if (t.length >= 10) return t.substring(0, 10);
  return t;
}

function toMinutes(hhmm: string): number {
  const parts = hhmm.trim().split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parts.length > 1 ? parseInt(parts[1] ?? "0", 10) : 0;
  return h * 60 + m;
}

function calendarHoursSpanning(startMin: number, endMin: number): number[] {
  if (endMin <= startMin) return [];
  const startH = Math.floor(startMin / 60);
  const endH = Math.floor((endMin - 1) / 60);
  const hours: number[] = [];
  for (let h = startH; h <= endH; h++) hours.push(h);
  return hours;
}

function fmtHourStart(h: number): string {
  return `${Math.min(23, Math.max(0, h)).toString().padStart(2, "0")}:00`;
}

function fmtHourEnd(h: number): string {
  if (h >= 23) return "24:00";
  return `${(h + 1).toString().padStart(2, "0")}:00`;
}

function safeIdPart(s: string): string {
  return s.replace(/\//g, "_");
}

/**
 * Promoção + cupom → preço do perfil do atleta (aluno/professor da arena) → desconto do vínculo de
 * professor. Nada acumula: cada etapa só troca o preço quando deixa a reserva mais barata, e o
 * desconto do vínculo, quando vence, desfaz o do perfil.
 */
export function applyAthleteDiscounts(
  withCoupon: {result: BookingTotalResult; coupon: CouponPricingOutcome},
  athleteRule: AthletePricingRule | null,
  professorRule: Parameters<typeof applyProfessorCourtDiscount>[1],
): {
  result: BookingTotalResult;
  coupon: CouponPricingOutcome;
  professor: ProfessorCourtDiscountOutcome;
  athletePricing: AthletePricingOutcome;
} {
  const tiered = applyAthletePricing(withCoupon, athleteRule);
  const {result, coupon, professor} = applyProfessorCourtDiscount(tiered, professorRule);
  const athletePricing = professor.professorDiscountPercent > 0 ? NO_ATHLETE_PRICING : tiered.athletePricing;
  return {result, coupon, professor, athletePricing};
}

export async function loadPricingContext(arenaId: string, courtId: string) {
  const db = getFirestore();
  const [arenaSnap, courtSnap, promoSnap, peakSnap] = await Promise.all([
    db.collection("arenas").doc(arenaId).get(),
    db.collection("arenas").doc(arenaId).collection("courts").doc(courtId).get(),
    db
      .collection("arenas")
      .doc(arenaId)
      .collection("promotions")
      .where("active", "==", true)
      .get(),
    db
      .collection("arenas")
      .doc(arenaId)
      .collection("peakRules")
      .where("active", "==", true)
      .get(),
  ]);

  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  if (!courtSnap.exists) {
    throw new HttpsError("not-found", "Quadra não encontrada.");
  }

  return {
    arenaData: arenaSnap.data() as Record<string, unknown>,
    courtData: courtSnap.data() as Record<string, unknown>,
    promotions: parsePromotionsFromDocs(promoSnap.docs),
    peakRules: parsePeakRulesFromDocs(peakSnap.docs),
    arenaFallback: readArenaFallbackPrice(
      arenaSnap.data() as Record<string, unknown>,
    ),
  };
}

async function ensureNotBlocked(arenaId: string, athleteId: string): Promise<void> {
  const db = getFirestore();
  const blockId = `${safeIdPart(arenaId)}_${safeIdPart(athleteId)}`;
  const snap = await db.collection(ARENA_BLOCKS).doc(blockId).get();
  if (!snap.exists || !arenaBlockApplies(snap.data(), arenaId)) return;
  const reason = (snap.data()?.["reason"] as string | undefined)?.trim();
  const suffix = reason ? ` Motivo: ${reason}` : "";
  throw new HttpsError(
    "permission-denied",
    `Sua conta está bloqueada para reservar nesta arena.${suffix}`,
  );
}

interface ResolvedBookingCourt {
  /** Quadra da cotação/validações: a escolhida ou, na flutuante, a 1ª candidata. */
  courtId: string;
  courtName: string;
  floating: boolean;
  /** Candidatas em ordem (só na flutuante) — a transação pega a primeira ainda livre. */
  capacityCourts: CapacityCourt[];
  allocation: ReturnType<typeof readBookingAllocation>;
}

/**
 * Modo da arena + o que o cliente pediu → quadra da reserva. Na arena "a arena define a quadra"
 * sem quadra pedida, ranqueia as candidatas da distribuição (lotou → erro).
 */
async function resolveBookingCourt(
  input: BookingInput,
  params: {arenaId: string; dateKey: string; startTime: string; endTime: string},
): Promise<ResolvedBookingCourt> {
  const db = getFirestore();
  const arenaSnap = await db.collection("arenas").doc(params.arenaId).get();
  const allocation = readBookingAllocation(arenaSnap.data());
  const request = resolveAllocationRequest(allocation, input);
  if (request.kind === "court") {
    const courtId = input.courtId?.trim() ?? "";
    if (!courtId) throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
    return {courtId, courtName: input.courtName?.trim() || "Quadra", floating: false, capacityCourts: [], allocation};
  }
  const sport = bookingSportCode(input.sport);
  if (!sport) throw new HttpsError("invalid-argument", "Escolha o esporte da reserva.");
  const capacityCourts = await rankCapacityCourts(db, {...params, arenaData: arenaSnap.data(), sport});
  if (capacityCourts.length === 0) throw new HttpsError("resource-exhausted", CAPACITY_FULL_MESSAGE);
  return {
    courtId: capacityCourts[0]!.id,
    courtName: capacityCourts[0]!.name,
    floating: true,
    capacityCourts,
    allocation,
  };
}

async function quoteInternal(
  input: BookingInput,
  athleteId: string,
): Promise<
  BookingTotalResult & CouponPricingOutcome & ProfessorCourtDiscountOutcome & AthletePricingOutcome & MemberHoursQuote &
  FlexPlanQuote
> {
  const arenaId = input.arenaId?.trim();
  const dateKey = parseDateKey(input.date ?? "");
  const startTime = input.startTime?.trim() ?? "";
  const endTime = input.endTime?.trim() ?? "";

  if (!arenaId || !dateKey || startTime.length < 4 || endTime.length < 4) {
    throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
  }

  const resolved = await resolveBookingCourt(input, {arenaId, dateKey, startTime, endTime});
  const courtId = resolved.courtId;
  const ctx = await loadPricingContext(arenaId, courtId);
  if (resolved.floating) {
    ctx.courtData = withCapacityPrice(ctx.courtData, resolved.allocation, bookingSportCode(input.sport)) ?? {};
  }
  const promoTotal = calculateBookingTotal({
    arenaId,
    courtId,
    dateKey,
    startTime,
    endTime,
    courtData: ctx.courtData,
    arenaFallback: ctx.arenaFallback,
    promotions: ctx.promotions,
    selectedSlotStartTimes: input.selectedSlotStartTimes,
  });

  await ensurePeakRuleSatisfied({
    db: getFirestore(),
    arenaId,
    courtId,
    dateKey,
    peakRules: ctx.peakRules,
    courtData: ctx.courtData,
    arenaFallback: ctx.arenaFallback,
    selectionStartTimes: promoTotal.lineItems.map((l) => l.startTime),
  });

  const withCoupon = await resolveCouponForBooking({
    db: getFirestore(),
    arenaId,
    athleteId,
    couponCode: input.couponCode,
    promoTotal,
  });
  const discount = await professorCourtDiscountForQuote(
    getFirestore(),
    arenaId,
    athleteId,
    input.asProfessor,
  );
  const athleteRule = await loadAthletePricingRule(getFirestore(), arenaId, ctx.arenaData, athleteId);
  const {result, coupon, professor, athletePricing} = applyAthleteDiscounts(withCoupon, athleteRule, discount);
  assertPositiveBookingTotal(result);
  // Plano de horário livre: um uso da semana cobre o horário dentro da janela (R$ 0). Vem antes do
  // banco de horas (já está pago); se cobriu, o banco não é tocado. Professor nunca usa.
  const flexCtx = input.asProfessor === true ? null : await loadFlexPlanContext(getFirestore(), {arenaId, athleteId, dateKey});
  const flex = await quoteFlexPlan(getFirestore(), flexCtx, {result, coupon}, resolved.floating ? null : courtId);
  if (flex.subscription) {
    return {...flex.result, ...flex.coupon, ...professor, ...athletePricing, ...NO_MEMBER_HOURS_QUOTE, ...flex.quote};
  }
  // Mensalista (arena com banco de horas ligado): as horas da semana saem a R$ 0. Reserva como
  // professor nunca usa o banco.
  const memberCtx = input.asProfessor === true ? null : await loadMemberHoursContext(getFirestore(), {
    arenaId,
    arenaData: ctx.arenaData,
    athleteId,
    dateKey,
    today: dayKeyFromEventDate(new Date()),
  });
  const member = await quoteMemberHours(getFirestore(), memberCtx, {result, coupon});
  return {...member.result, ...member.coupon, ...professor, ...athletePricing, ...member.quote, ...flex.quote};
}

export interface BookingPaymentPlan {
  channel: PaymentMode | "weather_credit";
  status: "active" | "pending_payment";
  paymentStatus: "none" | "pending" | "paid" | "partial";
  paymentFraction: number | null;
  amountToPayNowReais: number;
  amountDueOnsiteReais: number;
}

/**
 * Como a reserva será paga depois do crédito de chuva: coberta por inteiro já
 * nasce confirmada e paga; senão o resto segue pelo Pix (sinal ou integral do
 * que falta) ou fica para pagar na arena.
 */
export function bookingPaymentPlan(params: {
  amountReais: number;
  weatherCreditReais: number;
  paymentMode: PaymentMode;
  paymentFraction: number;
}): BookingPaymentPlan {
  // Coberta inteira pelo banco de horas do mensalista: nada a pagar, nem online nem no balcão.
  if (params.amountReais <= 0) {
    return {
      channel: "onsite",
      status: "active",
      paymentStatus: "none",
      paymentFraction: null,
      amountToPayNowReais: 0,
      amountDueOnsiteReais: 0,
    };
  }
  const credit = Math.max(0, Math.min(params.weatherCreditReais, params.amountReais));
  const net = roundMoney(params.amountReais - credit);
  if (net <= 0) {
    return {
      channel: "weather_credit",
      status: "active",
      paymentStatus: "paid",
      paymentFraction: null,
      amountToPayNowReais: 0,
      amountDueOnsiteReais: 0,
    };
  }
  if (params.paymentMode === "pix") {
    // Com crédito, o resto vai integral (mesma regra de resolveArenaBookingChargeAmounts).
    const fraction = credit > 0 ? 1 : params.paymentFraction;
    const now = roundMoney(net * fraction);
    return {
      channel: "pix",
      status: "pending_payment",
      paymentStatus: "pending",
      paymentFraction: fraction,
      amountToPayNowReais: now,
      amountDueOnsiteReais: roundMoney(net - now),
    };
  }
  return {
    channel: "onsite",
    status: "active",
    paymentStatus: credit > 0 ? "partial" : "none",
    paymentFraction: null,
    amountToPayNowReais: 0,
    amountDueOnsiteReais: net,
  };
}

function assertPositiveBookingTotal(total: BookingTotalResult): void {
  if (total.amountReais <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "Configure o preço da quadra antes de reservar.",
    );
  }
}

export const quoteArenaBooking = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as BookingInput;
  const total = await quoteInternal(input, request.auth.uid);
  // Saldo de chuva nesta arena: o app mostra o "Usar crédito" só quando há.
  const credit = await weatherCreditSummary(
    getFirestore(),
    request.auth.uid,
    input.arenaId?.trim() ?? "",
    Date.now(),
  );
  const creditApplied = input.useWeatherCredit === true ?
    weatherCreditToApply({
      amountReais: total.amountReais,
      availableReais: credit.availableReais,
      paymentMode: input.paymentMode === "onsite" ? "onsite" : "pix",
    }) :
    0;
  return {
    weatherCreditAvailableReais: credit.availableReais,
    weatherCreditNextExpiresAt: credit.nextExpiresAtMs == null ?
      null :
      new Date(credit.nextExpiresAtMs).toISOString(),
    weatherCreditAppliedReais: creditApplied,
    amountAfterCreditReais: roundMoney(total.amountReais - creditApplied),
    amountReais: total.amountReais,
    lineItems: total.lineItems,
    appliedPromotionIds: total.appliedPromotionIds,
    couponApplied: total.couponApplied,
    couponId: total.couponId,
    couponDiscountReais: total.couponDiscountReais,
    professorDiscountPercent: total.professorDiscountPercent,
    professorDiscountReais: total.professorDiscountReais,
    athletePricingTier: total.athletePricingTier,
    athletePricingLabel: total.athletePricingLabel,
    athletePricingDiscountReais: total.athletePricingDiscountReais,
    memberHoursWeeklyMinutes: total.memberHoursWeeklyMinutes,
    memberHoursAvailableMinutes: total.memberHoursAvailableMinutes,
    memberHoursMinutes: total.memberHoursMinutes,
    memberHoursDiscountReais: total.memberHoursDiscountReais,
    memberHoursPlanName: total.memberHoursPlanName,
    memberHoursBlockedReason: total.memberHoursBlockedReason,
    schedulePlanName: total.schedulePlanName,
    schedulePlanTimesPerWeek: total.schedulePlanTimesPerWeek,
    schedulePlanUsesLeft: total.schedulePlanUsesLeft,
    scheduleFlexMinutes: total.scheduleFlexMinutes,
    scheduleFlexDiscountReais: total.scheduleFlexDiscountReais,
    schedulePlanBlockedReason: total.schedulePlanBlockedReason,
  };
});

export const createArenaBooking = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const athleteId = request.auth?.uid;
  if (!athleteId) {
    throw new HttpsError("unauthenticated", "Faça login para confirmar a reserva.");
  }

  const input = (request.data ?? {}) as BookingInput;
  const arenaId = input.arenaId?.trim();
  const arenaName = (input.arenaName?.trim() || "Arena");
  const dateKey = parseDateKey(input.date ?? "");
  const startTime = input.startTime?.trim() ?? "";
  const endTime = input.endTime?.trim() ?? "";

  if (!arenaId || !dateKey || startTime.length < 4 || endTime.length < 4) {
    throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
  }
  if (dateKey < dayKeyFromEventDate(new Date())) {
    throw new HttpsError("invalid-argument", "Não dá pra reservar em data passada.");
  }
  // Arena "a arena define a quadra": sem quadra pedida, a reserva nasce flutuante numa quadra
  // provisória (a transação pega a 1ª candidata ainda livre).
  const resolved = await resolveBookingCourt(input, {arenaId, dateKey, startTime, endTime});
  let courtId = resolved.courtId;
  let courtName = resolved.courtName;

  await ensureNotBlocked(arenaId, athleteId);
  // Bloqueio de quadra do gestor (`arenaSlots` com status blocked): a grade já
  // esconde, mas a grade aberta antes do bloqueio (ou a callable chamada
  // direto) passava. Mesma checagem da reserva manual.
  const blocked = await hasBlockedSlotOverlap(
    getFirestore(),
    {arenaId, courtId, startTime, endTime},
    dateKey,
  );
  if (blocked) {
    throw new HttpsError("failed-precondition", "Esse horário está bloqueado pela arena.");
  }
  const professorBooking = await resolveProfessorBooking(
    getFirestore(),
    arenaId,
    athleteId,
    input.asProfessor,
  );
  const professorStamp = professorBooking?.stamp ?? null;
  const lessonStudent = await resolveProfessorLessonStudent(
    getFirestore(),
    athleteId,
    input.professorStudentId,
    professorStamp,
  );

  const ctx = await loadPricingContext(arenaId, courtId);
  if (resolved.floating) {
    ctx.courtData = withCapacityPrice(ctx.courtData, resolved.allocation, bookingSportCode(input.sport)) ?? {};
  }
  const sport = resolveBookingSport(input.sport, ctx.courtData);
  // Banco de horas do mensalista: o desconto é fechado na transação (saldo fresco).
  const memberCtx = professorBooking ? null : await loadMemberHoursContext(getFirestore(), {
    arenaId,
    arenaData: ctx.arenaData,
    athleteId,
    dateKey,
    today: dayKeyFromEventDate(new Date()),
  });
  // Plano de horário livre: o uso da semana é fechado na transação (contagem fresca).
  const flexCtx = professorBooking ? null : await loadFlexPlanContext(getFirestore(), {arenaId, athleteId, dateKey});
  const memberMayCover = (memberCtx != null && !memberCtx.blocked) || flexCtx != null;
  const paymentFlags = readArenaPaymentFlags(ctx.arenaData);
  const paymentMode: PaymentMode =
    input.paymentMode === "pix" ? "pix" : "onsite";

  if (paymentMode === "pix" && !paymentFlags.onlinePaymentEnabled) {
    throw new HttpsError(
      "failed-precondition",
      "Esta arena não aceita pagamento online (PIX).",
    );
  }
  // Coberta inteira pelo banco não tem nada a pagar no local: conferido na transação.
  if (paymentMode === "onsite" && !paymentFlags.onsitePaymentEnabled && !memberMayCover) {
    throw new HttpsError(
      "failed-precondition",
      "Esta arena não aceita pagamento no local.",
    );
  }

  const paymentReceiver = readArenaPaymentReceiver(ctx.arenaData);
  if (paymentMode === "pix" && paymentReceiver === "platform") {
    try {
      requireArenaPayoutPixKey(ctx.arenaData);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "ARENA_PAYOUT_PIX_KEY_REQUIRED") {
        throw new HttpsError(
          "failed-precondition",
          "A arena precisa cadastrar uma chave PIX para receber pagamentos online.",
        );
      }
      throw e;
    }
  }

  let paymentFraction = 1;
  if (paymentMode === "pix") {
    const rawFraction = Number(input.paymentFraction);
    if (rawFraction !== 0.5 && rawFraction !== 1) {
      throw new HttpsError(
        "invalid-argument",
        "paymentFraction deve ser 0.5 ou 1 para pagamento PIX.",
      );
    }
    paymentFraction = rawFraction;
  }

  const db = getFirestore();

  const promoTotal = calculateBookingTotal({
    arenaId,
    courtId,
    dateKey,
    startTime,
    endTime,
    courtData: ctx.courtData,
    arenaFallback: ctx.arenaFallback,
    promotions: ctx.promotions,
    selectedSlotStartTimes: input.selectedSlotStartTimes,
  });
  const {
    result: baseTotal,
    coupon: baseCoupon,
    professor: professorDiscount,
    athletePricing,
  } = applyAthleteDiscounts(
    await resolveCouponForBooking({
      db,
      arenaId,
      athleteId,
      couponCode: input.couponCode,
      promoTotal,
    }),
    await loadAthletePricingRule(db, arenaId, ctx.arenaData, athleteId),
    professorBooking?.courtDiscount ?? null,
  );

  assertPositiveBookingTotal(baseTotal);
  let total = baseTotal;
  let couponOutcome = baseCoupon;
  let member: MemberHoursOutcome = NO_MEMBER_HOURS;
  let flexOutcome: FlexPlanOutcome = NO_FLEX_PLAN;
  // Assinatura livre que cobre (escolhida com a contagem de agora; reconferida na transação).
  const flexPick = flexCtx ?
    (await quoteFlexPlan(db, flexCtx, {result: baseTotal, coupon: baseCoupon}, resolved.floating ? null : courtId)).subscription :
    null;

  await ensurePeakRuleSatisfied({
    db,
    arenaId,
    courtId,
    dateKey,
    peakRules: ctx.peakRules,
    courtData: ctx.courtData,
    arenaFallback: ctx.arenaFallback,
    selectionStartTimes: total.lineItems.map((l) => l.startTime),
  });

  if (
    input.clientAmountReais != null &&
    Math.abs(input.clientAmountReais - total.amountReais) > 0.02 &&
    !memberCtx &&
    !flexCtx
  ) {
    logger.warn("createArenaBooking: client amount mismatch", {
      client: input.clientAmountReais,
      server: total.amountReais,
      arenaId,
      courtId,
    });
  }

  let amountReais = total.amountReais;
  if (paymentMode === "pix" && roundMoney(amountReais * paymentFraction) <= 0) {
    throw new HttpsError("failed-precondition", "Valor PIX inválido.");
  }

  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  if (endMin <= startMin) {
    throw new HttpsError("invalid-argument", "Intervalo de horário inválido.");
  }

  const hours = calendarHoursSpanning(startMin, endMin);
  if (hours.length === 0) {
    throw new HttpsError("failed-precondition", "Não foi possível calcular os horários.");
  }

  const bookingRef = db.collection(ARENA_BOOKINGS).doc();
  const slotRef = db.collection(ARENA_SLOTS).doc();
  const bookingId = bookingRef.id;

  const safeArena = safeIdPart(arenaId);
  const safeCourt = safeIdPart(courtId);
  let lockRefs = hours.map((h) =>
    db
      .collection(ARENA_SLOT_LOCKS)
      .doc(`${safeArena}_${safeCourt}_${dateKey}_h${h.toString().padStart(2, "0")}`),
  );

  const startAt = arenaBookingStartAt(dateKey, startTime);
  const confirmationDeadline = new Date(startAt.getTime() - 2 * 60 * 60 * 1000);
  const paymentExpiresAt = new Date(
    Date.now() + ARENA_BOOKING_PAYMENT_EXPIRY_MINUTES * 60 * 1000,
  );
  // Fechado dentro da transação, depois de reservar o crédito de chuva.
  let plan = bookingPaymentPlan({amountReais, weatherCreditReais: 0, paymentMode, paymentFraction});
  let weatherCreditReais = 0;
  let weatherCreditUses: WeatherCreditUse[] = [];

  try {
    await db.runTransaction(async (transaction) => {
      // Flutuante: a 1ª quadra candidata ainda livre vira a provisória.
      let claim: Awaited<ReturnType<typeof claimCourtLocks>> | null = null;
      if (resolved.floating) {
        const picked = await takeFirstFreeCourt(transaction, db, resolved.capacityCourts, {
          arenaId, dateKey, startTime, endTime,
        });
        if (!picked) throw new HttpsError("resource-exhausted", CAPACITY_FULL_MESSAGE);
        courtId = picked.court.id;
        courtName = picked.court.name;
        lockRefs = picked.lockRefs;
      } else {
        // Trava de reserva flutuante (modo "arena define a quadra") é empurrada para outra quadra.
        claim = await claimCourtLocks(transaction, db, {arenaId, courtId, lockRefs}, {
          ownBookingId: bookingId,
          reason: "Quadra reservada por um atleta",
        });
        if (!claim.ok) {
          throw new HttpsError(
            "already-exists",
            "Esse horário acabou de ser reservado. Escolha outro.",
          );
        }
      }

      // Mensalista: saldo da semana relido aqui (duas reservas juntas não gastam a mesma hora).
      // A transação pode repetir: tudo parte do preço de antes do banco.
      total = baseTotal;
      couponOutcome = baseCoupon;
      member = NO_MEMBER_HOURS;
      flexOutcome = NO_FLEX_PLAN;
      let commitMemberHours: (() => void) | null = null;
      let commitFlexUse: (() => void) | null = null;
      if (flexCtx && flexPick) {
        const reserved = await reserveFlexUseInTransaction(transaction, db, flexCtx, flexPick, bookingId);
        const applied = applyFlexPlan(
          {result: baseTotal, coupon: baseCoupon},
          flexPick,
          {weekday: flexCtx.weekday, courtId: resolved.floating ? null : courtId, usesLeft: reserved.usesLeft},
        );
        if (applied.flex.scheduleFlexMinutes > 0) {
          total = applied.result;
          couponOutcome = applied.coupon;
          flexOutcome = applied.flex;
          commitFlexUse = reserved.commit;
        }
      }
      if (memberCtx && !memberCtx.blocked && flexOutcome.scheduleFlexMinutes === 0) {
        const reserved = await reserveMemberMinutesInTransaction(transaction, db, memberCtx, bookingId);
        const applied = applyMemberHours(
          {result: baseTotal, coupon: baseCoupon},
          reserved.availableMinutes,
          memberCtx.contract.contractId,
        );
        total = applied.result;
        couponOutcome = applied.coupon;
        member = applied.member;
        if (member.memberHoursMinutes > 0) {
          const minutes = member.memberHoursMinutes;
          commitMemberHours = () => reserved.commit(minutes);
        }
      }
      amountReais = total.amountReais;
      if (paymentMode === "onsite" && !paymentFlags.onsitePaymentEnabled && amountReais > 0) {
        throw new HttpsError(
          "failed-precondition",
          "Esta arena não aceita pagamento no local.",
        );
      }

      // Revalida vigência/limites do cupom com dados frescos (mesma fase de
      // leitura da transação) e devolve a escrita do resgate pra rodar
      // depois — Firestore exige todas as leituras antes de qualquer escrita.
      let commitCouponRedemption: (() => void) | null = null;
      if (couponOutcome.couponApplied && couponOutcome.couponId) {
        commitCouponRedemption = await reserveCouponRedemptionInTransaction({
          transaction,
          db,
          arenaId,
          couponId: couponOutcome.couponId,
          athleteId,
        });
      }

      // Crédito de chuva: lido aqui (fase de leitura) e debitado junto da reserva.
      let commitWeatherCredit: (() => void) | null = null;
      if (input.useWeatherCredit === true) {
        const nowMs = Date.now();
        const summary = await weatherCreditSummary(db, athleteId, arenaId, nowMs);
        const toApply = weatherCreditToApply({
          amountReais,
          availableReais: summary.availableReais,
          paymentMode,
        });
        if (toApply > 0) {
          const reserved = await reserveWeatherCreditInTransaction({
            tx: transaction,
            db,
            athleteId,
            arenaId,
            amountReais: toApply,
            bookingId,
            nowMs,
          });
          weatherCreditReais = reserved.appliedReais;
          weatherCreditUses = reserved.uses;
          commitWeatherCredit = reserved.commit;
        }
      }
      plan = bookingPaymentPlan({amountReais, weatherCreditReais, paymentMode, paymentFraction});

      transaction.set(bookingRef, {
        athleteId,
        arenaId,
        arenaName,
        // O que vale se o atleta cancelar no prazo: a política da arena AGORA.
        cancelPolicy: athleteCancelPolicySnapshot(ctx.arenaData),
        courtId,
        courtName,
        sport,
        date: dateKey,
        startTime,
        endTime,
        amountReais,
        amountToPayNowReais: plan.amountToPayNowReais,
        amountPaidOnlineReais: 0,
        amountDueOnsiteReais: plan.amountDueOnsiteReais,
        paymentChannel: plan.channel,
        paymentReceiver: plan.channel === "pix" ? paymentReceiver : null,
        paymentFraction: plan.paymentFraction,
        paymentStatus: plan.paymentStatus,
        status: plan.status,
        attendanceConfirmed: false,
        attendanceStatus: "pending",
        confirmationDeadline: Timestamp.fromDate(confirmationDeadline),
        paymentExpiresAt:
          plan.channel === "pix"
            ? Timestamp.fromDate(paymentExpiresAt)
            : null,
        ...(weatherCreditReais > 0 ? {weatherCreditReais, weatherCreditUses} : {}),
        source: "platform",
        // Arena "a arena define a quadra": a flutuante espera a recepção; a escolhida pelo atleta
        // (modo misto) já nasce definida. Arena no modo de sempre não ganha os campos.
        // `revealCourtBeforeArrival` copia a opção da arena na criação: a troca de opção vale
        // para reservas novas, como a troca de modo.
        ...(resolved.floating ?
          {
            allocationStatus: "unassigned",
            allocationSource: "auto",
            revealCourtBeforeArrival: resolved.allocation.revealBeforeArrival,
          } :
          resolved.allocation.mode === "capacity" ? {allocationStatus: "assigned", allocationSource: "athlete"} : {}),
        ...(professorStamp ?? {}),
        appliedPromotionIds: total.appliedPromotionIds,
        couponId: couponOutcome.couponId,
        couponCode: couponOutcome.couponCode,
        couponDiscountReais: couponOutcome.couponDiscountReais,
        ...(professorDiscount.professorDiscountPercent > 0 ? professorDiscount : {}),
        // Preço do perfil (aluno/professor da arena): a arena vê na reserva por que saiu mais barato.
        ...(athletePricing.athletePricingTier ? athletePricing : {}),
        // Banco de horas do mensalista: quanto saiu do banco (é o que conta o saldo da semana).
        ...(member.memberHoursMinutes > 0 ? {...member, coveredByMemberHours: amountReais <= 0} : {}),
        // Plano de horário livre: quanto o plano cobriu (é o que conta os usos da semana).
        ...(flexOutcome.scheduleFlexMinutes > 0 ? {...flexOutcome, coveredByScheduleFlex: amountReais <= 0} : {}),
        pricingLineItems: total.lineItems.map((l) => ({
          startTime: l.startTime,
          endTime: l.endTime,
          baseSlotPriceReais: l.baseSlotPriceReais,
          finalSlotPriceReais: l.finalSlotPriceReais,
          appliedPromotionId: l.appliedPromotionId ?? null,
        })),
        createdAt: FieldValue.serverTimestamp(),
      });

      commitCouponRedemption?.();
      commitWeatherCredit?.();
      commitMemberHours?.();
      commitFlexUse?.();
      if (claim?.ok) claim.commit(transaction);

      // Cópia do total fora do alcance dos clientes: é dela que o PIX, a
      // divisão em fatias e o webhook partem (ver arena-booking-pricing.ts).
      transaction.set(db.collection(ARENA_BOOKING_PRICING).doc(bookingId), {
        arenaId,
        athleteId,
        amountReais,
        ...(weatherCreditReais > 0 ? {weatherCreditReais} : {}),
        createdAt: FieldValue.serverTimestamp(),
      });

      transaction.set(slotRef, {
        arenaId,
        courtId,
        // String YYYY-MM-DD — evita deslocamento de dia (UTC) ao ler no app; alinhado a arenaBookings.
        date: dateKey,
        dateKey,
        startTime,
        endTime,
        status: "booked",
        bookingAthleteId: athleteId,
        bookingId,
        priceReais: total.amountReais,
        createdAt: FieldValue.serverTimestamp(),
      });

      for (let i = 0; i < hours.length; i++) {
        const h = hours[i]!;
        transaction.set(lockRefs[i]!, {
          arenaId,
          courtId,
          date: dateKey,
          startTime: fmtHourStart(h),
          endTime: fmtHourEnd(h),
          bookingId,
          bookingAthleteId: athleteId,
          ...(resolved.floating ? {floating: true} : {}),
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("createArenaBooking transaction failed", e);
    throw new HttpsError("internal", "Não foi possível concluir a reserva.");
  }

  if (lessonStudent) {
    await recordProfessorLesson(getFirestore(), {
      bookingId,
      professorUid: athleteId,
      student: lessonStudent,
      arenaId,
      arenaName,
      courtName,
      date: dateKey,
      startTime,
      endTime,
      courtCostReais: amountReais,
    });
  }

  return {
    bookingId,
    amountReais,
    amountToPayNowReais: plan.amountToPayNowReais,
    amountDueOnsiteReais: plan.amountDueOnsiteReais,
    paymentMode: plan.channel,
    paymentFraction: plan.paymentFraction ?? 1,
    paymentExpiresAt:
      plan.channel === "pix" ? paymentExpiresAt.toISOString() : null,
    weatherCreditAppliedReais: weatherCreditReais,
    appliedPromotionIds: total.appliedPromotionIds,
    couponApplied: couponOutcome.couponApplied,
    couponId: couponOutcome.couponId,
    couponDiscountReais: couponOutcome.couponDiscountReais,
    professorDiscountPercent: professorDiscount.professorDiscountPercent,
    professorDiscountReais: professorDiscount.professorDiscountReais,
    ...athletePricing,
    memberHoursMinutes: member.memberHoursMinutes,
    memberHoursDiscountReais: member.memberHoursDiscountReais,
    scheduleFlexMinutes: flexOutcome.scheduleFlexMinutes,
    scheduleFlexDiscountReais: flexOutcome.scheduleFlexDiscountReais,
    schedulePlanName: flexOutcome.schedulePlanName,
    bookedAs: professorStamp?.bookedAs ?? "athlete",
    /** `unassigned`: a quadra é definida pela recepção (não mostrar a provisória ao atleta). */
    allocationStatus: resolved.floating ? "unassigned" : "assigned",
  };
});
