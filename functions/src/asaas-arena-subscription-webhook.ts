import {
  type Firestore,
  type DocumentReference,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {fetchAsaas} from "./asaas-client";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";
import {ARENA_SUBSCRIPTION_REF_PREFIX} from "./arena-booking-payment-constants";
import {normalizeArenaPlanTier, type ArenaPlanTier} from "./arena-plans";

const ACTIVE_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
const OVERDUE_STATUSES = new Set(["OVERDUE"]);
// Corte imediato (dinheiro revertido / disputa): revoga o Pro na hora.
const HARD_DOWNGRADE_STATUSES = new Set([
  "REFUNDED",
  "REFUND_REQUESTED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
]);
// Assinatura/pagamento removido (inclui nosso próprio cancelamento): mantém o
// Pro até o fim do período pago (planActiveUntil), como um cancelamento.
const CANCEL_STATUSES = new Set(["DELETED"]);

type SubscriptionDetails = {nextDueDate?: string; externalReference?: string};

/** Extrai `{arenaId, tier}` de `arenaSubscription:{arenaId}:{tier}` (aceita tiers legados). */
export function parseSubscriptionRef(
  externalReference: string,
): {arenaId: string; tier: ArenaPlanTier} | null {
  if (!externalReference.startsWith(ARENA_SUBSCRIPTION_REF_PREFIX)) return null;
  const rest = externalReference.slice(ARENA_SUBSCRIPTION_REF_PREFIX.length);
  const sep = rest.lastIndexOf(":");
  if (sep <= 0) return null;
  const arenaId = rest.slice(0, sep).trim();
  const tier = normalizeArenaPlanTier(rest.slice(sep + 1).trim());
  if (!arenaId || !tier) return null;
  return {arenaId, tier};
}

/**
 * Este pagamento carregava a taxa de ativação (R$97) embutida?
 *
 * Mais de uma cobrança com ativação pode ficar em aberto (o gestor gera o PIX
 * mensal, não paga, volta e escolhe o anual), por isso a decisão consulta a
 * LISTA `activationPaymentIds`. O escalar `activationPaymentId` é aceito como
 * legado — billings gravados antes da lista existir só têm ele.
 */
export function paymentCarriesActivation(
  billing: Record<string, unknown> | undefined,
  paymentId: string,
): boolean {
  const id = paymentId.trim();
  if (!id) return false;
  const list = billing?.activationPaymentIds;
  if (Array.isArray(list) && list.some((v) => typeof v === "string" && v.trim() === id)) {
    return true;
  }
  const legacy = billing?.activationPaymentId;
  return typeof legacy === "string" && legacy.trim() === id;
}

/**
 * Deve gravar `activationFeePaidAt` neste pagamento confirmado? Só quando o
 * pagamento carregava a ativação E ela ainda não foi marcada como paga —
 * nunca sobrescreve a data já registrada.
 */
export function shouldMarkActivationPaid(
  billing: Record<string, unknown> | undefined,
  paymentId: string,
): boolean {
  if (billing?.activationFeePaidAt) return false;
  return paymentCarriesActivation(billing, paymentId);
}

/** Converte vencimento (YYYY-MM-DD, fuso SP) em Timestamp. */
function dueDateToTimestamp(nextDueDate: string | undefined): Timestamp | null {
  if (!nextDueDate) return null;
  const parsed = new Date(`${nextDueDate}T00:00:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : Timestamp.fromDate(parsed);
}

/**
 * Processa eventos de pagamento de uma assinatura de plano de arena.
 * Atualiza o estado da assinatura (`billing/subscription`) e os campos públicos
 * do plano no doc da arena (gravados só por aqui — Admin SDK ignora as rules).
 */
export async function processArenaSubscriptionAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
): Promise<void> {
  let externalRef = (payment.externalReference || "").trim();
  const subscriptionId = (payment.subscription || "").trim();

  // Fallback: alguns pagamentos podem não herdar o externalReference da assinatura.
  if (!externalRef.startsWith(ARENA_SUBSCRIPTION_REF_PREFIX) && subscriptionId) {
    try {
      const sub = await fetchAsaas<SubscriptionDetails>(
        `/v3/subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      externalRef = (sub.externalReference || "").trim();
    } catch (e) {
      logger.warn("arenaSubscription webhook: falha ao buscar subscription", subscriptionId, e);
    }
  }

  const parsed = parseSubscriptionRef(externalRef);
  if (!parsed) {
    logger.warn("arenaSubscription webhook: externalReference não reconhecido", externalRef);
    return;
  }
  const {arenaId, tier} = parsed;
  const status = (payment.status || "").trim().toUpperCase();

  const arenaRef = db.collection("arenas").doc(arenaId);
  const billingRef = db.doc(`arenas/${arenaId}/billing/subscription`);

  if (ACTIVE_STATUSES.has(status)) {
    let activeUntil: Timestamp | null = dueDateToTimestamp(payment.dueDate);
    if (subscriptionId) {
      try {
        const sub = await fetchAsaas<SubscriptionDetails>(
          `/v3/subscriptions/${encodeURIComponent(subscriptionId)}`,
        );
        activeUntil = dueDateToTimestamp(sub.nextDueDate) ?? activeUntil;
      } catch {
        // mantém o dueDate do pagamento
      }
    }
    await arenaRef.set(
      {
        planTier: tier,
        planStatus: "active",
        planActiveUntil: activeUntil,
        planUpdatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    const billingData = (await billingRef.get()).data() ?? {};
    const paidActivation = shouldMarkActivationPaid(billingData, paymentId);

    await billingRef.set(
      {
        status: "active",
        lastPaymentId: paymentId,
        updatedAt: FieldValue.serverTimestamp(),
        ...(paidActivation ? {activationFeePaidAt: FieldValue.serverTimestamp()} : {}),
      },
      {merge: true},
    );
  } else if (OVERDUE_STATUSES.has(status)) {
    await arenaRef.set(
      {planStatus: "overdue", planUpdatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
    await billingRef.set(
      {status: "overdue", updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
  } else if (CANCEL_STATUSES.has(status)) {
    // Mantém planTier e planActiveUntil; titularidade expira no fim do período.
    await arenaRef.set(
      {planStatus: "canceling", planUpdatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
    await billingRef.set(
      {status: "canceled", updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
  } else if (HARD_DOWNGRADE_STATUSES.has(status)) {
    await arenaRef.set(
      {
        planStatus: "none",
        planTier: FieldValue.delete(),
        planActiveUntil: null,
        planUpdatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    // Se o dinheiro estornado incluía a ativação, ela volta a ser devida —
    // senão a arena estorna R$196 e reassina sem nunca mais pagar os R$97.
    const billingData = (await billingRef.get()).data() ?? {};
    const refundedActivation = paymentCarriesActivation(billingData, paymentId);
    await billingRef.set(
      {
        status: "canceled",
        updatedAt: FieldValue.serverTimestamp(),
        ...(refundedActivation ?
          {
            activationFeePaidAt: FieldValue.delete(),
            activationPaymentId: FieldValue.delete(),
            activationPaymentIds: FieldValue.delete(),
          } :
          {}),
      },
      {merge: true},
    );
  } else {
    // Outros status (PENDING, AWAITING_RISK_ANALYSIS...) — sem efeito no plano.
    return;
  }

  // Auditoria/dedup (escrita idempotente; o efeito acima também é idempotente).
  await processedRef.set(
    {
      type: "arenaSubscription",
      arenaId,
      tier,
      paymentId,
      status,
      processedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}
