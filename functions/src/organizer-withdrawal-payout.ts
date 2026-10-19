/**
 * Conclusão de saque do organizador — espelha `arena-withdrawal-payout.ts`.
 * Valida a reserva, envia o PIX Asaas (com prefixo próprio) e libera o pending.
 */
import {type DocumentReference, type Firestore} from "firebase-admin/firestore";
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
import {
  finalizeApprovedWithdrawal,
  resolveWithdrawalWalletTarget,
  type WithdrawalWalletTarget,
} from "./withdrawal-transfer-state";

export type CompleteOrganizerWithdrawalPayoutResult = PayoutSendResult & {
  withdrawalId: string;
  status: "approved";
};

// Moraram aqui; o webhook e a validação de saque também precisam, então foram
// para `withdrawal-transfer-state.ts` (sem ciclo de import). Reexporta para os
// chamadores de sempre.
export {resolveWithdrawalWalletTarget, type WithdrawalWalletTarget};

/**
 * Libera a reserva no caixa que o saque aponta — ÚNICO despacho de alvo do
 * projeto. O if/else vivia copiado em três lugares (aqui, e nos dois caminhos
 * de revisão de `organizer-withdrawal.ts`), e foi essa repetição que deixou o
 * saque automático debitar a carteira errada sem ninguém perceber. Os
 * `assert*` de reserva continuam separados de propósito: eles não são iguais
 * (o do torneio também checa o disponível negativo).
 */
export async function releaseWithdrawalReservation(
  db: Firestore,
  target: WithdrawalWalletTarget,
  amountReais: number,
  approve: boolean,
): Promise<void> {
  if (target.kind === "tournament") {
    await releaseTournamentWithdrawalReservation(
      db, target.tournamentId, amountReais, approve,
    );
    return;
  }
  await releaseOrganizerWithdrawalReservation(
    db, target.organizerId, amountReais, approve,
  );
}

/**
 * Envio do PIX. Existe como parâmetro só para o teste poder observar o caminho
 * automático sem tocar na rede — em produção é sempre o Asaas de verdade.
 */
export type WithdrawalPixSender = (
  withdrawalRef: DocumentReference,
  withdrawal: Record<string, unknown>,
  externalRefPrefix: string,
) => Promise<PayoutSendResult>;

export async function completeOrganizerWithdrawalPayout(
  db: Firestore,
  withdrawalRef: DocumentReference,
  withdrawal: Record<string, unknown>,
  reviewedBy: string,
  reviewNote?: string,
  sendPixTransfer: WithdrawalPixSender = sendArenaWithdrawalPixTransfer,
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

  const payout = await sendPixTransfer(
    withdrawalRef,
    withdrawal,
    ORGANIZER_WITHDRAWAL_REF_PREFIX,
  );

  // Consome a reserva e aprova numa transação que relê o saque: se o webhook
  // de falha chegou entre o envio e aqui, nada é consumido.
  await finalizeApprovedWithdrawal(db, "organizer", withdrawalRef, amountReais, {
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
