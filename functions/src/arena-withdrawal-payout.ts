import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import {
  assertWithdrawalReservationValid,
  releaseWithdrawalReservation,
} from "./arena-wallet";
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
 * Valida reserva, envia PIX Asaas e finaliza o saque (libera pending).
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
  await releaseWithdrawalReservation(db, arenaId, amountReais, true);

  await withdrawalRef.update({
    status: "approved",
    reviewedBy,
    reviewedAt: FieldValue.serverTimestamp(),
    reviewNote: reviewNote?.trim() || null,
    updatedAt: FieldValue.serverTimestamp(),
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
