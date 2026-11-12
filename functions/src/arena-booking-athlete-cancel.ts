/**
 * Cancelamento da reserva pelo próprio atleta, com o que a arena escolheu devolver.
 *
 * Antes, o app e o portal só gravavam `status: canceled` no doc: o Pix ou o cartão
 * ficavam com a plataforma e o atleta dependia da arena estornar à mão no Asaas.
 * Agora o cancelamento passa por aqui:
 *
 * 1. Mesma regra do app (`ArenaBookingCancellationPolicy`): só o titular, só reserva
 *    avulsa (horário fixo é com a arena), sem escolha de chuva pendente e até
 *    [ATHLETE_FREE_CANCEL_HOURS]h antes do início. Depois do prazo o cancelamento é
 *    combinado com a arena; só o "Cancelar mesmo" do modo professor (`lateCancel`)
 *    cancela até o início, sem devolver nada — o mesmo que esse caminho sempre fez.
 * 2. Dentro do prazo vale a política da arena copiada na reserva (`cancelPolicy`,
 *    ver `arena-athlete-cancel-policy.ts`; sem cópia = estorno integral):
 *    - estorno integral ou parcial no Asaas de cada pagamento recebido — a cobrança
 *      da reserva (Pix ou cartão) e, na reserva dividida, cada parte paga (volta para
 *      quem pagou). Falhou um → a reserva NÃO é cancelada e o atleta tenta de novo;
 *      os já estornados ficam em `athleteCancelRefunds` e não se repetem;
 *    - crédito na arena: o valor pago vira saldo em `arenaWeatherCredits` (o mesmo dos
 *      créditos de chuva), criado na MESMA transação que cancela a reserva.
 * 3. Marca a reserva cancelada (`canceledByRole: athlete`); o trigger de slot libera
 *    o horário como em qualquer cancelamento.
 * 4. Estorno: tira da carteira da arena a mesma fração do líquido que ela recebeu (a
 *    plataforma absorve a própria taxa, como no clubinho). Crédito: a carteira não
 *    mexe — o dinheiro fica na arena, como nos créditos de chuva.
 *
 * No estorno integral, o cashback usado volta pelo webhook `PAYMENT_REFUNDED`. No
 * parcial, o Asaas devolve a fração sobre o valor TODO (cashback incluso), limitada
 * ao que saiu do bolso; o saldo de cashback usado fica com a reserva.
 */
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {arenaWalletRef, heldArenaAwaitingSettlement, releaseArenaAwaitingSettlement} from "./arena-wallet";
import {
  DEFAULT_ATHLETE_CANCEL_POLICY,
  normalizeAthleteCancelPolicy,
  type AthleteCancelPolicy,
} from "./arena-athlete-cancel-policy";
import {ARENA_WEATHER_CREDITS, weatherCreditDoc} from "./arena-weather-credits";
import {normalizeWeatherPolicy, weatherCreditExpiresAtMs} from "./arena-weather-model";
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
  /** Estorno parcial: vai `value` ao Asaas. Integral: sem `value` (tudo, cashback junto). */
  partial: boolean;
  /** `booking`: cobrança da reserva inteira; `share`: parte paga de uma divisão. */
  kind: "booking" | "share";
  shareId?: string;
};

export type AthleteCancelCredit = {
  /** `wx_<reserva>` (titular) ou `wx_<reserva>_<parte>` (quem pagou a parte). */
  creditId: string;
  athleteId: string;
  amountReais: number;
};

export type AthleteCancelPlan =
  | {kind: "reject"; code: "permission-denied" | "failed-precondition"; message: string}
  | {kind: "pending_payment"}
  | {
    kind: "cancel";
    policy: AthleteCancelPolicy;
    refunds: AthleteCancelRefund[];
    credits: AthleteCancelCredit[];
    late?: true;
  };

/** Um pagamento recebido pela reserva. */
type PaidItem = {
  paymentId: string;
  kind: "booking" | "share";
  shareId?: string;
  payerUid: string;
  /** O que saiu do bolso pelo Asaas. */
  cashReais: number;
  /** O que conta como pago (com cashback e desconto de embaixador). */
  valueReais: number;
};

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
  bookingId: string;
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
    if (input.lateCancel === true) {
      return {kind: "cancel", policy: DEFAULT_ATHLETE_CANCEL_POLICY, refunds: [], credits: [], late: true};
    }
    return {
      kind: "reject",
      code: "failed-precondition",
      message: `O cancelamento pelo app vai só até ${ATHLETE_FREE_CANCEL_HOURS}h antes do horário. ` +
        `Para cancelar agora, ${contactArena(booking)}.`,
    };
  }

  const policy = booking["cancelPolicy"] == null ?
    DEFAULT_ATHLETE_CANCEL_POLICY :
    normalizeAthleteCancelPolicy(booking["cancelPolicy"]);
  const items = paidItems(booking, shares);

  // Pago online por um caminho que não sabemos estornar (Mercado Pago legado):
  // cancelar sem devolver repetiria o problema — a arena resolve.
  if (items.length === 0 && num(booking["amountPaidOnlineReais"]) > 0 &&
      !str(booking["asaasPaymentId"]) && str(booking["mercadopagoPaymentId"])) {
    return {
      kind: "reject",
      code: "failed-precondition",
      message: `Este pagamento não pode ser estornado pelo app. Para cancelar, ${contactArena(booking)}.`,
    };
  }

  if (policy.mode === "credit") {
    const bookingId = input.bookingId;
    const credits = items
      .filter((i) => i.valueReais > 0 && i.payerUid)
      .map((i) => ({
        creditId: i.kind === "share" ? `wx_${bookingId}_${i.shareId}` : `wx_${bookingId}`,
        athleteId: i.payerUid,
        amountReais: roundMoney(i.valueReais),
      }));
    return {kind: "cancel", policy, refunds: [], credits};
  }

  const done = refundedBefore(booking);
  const reversals = (booking["appPaymentReversals"] ?? {}) as Record<string, unknown>;
  const partial = policy.refundPercent < 100;
  const refunds: AthleteCancelRefund[] = [];
  for (const i of items) {
    if (reversals[i.paymentId] != null || done.has(i.paymentId)) continue;
    const amount = partial ?
      Math.min(i.cashReais, roundMoney(i.valueReais * policy.refundPercent / 100)) :
      i.cashReais;
    if (amount <= 0) continue;
    refunds.push({
      paymentId: i.paymentId,
      amountReais: roundMoney(amount),
      partial,
      kind: i.kind,
      ...(i.shareId ? {shareId: i.shareId} : {}),
    });
  }
  return {kind: "cancel", policy, refunds, credits: []};
}

/** Pagamentos recebidos: a cobrança da reserva inteira ou, dividida, as partes pagas. */
function paidItems(booking: DocumentData, shares: Array<DocumentData & {id: string}>): PaidItem[] {
  const items: PaidItem[] = [];
  const paymentStatus = str(booking["paymentStatus"]).toLowerCase();
  // Dividida, a cobrança da reserva inteira foi substituída pelas partes.
  const mainId = str(booking["asaasPaymentId"]);
  if (booking["hasSplitShares"] !== true && mainId && (paymentStatus === "paid" || paymentStatus === "partial")) {
    const value = num(booking["amountPaidOnlineReais"]);
    const cash = booking["asaasPaidAmount"] != null ?
      num(booking["asaasPaidAmount"]) :
      value - num(booking["cashbackAppliedReais"]) - num(booking["squadDiscountReais"]);
    items.push({
      paymentId: mainId,
      kind: "booking",
      payerUid: str(booking["athleteId"]),
      cashReais: roundMoney(Math.max(0, cash)),
      valueReais: roundMoney(Math.max(0, value)),
    });
  }
  for (const share of shares) {
    const paymentId = str(share["asaasPaymentId"]);
    if (share["status"] !== "paid" || !paymentId) continue;
    const paid = roundMoney(Math.max(0, num(share["asaasPaidAmount"])));
    items.push({
      paymentId,
      kind: "share",
      shareId: share.id,
      payerUid: str(share["payerAthleteId"]),
      cashReais: paid,
      valueReais: paid,
    });
  }
  return items;
}

export interface AthleteCancelDeps {
  /** `valueReais` só no estorno parcial; sem ele o Asaas devolve tudo. */
  refund: (paymentId: string, valueReais?: number) => Promise<void>;
  nowMs: () => number;
}

const defaultDeps: AthleteCancelDeps = {
  refund: (paymentId, valueReais) => refundAsaasPayment(paymentId, valueReais),
  nowMs: () => Date.now(),
};

export type CancelMyArenaBookingResult = {
  bookingId: string;
  status: "cancelled" | "canceled";
  /** Total devolvido em dinheiro (0 quando nada foi pago pelo app ou a arena dá crédito). */
  refundedReais: number;
  /** Total que virou crédito do atleta na arena. */
  creditedReais: number;
  /** O que a política da reserva mandou fazer. */
  mode: "refund" | "credit";
  refundPercent: number;
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
  opts: {
    /** Fração do líquido que sai (1 no estorno integral; 0,5 no estorno de 50%). */
    fraction?: number;
    /** Líquido ainda no "a liberar" (cartão não liquidado) que entra depois e também conta. */
    awaitingNetReais?: number;
  } = {},
): Promise<number> {
  const fraction = Math.min(1, Math.max(0, opts.fraction ?? 1));
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
    netReais = roundMoney((netReais + Math.max(0, opts.awaitingNetReais ?? 0)) * fraction);
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
      ...(fraction < 1 ? {fraction} : {}),
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
    bookingId,
    booking,
    shares: sharesSnap.docs.map((d) => ({...d.data(), id: d.id})),
    callerUid,
    nowMs: deps.nowMs(),
    lateCancel: opts.lateCancel,
  });

  if (plan.kind === "reject") throw new HttpsError(plan.code, plan.message);
  if (plan.kind === "pending_payment") {
    const res = await cancelPendingArenaBookingPaymentCore(db, callerUid, bookingId);
    return {...res, refundedReais: 0, creditedReais: 0, mode: "refund", refundPercent: 100};
  }
  const {policy} = plan;
  const result = (refundedReais: number, creditedReais: number): CancelMyArenaBookingResult => ({
    bookingId, status: "canceled", refundedReais, creditedReais, mode: policy.mode, refundPercent: policy.refundPercent,
  });

  if (policy.mode === "credit" && !plan.late) {
    const creditedReais = await cancelWithArenaCredit(db, bookingRef, booking, plan.credits, deps.nowMs());
    logger.info("cancelMyArenaBooking: reserva cancelada, valor virou crédito na arena", {bookingId, creditedReais});
    return result(0, creditedReais);
  }

  // 1. Estornos. Cada sucesso fica gravado: o retry depois de uma falha não repete.
  for (const r of plan.refunds) {
    try {
      await deps.refund(r.paymentId, r.partial ? r.amountReais : undefined);
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
          ...(r.partial ? {partial: true} : {}),
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
    if (!NOT_CANCELLABLE_STATUSES.has(str(current["status"]).toLowerCase())) {
      tx.update(bookingRef, {
        ...canceledFields(plan.late ? null : policy),
        ...(plan.late ? {canceledLate: true} : {}),
      });
    }
    return refunds;
  });
  const refundedReais = roundMoney(Object.values(doneMap)
    .filter((e) => e?.["status"] === "done")
    .reduce((sum, e) => sum + num(e["amountReais"]), 0));

  // 3. Carteira da arena: sai a mesma fração do líquido. Falha aqui não desfaz o
  //    estorno do atleta: grita no log.
  const arenaId = str(booking["arenaId"]);
  if (refundedReais > 0 && arenaId) {
    try {
      const mainId = str(booking["asaasPaymentId"]);
      const fraction = policy.refundPercent / 100;
      let released = 0;
      let awaitingNetReais = 0;
      if (mainId && fraction >= 1) {
        // Integral: o cartão não vai liquidar — sai do "a liberar".
        released = await releaseArenaAwaitingSettlement(db, processedPaymentRef(db, mainId), "athlete_cancel");
      } else if (mainId) {
        // Parcial: o cartão ainda liquida (menos o estorno) e credita o líquido cheio
        // depois; a fração dele já sai agora junto com o resto.
        awaitingNetReais = heldArenaAwaitingSettlement((await processedPaymentRef(db, mainId).get()).data())?.netReais ?? 0;
      }
      const debited = await debitArenaWalletForAthleteCancel(db, arenaId, bookingId, {fraction, awaitingNetReais});
      logger.info("cancelMyArenaBooking: carteira da arena ajustada", {bookingId, arenaId, debited, released, fraction});
    } catch (e) {
      logger.error("cancelMyArenaBooking: ajuste da carteira da arena falhou — resolver à mão", {
        bookingId, arenaId, refundedReais, error: String(e),
      });
    }
  }

  logger.info("cancelMyArenaBooking: reserva cancelada pelo atleta", {bookingId, refundedReais, policy});
  return result(refundedReais, 0);
}

/** Campos do cancelamento pelo atleta (com a política aplicada, quando houve). */
function canceledFields(policy: AthleteCancelPolicy | null): DocumentData {
  return {
    status: "canceled",
    attendanceStatus: "canceled",
    canceledAt: FieldValue.serverTimestamp(),
    canceledByRole: "athlete",
    ...(policy ? {athleteCancelOutcome: {mode: policy.mode, refundPercent: policy.refundPercent}} : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Política "crédito na arena": cria os créditos (id fixo — repetir não credita em
 * dobro) e cancela a reserva na MESMA transação. A carteira da arena não mexe: o
 * dinheiro já está lá desde o pagamento. Devolve o total creditado.
 */
async function cancelWithArenaCredit(
  db: Firestore,
  bookingRef: DocumentReference,
  booking: DocumentData,
  credits: AthleteCancelCredit[],
  nowMs: number,
): Promise<number> {
  const arenaId = str(booking["arenaId"]);
  const arenaData = arenaId ? (await db.collection("arenas").doc(arenaId).get()).data() : undefined;
  const expiresAtMs = weatherCreditExpiresAtMs(normalizeWeatherPolicy(arenaData?.["weatherPolicy"]), nowMs);
  const names = new Map<string, string>();
  for (const uid of new Set(credits.map((c) => c.athleteId))) {
    const user = (await db.collection("users").doc(uid).get()).data();
    names.set(uid, str(user?.["fullName"]) || str(user?.["displayName"]) || "Atleta");
  }

  return db.runTransaction(async (tx) => {
    const current = (await tx.get(bookingRef)).data() ?? {};
    const refs = credits.map((c) => db.collection(ARENA_WEATHER_CREDITS).doc(c.creditId));
    const existing = await Promise.all(refs.map((r) => tx.get(r)));
    if (NOT_CANCELLABLE_STATUSES.has(str(current["status"]).toLowerCase())) {
      // Outra chamada cancelou primeiro: o que ela criou é o que vale.
      return roundMoney(existing.reduce((sum, snap) => sum + num(snap.data()?.["amountReais"]), 0));
    }
    let total = 0;
    credits.forEach((c, i) => {
      total += c.amountReais;
      if (existing[i].exists) return;
      tx.set(refs[i], {
        ...weatherCreditDoc({
          originBookingId: bookingRef.id,
          booking: {...current, athleteId: c.athleteId},
          athleteName: names.get(c.athleteId) ?? "Atleta",
          amountReais: c.amountReais,
          balanceReais: c.amountReais,
          source: "athlete_cancel",
          expiresAtMs,
          nowMs,
        }),
      });
    });
    tx.update(bookingRef, {
      ...canceledFields({mode: "credit", refundPercent: 0}),
      athleteCancelCreditIds: credits.map((c) => c.creditId),
    });
    return roundMoney(total);
  });
}

/** Atleta cancela a própria reserva; volta o que a política da arena manda (estorno ou crédito). */
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
