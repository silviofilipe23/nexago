/**
 * Conclusão de saque do organizador — espelha `arena-withdrawal-payout.ts`.
 * Valida a reserva, envia o PIX Asaas (com prefixo próprio) e libera o pending.
 */
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import {
  assertOrganizerWithdrawalReservationValid,
  releaseOrganizerWithdrawalReservation,
} from "./organizer-wallet";
import {ORGANIZER_WITHDRAWAL_REF_PREFIX} from "./arena-booking-payment-constants";
import {
  type PayoutSendResult,
  sendArenaWithdrawalPixTransfer,
} from "./asaas-payout";

export type CompleteOrganizerWithdrawalPayoutResult = PayoutSendResult & {
  withdrawalId: string;
  status: "approved";
};

export async function completeOrganizerWithdrawalPayout(
  db: Firestore,
  withdrawalRef: DocumentReference,
  withdrawal: Record<string, unknown>,
  reviewedBy: string,
  reviewNote?: string,
): Promise<CompleteOrganizerWithdrawalPayoutResult> {
  const organizerId = (withdrawal.organizerId as string | undefined)?.trim() ?? "";
  const amountReais = Number(withdrawal.amountReais) || 0;
  if (!organizerId || amountReais <= 0) {
    throw new Error("WITHDRAWAL_DATA_INVALID");
  }

  await assertOrganizerWithdrawalReservationValid(db, organizerId, amountReais);

  const payout = await sendArenaWithdrawalPixTransfer(
    withdrawalRef,
    withdrawal,
    ORGANIZER_WITHDRAWAL_REF_PREFIX,
  );
  await releaseOrganizerWithdrawalReservation(db, organizerId, amountReais, true);

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
