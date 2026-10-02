/**
 * Estorno de um pagamento que teve cashback (`PAYMENT_REFUNDED`): o do
 * clubinho (`leaveArenaClubSession`, sessão cancelada) e qualquer estorno
 * feito à mão no painel do Asaas. Roda pelo roteador, fora dos handlers —
 * eles param no "já processado".
 *
 * Lote do pagamento: pendente é cancelado; disponível perde o que resta.
 * Saldo usado no pagamento: volta aos lotes de origem.
 */
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {refundCapturedHold, reverseLot} from "./athlete-wallet";
import type {CashbackIntent} from "./cashback-intent";

export async function reverseCashbackForPayment(
  db: Firestore,
  processedRef: DocumentReference,
  paymentId: string,
  nowMs: number,
): Promise<"reversed" | "skipped"> {
  const data = (await processedRef.get()).data() ?? {};
  const intent = data.cashback as CashbackIntent | undefined;
  if (!intent || intent.reversedAtMs != null) return "skipped";
  // Primeiro tira a intenção da fila: aplicada depois do estorno, ela capturaria
  // a reserva devolvida aqui e criaria o lote de um pagamento que não existe mais.
  // "reversing" (em vez de já ir para "reversed") deixa a varredura retomar se o
  // processo cair no meio — as operações abaixo são idempotentes, então rodar de
  // novo num doc já em "reversing" não tem efeito duplicado.
  await processedRef.set({cashbackStatus: "reversing"}, {merge: true});
  const lotOutcome = await reverseLot(db, intent.uid, paymentId, nowMs);
  const restoredCents = intent.holdId ?
    await refundCapturedHold(db, intent.uid, intent.holdId, nowMs) :
    0;
  await processedRef.set(
    {cashbackStatus: "reversed", cashback: {reversedAtMs: nowMs}},
    {merge: true},
  );
  logger.info("cashback: pagamento estornado", {
    paymentId,
    uid: intent.uid,
    lotOutcome,
    restoredCents,
  });
  return "reversed";
}
