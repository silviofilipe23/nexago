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
import {
  resolveCouponForBooking,
  reserveCouponRedemptionInTransaction,
  type CouponPricingOutcome,
} from "./arena-coupons";
import {ensurePeakRuleSatisfied, parsePeakRulesFromDocs} from "./arena-peak-rules";

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

async function loadPricingContext(arenaId: string, courtId: string) {
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
  if (!snap.exists) return;
  const reason = (snap.data()?.["reason"] as string | undefined)?.trim();
  const suffix = reason ? ` Motivo: ${reason}` : "";
  throw new HttpsError(
    "permission-denied",
    `Sua conta está bloqueada para reservar nesta arena.${suffix}`,
  );
}

async function quoteInternal(
  input: BookingInput,
  athleteId: string,
): Promise<BookingTotalResult & CouponPricingOutcome> {
  const arenaId = input.arenaId?.trim();
  const courtId = input.courtId?.trim();
  const dateKey = parseDateKey(input.date ?? "");
  const startTime = input.startTime?.trim() ?? "";
  const endTime = input.endTime?.trim() ?? "";

  if (!arenaId || !courtId || !dateKey || startTime.length < 4 || endTime.length < 4) {
    throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
  }

  const ctx = await loadPricingContext(arenaId, courtId);
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

  const {result, coupon} = await resolveCouponForBooking({
    db: getFirestore(),
    arenaId,
    athleteId,
    couponCode: input.couponCode,
    promoTotal,
  });
  return {...result, ...coupon};
}

function assertPositiveBookingTotal(total: BookingTotalResult): void {
  if (total.amountReais <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "Configure o preço da quadra antes de reservar.",
    );
  }
}

export const quoteArenaBooking = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as BookingInput;
  const total = await quoteInternal(input, request.auth.uid);
  assertPositiveBookingTotal(total);
  return {
    amountReais: total.amountReais,
    lineItems: total.lineItems,
    appliedPromotionIds: total.appliedPromotionIds,
    couponApplied: total.couponApplied,
    couponId: total.couponId,
    couponDiscountReais: total.couponDiscountReais,
  };
});

export const createArenaBooking = onCall(async (request) => {
  const athleteId = request.auth?.uid;
  if (!athleteId) {
    throw new HttpsError("unauthenticated", "Faça login para confirmar a reserva.");
  }

  const input = (request.data ?? {}) as BookingInput;
  const arenaId = input.arenaId?.trim();
  const courtId = input.courtId?.trim();
  const arenaName = (input.arenaName?.trim() || "Arena");
  const courtName = (input.courtName?.trim() || "Quadra");
  const dateKey = parseDateKey(input.date ?? "");
  const startTime = input.startTime?.trim() ?? "";
  const endTime = input.endTime?.trim() ?? "";

  if (!arenaId || !courtId || !dateKey || startTime.length < 4 || endTime.length < 4) {
    throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
  }

  await ensureNotBlocked(arenaId, athleteId);

  const ctx = await loadPricingContext(arenaId, courtId);
  const paymentFlags = readArenaPaymentFlags(ctx.arenaData);
  const paymentMode: PaymentMode =
    input.paymentMode === "pix" ? "pix" : "onsite";

  if (paymentMode === "pix" && !paymentFlags.onlinePaymentEnabled) {
    throw new HttpsError(
      "failed-precondition",
      "Esta arena não aceita pagamento online (PIX).",
    );
  }
  if (paymentMode === "onsite" && !paymentFlags.onsitePaymentEnabled) {
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
  const {result: total, coupon: couponOutcome} = await resolveCouponForBooking({
    db,
    arenaId,
    athleteId,
    couponCode: input.couponCode,
    promoTotal,
  });

  assertPositiveBookingTotal(total);

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
    Math.abs(input.clientAmountReais - total.amountReais) > 0.02
  ) {
    logger.warn("createArenaBooking: client amount mismatch", {
      client: input.clientAmountReais,
      server: total.amountReais,
      arenaId,
      courtId,
    });
  }

  const amountReais = total.amountReais;
  const amountToPayNowReais =
    paymentMode === "pix"
      ? roundMoney(amountReais * paymentFraction)
      : 0;
  const amountDueOnsiteReais =
    paymentMode === "pix"
      ? roundMoney(amountReais - amountToPayNowReais)
      : amountReais;

  if (paymentMode === "pix" && amountToPayNowReais <= 0) {
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
  const lockRefs = hours.map((h) =>
    db
      .collection(ARENA_SLOT_LOCKS)
      .doc(`${safeArena}_${safeCourt}_${dateKey}_h${h.toString().padStart(2, "0")}`),
  );

  const dateParts = dateKey.split("-");
  const day = new Date(
    parseInt(dateParts[0] ?? "2020", 10),
    parseInt(dateParts[1] ?? "1", 10) - 1,
    parseInt(dateParts[2] ?? "1", 10),
  );
  const startParts = startTime.split(":");
  const startHour = parseInt(startParts[0] ?? "0", 10);
  const startMinute = parseInt(startParts[1] ?? "0", 10);
  const startAt = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    startHour,
    startMinute,
  );
  const confirmationDeadline = new Date(startAt.getTime() - 2 * 60 * 60 * 1000);
  const paymentExpiresAt = new Date(
    Date.now() + ARENA_BOOKING_PAYMENT_EXPIRY_MINUTES * 60 * 1000,
  );
  const bookingStatus = paymentMode === "pix" ? "pending_payment" : "active";
  const bookingPaymentStatus = paymentMode === "pix" ? "pending" : "none";

  try {
    await db.runTransaction(async (transaction) => {
      for (const lockRef of lockRefs) {
        const snap = await transaction.get(lockRef);
        if (snap.exists) {
          throw new HttpsError(
            "already-exists",
            "Esse horário acabou de ser reservado. Escolha outro.",
          );
        }
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

      transaction.set(bookingRef, {
        athleteId,
        arenaId,
        arenaName,
        courtId,
        courtName,
        date: dateKey,
        startTime,
        endTime,
        amountReais,
        amountToPayNowReais,
        amountPaidOnlineReais: 0,
        amountDueOnsiteReais,
        paymentChannel: paymentMode,
        paymentReceiver: paymentMode === "pix" ? paymentReceiver : null,
        paymentFraction: paymentMode === "pix" ? paymentFraction : null,
        paymentStatus: bookingPaymentStatus,
        status: bookingStatus,
        attendanceConfirmed: false,
        attendanceStatus: "pending",
        confirmationDeadline: Timestamp.fromDate(confirmationDeadline),
        paymentExpiresAt:
          paymentMode === "pix"
            ? Timestamp.fromDate(paymentExpiresAt)
            : null,
        source: "platform",
        appliedPromotionIds: total.appliedPromotionIds,
        couponId: couponOutcome.couponId,
        couponCode: couponOutcome.couponCode,
        couponDiscountReais: couponOutcome.couponDiscountReais,
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
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("createArenaBooking transaction failed", e);
    throw new HttpsError("internal", "Não foi possível concluir a reserva.");
  }

  return {
    bookingId,
    amountReais,
    amountToPayNowReais,
    amountDueOnsiteReais,
    paymentMode,
    paymentFraction: paymentMode === "pix" ? paymentFraction : 1,
    paymentExpiresAt:
      paymentMode === "pix" ? paymentExpiresAt.toISOString() : null,
    appliedPromotionIds: total.appliedPromotionIds,
    couponApplied: couponOutcome.couponApplied,
    couponId: couponOutcome.couponId,
    couponDiscountReais: couponOutcome.couponDiscountReais,
  };
});
