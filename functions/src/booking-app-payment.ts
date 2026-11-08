/**
 * Recursos sociais da pelada (placar, story e arte do resultado) liberados pelo pagamento no app.
 *
 * A conta de "pago pelo app" NÃO mora aqui: é `arenaBookingAppPayment` de
 * `arena-booking-app-payment.ts`, a mesma do modelo comercial das arenas. Este arquivo só soma:
 * - o limite do dono ({@link SOCIAL_UNLOCK_MIN_APP_PAID_SHARE} do valor da reserva);
 * - o gatilho que grava `appPaidReais`/`appPaidShare`/`socialUnlocked` na reserva sozinho;
 * - o estorno (`PAYMENT_REFUNDED`), que desconta o valor de `amountPaidOnlineReais` para a regra
 *   única refletir o dinheiro que voltou.
 */
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {arenaBookingAppPayment} from "./arena-booking-app-payment";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";
import {parseArenaBookingShareExternalReference} from "./arena-booking-split";

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
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) return null;
    const booking = snap.data() as Data;
    const patch = bookingSocialUnlockPatch(booking, bookingSocialUnlock(booking));
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
