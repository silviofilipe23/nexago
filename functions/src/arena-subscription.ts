import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {AsaasApiError, asaasArenaSecrets, fetchAsaas} from "./asaas-client";
import {fetchAsaasPixQrCode} from "./asaas-booking-payment";
import {getOrCreateArenaAsaasCustomer, resolveArenaCpfCnpj} from "./asaas-arena-customer";
import {callerIsSuperAdmin} from "./auth-roles";
import {
  asaasCycle,
  isArenaPlanTier,
  isBillingCycle,
  resolvePlanPriceCents,
  ARENA_PLANS,
  ACTIVATION_FEE_CENTS,
  type ArenaPlanTier,
  type BillingCycle,
} from "./arena-plans";
import {ARENA_SUBSCRIPTION_REF_PREFIX} from "./arena-booking-payment-constants";

type AsaasBillingType = "PIX" | "CREDIT_CARD" | "UNDEFINED";

type SubscriptionResponse = {id?: string};
type SubscriptionPaymentsResponse = {
  data?: Array<{id?: string; invoiceUrl?: string; status?: string}>;
};

type CreateArenaSubscriptionResult = {
  subscriptionId: string;
  paymentId: string;
  billingType: AsaasBillingType;
  tier: ArenaPlanTier;
  cycle: BillingCycle;
  invoiceUrl: string | null;
  /** Preenchido apenas para PIX. */
  qrCode: string | null;
  qrCodeBase64: string | null;
};

/** Data de hoje no fuso de São Paulo (YYYY-MM-DD). */
function todaySaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseBillingType(raw: unknown): AsaasBillingType {
  if (raw === "PIX" || raw === "CREDIT_CARD" || raw === "UNDEFINED") return raw;
  return "UNDEFINED";
}

/**
 * A arena ainda deve a taxa de ativação? Só o webhook grava
 * `activationFeePaidAt` (quando a cobrança com ativação embutida confirma);
 * uma tentativa anterior não paga (só `activationPaymentId`) cobra de novo.
 */
export function shouldChargeActivationFee(
  billing: Record<string, unknown> | undefined,
): boolean {
  return !billing?.activationFeePaidAt;
}

/** Campos de ativação a gravar no billing: omitidos quando não houve cobrança nova (preserva auditoria). */
export function activationBillingFields(
  activationPaymentId: string | null,
): Record<string, unknown> {
  return activationPaymentId ?
    {activationPaymentId, activationFeeCents: ACTIVATION_FEE_CENTS} :
    {};
}

async function assertCallerManagesArena(
  arenaId: string,
  callerUid: string,
): Promise<{managerUid: string}> {
  const arenaSnap = await getFirestore().collection("arenas").doc(arenaId).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  const managerUid = (arenaSnap.data()?.managerUserId as string | undefined)?.trim() ?? "";
  const caller = await getAuth().getUser(callerUid);
  if (!callerIsSuperAdmin(caller) && managerUid !== callerUid) {
    throw new HttpsError("permission-denied", "Você não gerencia esta arena.");
  }
  return {managerUid: managerUid || callerUid};
}

/**
 * Cria/garante a assinatura recorrente do plano da arena no Asaas.
 * Cliente envia apenas `tier`/`cycle`; o valor vem do catálogo server-side.
 * PIX retorna QR copia-e-cola; cartão/undefined retornam o `invoiceUrl` (checkout
 * hospedado Asaas — nenhum dado de cartão passa por aqui). O plano só vira
 * `active` quando o pagamento é confirmado pelo webhook.
 */
export const createArenaSubscription = onCall(
  {secrets: asaasArenaSecrets},
  async (request): Promise<CreateArenaSubscriptionResult> => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Faça login para continuar.");
    }

    const data = (request.data ?? {}) as Record<string, unknown>;
    const arenaId = typeof data.arenaId === "string" ? data.arenaId.trim() : "";
    const tier = data.tier;
    const cycle = data.cycle;
    const billingType = parseBillingType(data.billingType);
    const cpfFromRequest = typeof data.cpfCnpj === "string" ? data.cpfCnpj : undefined;

    if (!arenaId) {
      throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
    }
    if (!isArenaPlanTier(tier) || !isBillingCycle(cycle)) {
      throw new HttpsError("invalid-argument", "Plano ou ciclo inválido.");
    }

    const {managerUid} = await assertCallerManagesArena(arenaId, callerUid);

    const valueCents = resolvePlanPriceCents(tier, cycle);
    const valueReais = Math.round(valueCents) / 100;

    let cpfCnpj: string;
    try {
      cpfCnpj = await resolveArenaCpfCnpj(arenaId, managerUid, cpfFromRequest);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "ARENA_CPF_CNPJ_REQUIRED") {
        throw new HttpsError("failed-precondition", "Informe o CNPJ/CPF da arena para gerar a cobrança.");
      }
      throw e;
    }

    let customerId: string;
    try {
      customerId = await getOrCreateArenaAsaasCustomer({arenaId, managerUid, cpfCnpj});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "ARENA_CPF_CNPJ_REQUIRED") {
        throw new HttpsError("failed-precondition", "Informe o CNPJ/CPF da arena para gerar a cobrança.");
      }
      throw new HttpsError("internal", "Falha ao registrar a arena no Asaas.");
    }

    const externalReference = `${ARENA_SUBSCRIPTION_REF_PREFIX}${arenaId}:${tier}`;
    const description = `Plano ${ARENA_PLANS[tier].name} (${cycle === "yearly" ? "anual" : "mensal"}) — NexaGO`;

    let subscriptionId: string;
    try {
      const sub = await fetchAsaas<SubscriptionResponse>("/v3/subscriptions", {
        method: "POST",
        body: {
          customer: customerId,
          billingType,
          value: valueReais,
          nextDueDate: todaySaoPaulo(),
          cycle: asaasCycle(cycle),
          description: description.slice(0, 500),
          externalReference,
        },
        idempotencyKey: `arena-sub-${arenaId}-${tier}-${cycle}`,
      });
      subscriptionId = sub.id?.trim() ?? "";
    } catch (e) {
      logger.error("createArenaSubscription: subscription falhou", arenaId, e);
      const detail = e instanceof AsaasApiError ? e.message : "Falha ao criar a assinatura no Asaas.";
      throw new HttpsError("internal", detail);
    }
    if (!subscriptionId) {
      throw new HttpsError("internal", "Asaas não retornou a assinatura.");
    }

    // 1ª cobrança gerada pela assinatura.
    const payments = await fetchAsaas<SubscriptionPaymentsResponse>(
      `/v3/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=1`,
    );
    const firstPayment = payments.data?.[0];
    const paymentId = firstPayment?.id?.trim() ?? "";
    const invoiceUrl = firstPayment?.invoiceUrl?.trim() || null;

    // Ativação única (R$97) na primeira assinatura: soma na 1ª cobrança da
    // recorrência (um único PIX; renovações vêm no preço normal do plano).
    const billingRef = getFirestore().doc(`arenas/${arenaId}/billing/subscription`);
    const existingBilling = (await billingRef.get()).data();
    let activationPaymentId: string | null = null;
    if (shouldChargeActivationFee(existingBilling) && paymentId) {
      const firstChargeReais = Math.round(valueCents + ACTIVATION_FEE_CENTS) / 100;
      try {
        await fetchAsaas(`/v3/payments/${encodeURIComponent(paymentId)}`, {
          method: "PUT",
          body: {
            value: firstChargeReais,
            description:
              `${description} + ativação única R$ 97`.slice(0, 500),
          },
        });
        activationPaymentId = paymentId;
      } catch (e) {
        logger.error("createArenaSubscription: falha ao somar ativação na 1ª cobrança", paymentId, e);
        throw new HttpsError("internal", "Falha ao gerar a cobrança de ativação. Tente novamente.");
      }
    }

    let qrCode: string | null = null;
    let qrCodeBase64: string | null = null;
    if (billingType === "PIX" && paymentId) {
      try {
        const qr = await fetchAsaasPixQrCode(paymentId);
        qrCode = qr.qrCode || null;
        qrCodeBase64 = qr.qrCodeBase64 || null;
      } catch (e) {
        logger.warn("createArenaSubscription: QR PIX indisponível", paymentId, e);
      }
    }

    await billingRef.set(
      {
        asaasSubscriptionId: subscriptionId,
        asaasCustomerId: customerId,
        tier,
        cycle,
        billingType,
        valueCents,
        status: "pending",
        lastPaymentId: paymentId || null,
        // Sem cobrança nova nesta chamada (ativação já paga em ciclo anterior):
        // omite as chaves para o merge preservar o paymentId/valor que já
        // pagou a ativação, em vez de zerar o rastro de auditoria.
        ...activationBillingFields(activationPaymentId),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    return {
      subscriptionId,
      paymentId,
      billingType,
      tier,
      cycle,
      invoiceUrl,
      qrCode,
      qrCodeBase64,
    };
  },
);

/** Cancela a assinatura do plano da arena no Asaas e zera o plano público. */
export const cancelArenaSubscription = onCall(
  {secrets: asaasArenaSecrets},
  async (request): Promise<{success: true}> => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Faça login para continuar.");
    }
    const data = (request.data ?? {}) as Record<string, unknown>;
    const arenaId = typeof data.arenaId === "string" ? data.arenaId.trim() : "";
    if (!arenaId) {
      throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
    }

    await assertCallerManagesArena(arenaId, callerUid);

    const db = getFirestore();
    const billingRef = db.doc(`arenas/${arenaId}/billing/subscription`);
    const subId = (await billingRef.get()).data()?.asaasSubscriptionId as string | undefined;

    if (subId?.trim()) {
      try {
        await fetchAsaas(`/v3/subscriptions/${encodeURIComponent(subId.trim())}`, {method: "DELETE"});
      } catch (e) {
        logger.warn("cancelArenaSubscription: delete no Asaas falhou", subId, e);
      }
    }

    await billingRef.set(
      {status: "canceled", updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
    // Downgrade só ao fim do período já pago: mantém planTier e planActiveUntil;
    // a titularidade (entitlement) expira em planActiveUntil. Ver
    // ArenaPlanStatus.entitled / arenaEntitled em firestore.rules.
    await db.collection("arenas").doc(arenaId).set(
      {planStatus: "canceling", planUpdatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );

    return {success: true};
  },
);
