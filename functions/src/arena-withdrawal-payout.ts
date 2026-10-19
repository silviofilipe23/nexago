import {type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {assertWithdrawalReservationValid} from "./arena-wallet";
import {finalizeApprovedWithdrawal} from "./withdrawal-transfer-state";
import {
  AsaasPayoutError,
  type PayoutSendResult,
  sendArenaWithdrawalPixTransfer,
} from "./asaas-payout";

export type CompleteWithdrawalPayoutResult = PayoutSendResult & {
  withdrawalId: string;
  status: "approved";
};

/**
 * Valida reserva, envia PIX Asaas e finaliza o saque (consome o pending).
 */
export async function completeArenaWithdrawalPayout(
  db: Firestore,
  withdrawalRef: DocumentReference,
  withdrawal: Record<string, unknown>,
  reviewedBy: string,
  reviewNote?: string,
): Promise<CompleteWithdrawalPayoutResult> {
  const arenaId = (withdrawal.arenaId as string | undefined)?.trim() ?? "";
  const amountReais = Number(withdrawal.amountReais) || 0;
  if (!arenaId || amountReais <= 0) {
    throw new Error("WITHDRAWAL_DATA_INVALID");
  }

  await assertWithdrawalReservationValid(db, arenaId, amountReais);

  const payout = await sendArenaWithdrawalPixTransfer(withdrawalRef, withdrawal);
  // Consome a reserva e aprova numa transação que relê o saque: se o webhook
  // de falha chegou entre o envio e aqui, nada é consumido.
  await finalizeApprovedWithdrawal(db, "arena", withdrawalRef, amountReais, {
    reviewedBy,
    reviewNote,
  });

  return {
    withdrawalId: withdrawalRef.id,
    status: "approved",
    payoutId: payout.payoutId,
    payoutStatus: payout.payoutStatus,
  };
}

export function isAsaasPayoutError(e: unknown): e is AsaasPayoutError {
  return e instanceof AsaasPayoutError;
}
