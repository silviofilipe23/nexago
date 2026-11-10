/**
 * CRM da arena — cobrança online do contrato (link Asaas: Pix ou cartão na fatura).
 *
 * O time gera um link para uma ou mais parcelas em aberto (`createPaymentLink` do `updateArenaCrm`).
 * Pago, o webhook dá baixa nas parcelas e credita o líquido no caixa da arena — mesmas fases e taxa
 * da mensalidade dos Planos de horário (`asaas-arena-schedule-webhook.ts`): Pix credita no
 * `RECEIVED`; cartão vai para o "a liberar" no `CONFIRMED` e credita no `RECEIVED`.
 *
 * Um link aberto por contrato (`arenaCrmPaymentLinks/{linkId}`, espelho em `contract.onlineLink`).
 * Baixa manual, cancelamento ou link novo apagam o anterior no Asaas; pago mesmo assim (corrida)
 * vira estorno — cobrar duas vezes é pior que devolver.
 *
 * Só para cliente com conta no app: o Asaas exige CPF, e o cliente Asaas mora em `users/{uid}`.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError} from "firebase-functions/v2/https";
import {FieldValue, type DocumentReference, type Firestore, type Transaction} from "firebase-admin/firestore";
import {assertArenaCanBillOnline} from "./arena-class-billing";
import {MIN_ONLINE_CHARGE_REAIS} from "./arena-schedule-plan-constants";
import {resolveArenaBookingFeePercent} from "./arena-entitlement";
import {
  arenaBookingNetReais,
  creditArenaWalletFromBookingPayment,
  holdArenaAwaitingSettlement,
  releaseArenaAwaitingSettlement,
} from "./arena-wallet";
import {
  createAsaasInvoiceCharge,
  deleteAsaasPaymentOrThrow,
  getAsaasPayment,
  refundAsaasPayment,
  type AsaasPaymentDetails,
} from "./asaas-booking-payment";
import {getAsaasEnvTag} from "./asaas-client";
import {isValidCpfCnpj, normalizeCpfCnpj} from "./asaas-customer";
import {registerScheduleCustomer, resolveScheduleCustomer} from "./asaas-saved-card";
import {gatewayFeeBeyondCovered, resolveGatewayFeeReais} from "./asaas-gateway-fee";
import {dayKeyFromEventDate} from "./event-timezone";
import {getFirebaseProjectId} from "./firebase-paths";
import {roundMoney} from "./mercadopago-arena-helpers";
import {computePlatformFeeReais} from "./platform-fees";
import {parseRegistrationBillingType, resolvePaymentPhases} from "./registration-payment-phases";
import {
  CRM_CONTRACTS,
  CRM_PAYMENTS,
  installmentDueDate,
  periodMonths,
  type CrmContractRecord,
  type CrmOnlineLink,
} from "./arena-crm-model";

export type {CrmOnlineLink};

export const CRM_PAYMENT_LINKS = "arenaCrmPaymentLinks";
/** `externalReference` do pagamento Asaas: `arenaCrmPayment:{linkId}`. */
export const CRM_PAYMENT_REF_PREFIX = "arenaCrmPayment:";
export const CPF_NEEDED_MESSAGE = "Informe o CPF de quem vai pagar.";
export const ONLINE_ONLY_APP_MESSAGE = "Cobrança online só para cliente com conta no app (o Asaas pede o CPF dele).";

type Data = Record<string, unknown>;

export interface CrmBillingDeps {
  /** Cliente Asaas do atleta pelo CPF guardado; null = sem CPF. */
  resolveCustomer: (athleteId: string) => Promise<string | null>;
  /** Grava o CPF informado (cliente Asaas + cadastro do atleta). */
  registerCustomer: (athleteId: string, cpfCnpj: string) => Promise<string>;
  createPayment: (input: {linkId: string; customerId: string; valueReais: number; dueDate: string; description: string}) =>
    Promise<{paymentId: string; invoiceUrl: string; status: string}>;
  /** Apaga a cobrança; lança se não der (já paga, por exemplo). */
  deletePayment: (paymentId: string) => Promise<void>;
  getPayment: (paymentId: string) => Promise<AsaasPaymentDetails>;
  refund: (paymentId: string) => Promise<void>;
  now: () => Date;
}

/** No emulador, só sandbox: o projeto DEV aponta para o Asaas de produção. */
function assertAsaasAllowed(): void {
  if (process.env.FUNCTIONS_EMULATOR === "true" && getAsaasEnvTag() !== "sandbox") {
    throw new Error("ASAAS_BLOCKED_IN_EMULATOR");
  }
}

export const defaultCrmBillingDeps: CrmBillingDeps = {
  resolveCustomer: resolveScheduleCustomer,
  registerCustomer: registerScheduleCustomer,
  createPayment: async (input) => {
    assertAsaasAllowed();
    return createAsaasInvoiceCharge({
      customerId: input.customerId,
      valueReais: input.valueReais,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: `${CRM_PAYMENT_REF_PREFIX}${input.linkId}`,
      // Mesmo link = mesma cobrança: repetir o pedido não duplica no Asaas.
      idempotencyKey: `crm-pay-${getAsaasEnvTag()}-${input.linkId}`,
    });
  },
  deletePayment: async (paymentId) => {
    assertAsaasAllowed();
    await deleteAsaasPaymentOrThrow(paymentId);
  },
  getPayment: (paymentId) => {
    assertAsaasAllowed();
    return getAsaasPayment(paymentId);
  },
  refund: (paymentId) => refundAsaasPayment(paymentId),
  now: () => new Date(),
};

export function onlineLinkFrom(raw: unknown): CrmOnlineLink | null {
  if (raw == null || typeof raw !== "object") return null;
  const d = raw as Data;
  const linkId = typeof d["linkId"] === "string" ? d["linkId"] : "";
  const invoiceUrl = typeof d["invoiceUrl"] === "string" ? d["invoiceUrl"] : "";
  if (!linkId || !invoiceUrl) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    linkId,
    invoiceUrl,
    fromInstallment: n(d["fromInstallment"]),
    installments: Math.max(1, n(d["installments"])),
    amountReais: n(d["amountReais"]),
    createdAt: typeof d["createdAt"] === "string" ? d["createdAt"] : "",
    byName: typeof d["byName"] === "string" ? d["byName"] : null,
  };
}

/** O link cobre a parcela `k`? (lembrete leva o link junto). */
export function linkCovers(link: CrmOnlineLink | null, k: number): boolean {
  return !!link && k >= link.fromInstallment && k < link.fromInstallment + link.installments;
}

/** Link aberto ficou velho: contrato cancelado ou parcela dele já paga por outro caminho. */
export function linkIsStale(link: CrmOnlineLink, contract: Pick<CrmContractRecord, "status" | "paidInstallments">): boolean {
  return contract.status === "canceled" || contract.paidInstallments !== link.fromInstallment;
}

function remainingInstallments(c: CrmContractRecord): number {
  return c.autoRenew ? 12 : periodMonths(c.period) - c.paidInstallments;
}

function brl(v: number): string {
  return `R$ ${(Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

// ── Gerar / cancelar ──────────────────────────────────────────────────────────

export async function createCrmPaymentLink(
  db: Firestore,
  arenaId: string,
  uid: string,
  byName: string | null,
  d: Data,
  contract: CrmContractRecord,
  rawLink: unknown,
  deps: CrmBillingDeps = defaultCrmBillingDeps,
): Promise<{linkId: string; invoiceUrl: string; amountReais: number; installments: number; reused: boolean}> {
  if (contract.status !== "active") throw new HttpsError("failed-precondition", "Contrato cancelado não gera cobrança.");
  if (!contract.athleteId) throw new HttpsError("failed-precondition", ONLINE_ONLY_APP_MESSAGE);
  const left = remainingInstallments(contract);
  if (left <= 0) throw new HttpsError("failed-precondition", "Todas as parcelas deste contrato já estão pagas.");
  const installments = Math.floor(typeof d["installments"] === "number" ? d["installments"] : 1);
  if (installments < 1 || installments > Math.min(12, left)) throw new HttpsError("invalid-argument", "Número de parcelas inválido.");
  const amountReais = roundMoney(installments * contract.monthlyPriceReais);
  if (amountReais < MIN_ONLINE_CHARGE_REAIS) throw new HttpsError("failed-precondition", `Cobrança online a partir de ${brl(MIN_ONLINE_CHARGE_REAIS)}.`);

  const arena = ((await db.collection("arenas").doc(arenaId).get()).data() ?? {}) as Data;
  assertArenaCanBillOnline(arena, "os contratos");

  const from = contract.paidInstallments;
  const existing = onlineLinkFrom(rawLink);
  if (existing && existing.fromInstallment === from && existing.installments === installments) {
    return {linkId: existing.linkId, invoiceUrl: existing.invoiceUrl, amountReais: existing.amountReais, installments, reused: true};
  }
  if (existing) await voidLink(db, contract.id, existing, "replaced", deps, true);

  const cpfRaw = typeof d["cpf"] === "string" ? d["cpf"] : "";
  let customerId: string | null;
  if (cpfRaw) {
    const cpf = normalizeCpfCnpj(cpfRaw);
    if (!isValidCpfCnpj(cpf)) throw new HttpsError("invalid-argument", "CPF inválido.");
    customerId = await deps.registerCustomer(contract.athleteId, cpf);
  } else {
    customerId = await deps.resolveCustomer(contract.athleteId);
  }
  if (!customerId) throw new HttpsError("failed-precondition", CPF_NEEDED_MESSAGE, {code: "CPF_REQUIRED"});

  const today = dayKeyFromEventDate(deps.now());
  const due = installmentDueDate(contract.startDate, contract.dueDay, from);
  const arenaName = typeof arena["name"] === "string" ? arena["name"] : "";
  const description = [`${contract.planName}`, installments === 1 ? "1 parcela" : `${installments} parcelas`, arenaName]
    .filter(Boolean).join(" · ").slice(0, 480);
  const linkRef = db.collection(CRM_PAYMENT_LINKS).doc();
  await linkRef.set({
    arenaId, contractId: contract.id, customerKey: contract.customerKey, athleteId: contract.athleteId,
    fromInstallment: from, installments, amountReais, dueDate: due > today ? due : today, description,
    state: "creating", paymentId: null, invoiceUrl: null, asaasStatus: null,
    createdAt: FieldValue.serverTimestamp(), createdBy: uid, createdByName: byName,
  });

  let created: {paymentId: string; invoiceUrl: string; status: string};
  try {
    created = await deps.createPayment({linkId: linkRef.id, customerId, valueReais: amountReais, dueDate: due > today ? due : today, description});
  } catch (e) {
    logger.error(`createCrmPaymentLink ${linkRef.id}: falhou`, e);
    await linkRef.set({state: "failed", error: e instanceof Error ? e.message : String(e)}, {merge: true});
    throw new HttpsError("unavailable", "Não foi possível gerar o link agora. Tente de novo em instantes.");
  }

  const mirror: CrmOnlineLink = {
    linkId: linkRef.id, invoiceUrl: created.invoiceUrl, fromInstallment: from, installments, amountReais,
    createdAt: deps.now().toISOString(), byName,
  };
  const ok = await db.runTransaction(async (tx: Transaction) => {
    const ref = db.collection(CRM_CONTRACTS).doc(contract.id);
    const now = (await tx.get(ref)).data() as Data | undefined;
    const paid = typeof now?.["paidInstallments"] === "number" ? now["paidInstallments"] : -1;
    if (!now || now["status"] === "canceled" || paid !== from) {
      tx.set(linkRef, {state: "void", voidReason: "contract_changed", paymentId: created.paymentId, invoiceUrl: created.invoiceUrl}, {merge: true});
      return false;
    }
    tx.set(linkRef, {state: "open", paymentId: created.paymentId, invoiceUrl: created.invoiceUrl, asaasStatus: created.status}, {merge: true});
    tx.set(ref, {onlineLink: mirror, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return true;
  });
  if (!ok) {
    await deps.deletePayment(created.paymentId).catch((e) => logger.warn(`createCrmPaymentLink: não apagou ${created.paymentId}`, e));
    throw new HttpsError("aborted", "O contrato mudou enquanto o link era gerado. Abra a ficha de novo.");
  }
  return {linkId: linkRef.id, invoiceUrl: created.invoiceUrl, amountReais, installments, reused: false};
}

/**
 * Apaga o link no Asaas e tira o espelho do contrato. `strict`: se não der para apagar (já pago),
 * lança — quem chamou não pode seguir como se o link não existisse.
 */
export async function voidLink(
  db: Firestore,
  contractId: string,
  link: CrmOnlineLink,
  reason: string,
  deps: CrmBillingDeps = defaultCrmBillingDeps,
  strict = false,
): Promise<void> {
  const linkRef = db.collection(CRM_PAYMENT_LINKS).doc(link.linkId);
  const paymentId = String((await linkRef.get()).data()?.["paymentId"] ?? "");
  if (paymentId) {
    try {
      await deps.deletePayment(paymentId);
    } catch (e) {
      logger.warn(`voidLink ${link.linkId}: não apagou ${paymentId}`, e);
      if (strict) throw new HttpsError("failed-precondition", "O link anterior acabou de ser pago. Atualize a ficha.");
    }
  }
  await db.runTransaction(async (tx: Transaction) => {
    const ref = db.collection(CRM_CONTRACTS).doc(contractId);
    const snap = await tx.get(ref);
    const linkSnap = await tx.get(linkRef);
    if (linkSnap.data()?.["state"] !== "paid") {
      tx.set(linkRef, {state: "void", voidReason: reason, voidedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
    if (onlineLinkFrom(snap.data()?.["onlineLink"])?.linkId === link.linkId) {
      tx.set(ref, {onlineLink: null}, {merge: true});
    }
  });
}

/** Depois de baixa manual ou cancelamento: o link que ficou velho sai do ar. */
export async function voidStaleLink(db: Firestore, contractId: string, deps: CrmBillingDeps = defaultCrmBillingDeps): Promise<boolean> {
  const data = (await db.collection(CRM_CONTRACTS).doc(contractId).get()).data() as Data | undefined;
  const link = onlineLinkFrom(data?.["onlineLink"]);
  if (!data || !link) return false;
  const status = data["status"] === "canceled" ? "canceled" : "active";
  const paid = typeof data["paidInstallments"] === "number" ? data["paidInstallments"] : 0;
  if (!linkIsStale(link, {status, paidInstallments: paid})) return false;
  await voidLink(db, contractId, link, status === "canceled" ? "contract_canceled" : "paid_manually", deps);
  return true;
}

// ── Webhook ───────────────────────────────────────────────────────────────────

const NEGATIVE_STATUSES = new Set([
  "REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED", "DUNNING_RECEIVED",
]);

export function parseCrmPaymentRef(ref: string): string | null {
  if (!ref.startsWith(CRM_PAYMENT_REF_PREFIX)) return null;
  const linkId = ref.slice(CRM_PAYMENT_REF_PREFIX.length).trim();
  return linkId && !linkId.includes("/") && !linkId.includes(":") ? linkId : null;
}

export function processedPaymentRef(db: Firestore, paymentId: string): DocumentReference {
  return db.doc(`artifacts/${getFirebaseProjectId()}/public/data/asaas_processed_payments/${paymentId}`);
}

/** Pagamento do link do CRM: baixa das parcelas + caixa da arena (ou estorno, se ficou velho). */
export async function processArenaCrmAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
  deps: Pick<CrmBillingDeps, "refund" | "now"> = defaultCrmBillingDeps,
): Promise<void> {
  const linkId = parseCrmPaymentRef((payment.externalReference || "").trim());
  if (!linkId) return;
  const processed = (await processedRef.get()).data() ?? {};
  const outcome = typeof processed["outcome"] === "string" ? processed["outcome"] : "";
  if (outcome && outcome !== "approved") return;
  const status = (payment.status || "").toUpperCase();
  const billingType = parseRegistrationBillingType(payment.billingType);
  const phases = resolvePaymentPhases({
    billingType,
    status,
    alreadyConfirmed: processed["confirmedAt"] != null,
    alreadyCredited: processed["walletCreditedAt"] != null,
    alreadyAwaitingSettlement: processed["awaitingSettlement"] != null,
  });
  const linkRef = db.collection(CRM_PAYMENT_LINKS).doc(linkId);

  if (NEGATIVE_STATUSES.has(status)) {
    if (processed["confirmedAt"] != null) {
      if (processed["awaitingSettlement"] != null && processed["walletCreditedAt"] == null) {
        await releaseArenaAwaitingSettlement(db, processedRef, status).catch((e) =>
          logger.error(`Asaas CRM ${linkId}: falha ao tirar ${paymentId} do "a liberar"`, e));
      }
      logger.error(`Asaas CRM ${linkId}: pagamento ${paymentId} virou ${status} depois de pago — resolver à mão`);
    }
    await linkRef.set({asaasStatus: status}, {merge: true}).catch(() => undefined);
    return;
  }
  if (status === "OVERDUE" || payment.deleted === true) {
    await linkRef.set({asaasStatus: payment.deleted ? "DELETED" : status}, {merge: true}).catch(() => undefined);
    return;
  }
  if (!phases.confirm && !phases.credit && !phases.awaitSettlement) return;

  const gross = roundMoney(Number(payment.value) || 0);
  let arenaId = String(processed["arenaId"] ?? "");
  let contractId = String(processed["contractId"] ?? "");

  if (phases.confirm) {
    const today = dayKeyFromEventDate(deps.now());
    const result = await db.runTransaction(async (tx: Transaction) => {
      const processedNow = (await tx.get(processedRef)).data() ?? {};
      const outcomeNow = typeof processedNow["outcome"] === "string" ? processedNow["outcome"] : "";
      if (outcomeNow && outcomeNow !== "approved") return {kind: "done" as const};
      const linkSnap = await tx.get(linkRef);
      if (!linkSnap.exists) return {kind: "orphan" as const};
      const link = linkSnap.data() as Data;
      const contractRef = db.collection(CRM_CONTRACTS).doc(String(link["contractId"] ?? "_"));
      const contractSnap = await tx.get(contractRef);
      const contract = (contractSnap.data() ?? {}) as Data;
      const base = {kind: "arenaCrmPayment", linkId, arenaId: String(link["arenaId"] ?? ""), contractId: contractRef.id, paymentStatus: status, billingType};
      if (processedNow["confirmedAt"] != null || (link["state"] === "paid" && link["paymentId"] === paymentId)) {
        return {kind: "already" as const, base};
      }
      const from = Number(link["fromInstallment"] ?? -1);
      const count = Number(link["installments"] ?? 0);
      const stale = link["state"] === "void" || !contractSnap.exists || contract["status"] === "canceled" ||
        Number(contract["paidInstallments"] ?? -1) !== from;
      if (stale) {
        tx.set(processedRef, {...base, outcome: "refund_stale", processedAt: FieldValue.serverTimestamp()}, {merge: true});
        tx.set(linkRef, {asaasStatus: status, paymentId}, {merge: true});
        return {kind: "stale" as const, base};
      }
      const paidInstallments = from + count;
      tx.set(contractRef, {
        paidInstallments,
        ...(onlineLinkFrom(contract["onlineLink"])?.linkId === linkId ? {onlineLink: null} : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(contractRef.collection(CRM_PAYMENTS).doc(), {
        arenaId: base.arenaId, installments: count, fromInstallment: from, amountReais: gross, method: "online",
        billingType, paymentId, linkId, paidOn: today, createdAt: FieldValue.serverTimestamp(), createdBy: null,
        createdByName: billingType === "CREDIT_CARD" ? "Cartão online" : "Pix online",
      });
      tx.set(linkRef, {state: "paid", paymentId, asaasStatus: status, billingType, paidAt: FieldValue.serverTimestamp()}, {merge: true});
      tx.set(processedRef, {...base, outcome: "approved", confirmedAt: FieldValue.serverTimestamp(), processedAt: FieldValue.serverTimestamp()}, {merge: true});
      return {kind: "approved" as const, base};
    });

    if (result.kind === "done") return;
    if (result.kind === "orphan") {
      logger.error(`Asaas CRM: link ${linkId} não encontrado para o pagamento ${paymentId} — estorno necessário`);
      await processedRef.set({kind: "arenaCrmPayment", linkId, outcome: "orphan", refundRequired: true, processedAt: FieldValue.serverTimestamp()}, {merge: true});
      return;
    }
    if (result.kind === "stale") {
      logger.warn(`Asaas CRM ${linkId}: pago com as parcelas já resolvidas — estornando ${paymentId}`);
      try {
        await deps.refund(paymentId);
        await processedRef.set({refundedAt: FieldValue.serverTimestamp()}, {merge: true});
      } catch (e) {
        logger.error(`Asaas CRM ${linkId}: estorno de ${paymentId} falhou — fazer à mão`, e);
        await processedRef.set({refundRequired: true}, {merge: true});
      }
      return;
    }
    arenaId = result.base.arenaId;
    contractId = result.base.contractId;
  }

  if (!arenaId) return;
  const arenaData = (await db.collection("arenas").doc(arenaId).get()).data() ?? {};
  const platformFeeReais = computePlatformFeeReais(gross, resolveArenaBookingFeePercent(arenaData, deps.now().getTime()));
  const gatewayFeeReais = gatewayFeeBeyondCovered(resolveGatewayFeeReais(payment, billingType, gross), 0);
  if (phases.awaitSettlement) {
    await holdArenaAwaitingSettlement(db, processedRef, {arenaId, netReais: arenaBookingNetReais({grossReais: gross, platformFeeReais, gatewayFeeReais})});
  }
  if (phases.credit) {
    await creditArenaWalletFromBookingPayment(db, {
      arenaId, bookingId: linkId, paymentId, grossReais: gross, platformFeeReais, gatewayFeeReais, processedRef,
      ledgerExtra: {source: "crm_contract", contractId, crmPaymentLinkId: linkId},
    });
  }
}

/** Webhook perdido: confere no Asaas os links abertos da arena e processa os pagos. */
export async function reconcileCrmPaymentLinks(
  db: Firestore,
  arenaId: string,
  deps: CrmBillingDeps = defaultCrmBillingDeps,
): Promise<number> {
  const snap = await db.collection(CRM_PAYMENT_LINKS).where("arenaId", "==", arenaId).where("state", "==", "open").get();
  let processed = 0;
  for (const doc of snap.docs) {
    const paymentId = String(doc.data()["paymentId"] ?? "");
    if (!paymentId) continue;
    try {
      const payment = await deps.getPayment(paymentId);
      const status = (payment.status || "").toUpperCase();
      if (!["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(status)) continue;
      await processArenaCrmAsaasNotification(db, paymentId, payment, processedPaymentRef(db, paymentId), deps);
      processed += 1;
    } catch (e) {
      logger.warn(`reconcileCrmPaymentLinks ${doc.id}: falhou`, e);
    }
  }
  return processed;
}
