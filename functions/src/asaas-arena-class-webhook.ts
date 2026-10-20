/**
 * Webhook Asaas das mensalidades de aula (`externalReference` = `arenaClassPayment:{groupId}`).
 *
 * Age pelo status do GET fresco (o roteador `asaas-webhook.ts` sempre relê o pagamento), então a
 * ordem dos eventos não importa. Fases como no aluguel online (`resolvePaymentPhases`):
 * - PIX `RECEIVED`: mensalidades pagas + crédito no caixa da arena;
 * - cartão `CONFIRMED`: mensalidades pagas + líquido no "a liberar"; `RECEIVED` (~D+32): crédito.
 * Pago com o grupo já anulado (baixa manual, cancelamento) ou mensalidade fora de "em aberto" vira
 * estorno — cobrar duas vezes é pior que devolver. `OVERDUE` só atualiza o espelho (não cancela).
 */
import * as logger from "firebase-functions/logger";
import {FieldValue, type DocumentReference, type Firestore, type Transaction} from "firebase-admin/firestore";
import {ARENA_CLASS_ASAAS_PAYMENTS, ARENA_CLASS_CHARGES, CLASS_PAYMENT_REF_PREFIX} from "./arena-class-constants";
import {allocateCents, chargeAsaasMirror} from "./arena-class-asaas-model";
import {resolveArenaBookingFeePercent} from "./arena-entitlement";
import {
  creditArenaWalletFromBookingPayment,
  holdArenaAwaitingSettlement,
  releaseArenaAwaitingSettlement,
  arenaBookingNetReais,
} from "./arena-wallet";
import {refundAsaasPayment, type AsaasPaymentDetails} from "./asaas-booking-payment";
import {resolveGatewayFeeReais} from "./asaas-gateway-fee";
import {dayKeyFromEventDate} from "./event-timezone";
import {roundMoney} from "./mercadopago-arena-helpers";
import {computePlatformFeeReais} from "./platform-fees";
import {parseRegistrationBillingType, resolvePaymentPhases} from "./registration-payment-phases";

export interface ClassWebhookDeps {
  refund: (paymentId: string) => Promise<void>;
  now: () => Date;
}

const defaultDeps: ClassWebhookDeps = {
  refund: (paymentId) => refundAsaasPayment(paymentId),
  now: () => new Date(),
};

const NEGATIVE_STATUSES = new Set([
  "REFUNDED",
  "REFUND_REQUESTED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED",
  "DUNNING_RECEIVED",
]);

export function parseClassPaymentRef(ref: string): string | null {
  if (!ref.startsWith(CLASS_PAYMENT_REF_PREFIX)) return null;
  const groupId = ref.slice(CLASS_PAYMENT_REF_PREFIX.length).trim();
  return groupId && !groupId.includes("/") ? groupId : null;
}

export async function processArenaClassAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
  deps: ClassWebhookDeps = defaultDeps,
): Promise<void> {
  const groupId = parseClassPaymentRef((payment.externalReference || "").trim());
  if (!groupId) return;

  const processed = (await processedRef.get()).data() ?? {};
  const outcome = typeof processed["outcome"] === "string" ? processed["outcome"] : "";
  if (outcome && outcome !== "approved") {
    logger.info(`Asaas aula: payment ${paymentId} já processado (${outcome})`);
    return;
  }
  const alreadyConfirmed = processed["confirmedAt"] != null;
  const alreadyCredited = processed["walletCreditedAt"] != null;
  const status = (payment.status || "").toUpperCase();
  const billingType = parseRegistrationBillingType(payment.billingType);
  const phases = resolvePaymentPhases({
    billingType,
    status,
    alreadyConfirmed,
    alreadyCredited,
    alreadyAwaitingSettlement: processed["awaitingSettlement"] != null,
  });

  const groupRef = db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(groupId);

  if (NEGATIVE_STATUSES.has(status)) {
    if (alreadyConfirmed) {
      // Estorno/chargeback depois de pago: a mensalidade fica paga (resolver à mão), mas o caixa
      // não espera um dinheiro que não vem.
      if (processed["awaitingSettlement"] != null && !alreadyCredited) {
        await releaseArenaAwaitingSettlement(db, processedRef, status).catch((e) =>
          logger.error(`Asaas aula ${groupId}: falha ao tirar ${paymentId} do "a liberar"`, e));
      }
      logger.error(`Asaas aula ${groupId}: pagamento ${paymentId} virou ${status} depois de pago — resolver à mão`, {
        groupId, paymentId, status, billingType,
      });
    }
    await mirrorStatus(db, groupId, status);
    return;
  }

  if (status === "OVERDUE" || payment.deleted === true) {
    await mirrorStatus(db, groupId, payment.deleted ? "DELETED" : status, payment.deleted === true);
    return;
  }

  if (!phases.confirm && !phases.credit && !phases.awaitSettlement) {
    logger.info(`Asaas aula ${groupId}: pagamento ${paymentId} ainda ${status}`);
    return;
  }

  const gross = roundMoney(Number(payment.value) || 0);
  let arenaId = String(processed["arenaId"] ?? "");
  let enrollmentId = String(processed["enrollmentId"] ?? "");
  let chargeIds: string[] = Array.isArray(processed["chargeIds"]) ? processed["chargeIds"] as string[] : [];

  if (phases.confirm) {
    const todayKey = dayKeyFromEventDate(deps.now());
    const result = await db.runTransaction(async (tx: Transaction) => {
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists) return {kind: "orphan" as const};
      const group = groupSnap.data() as Record<string, unknown>;
      const ids = Array.isArray(group["chargeIds"]) ? (group["chargeIds"] as unknown[]).map(String) : [];
      const chargeSnaps = await Promise.all(ids.map((id) => tx.get(db.collection(ARENA_CLASS_CHARGES).doc(id))));
      const arenaSnap = await tx.get(db.collection("arenas").doc(String(group["arenaId"] ?? "_")));
      const state = String(group["state"] ?? "");
      const stale = state === "void" || state === "voiding" ||
        chargeSnaps.some((c) => !c.exists || c.data()?.["status"] !== "open");
      const base = {
        kind: "arenaClassPayment",
        groupId,
        arenaId: String(group["arenaId"] ?? ""),
        enrollmentId: String(group["enrollmentId"] ?? ""),
        chargeIds: ids,
        paymentStatus: status,
        billingType,
      };
      if (stale) {
        tx.set(processedRef, {...base, outcome: "refund_stale", processedAt: FieldValue.serverTimestamp()}, {merge: true});
        tx.set(groupRef, {asaasStatus: status, paymentId, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
        return {kind: "stale" as const, base};
      }
      // Taxa da NexaGO do pagamento (plano da arena agora, mesma conta do crédito no caixa),
      // repartida pelas mensalidades: o repasse do professor desconta a parte de cada uma.
      const feeCents = Math.round(
        computePlatformFeeReais(gross, resolveArenaBookingFeePercent(arenaSnap.data() ?? {}, deps.now().getTime())) * 100,
      );
      const feeShares = allocateCents(feeCents, chargeSnaps.map((c) => Math.round(Number(c.data()?.["amountReais"] ?? 0) * 100)));
      for (const [i, c] of chargeSnaps.entries()) {
        tx.set(c.ref, {
          platformFeeReais: (feeShares[i] ?? 0) / 100,
          status: "paid",
          paidOn: todayKey,
          paidAt: FieldValue.serverTimestamp(),
          paidVia: "asaas",
          onlineBillingType: billingType,
          asaasPaymentId: paymentId,
          asaas: chargeAsaasMirror(groupId, "paid", {invoiceUrl: (group["invoiceUrl"] as string) ?? null, status}),
        }, {merge: true});
      }
      tx.set(groupRef, {
        state: "paid", paymentId, asaasStatus: status, billingType, paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(processedRef, {
        ...base, outcome: "approved", confirmedAt: FieldValue.serverTimestamp(), processedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {kind: "approved" as const, base};
    });

    if (result.kind === "orphan") {
      logger.error(`Asaas aula: grupo ${groupId} não encontrado para o pagamento ${paymentId} — estorno necessário`);
      await processedRef.set({kind: "arenaClassPayment", groupId, outcome: "orphan", paymentStatus: status,
        refundRequired: true, processedAt: FieldValue.serverTimestamp()}, {merge: true});
      return;
    }
    if (result.kind === "stale") {
      logger.warn(`Asaas aula ${groupId}: pago com a mensalidade já resolvida — estornando ${paymentId}`, result.base);
      try {
        await deps.refund(paymentId);
        await processedRef.set({refundedAt: FieldValue.serverTimestamp()}, {merge: true});
      } catch (e) {
        logger.error(`Asaas aula ${groupId}: estorno de ${paymentId} falhou — fazer à mão`, e);
        await processedRef.set({refundRequired: true}, {merge: true});
      }
      return;
    }
    arenaId = result.base.arenaId;
    enrollmentId = result.base.enrollmentId;
    chargeIds = result.base.chargeIds;
  }

  if (!arenaId) return;
  const arenaData = (await db.collection("arenas").doc(arenaId).get()).data() ?? {};
  const platformFeeReais = computePlatformFeeReais(gross, resolveArenaBookingFeePercent(arenaData, deps.now().getTime()));
  const gatewayFeeReais = resolveGatewayFeeReais(payment, billingType, gross);

  if (phases.awaitSettlement) {
    await holdArenaAwaitingSettlement(db, processedRef, {
      arenaId,
      netReais: arenaBookingNetReais({grossReais: gross, platformFeeReais, gatewayFeeReais}),
    });
  }
  if (phases.credit) {
    await creditArenaWalletFromBookingPayment(db, {
      arenaId,
      bookingId: groupId,
      paymentId,
      grossReais: gross,
      platformFeeReais,
      gatewayFeeReais,
      processedRef,
      ledgerExtra: {source: "class", enrollmentId, classChargeIds: chargeIds},
    });
  }
}

/** Espelha o status do Asaas no grupo e nas mensalidades; removido no Asaas anula o grupo. */
async function mirrorStatus(db: Firestore, groupId: string, status: string, voidGroup = false): Promise<void> {
  const groupRef = db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(groupId);
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists) return;
    const group = snap.data() as Record<string, unknown>;
    if (group["state"] === "paid") return;
    const ids = Array.isArray(group["chargeIds"]) ? (group["chargeIds"] as unknown[]).map(String) : [];
    const charges = await Promise.all(ids.map((id) => tx.get(db.collection(ARENA_CLASS_CHARGES).doc(id))));
    const state = voidGroup ? "void" : String(group["state"] ?? "open");
    tx.set(groupRef, {asaasStatus: status, ...(voidGroup ? {state: "void", voidReason: "deleted_in_asaas"} : {}),
      updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    for (const c of charges) {
      const asaas = (c.data()?.["asaas"] ?? {}) as Record<string, unknown>;
      if (!c.exists || asaas["groupId"] !== groupId) continue;
      tx.set(c.ref, {asaas: {...asaas, state, status}}, {merge: true});
    }
  });
}
