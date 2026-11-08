/**
 * "Pagamento confirmado pelo app" de uma reserva de quadra — a regra num lugar só.
 *
 * Quanto da reserva foi pago pela NexaGO (`appPaidReais`):
 * - `amountPaidOnlineReais`: Pix/cartão confirmados pelo webhook (Asaas e o legado Mercado Pago),
 *   inclusive cashback e desconto de embaixador, que a nexaGO cobre, e a soma das fatias pagas
 *   de uma reserva dividida. Só o servidor grava (allow-list de `arenaBookings` nas rules);
 * - mais o crédito de chuva usado na criação (dinheiro que já tinha sido pago pelo app);
 * - menos os estornos registrados em `appPaymentReversals.{paymentId}`.
 * Reserva cancelada ou ainda esperando o Pix conta zero. Pagamento na arena nunca entra.
 *
 * Usos: a liberação dos recursos sociais da pelada (placar, story e arte do resultado pedem
 * pelo menos {@link SOCIAL_UNLOCK_MIN_APP_PAID_SHARE} do valor) e o modelo comercial das arenas
 * ({@link isBookingAppPaymentConfirmed}).
 */
import {
  FieldValue,
  type DocumentData,
  type Firestore,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";
import {
  ARENA_BOOKING_PRICING,
  type ArenaBookingServerPricing,
} from "./arena-booking-pricing";
import {parseArenaBookingShareExternalReference} from "./arena-booking-split";

type Data = Record<string, unknown>;

const ARENA_BOOKINGS = "arenaBookings";

/** Regra do dono: metade da reserva paga pelo app libera placar, story e arte do resultado. */
export const SOCIAL_UNLOCK_MIN_APP_PAID_SHARE = 0.5;

/** Centavos de arredondamento entre o Pix cobrado e a metade exata do total. */
const AMOUNT_TOLERANCE_REAIS = 0.02;

/** Reserva que não está de pé (ou ainda não foi paga): nada do que entrou conta. */
const NOT_LIVE_STATUSES = new Set([
  "canceled",
  "cancelled",
  "pending",
  "processing",
  "pending_payment",
  "expired",
  "rejected",
]);

/** Mensagem da callable (e do app) quando a reserva não está liberada. */
export const SOCIAL_LOCKED_MESSAGE =
  "Para registrar o placar, pelo menos metade da reserva precisa ser paga pelo app (Pix ou cartão).";

export interface BookingAppPayment {
  /** Pago pelo app, já sem estornos (0 se a reserva não está de pé). */
  appPaidReais: number;
  /** Valor da reserva: preço do servidor (`arenaBookingPricing`), senão o do doc. */
  totalReais: number;
  /** `appPaidReais / totalReais`, de 0 a 1, com 4 casas. */
  appPaidShare: number;
  /** Placar, story e arte do resultado liberados. */
  socialUnlocked: boolean;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v: number): number {
  return Math.round(v * 100) / 100;
}

function statusOf(booking: Data): string {
  return typeof booking["status"] === "string" ? booking["status"].trim().toLowerCase() : "";
}

/** Soma dos estornos registrados (`appPaymentReversals.{paymentId}.amountReais`). */
export function bookingAppReversedReais(booking: Data): number {
  const raw = booking["appPaymentReversals"];
  if (!raw || typeof raw !== "object") return 0;
  let total = 0;
  for (const entry of Object.values(raw as Record<string, unknown>)) {
    const amount = entry && typeof entry === "object" ? num((entry as Data)["amountReais"]) : 0;
    if (amount > 0) total += amount;
  }
  return money(total);
}

/**
 * Quanto da reserva foi pago pelo app e se isso libera os recursos sociais. Pura: o preço do
 * servidor vem de fora ({@link readBookingAppPayment}); sem ele (reserva legada) vale o doc.
 */
export function computeBookingAppPayment(
  booking: Data,
  pricing: ArenaBookingServerPricing | null,
): BookingAppPayment {
  const totalReais = money(pricing ? pricing.amountReais : Math.max(0, num(booking["amountReais"])));
  const credit = pricing ?
    pricing.weatherCreditReais :
    Math.max(0, num(booking["weatherCreditReais"]));
  const live = !NOT_LIVE_STATUSES.has(statusOf(booking));
  const gross = Math.max(0, num(booking["amountPaidOnlineReais"])) + Math.max(0, credit);
  const appPaidReais = live ? money(Math.max(0, gross - bookingAppReversedReais(booking))) : 0;
  const appPaidShare = totalReais > 0 ?
    Math.min(1, Math.round((appPaidReais / totalReais) * 10_000) / 10_000) :
    0;
  const socialUnlocked = totalReais > 0 && appPaidReais > 0 &&
    appPaidReais + AMOUNT_TOLERANCE_REAIS >= totalReais * SOCIAL_UNLOCK_MIN_APP_PAID_SHARE;
  return {appPaidReais, totalReais, appPaidShare, socialUnlocked};
}

/**
 * Reserva com pagamento confirmado pelo app (qualquer valor), de pé. Mesma conta da liberação
 * social — para o modelo comercial das arenas contar só o que passou pela NexaGO.
 */
export function isBookingAppPaymentConfirmed(booking: Data): boolean {
  return computeBookingAppPayment(booking, null).appPaidReais > 0;
}

async function readPricing(db: Firestore, bookingId: string): Promise<ArenaBookingServerPricing | null> {
  const snap = await db.collection(ARENA_BOOKING_PRICING).doc(bookingId).get();
  if (!snap.exists) return null;
  const amount = num(snap.data()?.["amountReais"]);
  if (amount <= 0) return null;
  const credit = num(snap.data()?.["weatherCreditReais"]);
  return {amountReais: amount, weatherCreditReais: credit > 0 ? Math.min(credit, amount) : 0};
}

/** {@link computeBookingAppPayment} com o preço do servidor. */
export async function readBookingAppPayment(
  db: Firestore,
  bookingId: string,
  booking: Data,
): Promise<BookingAppPayment> {
  return computeBookingAppPayment(booking, await readPricing(db, bookingId));
}

/**
 * Campos derivados a regravar no doc, ou `null` quando já batem. Campo ausente vale como
 * `{appPaidReais: 0, socialUnlocked: false}`: reserva que nunca recebeu nada não ganha escrita.
 */
export function bookingAppPaymentPatch(booking: Data, computed: BookingAppPayment): Data | null {
  const storedPaid = money(num(booking["appPaidReais"]));
  const storedShare = num(booking["appPaidShare"]);
  const storedUnlocked = booking["socialUnlocked"] === true;
  if (
    storedPaid === computed.appPaidReais &&
    storedShare === computed.appPaidShare &&
    storedUnlocked === computed.socialUnlocked
  ) {
    return null;
  }
  return {
    appPaidReais: computed.appPaidReais,
    appPaidShare: computed.appPaidShare,
    socialUnlocked: computed.socialUnlocked,
  };
}

/** Campos que mudam a conta: só eles disparam a releitura. */
const INPUT_FIELDS = [
  "status",
  "amountPaidOnlineReais",
  "weatherCreditReais",
  "appPaymentReversals",
  "amountReais",
] as const;

export function bookingAppPaymentInputsChanged(before: Data | undefined, after: Data): boolean {
  if (!before) return true;
  return INPUT_FIELDS.some((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null));
}

/**
 * Recalcula os derivados de UMA reserva relendo o doc numa transação (eventos do gatilho podem
 * chegar fora de ordem). Devolve o patch gravado, ou `null` sem mudança.
 */
export async function syncBookingAppPayment(db: Firestore, bookingId: string): Promise<Data | null> {
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const pricing = await readPricing(db, bookingId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) return null;
    const booking = snap.data() as Data;
    const patch = bookingAppPaymentPatch(booking, computeBookingAppPayment(booking, pricing));
    if (patch) tx.update(bookingRef, patch);
    return patch;
  });
}

/**
 * Liberação automática: toda escrita que mexe em status, pago online, crédito ou estorno
 * recalcula `appPaidReais`/`appPaidShare`/`socialUnlocked`. Cobre o Pix e o cartão confirmados,
 * cada fatia paga da divisão, o cancelamento e o estorno sem que cada caminho precise lembrar.
 */
export const syncArenaBookingAppPayment = onDocumentWritten(
  {document: "arenaBookings/{bookingId}"},
  async (event) => {
    const after = event.data?.after.data() as Data | undefined;
    if (!after) return;
    const before = event.data?.before.data() as Data | undefined;
    if (!bookingAppPaymentInputsChanged(before, after)) return;
    const patch = await syncBookingAppPayment(getFirestore(), event.params.bookingId);
    if (patch) logger.info("arenaBooking: pago pelo app recalculado", {bookingId: event.params.bookingId, ...patch});
  },
);

/**
 * Estorno (`PAYMENT_REFUNDED`) de um pagamento que contou na reserva: registra o valor em
 * `appPaymentReversals.{paymentId}` (idempotente pela chave) e o gatilho tira a liberação.
 * Cobrança inteira: vale o que ela gravou em `amountPaidOnlineReais`, se ainda é a cobrança da
 * reserva. Fatia: o `asaasPaidAmount` dela, se paga. Estorno parcial conta como total (o lado
 * seguro). Devolve se registrou.
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

    tx.set(bookingRef, {
      appPaymentReversals: {
        [paymentId]: {amountReais: money(amountReais), reversedAt: FieldValue.serverTimestamp()},
      },
    }, {merge: true});
    logger.warn("arenaBooking: estorno tira o pago pelo app", {bookingId, paymentId, amountReais});
    return true;
  });
}
