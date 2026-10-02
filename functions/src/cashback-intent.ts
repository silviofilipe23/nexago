/**
 * Intenção de cashback — gravada pelo webhook no MESMO batch que confirma o
 * pagamento (em `asaas_processed_payments/{paymentId}`) e aplicada logo em
 * seguida: captura a reserva de saldo e cria o lote pendente.
 *
 * Falha aqui nunca derruba o webhook: a intenção fica `cashbackStatus:
 * "pending"` e a varredura de 5 minutos tenta de novo. O espelho de topo
 * `cashbackStatus` existe para a varredura consultar sem depender de campo
 * aninhado.
 */
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import type {CashbackConfig} from "./cashback-config";
import {computeEarnCents, toCents, type CashbackSourceType} from "./cashback-rules";
import {captureHold, earnPendingLot} from "./athlete-wallet";
import {athleteWalletRef} from "./athlete-wallet-state";

export type CashbackIntent = {
  uid: string;
  sourceType: CashbackSourceType;
  sourceId: string;
  tournamentId: string | null;
  arenaId: string | null;
  label: string;
  eventAtMs: number;
  cashCents: number;
  appliedCents: number;
  feeCents: number;
  earnCents: number;
  holdId: string | null;
  attempts: number;
  lastError: string | null;
  reversedAtMs: number | null;
};

export const MAX_INTENT_ATTEMPTS = 10;

export function buildCashbackIntent(p: {
  uid: string;
  sourceType: CashbackSourceType;
  sourceId: string;
  tournamentId: string | null;
  arenaId: string | null;
  label: string;
  eventAtMs: number;
  /** O que o Asaas recebeu — base do ganho (a parte paga com saldo não gera cashback). */
  cashReais: number;
  appliedCents: number;
  /** Taxa da nexaGO sobre o BRUTO — base da trava do ganho. */
  feeReais: number;
  holdId: string | null;
  config: CashbackConfig;
}): CashbackIntent {
  const cashCents = toCents(p.cashReais);
  const feeCents = toCents(p.feeReais);
  return {
    uid: p.uid,
    sourceType: p.sourceType,
    sourceId: p.sourceId,
    tournamentId: p.tournamentId,
    arenaId: p.arenaId,
    label: p.label,
    eventAtMs: p.eventAtMs,
    cashCents,
    appliedCents: p.appliedCents,
    feeCents,
    earnCents: p.config.enabled ? computeEarnCents({cashCents, feeCents, config: p.config}) : 0,
    holdId: p.holdId,
    attempts: 0,
    lastError: null,
    reversedAtMs: null,
  };
}

/** Sem atleta, sem reserva e sem ganho não há o que gravar. */
export function intentHasWork(intent: CashbackIntent): boolean {
  return intent.uid !== "" && (intent.holdId != null || intent.earnCents > 0);
}

export function cashbackIntentFields(intent: CashbackIntent): Record<string, unknown> {
  return {cashback: intent, cashbackStatus: "pending"};
}

/** Saldo aplicado e reserva gravados no registro da cobrança (pixPending, reserva, participante). */
export function readCashbackApplied(
  data: Record<string, unknown> | undefined,
): {appliedCents: number; holdId: string | null} {
  const applied = Math.round(Number(data?.cashbackAppliedCents));
  const rawHold = data?.cashbackHoldId;
  return {
    appliedCents: Number.isFinite(applied) && applied > 0 ? applied : 0,
    holdId: typeof rawHold === "string" && rawHold.trim() ? rawHold.trim() : null,
  };
}

/**
 * Quanto saldo ESTE pagamento usou. O registro da cobrança (pixPending,
 * reserva, participante) é reescrito quando o atleta gera uma cobrança nova:
 * só vale se for da mesma cobrança. Senão, a reserva é achada pelo id do
 * pagamento (gravado por `attachHoldPayment`); sem reserva, nada foi usado.
 */
export async function resolveCashbackForPayment(
  db: Firestore,
  uid: string,
  paymentId: string,
  tracking: Record<string, unknown> | undefined,
): Promise<{appliedCents: number; holdId: string | null}> {
  if (typeof tracking?.asaasPaymentId === "string" && tracking.asaasPaymentId.trim() === paymentId) {
    return readCashbackApplied(tracking);
  }
  if (!uid) return {appliedCents: 0, holdId: null};
  const snap = await athleteWalletRef(db, uid)
    .collection("holds")
    .where("asaasPaymentId", "==", paymentId)
    .limit(1)
    .get();
  if (snap.empty) return {appliedCents: 0, holdId: null};
  const doc = snap.docs[0];
  const data = doc.data() ?? {};
  return {
    appliedCents: Math.max(0, Math.round(Number(data.amountCents)) || 0),
    holdId: doc.id,
  };
}

export function registrationCashbackLabel(tournamentName: string): string {
  return `Inscrição · ${tournamentName}`;
}

export function bookingCashbackLabel(arenaName: string, dateKey: unknown): string {
  const m = typeof dateKey === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey) : null;
  return m ? `Reserva · ${arenaName} · ${m[3]}/${m[2]}` : `Reserva · ${arenaName}`;
}

export function clubCashbackLabel(clubName: string): string {
  return `Clubinho · ${clubName}`;
}

/** Captura a reserva e cria o lote pendente. Idempotente; nunca lança. */
export async function applyCashbackIntent(
  db: Firestore,
  processedRef: DocumentReference,
  paymentId: string,
  nowMs: number,
): Promise<"done" | "skipped" | "failed"> {
  let intent: CashbackIntent | undefined;
  try {
    const data = (await processedRef.get()).data() ?? {};
    if (data.cashbackStatus !== "pending") return "skipped";
    intent = data.cashback as CashbackIntent | undefined;
    if (!intent) return "skipped";
    if (intent.holdId) {
      const capture = await captureHold(db, intent.uid, intent.holdId, nowMs);
      if (capture.shortfallCents > 0) {
        logger.error(
          "cashback: saldo usado num pagamento tardio já não estava disponível — nexaGO absorveu",
          {paymentId, uid: intent.uid, holdId: intent.holdId, shortfallCents: capture.shortfallCents},
        );
      }
    }
    await earnPendingLot(db, {
      uid: intent.uid,
      paymentId,
      earnCents: intent.earnCents,
      sourceType: intent.sourceType,
      sourceId: intent.sourceId,
      tournamentId: intent.tournamentId,
      arenaId: intent.arenaId,
      label: intent.label,
      eventAtMs: intent.eventAtMs,
      nowMs,
    });
    await processedRef.set({cashbackStatus: "done"}, {merge: true});
    return "done";
  } catch (e) {
    logger.error("cashback: falha ao aplicar a intenção — a varredura tenta de novo", {
      paymentId,
      error: String(e),
    });
    try {
      await processedRef.set({
        cashback: {attempts: (intent?.attempts ?? 0) + 1, lastError: String(e)},
      }, {merge: true});
    } catch {
      // A varredura reconta na próxima passada.
    }
    return "failed";
  }
}
