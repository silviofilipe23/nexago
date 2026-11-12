/**
 * Cancelamento da reserva pelo próprio atleta, COM estorno.
 *
 * Antes, o app e o portal só gravavam `status: canceled` no doc: o Pix ou o cartão
 * ficavam com a plataforma e o atleta dependia da arena estornar à mão no Asaas.
 * Agora o cancelamento passa por aqui:
 *
 * 1. Mesma regra do app (`ArenaBookingCancellationPolicy`): só o titular, só reserva
 *    avulsa (horário fixo é com a arena), sem escolha de chuva pendente e até
 *    [ATHLETE_FREE_CANCEL_HOURS]h antes do início — dentro do prazo grátis o
 *    estorno é integral. Depois do prazo o cancelamento é combinado com a arena;
 *    só o "Cancelar mesmo" do modo professor (`lateCancel`) cancela até o início,
 *    sem estorno — o mesmo que esse caminho sempre fez.
 * 2. Estorna no Asaas cada pagamento recebido: a cobrança da reserva (Pix ou cartão)
 *    e, na reserva dividida, cada parte paga (volta para quem pagou). Falhou um →
 *    a reserva NÃO é cancelada e o atleta tenta de novo; os já estornados ficam
 *    marcados em `athleteCancelRefunds` e não são estornados duas vezes.
 * 3. Marca a reserva cancelada (`canceledByRole: athlete`); o trigger de slot libera
 *    o horário como em qualquer cancelamento.
 * 4. Tira da carteira da arena o líquido que ela recebeu por esta reserva (a
 *    plataforma absorve a própria taxa, como no clubinho) e, no cartão ainda não
 *    liquidado, o valor do "a liberar".
 *
 * O cashback usado volta pelo webhook `PAYMENT_REFUNDED`, que também desconta o
 * "pago pelo app" da reserva — nada disso é refeito aqui.
 */
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {arenaWalletRef, releaseArenaAwaitingSettlement} from "./arena-wallet";
import {arenaBookingStartAt} from "./arena-booking-start-at";
import {refundAsaasPayment} from "./asaas-booking-payment";
import {asaasArenaSecrets} from "./asaas-client";
import {cancelPendingArenaBookingPaymentCore} from "./arena-booking-pix";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {getFirebaseProjectId} from "./firebase-paths";
import {PLATFORM_FEE_FIXED_BRL, roundMoney} from "./mercadopago-arena-helpers";

const ARENA_BOOKINGS = "arenaBookings";
const PAYMENT_SHARES = "paymentShares";

/** Prazo do cancelamento grátis — o mesmo `freeCancellationHoursBeforeStart` do app. */
export const ATHLETE_FREE_CANCEL_HOURS = 6;

/** Reserva que já não vale ou já aconteceu: nada a cancelar. */
const NOT_CANCELLABLE_STATUSES = new Set([
  "canceled",
  "cancelled",
  "expired",
  "rejected",
  "refunded",
  "completed",
  "no_show",
]);

export type AthleteCancelRefund = {
  paymentId: string;
  amountReais: number;
  /** `booking`: cobrança da reserva inteira; `share`: parte paga de uma divisão. */
  kind: "booking" | "share";
  shareId?: string;
};

export type AthleteCancelPlan =
  | {kind: "reject"; code: "permission-denied" | "failed-precondition"; message: string}
  | {kind: "pending_payment"}
  | {kind: "cancel"; refunds: AthleteCancelRefund[]; late?: true};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function contactArena(booking: DocumentData): string {
  const name = str(booking["arenaName"]);
  return name ? `fale com a ${name}` : "fale com a arena";
}

/** Estornos já feitos numa tentativa anterior (o retry não estorna de novo). */
function refundedBefore(booking: DocumentData): Set<string> {
  const map = (booking["athleteCancelRefunds"] ?? {}) as Record<string, unknown>;
  const done = new Set<string>();
  for (const [paymentId, entry] of Object.entries(map)) {
    if ((entry as Record<string, unknown> | null)?.["status"] === "done") done.add(paymentId);
  }
  return done;
}

/**
 * O que fazer com o pedido de cancelamento — regra pura, sem I/O.
 * `shares` são os docs de `paymentShares` (com `id`), vazios fora da divisão.
 */
export function planAthleteBookingCancel(input: {
  booking: DocumentData;
  shares: Array<DocumentData & {id: string}>;
  callerUid: string;
  nowMs: number;
  /** Fora do prazo grátis, cancela sem estorno (modo professor, "Cancelar mesmo"). */
  lateCancel?: boolean;
}): AthleteCancelPlan {
  const {booking, shares, callerUid, nowMs} = input;
  if (str(booking["athleteId"]) !== callerUid) {
    return {kind: "reject", code: "permission-denied", message: "Você não pode cancelar esta reserva."};
  }

  const status = str(booking["status"]).toLowerCase();
  if (status === "pending_payment") return {kind: "pending_payment"};
  if (NOT_CANCELLABLE_STATUSES.has(status)) {
    return {kind: "reject", code: "failed-precondition", message: "Esta reserva não pode mais ser cancelada."};
  }
  if (booking["isRecurring"] === true || str(booking["recurringBookingId"])) {
    return {
      kind: "reject",
      code: "failed-precondition",
      message: `Horário fixo é cancelado com a arena: ${contactArena(booking)}.`,
    };
  }
  const weather = booking["weatherRelease"] as Record<string, unknown> | undefined;
  if (weather?.["status"] === "pending_choice") {
    return {
      kind: "reject",
      code: "failed-precondition",
      message: "A arena liberou este horário por chuva: escolha crédito, remarcar ou manter no aviso da reserva.",
    };
  }

  const date = str(booking["date"]);
  const startTime = str(booking["startTime"]);
  const startMs = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{1,2}:\d{2}$/.test(startTime) ?
    arenaBookingStartAt(date, startTime).getTime() :
    NaN;
  if (!Number.isFinite(startMs)) {
    return {kind: "reject", code: "failed-precondition", message: `Para cancelar, ${contactArena(booking)}.`};
  }
  if (nowMs >= startMs) {
    return {kind: "reject", code: "failed-precondition", message: "Esta reserva já começou."};
  }
  if (nowMs >= startMs - ATHLETE_FREE_CANCEL_HOURS * 60 * 60 * 1000) {
    if (input.lateCancel === true) return {kind: "cancel", refunds: [], late: true};
    return {
      kind: "reject",
      code: "failed-precondition",
      message: `O cancelamento pelo app vai só até ${ATHLETE_FREE_CANCEL_HOURS}h antes do horário. ` +
        `Para cancelar agora, ${contactArena(booking)}.`,
    };
  }

  const done = refundedBefore(booking);
  const refunds: AthleteCancelRefund[] = [];
  const split = booking["hasSplitShares"] === true;
  const paymentStatus = str(booking["paymentStatus"]).toLowerCase();
  const reversals = (booking["appPaymentReversals"] ?? {}) as Record<string, unknown>;

  // Cobrança da reserva inteira. Dividida, ela foi substituída pelas partes.
  const mainId = str(booking["asaasPaymentId"]);
  if (!split && mainId && (paymentStatus === "paid" || paymentStatus === "partial") &&
      reversals[mainId] == null && !done.has(mainId)) {
    // O que saiu do bolso (`asaasPaidAmount`); o cashback usado volta como saldo, pelo webhook.
    const cash = booking["asaasPaidAmount"] != null ?
      num(booking["asaasPaidAmount"]) :
      num(booking["amountPaidOnlineReais"]) - num(booking["cashbackAppliedReais"]) - num(booking["squadDiscountReais"]);
    refunds.push({paymentId: mainId, amountReais: roundMoney(Math.max(0, cash)), kind: "booking"});
  }
  for (const share of shares) {
    const paymentId = str(share["asaasPaymentId"]);
    if (share["status"] !== "paid" || !paymentId || reversals[paymentId] != null || done.has(paymentId)) continue;
    refunds.push({paymentId, amountReais: roundMoney(num(share["asaasPaidAmount"])), kind: "share", shareId: share.id});
  }

  // Pago online por um caminho que não sabemos estornar (Mercado Pago legado):
  // cancelar sem devolver repetiria o problema — a arena resolve.
  if (refunds.length === 0 && done.size === 0 && num(booking["amountPaidOnlineReais"]) > 0 &&
      !mainId && str(booking["mercadopagoPaymentId"])) {
    return {
      kind: "reject",
      code: "failed-precondition",
      message: `Este pagamento não pode ser estornado pelo app. Para cancelar, ${contactArena(booking)}.`,
    };
  }

  return {kind: "cancel", refunds};
}

export interface AthleteCancelDeps {
  refund: (paymentId: string) => Promise<void>;
  nowMs: () => number;
}

const defaultDeps: AthleteCancelDeps = {
  refund: (paymentId) => refundAsaasPayment(paymentId),
  nowMs: () => Date.now(),
};

export type CancelMyArenaBookingResult = {
  bookingId: string;
  status: "cancelled" | "canceled";
  /** Total devolvido nesta reserva (0 quando nada foi pago pelo app). */
  refundedReais: number;
};

/** Doc de controle do pagamento no webhook do Asaas (marca do "a liberar" do cartão). */
function processedPaymentRef(db: Firestore, paymentId: string) {
  return db.doc(`artifacts/${getFirebaseProjectId()}/public/data/asaas_processed_payments/${paymentId}`);
}

/**
 * Tira da carteira da arena o líquido creditado por esta reserva. Uma vez só por
 * reserva (linha do extrato com id fixo, na mesma transação). Pode deixar o saldo
 * negativo se a arena já sacou — mesmo risco aceito no estorno do clubinho.
 * Devolve o valor debitado.
 */
export async function debitArenaWalletForAthleteCancel(
  db: Firestore,
  arenaId: string,
  bookingId: string,
): Promise<number> {
  const walletRef = arenaWalletRef(db, arenaId);
  const ledger = walletRef.collection("ledger");
  const debitRef = ledger.doc(`athleteCancel_${bookingId}`);

  return db.runTransaction(async (tx) => {
    if ((await tx.get(debitRef)).exists) return 0;
    const credits = await tx.get(ledger.where("bookingId", "==", bookingId));
    let netReais = 0;
    for (const doc of credits.docs) {
      const entry = doc.data();
      // Só o crédito da própria reserva (sem `source`): clubinho, aula e repasses têm o seu.
      if (entry["type"] === "credit" && entry["source"] == null) netReais += num(entry["netReais"]);
    }
    netReais = roundMoney(netReais);
    if (netReais <= 0) return 0;

    const walletSnap = await tx.get(walletRef);
    const available = num(walletSnap.data()?.["availableReais"]);
    tx.set(walletRef, {
      arenaId,
      availableReais: roundMoney(available - netReais),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(debitRef, {
      type: "refund",
      source: "booking_athlete_cancel",
      bookingId,
      grossReais: roundMoney(-netReais),
      platformFeeReais: 0,
      netReais: roundMoney(-netReais),
      createdAt: FieldValue.serverTimestamp(),
    });
    return netReais;
  });
}

export async function cancelMyArenaBookingCore(
  db: Firestore,
  callerUid: string,
  bookingId: string,
  deps: AthleteCancelDeps = defaultDeps,
  opts: {lateCancel?: boolean} = {},
): Promise<CancelMyArenaBookingResult> {
  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const [bookingSnap, sharesSnap] = await Promise.all([
    bookingRef.get(),
    bookingRef.collection(PAYMENT_SHARES).get(),
  ]);
  if (!bookingSnap.exists) throw new HttpsError("not-found", "Reserva não encontrada.");
  const booking = bookingSnap.data()!;
  const plan = planAthleteBookingCancel({
    booking,
    shares: sharesSnap.docs.map((d) => ({...d.data(), id: d.id})),
    callerUid,
    nowMs: deps.nowMs(),
    lateCancel: opts.lateCancel,
  });

  if (plan.kind === "reject") throw new HttpsError(plan.code, plan.message);
  if (plan.kind === "pending_payment") {
    const res = await cancelPendingArenaBookingPaymentCore(db, callerUid, bookingId);
    return {...res, refundedReais: 0};
  }

  // 1. Estornos. Cada sucesso fica gravado: o retry depois de uma falha não repete.
  for (const r of plan.refunds) {
    try {
      await deps.refund(r.paymentId);
    } catch (e) {
      logger.error("cancelMyArenaBooking: estorno falhou", {bookingId, paymentId: r.paymentId, error: String(e)});
      await bookingRef.set({
        athleteCancelRefunds: {[r.paymentId]: {status: "failed", kind: r.kind, failedAt: FieldValue.serverTimestamp()}},
      }, {merge: true});
      throw new HttpsError(
        "unavailable",
        "Não foi possível estornar o pagamento agora. Sua reserva continua ativa — tente de novo em instantes.",
      );
    }
    await bookingRef.set({
      athleteCancelRefunds: {
        [r.paymentId]: {
          status: "done",
          kind: r.kind,
          amountReais: r.amountReais,
          ...(r.shareId ? {shareId: r.shareId} : {}),
          refundedAt: FieldValue.serverTimestamp(),
        },
      },
    }, {merge: true});
  }

  // 2. Cancela (o trigger de slot libera horário e locks).
  const doneMap = await db.runTransaction(async (tx) => {
    const current = (await tx.get(bookingRef)).data() ?? {};
    const refunds = (current["athleteCancelRefunds"] ?? {}) as Record<string, Record<string, unknown>>;
    const status = str(current["status"]).toLowerCase();
    if (!NOT_CANCELLABLE_STATUSES.has(status)) {
      tx.update(bookingRef, {
        status: "canceled",
        attendanceStatus: "canceled",
        canceledAt: FieldValue.serverTimestamp(),
        canceledByRole: "athlete",
        ...(plan.late ? {canceledLate: true} : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return refunds;
  });
  const refundedReais = roundMoney(Object.values(doneMap)
    .filter((e) => e?.["status"] === "done")
    .reduce((sum, e) => sum + num(e["amountReais"]), 0));

  // 3. Carteira da arena. Falha aqui não desfaz o estorno do atleta: grita no log.
  const arenaId = str(booking["arenaId"]);
  if (refundedReais > 0 && arenaId) {
    try {
      const debited = await debitArenaWalletForAthleteCancel(db, arenaId, bookingId);
      const mainId = str(booking["asaasPaymentId"]);
      const released = mainId ?
        await releaseArenaAwaitingSettlement(db, processedPaymentRef(db, mainId), "athlete_cancel") :
        0;
      logger.info("cancelMyArenaBooking: carteira da arena ajustada", {bookingId, arenaId, debited, released});
    } catch (e) {
      logger.error("cancelMyArenaBooking: ajuste da carteira da arena falhou — resolver à mão", {
        bookingId, arenaId, refundedReais, error: String(e),
      });
    }
  }

  logger.info("cancelMyArenaBooking: reserva cancelada pelo atleta", {bookingId, refundedReais});
  return {bookingId, status: "canceled", refundedReais};
}

/** Atleta cancela a própria reserva; o que foi pago pelo app volta pelo mesmo meio. */
export const cancelMyArenaBooking = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: [...asaasArenaSecrets, PLATFORM_FEE_FIXED_BRL],
}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const data = (request.data ?? {}) as {bookingId?: unknown; lateCancel?: unknown};
  const bookingId = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
  if (!bookingId || bookingId.includes("/")) {
    throw new HttpsError("invalid-argument", "bookingId é obrigatório.");
  }
  return cancelMyArenaBookingCore(getFirestore(), callerUid, bookingId, defaultDeps, {
    lateCancel: data.lateCancel === true,
  });
});
