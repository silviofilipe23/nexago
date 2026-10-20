/**
 * Saques pagos por PIX pelo Asaas (arena e organizador): de qual saque é uma
 * transferência, e o que cada `TRANSFER_*` faz com ele.
 *
 * `payoutStatus` do saque:
 *   pending → indo ao Asaas
 *   sent    → transferência CRIADA; pode estar esperando autorização (token
 *             SMS/APP, validação de saque) e ainda falhar no banco
 *   paid    → `TRANSFER_DONE`: o dinheiro saiu (só aqui ganha `paidAt`)
 *   failed  → não saiu
 *
 * Na aprovação a reserva já foi consumida do caixa; quando a transferência
 * falha ou é cancelada DEPOIS disso, o valor volta ao disponível e o saque
 * vira `rejected` — o mesmo desfecho da recusa no backoffice, que todas as
 * telas (inclusive o app já publicado) mostram como "Falhou".
 */
import {PROFESSOR_WITHDRAWAL_REF_PREFIX, PROFESSOR_WITHDRAWALS} from "./professor-earnings-wallet";
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  ARENA_WITHDRAWAL_REF_PREFIX,
  ORGANIZER_WITHDRAWAL_REF_PREFIX,
} from "./arena-booking-payment-constants";
import {roundMoney} from "./mercadopago-arena-helpers";
import {deliverNotificationToUser} from "./notification-delivery";
import {ORGANIZER_WALLET_NOTIFICATION_LINKS} from "./organizer-notification-links";
import {
  isCurrentTransfer,
  lowerStatus,
  nextTransferAttempt,
  type WithdrawalKind,
  withdrawalWalletRef,
} from "./withdrawal-transfer-state";

export const ARENA_WITHDRAWALS = "arenaWithdrawals";
export const ORGANIZER_WITHDRAWALS = "organizerWithdrawals";

export type {WithdrawalKind};

/** O que o Asaas manda de uma transferência (webhook e validação de saque). */
export type AsaasTransferPayload = {
  id?: string;
  externalReference?: string;
  status?: string;
  value?: number;
  failReason?: string;
  /** `PIX`, `TED` ou `INTERNAL`. */
  operationType?: string;
  bankAccount?: {pixAddressKey?: string} | null;
};

export type WithdrawalMatch = {kind: WithdrawalKind; ref: DocumentReference};

/** `externalReference` → saque. Sem prefixo nosso, a transferência não é de saque. */
export function parseWithdrawalReference(
  externalReference: string | undefined,
): {kind: WithdrawalKind; collection: string; withdrawalId: string} | null {
  const ref = (externalReference ?? "").trim();
  const prefixes: Array<[string, WithdrawalKind, string]> = [
    [ORGANIZER_WITHDRAWAL_REF_PREFIX, "organizer", ORGANIZER_WITHDRAWALS],
    [ARENA_WITHDRAWAL_REF_PREFIX, "arena", ARENA_WITHDRAWALS],
    [PROFESSOR_WITHDRAWAL_REF_PREFIX, "professor", PROFESSOR_WITHDRAWALS],
  ];
  for (const [prefix, kind, collection] of prefixes) {
    if (!ref.startsWith(prefix)) continue;
    const withdrawalId = ref.slice(prefix.length).trim();
    return withdrawalId ? {kind, collection, withdrawalId} : null;
  }
  return null;
}

/**
 * Acha o saque da transferência: pela referência que o envio grava e, sem
 * ela, pelo id da transferência guardado no doc do saque.
 */
export async function findWithdrawalForTransfer(
  db: Firestore,
  transfer: AsaasTransferPayload | undefined,
): Promise<WithdrawalMatch | null> {
  const parsed = parseWithdrawalReference(transfer?.externalReference);
  if (parsed) {
    const ref = db.collection(parsed.collection).doc(parsed.withdrawalId);
    const snap = await ref.get();
    return snap.exists ? {kind: parsed.kind, ref} : null;
  }
  const transferId = transfer?.id?.trim() ?? "";
  if (!transferId) return null;
  const lookups: Array<[WithdrawalKind, string]> = [
    ["arena", ARENA_WITHDRAWALS],
    ["organizer", ORGANIZER_WITHDRAWALS],
    ["professor", PROFESSOR_WITHDRAWALS],
  ];
  for (const [kind, collection] of lookups) {
    const snap = await db.collection(collection)
      .where("asaasTransferId", "==", transferId).limit(1).get();
    if (!snap.empty) return {kind, ref: snap.docs[0].ref};
  }
  return null;
}

/** Motivo da falha em texto para o saque e para o aviso. */
export function describeTransferFailure(
  event: string,
  transfer: AsaasTransferPayload | undefined,
): string {
  const reason = transfer?.failReason?.trim();
  if (reason) return reason;
  return event === "TRANSFER_CANCELLED" ?
    "Transferência cancelada no Asaas (autorização não concluída ou recusada)." :
    "Transferência recusada pelo banco.";
}

export type WithdrawalTransferFailure = {
  kind: WithdrawalKind;
  withdrawal: Record<string, unknown>;
  amountReais: number;
  reason: string;
};

/** Aviso a quem pediu o saque. Melhor esforço: falhar aqui não desfaz nada. */
export type WithdrawalFailureNotifier = (failure: WithdrawalTransferFailure) => Promise<void>;

export const notifyWithdrawalTransferFailed: WithdrawalFailureNotifier = async (failure) => {
  const w = failure.withdrawal;
  const userId = failure.kind === "arena" ?
    (w.managerUserId as string | undefined)?.trim() :
    failure.kind === "professor" ?
      (w.professorUid as string | undefined)?.trim() :
      ((w.requestedBy as string | undefined)?.trim() || (w.organizerId as string | undefined)?.trim());
  if (!userId) return;
  try {
    await deliverNotificationToUser({
      userId,
      title: "Saque não concluído",
      body:
        `Seu saque de R$ ${failure.amountReais.toFixed(2).replace(".", ",")} não foi concluído. ` +
        "O valor voltou para o seu caixa — confira a chave PIX e peça o saque de novo.",
      type: "withdrawal_transfer_failed",
      data: failure.kind === "organizer" ? {...ORGANIZER_WALLET_NOTIFICATION_LINKS} :
        failure.kind === "professor" ? {url: "/professor/mais/ganhos"} : {},
    });
  } catch (err) {
    logger.warn("notifyWithdrawalTransferFailed falhou", err);
  }
};

const FAILURE_EVENTS: Record<string, string> = {
  TRANSFER_FAILED: "failed",
  TRANSFER_CANCELLED: "cancelled",
};

/**
 * Reconcilia os webhooks `TRANSFER_*` dos saques de arena
 * (`arenaWithdrawal:*`) e de organizador (`organizerWithdrawal:*`).
 */
export async function processArenaWithdrawalTransferWebhook(
  db: Firestore,
  event: string,
  transfer: AsaasTransferPayload | undefined,
  notify: WithdrawalFailureNotifier = notifyWithdrawalTransferFailed,
): Promise<void> {
  const match = await findWithdrawalForTransfer(db, transfer);
  if (!match) {
    logger.info(
      `asaasWebhook transfer: saque não encontrado ref=${transfer?.externalReference ?? ""} ` +
      `transfer=${transfer?.id ?? ""}`,
    );
    return;
  }

  if (event === "TRANSFER_DONE") {
    await markWithdrawalPaid(db, match, transfer);
    return;
  }

  const webhookStatus = FAILURE_EVENTS[event];
  if (webhookStatus) {
    const failure = await handleWithdrawalTransferFailure(db, match, event, webhookStatus, transfer);
    if (failure) await notify(failure);
  }
}

async function markWithdrawalPaid(
  db: Firestore,
  {ref}: WithdrawalMatch,
  transfer: AsaasTransferPayload | undefined,
): Promise<void> {
  const transferId = transfer?.id?.trim() ?? "";
  await db.runTransaction(async (tx) => {
    const w = (await tx.get(ref)).data() ?? {};
    if (!isCurrentTransfer(w, transferId)) {
      logger.warn(`asaasWebhook TRANSFER_DONE de transferência antiga ${transferId} withdrawal=${ref.path}`);
      return;
    }
    if (lowerStatus(w.payoutStatus) === "paid") return;
    if (lowerStatus(w.status) === "rejected") {
      // O valor já tinha voltado ao caixa e o banco concluiu mesmo assim: o
      // dinheiro saiu E está de novo disponível. Só uma pessoa resolve isso.
      tx.update(ref, {
        transferWebhookStatus: "done",
        payoutWebhookAlert:
          "Transferência concluída depois de dada como falha — o valor foi devolvido " +
          "ao caixa e também saiu da conta. Revisar no backoffice.",
        updatedAt: FieldValue.serverTimestamp(),
      });
      logger.error(`asaasWebhook TRANSFER_DONE depois da devolução withdrawal=${ref.path}`);
      return;
    }
    const stillPending = lowerStatus(w.status) === "pending";
    tx.update(ref, {
      payoutStatus: "paid",
      paidAt: FieldValue.serverTimestamp(),
      transferWebhookStatus: "done",
      asaasTransferStatus: transfer?.status?.trim() || "DONE",
      ...(transferId ? {asaasTransferId: transferId} : {}),
      payoutError: FieldValue.delete(),
      // Pago com o saque ainda na fila (aprovação interrompida, ou dado como
      // falho antes): "Aprovar e pagar" reconhece o `paid` e só fecha, sem
      // criar outra transferência.
      ...(stillPending ? {
        payoutWebhookAlert: "PIX concluído no Asaas — falta fechar o saque no backoffice.",
      } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Transferência que não saiu. Saque aprovado (reserva já consumida): o valor
 * BRUTO volta ao disponível e o saque vira `rejected`, numa transação só com o
 * caixa — reentrega do webhook não devolve duas vezes. Saque ainda `pending`
 * (a reserva segue lá): fica para a fila de revisão, como a falha síncrona.
 * Devolve o que avisar, quando o valor voltou ao caixa.
 */
async function handleWithdrawalTransferFailure(
  db: Firestore,
  match: WithdrawalMatch,
  event: string,
  webhookStatus: string,
  transfer: AsaasTransferPayload | undefined,
): Promise<WithdrawalTransferFailure | null> {
  const {kind, ref} = match;
  const reason = describeTransferFailure(event, transfer);
  const transferId = transfer?.id?.trim() ?? "";
  return db.runTransaction(async (tx) => {
    const w = (await tx.get(ref)).data() ?? {};
    if (!isCurrentTransfer(w, transferId)) {
      logger.warn(`asaasWebhook ${event} de transferência antiga ${transferId} withdrawal=${ref.path}`);
      return null;
    }
    const status = lowerStatus(w.status);
    const payout = lowerStatus(w.payoutStatus);

    if (payout === "paid") {
      tx.update(ref, {
        transferWebhookStatus: webhookStatus,
        payoutWebhookAlert: `${event} depois do TRANSFER_DONE — conferir no Asaas.`,
        updatedAt: FieldValue.serverTimestamp(),
      });
      logger.error(`asaasWebhook ${event} depois do pago withdrawal=${ref.path}`);
      return null;
    }
    if (payout === "failed" && transferId && !w.asaasTransferId) {
      // O envio deu erro sem saber que a transferência existia (resposta
      // perdida). Grava o id e avança a tentativa: a próxima ganha chave de
      // idempotência nova em vez de receber esta transferência morta de volta.
      tx.update(ref, {
        asaasTransferId: transferId,
        transferWebhookStatus: webhookStatus,
        transferAttempt: nextTransferAttempt(w),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return null;
    }
    // Já tratado (reentrega, ou FAILED seguido de CANCELLED) ou nunca saiu pela API.
    if (payout !== "sent" && payout !== "pending") return null;

    const common = {
      payoutStatus: "failed",
      transferWebhookStatus: webhookStatus,
      asaasTransferStatus: transfer?.status?.trim() || event.replace("TRANSFER_", ""),
      payoutError: reason,
      ...(transferId ? {asaasTransferId: transferId} : {}),
      // A transferência desta tentativa morreu: a próxima ganha chave nova.
      transferAttempt: nextTransferAttempt(w),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (status === "approved") {
      const amountReais = roundMoney(Number(w.amountReais) || 0);
      const walletRef = withdrawalWalletRef(db, kind, w);
      const wallet = (await tx.get(walletRef)).data() ?? {};
      const available = Number(wallet.availableReais) || 0;
      tx.set(walletRef, {
        availableReais: roundMoney(available + amountReais),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.update(ref, {
        ...common,
        status: "rejected",
        reviewNote:
          `O PIX não foi concluído: ${reason} O valor voltou para o caixa — ` +
          "confira a chave PIX e peça o saque de novo.",
        returnedToWalletAt: FieldValue.serverTimestamp(),
        returnedToWalletReais: amountReais,
      });
      logger.warn(`asaasWebhook ${event}: valor devolvido ao caixa withdrawal=${ref.path}`);
      return {kind, withdrawal: w, amountReais, reason};
    }

    if (status === "pending") {
      tx.update(ref, {
        ...common,
        payoutWebhookAlert: "Transferência não concluída — revisar no backoffice.",
      });
      logger.warn(`asaasWebhook ${event}: saque volta para a revisão withdrawal=${ref.path}`);
    }
    return null;
  });
}
