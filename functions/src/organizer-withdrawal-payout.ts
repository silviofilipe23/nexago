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
import {
  assertTournamentWithdrawalReservationValid,
  releaseTournamentWithdrawalReservation,
} from "./tournament-wallet";
import {ORGANIZER_WITHDRAWAL_REF_PREFIX} from "./arena-booking-payment-constants";
import {
  type PayoutSendResult,
  sendArenaWithdrawalPixTransfer,
} from "./asaas-payout";

export type CompleteOrganizerWithdrawalPayoutResult = PayoutSendResult & {
  withdrawalId: string;
  status: "approved";
};

/**
 * De qual caixa o saque sai. Saque criado a partir de 16/09/2026 traz
 * `tournamentId`; os que ficaram pendentes antes da virada continuam debitando
 * `organizerWallets/{uid}` — é o único caminho que não deixa dinheiro preso.
 */
export function resolveWithdrawalWalletTarget(
  withdrawal: Record<string, unknown>,
):
  | {kind: "tournament"; tournamentId: string}
  | {kind: "organizer"; organizerId: string} {
  const tournamentId = (withdrawal.tournamentId as string | undefined)?.trim() ?? "";
  if (tournamentId) return {kind: "tournament", tournamentId};
  const organizerId = (withdrawal.organizerId as string | undefined)?.trim() ?? "";
  if (organizerId) return {kind: "organizer", organizerId};
  throw new Error("WITHDRAWAL_DATA_INVALID");
}

export async function completeOrganizerWithdrawalPayout(
  db: Firestore,
  withdrawalRef: DocumentReference,
  withdrawal: Record<string, unknown>,
  reviewedBy: string,
  reviewNote?: string,
): Promise<CompleteOrganizerWithdrawalPayoutResult> {
  const target = resolveWithdrawalWalletTarget(withdrawal);
  const amountReais = Number(withdrawal.amountReais) || 0;
  if (amountReais <= 0) {
    throw new Error("WITHDRAWAL_DATA_INVALID");
  }

  if (target.kind === "tournament") {
    await assertTournamentWithdrawalReservationValid(db, target.tournamentId, amountReais);
  } else {
    await assertOrganizerWithdrawalReservationValid(db, target.organizerId, amountReais);
  }

  const payout = await sendArenaWithdrawalPixTransfer(
    withdrawalRef,
    withdrawal,
    ORGANIZER_WITHDRAWAL_REF_PREFIX,
  );

  if (target.kind === "tournament") {
    await releaseTournamentWithdrawalReservation(db, target.tournamentId, amountReais, true);
  } else {
    await releaseOrganizerWithdrawalReservation(db, target.organizerId, amountReais, true);
  }

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
