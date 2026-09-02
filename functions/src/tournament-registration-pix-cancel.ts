/**
 * Cancelamento das cobranças PIX abertas de uma inscrição em torneio.
 *
 * Chamado quando a inscrição (ou a parcela de um atleta) passa a estar paga por
 * OUTRO caminho: o parceiro pagou o integral, ou o organizador deu baixa
 * manual. Sem isso o QR do atleta segue pagável até expirar e o
 * pagamento entra sem crédito — vira estorno manual.
 */

import {
  FieldValue,
  type DocumentReference,
} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {deleteAsaasPaymentOrThrow} from "./asaas-booking-payment";

/** Inscrição já quitada — o pagamento de outro atleta fechou a conta. */
export const PIX_CANCELLED_REGISTRATION_ALREADY_PAID = "registrationAlreadyPaid";
/** Baixa manual do organizador — o dinheiro chegou fora do gateway. */
export const PIX_CANCELLED_ORGANIZER_CONFIRMED = "organizerConfirmedPayment";

/**
 * Mata as cobranças PIX AINDA ABERTAS da inscrição e marca os documentos
 * `pixPending` como cancelados.
 *
 * Nunca toca numa cobrança já liquidada (`status: "paid"`): esse documento é o
 * registro do pagamento. `skipUid` preserva o atleta que acabou de pagar;
 * `onlyUid` restringe a um atleta só (baixa manual de UMA parcela).
 *
 * Falha do gateway não propaga — quem chama já confirmou a inscrição e não
 * pode ser derrubado por isso; o documento fica intocado, porque marcar
 * "cancelled" com a cobrança viva seria mentir sobre o estado.
 *
 * Retorna os uids cujas cobranças foram canceladas.
 */
export async function cancelOpenPixPendingCharges(params: {
  registrationRef: DocumentReference;
  reason: string;
  cancelCharge?: (asaasPaymentId: string) => Promise<void>;
  skipUid?: string;
  onlyUid?: string;
}): Promise<string[]> {
  const {registrationRef, reason, skipUid, onlyUid} = params;
  const cancelCharge = params.cancelCharge ?? deleteAsaasPaymentOrThrow;
  const pendingSnap = await registrationRef.collection("pixPending").get();
  const cancelledUids: string[] = [];
  for (const doc of pendingSnap.docs) {
    if (skipUid && doc.id === skipUid) continue;
    if (onlyUid && doc.id !== onlyUid) continue;
    const data = doc.data() ?? {};
    if (data.status === "paid" || data.status === "cancelled") continue;
    const asaasId = (data.asaasPaymentId as string | undefined)?.trim() ?? "";
    if (asaasId) {
      try {
        await cancelCharge(asaasId);
      } catch (e) {
        logger.error("Falha ao cancelar cobrança PIX aberta da inscrição", {
          registrationId: registrationRef.id,
          payerUid: doc.id,
          asaasId,
          reason,
          error: e,
        });
        // Cobrança pode seguir viva: marcar "cancelled" mentiria sobre o estado.
        continue;
      }
    }
    await doc.ref.set({
      status: "cancelled",
      cancelledReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    cancelledUids.push(doc.id);
  }
  return cancelledUids;
}

/**
 * Mata as cobranças PIX abertas ANTES de uma escrita destrutiva (remoção da
 * inscrição pelo organizador, cancelamento pelo atleta) e **propaga a falha**:
 * aqui a cobrança não pode sobreviver ao documento, senão um pagamento tardio
 * cai como órfão no webhook — dinheiro entra sem inscrição para creditar.
 *
 * É o oposto de [cancelOpenPixPendingCharges], que engole a falha porque lá a
 * inscrição já está confirmada e o pior caso é o QR viver até expirar.
 *
 * Recebe os docs `pixPending` que o chamador já leu (ele os apaga no próprio
 * batch). Ignora cobrança já liquidada e doc sem cobrança no gateway.
 */
export async function cancelOpenPixChargesOrThrow(params: {
  registrationId: string;
  pendingDocs: Array<{id: string; data: () => Record<string, unknown> | undefined}>;
  cancelCharge?: (asaasPaymentId: string) => Promise<void>;
}): Promise<void> {
  const cancelCharge = params.cancelCharge ?? deleteAsaasPaymentOrThrow;
  for (const doc of params.pendingDocs) {
    const data = doc.data() ?? {};
    const asaasId = (data.asaasPaymentId as string | undefined)?.trim() ?? "";
    if (!asaasId || data.status === "paid") continue;
    try {
      await cancelCharge(asaasId);
    } catch (e) {
      logger.error("Falha ao cancelar cobrança PIX antes de apagar a inscrição", {
        registrationId: params.registrationId,
        payerUid: doc.id,
        asaasId,
        error: e,
      });
      throw new HttpsError(
        "unavailable",
        "Não foi possível cancelar a cobrança PIX pendente. Tente novamente.",
      );
    }
  }
}
