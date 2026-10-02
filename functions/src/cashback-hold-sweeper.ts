/**
 * Varredura de 5 minutos do cashback.
 *
 * A. Reservas de saldo abertas: confere o registro da cobrança e devolve (a
 *    cobrança morreu) ou captura (pagou e o webhook se perdeu). É UMA porta
 *    para todas as formas de uma cobrança morrer — expiração, cancelamento
 *    pelo atleta, remoção pelo organizador, status negativo do Asaas, saída do
 *    clubinho, PIX gerado de novo. Ligar código em cada porta é o que deixa
 *    passar a próxima.
 *    O registro é só o gatilho: a reserva de quadra é gravável pelo atleta e
 *    pela arena. Antes de DEVOLVER uma reserva ligada a uma cobrança, quem
 *    decide é o Asaas — pago → captura; ainda pagável → apaga a cobrança e só
 *    então devolve; apagada/estornada → devolve; sem resposta → mantém e
 *    tenta na próxima passada. Devolver com a cobrança viva deixaria o atleta
 *    gastar o saldo de novo e ainda pagar a cobrança com o desconto.
 * B. Intenções de cashback pendentes: reaplica; depois de
 *    `MAX_INTENT_ATTEMPTS`, desiste e loga.
 * C. Estornos interrompidos (`cashbackStatus: "reversing"`): o roteador marcou
 *    e caiu no meio, antes de desfazer lote e saldo — retoma do zero; as
 *    operações são idempotentes.
 */
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  getFirestore,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import type {CashbackSourceType} from "./cashback-rules";
import type {HoldDoc} from "./athlete-wallet-state";
import {captureHold, releaseHold} from "./athlete-wallet";
import {applyCashbackIntent, MAX_INTENT_ATTEMPTS, type CashbackIntent} from "./cashback-intent";
import {reverseCashbackForPayment} from "./cashback-reversal";
import {getFirebaseProjectId} from "./firebase-paths";
import {asaasArenaSecrets} from "./asaas-client";
import {
  deleteAsaasPaymentOrThrow,
  getAsaasPayment,
  type AsaasPaymentDetails,
} from "./asaas-booking-payment";

/** Reserva recém-criada pode estar no meio da callable (cobrança ainda sendo criada). */
const HOLD_GRACE_MS = 2 * 60 * 1000;
/** Reserva que nunca ganhou cobrança: a callable caiu entre reservar e cobrar. */
const UNATTACHED_HOLD_TTL_MS = 15 * 60 * 1000;

export type HoldAction = "release" | "capture" | "keep";

export function decideHoldAction(p: {
  sourceType: CashbackSourceType;
  holdPaymentId: string | null;
  holdCreatedAtMs: number;
  tracking: Record<string, unknown> | null;
  nowMs: number;
}): HoldAction {
  if (!p.holdPaymentId) {
    return p.nowMs - p.holdCreatedAtMs > UNATTACHED_HOLD_TTL_MS ? "release" : "keep";
  }
  const t = p.tracking;
  if (!t) return "release";
  const trackingPaymentId = typeof t.asaasPaymentId === "string" ? t.asaasPaymentId.trim() : "";
  if (trackingPaymentId !== p.holdPaymentId) return "release";
  const status = String(t.status ?? "").toLowerCase();
  if (p.sourceType === "registration") {
    if (status === "paid") return "capture";
    return status === "pending" ? "keep" : "release";
  }
  if (p.sourceType === "booking") {
    const paymentStatus = String(t.paymentStatus ?? "").toLowerCase();
    if (paymentStatus === "paid" || paymentStatus === "partial") return "capture";
    return status === "pending_payment" ? "keep" : "release";
  }
  if (status === "confirmed") return "capture";
  return status === "pending_payment" ? "keep" : "release";
}

/** Asaas injetável: os testes da varredura não vão à rede. */
export type HoldSweepAsaas = {
  getPayment: (paymentId: string) => Promise<AsaasPaymentDetails>;
  /** Apaga e PROPAGA a falha (404 = já não existe = sucesso). */
  deletePayment: (paymentId: string) => Promise<void>;
};

const defaultHoldSweepAsaas: HoldSweepAsaas = {
  getPayment: getAsaasPayment,
  deletePayment: deleteAsaasPaymentOrThrow,
};

const ASAAS_PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const ASAAS_GONE_STATUSES = new Set(["REFUNDED", "DELETED"]);
/** Pago e em estorno/disputa: não é pagável nem morto — espera o desfecho. */
const ASAAS_SETTLING_STATUSES = new Set([
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED",
  "DUNNING_RECEIVED",
]);

export type AsaasHoldVerdict = "capture" | "release" | "delete_then_release" | "wait";

/**
 * O que fazer com uma reserva que o registro manda devolver, pelo que o
 * Asaas diz da cobrança dela. O GET de cobrança removida devolve o último
 * status mais `deleted: true`. Status vazio é incerteza: espera.
 */
export function asaasVerdictForHold(payment: {status?: string; deleted?: boolean}): AsaasHoldVerdict {
  if (payment.deleted === true) return "release";
  const status = (payment.status ?? "").trim().toUpperCase();
  if (!status) return "wait";
  if (ASAAS_PAID_STATUSES.has(status)) return "capture";
  if (ASAAS_GONE_STATUSES.has(status)) return "release";
  if (ASAAS_SETTLING_STATUSES.has(status)) return "wait";
  // PENDING, OVERDUE, AWAITING_RISK_ANALYSIS e qualquer outro: ainda pagável.
  return "delete_then_release";
}

export type HoldSweepStats = {
  released: number;
  captured: number;
  kept: number;
  /** Cobranças ainda pagáveis apagadas no Asaas antes de devolver a reserva. */
  chargesDeleted: number;
  /** GET ou DELETE do Asaas falhou: reserva mantida para a próxima passada. */
  asaasFailed: number;
  intentsDone: number;
  intentsFailed: number;
  intentsGivenUp: number;
  reversalsRetried: number;
};

/**
 * O registro mandou devolver uma reserva ligada a uma cobrança: o Asaas
 * confirma antes. Nunca devolve na incerteza.
 */
async function confirmReleaseWithAsaas(
  asaas: HoldSweepAsaas,
  paymentId: string,
  stats: HoldSweepStats,
  ctx: {uid: string; holdId: string},
): Promise<HoldAction> {
  let payment: AsaasPaymentDetails;
  try {
    payment = await asaas.getPayment(paymentId);
  } catch (e) {
    stats.asaasFailed++;
    logger.error("cashback: Asaas não respondeu sobre a cobrança da reserva — mantida", {
      ...ctx, paymentId, error: String(e),
    });
    return "keep";
  }
  const verdict = asaasVerdictForHold(payment);
  if (verdict === "capture" || verdict === "release") return verdict;
  if (verdict === "wait") {
    logger.warn("cashback: cobrança da reserva em estorno/disputa ou sem status — mantida", {
      ...ctx, paymentId, status: payment.status ?? null,
    });
    return "keep";
  }
  try {
    await asaas.deletePayment(paymentId);
  } catch (e) {
    stats.asaasFailed++;
    logger.error("cashback: cobrança ainda pagável não foi apagada — reserva mantida", {
      ...ctx, paymentId, status: payment.status ?? null, error: String(e),
    });
    return "keep";
  }
  stats.chargesDeleted++;
  return "release";
}

export async function runCashbackHoldSweep(
  db: Firestore,
  projectId: string,
  nowMs: number,
  asaas: HoldSweepAsaas = defaultHoldSweepAsaas,
): Promise<HoldSweepStats> {
  const stats: HoldSweepStats = {
    released: 0, captured: 0, kept: 0, chargesDeleted: 0, asaasFailed: 0,
    intentsDone: 0, intentsFailed: 0, intentsGivenUp: 0, reversalsRetried: 0,
  };

  const holdsSnap = await db
    .collectionGroup("holds")
    .where("status", "==", "open")
    .where("createdAt", "<=", Timestamp.fromMillis(nowMs - HOLD_GRACE_MS))
    .limit(200)
    .get();
  for (const doc of holdsSnap.docs) {
    const hold = doc.data() as HoldDoc;
    const uid = doc.ref.parent.parent?.id ?? hold.uid;
    try {
      const trackingSnap = hold.trackingPath ? await db.doc(hold.trackingPath).get() : null;
      let action = decideHoldAction({
        sourceType: hold.sourceType,
        holdPaymentId: hold.asaasPaymentId,
        holdCreatedAtMs: hold.createdAt.toMillis(),
        tracking: trackingSnap?.exists ? trackingSnap.data() ?? null : null,
        nowMs,
      });
      // Sem `asaasPaymentId` a cobrança nunca chegou a existir: devolve direto.
      if (action === "release" && hold.asaasPaymentId) {
        action = await confirmReleaseWithAsaas(asaas, hold.asaasPaymentId, stats, {uid, holdId: doc.id});
      }
      if (action === "release") {
        if (await releaseHold(db, uid, doc.id, nowMs)) stats.released++;
      } else if (action === "capture") {
        await captureHold(db, uid, doc.id, nowMs);
        stats.captured++;
      } else {
        stats.kept++;
      }
    } catch (e) {
      logger.error("cashback: falha ao conferir reserva de saldo", {uid, holdId: doc.id, error: String(e)});
    }
  }

  const intentsSnap = await db
    .collection(`artifacts/${projectId}/public/data/asaas_processed_payments`)
    .where("cashbackStatus", "==", "pending")
    .limit(100)
    .get();
  for (const doc of intentsSnap.docs) {
    const intent = doc.data().cashback as CashbackIntent | undefined;
    if ((intent?.attempts ?? 0) >= MAX_INTENT_ATTEMPTS) {
      await doc.ref.set({cashbackStatus: "failed"}, {merge: true});
      logger.error("cashback: intenção abandonada depois do limite de tentativas", {
        paymentId: doc.id,
        lastError: intent?.lastError ?? null,
      });
      stats.intentsGivenUp++;
      continue;
    }
    const result = await applyCashbackIntent(db, doc.ref as DocumentReference, doc.id, nowMs);
    if (result === "done") stats.intentsDone++;
    else if (result === "failed") stats.intentsFailed++;
  }

  const reversingSnap = await db
    .collection(`artifacts/${projectId}/public/data/asaas_processed_payments`)
    .where("cashbackStatus", "==", "reversing")
    .limit(100)
    .get();
  for (const doc of reversingSnap.docs) {
    try {
      await reverseCashbackForPayment(db, doc.ref as DocumentReference, doc.id, nowMs);
      stats.reversalsRetried++;
    } catch (e) {
      logger.error("cashback: falha ao retomar estorno interrompido", {
        paymentId: doc.id,
        error: String(e),
      });
    }
  }

  return stats;
}

export const expireCashbackHolds = onSchedule(
  // Os segredos do Asaas são obrigatórios: sem eles todo GET falha e nenhuma
  // reserva com cobrança volta a ser devolvida.
  {schedule: "every 5 minutes", timeoutSeconds: 300, secrets: [...asaasArenaSecrets]},
  async () => {
    const stats = await runCashbackHoldSweep(getFirestore(), getFirebaseProjectId(), Date.now());
    logger.info("expireCashbackHolds", stats);
  },
);
