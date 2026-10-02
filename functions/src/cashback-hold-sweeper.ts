/**
 * Varredura de 5 minutos do cashback.
 *
 * A. Reservas de saldo abertas: confere o registro da cobrança e devolve (a
 *    cobrança morreu) ou captura (pagou e o webhook se perdeu). É UMA porta
 *    para todas as formas de uma cobrança morrer — expiração, cancelamento
 *    pelo atleta, remoção pelo organizador, status negativo do Asaas, saída do
 *    clubinho, PIX gerado de novo. Ligar código em cada porta é o que deixa
 *    passar a próxima.
 * B. Intenções de cashback pendentes: reaplica; depois de
 *    `MAX_INTENT_ATTEMPTS`, desiste e loga.
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
import {getFirebaseProjectId} from "./firebase-paths";

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

export type HoldSweepStats = {
  released: number;
  captured: number;
  kept: number;
  intentsDone: number;
  intentsFailed: number;
  intentsGivenUp: number;
};

export async function runCashbackHoldSweep(
  db: Firestore,
  projectId: string,
  nowMs: number,
): Promise<HoldSweepStats> {
  const stats: HoldSweepStats = {
    released: 0, captured: 0, kept: 0, intentsDone: 0, intentsFailed: 0, intentsGivenUp: 0,
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
      const action = decideHoldAction({
        sourceType: hold.sourceType,
        holdPaymentId: hold.asaasPaymentId,
        holdCreatedAtMs: hold.createdAt.toMillis(),
        tracking: trackingSnap?.exists ? trackingSnap.data() ?? null : null,
        nowMs,
      });
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

  return stats;
}

export const expireCashbackHolds = onSchedule(
  {schedule: "every 5 minutes", timeoutSeconds: 300},
  async () => {
    const stats = await runCashbackHoldSweep(getFirestore(), getFirebaseProjectId(), Date.now());
    logger.info("expireCashbackHolds", stats);
  },
);
