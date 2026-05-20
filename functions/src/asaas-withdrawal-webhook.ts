import {FieldValue, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {ARENA_WITHDRAWAL_REF_PREFIX} from "./arena-booking-payment-constants";

const ARENA_WITHDRAWALS = "arenaWithdrawals";

type TransferWebhookPayload = {
  id?: string;
  externalReference?: string;
};

/**
 * Reconcilia webhooks `TRANSFER_*` de saques de arena (`arenaWithdrawal:*`).
 */
export async function processArenaWithdrawalTransferWebhook(
  db: Firestore,
  event: string,
  transfer: TransferWebhookPayload | undefined,
): Promise<void> {
  const transferId = transfer?.id?.trim() ?? "";
  const externalRef = (transfer?.externalReference || "").trim();

  let withdrawalId = "";
  if (externalRef.startsWith(ARENA_WITHDRAWAL_REF_PREFIX)) {
    withdrawalId = externalRef.slice(ARENA_WITHDRAWAL_REF_PREFIX.length).trim();
  }

  const col = db.collection(ARENA_WITHDRAWALS);
  let withdrawalRef;

  if (withdrawalId) {
    withdrawalRef = col.doc(withdrawalId);
    const snap = await withdrawalRef.get();
    if (!snap.exists) {
      logger.info(`asaasWebhook transfer: withdrawal not found ${withdrawalId}`);
      return;
    }
  } else if (transferId) {
    const snap = await col.where("asaasTransferId", "==", transferId).limit(1).get();
    if (snap.empty) {
      logger.info(`asaasWebhook transfer: no withdrawal for transferId=${transferId}`);
      return;
    }
    withdrawalRef = snap.docs[0].ref;
  } else {
    return;
  }

  const snap = await withdrawalRef.get();
  const data = snap.data() ?? {};
  const status = (data.status as string | undefined)?.toLowerCase() ?? "";
  const payoutStatus = (data.payoutStatus as string | undefined)?.toLowerCase() ?? "";

  if (event === "TRANSFER_DONE") {
    await withdrawalRef.update({
      transferWebhookStatus: "done",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (event === "TRANSFER_FAILED") {
    if (status === "pending" && payoutStatus === "sent") {
      await withdrawalRef.update({
        transferWebhookStatus: "failed",
        payoutWebhookAlert:
          "Transferência falhou após envio aparente — revisar no backoffice.",
        updatedAt: FieldValue.serverTimestamp(),
      });
      logger.warn(
        `asaasWebhook TRANSFER_FAILED alert withdrawal=${withdrawalRef.id} transfer=${transferId}`,
      );
    }
  }
}
