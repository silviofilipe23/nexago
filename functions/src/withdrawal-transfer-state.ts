/**
 * Estado do saque de arena/organizador em volta da transferência PIX do Asaas.
 * Peças compartilhadas pelo envio (asaas-payout.ts), pela aprovação
 * (arena-/organizer-withdrawal-payout.ts), pelo webhook TRANSFER_* e pela
 * validação de saque — sem importar nenhum deles, para não haver ciclo.
 */
import {FieldValue, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {arenaWalletRef} from "./arena-wallet";
import {roundMoney} from "./mercadopago-arena-helpers";
import {organizerWalletRef} from "./organizer-wallet";
import {professorEarningsWalletRef} from "./professor-earnings-wallet";
import {tournamentWalletRef} from "./tournament-wallet";

/** `professor`: saque dos ganhos de repasse (`professorEarningsWallets`). */
export type WithdrawalKind = "arena" | "organizer" | "professor";

/** De qual caixa o saque de organizador sai. */
export type WithdrawalWalletTarget =
  | {kind: "tournament"; tournamentId: string}
  | {kind: "organizer"; organizerId: string};

/**
 * De qual caixa o saque sai. Saque criado a partir de 16/09/2026 traz
 * `tournamentId`; os que ficaram pendentes antes da virada continuam debitando
 * `organizerWallets/{uid}` — é o único caminho que não deixa dinheiro preso.
 */
export function resolveWithdrawalWalletTarget(
  withdrawal: Record<string, unknown>,
): WithdrawalWalletTarget {
  const tournamentId = (withdrawal.tournamentId as string | undefined)?.trim() ?? "";
  if (tournamentId) return {kind: "tournament", tournamentId};
  const organizerId = (withdrawal.organizerId as string | undefined)?.trim() ?? "";
  if (organizerId) return {kind: "organizer", organizerId};
  throw new Error("WITHDRAWAL_DATA_INVALID");
}

/** O doc do caixa de onde o valor do saque saiu (e para onde volta numa falha). */
export function withdrawalWalletRef(
  db: Firestore,
  kind: WithdrawalKind,
  withdrawal: Record<string, unknown>,
): DocumentReference {
  if (kind === "professor") {
    const professorUid = (withdrawal.professorUid as string | undefined)?.trim() ?? "";
    if (!professorUid) throw new Error("WITHDRAWAL_DATA_INVALID");
    return professorEarningsWalletRef(db, professorUid);
  }
  if (kind === "arena") {
    const arenaId = (withdrawal.arenaId as string | undefined)?.trim() ?? "";
    if (!arenaId) throw new Error("WITHDRAWAL_DATA_INVALID");
    return arenaWalletRef(db, arenaId);
  }
  const target = resolveWithdrawalWalletTarget(withdrawal);
  return target.kind === "tournament" ?
    tournamentWalletRef(db, target.tournamentId) :
    organizerWalletRef(db, target.organizerId);
}

export function lowerStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Ids de transferências deste saque que já morreram (uma nova tentativa as substituiu). */
export function failedTransferIds(withdrawal: Record<string, unknown>): string[] {
  const raw = withdrawal.failedTransferIds;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

/**
 * A transferência é a ATUAL do saque? Evento ou validação de uma tentativa
 * anterior (que falhou e foi trocada) não pode mexer no saque: devolveria ao
 * caixa um saque que a tentativa nova está pagando. Sem id no evento, ou sem
 * id gravado ainda (envio em andamento), vale a referência.
 */
export function isCurrentTransfer(
  withdrawal: Record<string, unknown>,
  transferId: string | undefined,
): boolean {
  const id = transferId?.trim() ?? "";
  if (!id) return true;
  if (failedTransferIds(withdrawal).includes(id)) return false;
  const stored = (withdrawal.asaasTransferId as string | undefined)?.trim() ?? "";
  return !stored || stored === id;
}

/**
 * Número da tentativa de envio: entra na chave de idempotência. Só avança
 * quando a tentativa anterior com certeza NÃO deixou transferência viva
 * (recusa 4xx do Asaas, transferência morta, webhook de falha) — com resultado
 * incerto (rede, 5xx) a chave fica, para a repetição receber de volta a mesma
 * transferência em vez de criar uma segunda.
 */
export function transferAttempt(withdrawal: Record<string, unknown>): number {
  const n = Math.floor(Number(withdrawal.transferAttempt) || 0);
  return n > 0 ? n : 0;
}

export function nextTransferAttempt(withdrawal: Record<string, unknown>): number {
  return transferAttempt(withdrawal) + 1;
}

/**
 * "Recusar" e "pago por fora" fecham o saque sem olhar o Asaas. Com PIX
 * concluído (recusar devolveria ao caixa um dinheiro que saiu) ou com uma
 * transferência viva (pagar à mão pagaria duas vezes), eles ficam bloqueados.
 */
export function manualReviewBlockReason(withdrawal: Record<string, unknown>): string | null {
  const payout = lowerStatus(withdrawal.payoutStatus);
  if (payout === "paid") {
    return "O PIX deste saque já foi concluído no Asaas. Use \"Aprovar e pagar\" para " +
      "fechar o saque — não cria outra transferência.";
  }
  if (payout === "sent") {
    return "Há uma transferência deste saque em andamento no Asaas. Aguarde ela " +
      "concluir ou falhar — ou cancele-a no painel do Asaas — antes de recusar " +
      "ou marcar como pago por fora.";
  }
  return null;
}

/**
 * Fecha a aprovação depois do envio, numa transação com o saque: consome a
 * reserva do caixa e grava `approved` — a menos que o webhook de falha tenha
 * chegado entre o envio e aqui (`payoutStatus: failed`). Nesse caso a reserva
 * fica intacta, o saque segue `pending` na fila de revisão, e o chamador
 * recebe `TRANSFER_NOT_CONCLUDED`. Saque que já não está `pending` (recusado
 * enquanto o envio corria) dá `WITHDRAWAL_ALREADY_REVIEWED`.
 */
export async function finalizeApprovedWithdrawal(
  db: Firestore,
  kind: WithdrawalKind,
  withdrawalRef: DocumentReference,
  amountReais: number,
  review: {reviewedBy: string; reviewNote?: string},
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const w = (await tx.get(withdrawalRef)).data() ?? {};
    // Recusado no meio do caminho (a reserva já voltou ao caixa): não consome.
    if (lowerStatus(w.status) !== "pending") {
      throw new Error("WITHDRAWAL_ALREADY_REVIEWED");
    }
    if (lowerStatus(w.payoutStatus) === "failed") {
      throw new Error("TRANSFER_NOT_CONCLUDED");
    }
    const walletRef = withdrawalWalletRef(db, kind, w);
    const wallet = (await tx.get(walletRef)).data() ?? {};
    const pending = Number(wallet.pendingReais) || 0;
    tx.set(walletRef, {
      pendingReais: roundMoney(Math.max(0, pending - amountReais)),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.update(withdrawalRef, {
      status: "approved",
      reviewedBy: review.reviewedBy,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNote: review.reviewNote?.trim() || null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
