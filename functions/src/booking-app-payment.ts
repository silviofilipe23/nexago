/**
 * Recursos sociais da pelada (placar, story e arte do resultado) liberados pelo pagamento no app.
 *
 * A conta de "pago pelo app" NÃO mora aqui: é `arenaBookingAppPayment` de
 * `arena-booking-app-payment.ts`, a mesma do modelo comercial das arenas. Este arquivo só soma:
 * - o limite do dono ({@link SOCIAL_UNLOCK_MIN_APP_PAID_SHARE} do valor da reserva);
 * - o gatilho que grava `appPaidReais`/`appPaidShare`/`socialUnlocked` na reserva sozinho;
 * - o estorno (`PAYMENT_REFUNDED`), que desconta o valor de `amountPaidOnlineReais` para a regra
 *   única refletir o dinheiro que voltou;
 * - a reserva de PLANO DE HORÁRIO (`scheduleSubscriptionId`), que nasce com 0 pago porque quem paga
 *   é a mensalidade: vale a fração da mensalidade do mês paga pelo app (`paidVia: "asaas"`, sem
 *   estorno), somando os pagadores do rateio. Mensalidade baixada à mão pela arena não conta.
 */
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {arenaBookingAppPayment, isArenaBookingInactive} from "./arena-booking-app-payment";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";
import {parseArenaBookingShareExternalReference} from "./arena-booking-split";
import {ARENA_SCHEDULE_ASAAS_PAYMENTS, ARENA_SCHEDULE_CHARGES} from "./arena-schedule-plan-constants";
import {parseSchedulePaymentRef} from "./asaas-arena-schedule-webhook";

type Data = Record<string, unknown>;

const ARENA_BOOKINGS = "arenaBookings";

/** Regra do dono: metade da reserva paga pelo app libera placar, story e arte do resultado. */
export const SOCIAL_UNLOCK_MIN_APP_PAID_SHARE = 0.5;

/** Centavos de arredondamento entre o Pix cobrado e a metade exata do total. */
const AMOUNT_TOLERANCE_REAIS = 0.02;

/** Mensagem da callable (e do app antigo, via friendlyErrorMessage) quando não está liberada. */
export const SOCIAL_LOCKED_MESSAGE =
  "Para registrar o placar, pelo menos metade da reserva precisa ser paga pelo app (Pix ou cartão).";

export interface BookingSocialUnlock {
  /** Pago pelo app (`confirmedReais` da regra única). */
  appPaidReais: number;
  totalReais: number;
  /** Fração paga pelo app, de 0 a 1, com 4 casas. */
  appPaidShare: number;
  socialUnlocked: boolean;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Libera ou não, a partir da regra única. */
export function bookingSocialUnlock(booking: Data): BookingSocialUnlock {
  const {confirmedReais, totalReais, share} = arenaBookingAppPayment(booking);
  return {
    appPaidReais: confirmedReais,
    totalReais,
    appPaidShare: Math.round(share * 10_000) / 10_000,
    socialUnlocked: totalReais > 0 && confirmedReais > 0 &&
      confirmedReais + AMOUNT_TOLERANCE_REAIS >= totalReais * SOCIAL_UNLOCK_MIN_APP_PAID_SHARE,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Plano da reserva, ou `""` (avulsa). */
export function bookingSchedulePlanId(booking: Data): string {
  return str(booking["scheduleSubscriptionId"]);
}

/**
 * Fração da mensalidade do mês paga pelo app: soma do rateio pago online (`paidVia: "asaas"`, sem
 * `appPaymentRefundedAt`) sobre a soma das mensalidades não canceladas do mês.
 */
export function schedulePlanAppPaidShare(charges: readonly Data[]): number {
  let total = 0;
  let paid = 0;
  for (const c of charges) {
    if (c["status"] === "canceled") continue;
    const amount = Math.max(0, num(c["amountReais"]));
    total += amount;
    if (c["status"] === "paid" && c["paidVia"] === "asaas" && c["appPaymentRefundedAt"] == null) paid += amount;
  }
  return total > 0 ? Math.min(1, paid / total) : 0;
}

/** Reserva de plano: a fração da mensalidade vale como fração da reserva. */
export function bookingSocialUnlockFromPlan(booking: Data, planShare: number): BookingSocialUnlock {
  const totalReais = money(Math.max(0, num(booking["amountReais"])));
  const share = isArenaBookingInactive(booking) ? 0 : planShare;
  const appPaidShare = Math.round(share * 10_000) / 10_000;
  return {
    appPaidReais: money(totalReais * share),
    totalReais,
    appPaidShare,
    socialUnlocked: share > 0 && appPaidShare >= SOCIAL_UNLOCK_MIN_APP_PAID_SHARE,
  };
}

/** Mensalidades do plano no mês da reserva (`period` = AAAA-MM do `date`). */
async function readPlanMonthCharges(db: Firestore, booking: Data): Promise<Data[]> {
  const planId = bookingSchedulePlanId(booking);
  const month = (str(booking["date"]) || str(booking["dateKey"])).slice(0, 7);
  if (!planId || !/^\d{4}-\d{2}$/.test(month)) return [];
  const snap = await db.collection(ARENA_SCHEDULE_CHARGES).where("subscriptionId", "==", planId).get();
  return snap.docs.map((d) => d.data() as Data).filter((c) => c["period"] === month);
}

/**
 * Liberação de qualquer reserva: avulsa pela regra única; de plano, também pela mensalidade do mês
 * (vale a maior das duas).
 */
export async function resolveBookingSocialUnlock(db: Firestore, booking: Data): Promise<BookingSocialUnlock> {
  const direct = bookingSocialUnlock(booking);
  if (!bookingSchedulePlanId(booking)) return direct;
  const plan = bookingSocialUnlockFromPlan(booking, schedulePlanAppPaidShare(await readPlanMonthCharges(db, booking)));
  return plan.appPaidShare > direct.appPaidShare ? plan : direct;
}

/**
 * Campos derivados a regravar no doc, ou `null` quando já batem. Campo ausente vale como
 * `{appPaidReais: 0, socialUnlocked: false}`: reserva que nunca recebeu nada não ganha escrita.
 */
export function bookingSocialUnlockPatch(booking: Data, computed: BookingSocialUnlock): Data | null {
  if (
    money(num(booking["appPaidReais"])) === computed.appPaidReais &&
    num(booking["appPaidShare"]) === computed.appPaidShare &&
    (booking["socialUnlocked"] === true) === computed.socialUnlocked
  ) {
    return null;
  }
  return {
    appPaidReais: computed.appPaidReais,
    appPaidShare: computed.appPaidShare,
    socialUnlocked: computed.socialUnlocked,
  };
}

/** Campos que a regra única lê: só eles disparam a releitura. */
const INPUT_FIELDS = ["status", "paymentStatus", "refundedAt", "amountPaidOnlineReais", "amountReais"] as const;

export function bookingSocialInputsChanged(before: Data | undefined, after: Data): boolean {
  if (!before) return true;
  return INPUT_FIELDS.some((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null));
}

/**
 * Recalcula os derivados de UMA reserva relendo o doc numa transação (eventos do gatilho podem
 * chegar fora de ordem). Devolve o patch gravado, ou `null` sem mudança.
 */
export async function syncBookingSocialUnlock(db: Firestore, bookingId: string): Promise<Data | null> {
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  // Mensalidades do plano lidas antes: plano e data da reserva não mudam.
  const first = (await bookingRef.get()).data() as Data | undefined;
  if (!first) return null;
  const planShare = bookingSchedulePlanId(first) ?
    schedulePlanAppPaidShare(await readPlanMonthCharges(db, first)) :
    null;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) return null;
    const booking = snap.data() as Data;
    const direct = bookingSocialUnlock(booking);
    const plan = planShare == null ? null : bookingSocialUnlockFromPlan(booking, planShare);
    const computed = plan && plan.appPaidShare > direct.appPaidShare ? plan : direct;
    const patch = bookingSocialUnlockPatch(booking, computed);
    if (patch) tx.update(bookingRef, patch);
    return patch;
  });
}

/**
 * Liberação automática: toda escrita que mexe no que a regra lê recalcula `socialUnlocked`.
 * Cobre o Pix e o cartão confirmados, cada fatia paga da divisão (vários pagando somam), o
 * cancelamento e o estorno sem que cada caminho precise lembrar.
 */
export const syncArenaBookingAppPayment = onDocumentWritten(
  {document: "arenaBookings/{bookingId}"},
  async (event) => {
    const after = event.data?.after.data() as Data | undefined;
    if (!after) return;
    const before = event.data?.before.data() as Data | undefined;
    if (!bookingSocialInputsChanged(before, after)) return;
    const patch = await syncBookingSocialUnlock(getFirestore(), event.params.bookingId);
    if (patch) {
      logger.info("arenaBooking: liberação social recalculada", {bookingId: event.params.bookingId, ...patch});
    }
  },
);

/**
 * Estorno (`PAYMENT_REFUNDED`) de um pagamento que contou na reserva: desconta o valor de
 * `amountPaidOnlineReais` (a regra única passa a ver o dinheiro que voltou) e registra
 * `appPaymentReversals.{paymentId}`, que torna o desconto idempotente. Cobrança inteira: vale o
 * que ela gravou, se ainda é a cobrança da reserva. Fatia: o `asaasPaidAmount` dela, se paga.
 * Estorno parcial conta como total (o lado seguro). Devolve se registrou.
 */
export async function recordArenaBookingAppPaymentReversal(
  db: Firestore,
  paymentId: string,
  externalReference: string,
): Promise<boolean> {
  const ref = externalReference.trim();
  const share = parseArenaBookingShareExternalReference(ref);
  const bookingId = share ?
    share.bookingId :
    ref.startsWith(ARENA_BOOKING_PAYMENT_REF_PREFIX) ? ref.slice(ARENA_BOOKING_PAYMENT_REF_PREFIX.length).trim() : "";
  if (!paymentId || !bookingId || bookingId.includes("/")) return false;
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);

  return db.runTransaction(async (tx) => {
    const bookingSnap = await tx.get(bookingRef);
    if (!bookingSnap.exists) return false;
    const booking = bookingSnap.data() as DocumentData;
    const reversals = (booking["appPaymentReversals"] ?? {}) as Record<string, unknown>;
    if (reversals[paymentId] != null) return false;

    let amountReais = 0;
    if (share) {
      const shareSnap = await tx.get(bookingRef.collection("paymentShares").doc(share.shareId));
      const s = (shareSnap.data() ?? {}) as Data;
      if (s["status"] === "paid" && s["asaasPaymentId"] === paymentId) amountReais = num(s["asaasPaidAmount"]);
    } else if (booking["asaasPaymentId"] === paymentId) {
      amountReais = num(booking["amountPaidOnlineReais"]);
    }
    if (amountReais <= 0) return false;

    const paidBefore = Math.max(0, num(booking["amountPaidOnlineReais"]));
    tx.set(bookingRef, {
      amountPaidOnlineReais: money(Math.max(0, paidBefore - amountReais)),
      appPaymentReversals: {
        [paymentId]: {amountReais: money(amountReais), reversedAt: FieldValue.serverTimestamp()},
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    logger.warn("arenaBooking: estorno sai do pago pelo app", {bookingId, paymentId, amountReais});
    return true;
  });
}

/** Campos da mensalidade que mudam a liberação das reservas do mês. */
const CHARGE_INPUT_FIELDS = ["status", "paidVia", "amountReais", "appPaymentRefundedAt"] as const;

export function scheduleChargeSocialInputsChanged(before: Data | undefined, after: Data | undefined): boolean {
  if (!after) return before != null;
  if (!before) return true;
  return CHARGE_INPUT_FIELDS.some((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null));
}

/** Recalcula as reservas do plano no mês da mensalidade. Devolve quantas mudaram. */
export async function syncSchedulePlanMonthBookings(db: Firestore, planId: string, month: string): Promise<number> {
  if (!planId || !/^\d{4}-\d{2}$/.test(month)) return 0;
  const snap = await db.collection(ARENA_BOOKINGS).where("scheduleSubscriptionId", "==", planId).get();
  let changed = 0;
  for (const doc of snap.docs) {
    const date = str((doc.data() as Data)["date"]) || str((doc.data() as Data)["dateKey"]);
    if (!date.startsWith(month)) continue;
    if (await syncBookingSocialUnlock(db, doc.id)) changed++;
  }
  return changed;
}

/**
 * Plano pago pelo app (mensalidade confirmada pelo Asaas, uma fatia do rateio, estorno): libera ou
 * tira a liberação das reservas daquele mês sozinho.
 */
export const syncScheduleChargeSocialUnlock = onDocumentWritten(
  {document: `${ARENA_SCHEDULE_CHARGES}/{chargeId}`},
  async (event) => {
    const before = event.data?.before.data() as Data | undefined;
    const after = event.data?.after.data() as Data | undefined;
    if (!scheduleChargeSocialInputsChanged(before, after)) return;
    const charge = after ?? before ?? {};
    const changed = await syncSchedulePlanMonthBookings(
      getFirestore(),
      str(charge["subscriptionId"]),
      str(charge["period"]),
    );
    if (changed > 0) {
      logger.info("plano de horário: liberação social recalculada", {chargeId: event.params.chargeId, changed});
    }
  },
);

/**
 * Estorno de uma mensalidade de plano paga pelo app: marca `appPaymentRefundedAt` nela (idempotente).
 * A mensalidade segue `paid` (o webhook do plano deixa o estorno para resolver à mão), mas deixa
 * de contar para liberar as reservas do mês. Devolve se registrou.
 */
export async function recordSchedulePlanAppPaymentReversal(
  db: Firestore,
  paymentId: string,
  externalReference: string,
): Promise<boolean> {
  const groupId = parseSchedulePaymentRef(externalReference.trim());
  if (!paymentId || !groupId) return false;
  const group = (await db.collection(ARENA_SCHEDULE_ASAAS_PAYMENTS).doc(groupId).get()).data() as Data | undefined;
  const chargeId = str(group?.["chargeId"]);
  if (!chargeId || chargeId.includes("/")) return false;
  const chargeRef = db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId);
  return db.runTransaction(async (tx) => {
    const charge = (await tx.get(chargeRef)).data() as Data | undefined;
    if (!charge || charge["asaasPaymentId"] !== paymentId || charge["paidVia"] !== "asaas") return false;
    if (charge["appPaymentRefundedAt"] != null) return false;
    tx.set(chargeRef, {appPaymentRefundedAt: FieldValue.serverTimestamp()}, {merge: true});
    logger.warn("plano de horário: estorno sai do pago pelo app", {chargeId, paymentId});
    return true;
  });
}
