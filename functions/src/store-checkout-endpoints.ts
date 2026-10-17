/**
 * Loja · checkout: as portas do mundo real (callables do atleta, webhook do Asaas, varredura do
 * Pix vencido e o espelho do pedido para o atleta). As regras estão em `store-checkout.ts`.
 */
import {randomUUID} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {logger} from "firebase-functions/v2";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {asaasArenaSecrets} from "./asaas-client";
import {
  createAsaasPixCharge,
  deleteAsaasPaymentIfOpen,
  getAsaasPayment,
  refundAsaasPayment,
  type AsaasPaymentDetails,
} from "./asaas-booking-payment";
import {getOrCreateAsaasCustomer, resolveAthleteCpfCnpj, resolveAthletePayerName} from "./asaas-customer";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  STORE_ORDER_PAYMENT_REF_PREFIX,
  confirmStoreOrderPaymentCore,
  createStoreOrderCore,
  expireStorePixCore,
  isPaidStatus,
  quoteCheckoutCore,
  syncOrderViewCore,
  type CheckoutPayments,
  type CreateCheckoutInput,
} from "./store-checkout";
import {CUSTOM_ITEMS} from "./store-custom";
import {ORDERS} from "./store-orders-write";

const CLIENT_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta pra usar a Loja.");
  return uid;
}

const toCents = (reais: number | undefined) => Math.round((reais ?? 0) * 100);

/** Asaas e Auth de verdade, atrás da interface que os testes falsificam. */
function realPayments(): CheckoutPayments {
  return {
    async customer(uid, cpf) {
      let cpfCnpj: string;
      try {
        cpfCnpj = await resolveAthleteCpfCnpj(uid, cpf ?? undefined);
      } catch {
        throw new HttpsError("failed-precondition", "Informe seu CPF para pagar com Pix.", {reason: "cpf_required"});
      }
      const user = await getAuth().getUser(uid);
      const email = user.email?.trim() ?? "";
      const name = await resolveAthletePayerName(uid, user.displayName ?? undefined);
      const asaasCustomerId = await getOrCreateAsaasCustomer(uid, email, user.displayName ?? undefined, cpfCnpj);
      const profile = (await getFirestore().collection("users").doc(uid).get()).data() ?? {};
      const phone = String(profile["phoneNumber"] ?? profile["phone"] ?? user.phoneNumber ?? "");
      return {name, email, phone, cpf: cpfCnpj, asaasCustomerId};
    },
    async createPix({orderId, customerId, totalCents, description, expiresAt}) {
      const charge = await createAsaasPixCharge({
        customerId,
        valueReais: totalCents / 100,
        dueDate: expiresAt,
        description,
        externalReference: `${STORE_ORDER_PAYMENT_REF_PREFIX}${orderId}`,
        idempotencyKey: `store-order-pix-${orderId}`,
      });
      return {paymentId: charge.paymentId, copyPaste: charge.qrCode};
    },
    cancelCharge: (paymentId) => deleteAsaasPaymentIfOpen(paymentId),
  };
}

/** Cotação do carrinho (resumo, cupom, frete). Só leitura. */
export const quoteStoreCheckout = onCall(CLIENT_CALLABLE, async (request) => {
  const uid = requireUid(request.auth?.uid);
  return quoteCheckoutCore(getFirestore(), uid, request.data, new Date());
});

/** Fecha o pedido: recalcula, cobra o Pix, reserva e devolve o copia-e-cola. */
export const createStoreOrder = onCall({...CLIENT_CALLABLE, secrets: asaasArenaSecrets}, async (request) => {
  const uid = requireUid(request.auth?.uid);
  return createStoreOrderCore(
    getFirestore(), uid, request.data as CreateCheckoutInput, realPayments(), new Date(),
    () => `ord_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
  );
});

/**
 * Link de leitura da arte para a fila do backoffice (tela 10): token de download do Storage,
 * o mesmo esquema do `getDownloadURL` do cliente. Best-effort — sem ele a fila mostra o caminho.
 */
async function attachArtUrls(db: Firestore, itemIds: string[]): Promise<void> {
  const bucket = getStorage().bucket();
  for (const id of itemIds) {
    try {
      const ref = db.collection(CUSTOM_ITEMS).doc(id);
      const item = (await ref.get()).data();
      const path = (item?.["image"] as {path?: string} | null)?.path;
      if (!path) continue;
      const token = randomUUID();
      await bucket.file(path).setMetadata({metadata: {firebaseStorageDownloadTokens: token}});
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
      await ref.update({"image.url": url});
    } catch (e) {
      logger.warn("Loja: link da arte não foi gerado", {itemId: id, error: String(e)});
    }
  }
}

/**
 * Ramo do `asaasWebhook` para `storeOrder:{orderId}`. Pago → confirma; pago depois de cancelado
 * (Pix vencido) → estorna. O doc de processados torna a notificação repetida inofensiva.
 */
export async function processStoreOrderAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
): Promise<void> {
  const orderId = (payment.externalReference ?? "").slice(STORE_ORDER_PAYMENT_REF_PREFIX.length).trim();
  if (!orderId || !isPaidStatus(payment.status ?? "")) return;
  const processed = await processedRef.get();
  if (processed.exists && processed.data()?.["outcome"]) return;

  const now = new Date();
  const r = await confirmStoreOrderPaymentCore(db, orderId, {paymentId, valueCents: toCents(payment.value)}, now);
  const base = {kind: "storeOrder", orderId, payerUid: r.uid, processedAt: now};
  switch (r.outcome) {
  case "confirmed":
  case "already_paid":
    await processedRef.set({...base, outcome: "approved"}, {merge: true});
    await attachArtUrls(db, r.customItemIds);
    return;
  case "not_pending":
    // Pix pago depois do pedido cancelar (vencido): o dinheiro volta.
    logger.error("Loja: Pix pago com o pedido já cancelado — estornando", {orderId, paymentId});
    await refundAsaasPayment(paymentId);
    await processedRef.set({...base, outcome: "refunded_after_cancel"}, {merge: true});
    return;
  default:
    logger.error("Loja: pagamento não confirmou o pedido", {orderId, paymentId, outcome: r.outcome});
    await processedRef.set({...base, outcome: r.outcome}, {merge: true});
  }
}

/** Pix vencido (30 min): confirma o que pagou sem webhook; cancela o resto e libera o estoque. */
export const expireStoreOrderPix = onSchedule(
  {schedule: "every 5 minutes", timeZone: "America/Sao_Paulo", secrets: asaasArenaSecrets},
  async () => {
    const db = getFirestore();
    const r = await expireStorePixCore(db, new Date(), {
      getPayment: async (id) => {
        const p = await getAsaasPayment(id);
        return {status: p.status ?? "", valueCents: toCents(p.value)};
      },
      deleteCharge: (id) => deleteAsaasPaymentIfOpen(id),
    });
    if (r.canceled.length + r.confirmed.length + r.failed.length > 0) logger.info("Loja: Pix vencidos", r);
  },
);

/** Espelho do pedido para o atleta (`storeOrderViews`), a cada mudança do pedido. */
export const onStoreOrderWrittenSyncView = onDocumentWritten(`${ORDERS}/{orderId}`, async (event) => {
  const after = event.data?.after;
  await syncOrderViewCore(getFirestore(), event.params.orderId, after?.exists ? after.data() ?? null : null);
});

