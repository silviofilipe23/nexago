/**
 * Webhook Asaas das mensalidades dos Planos de horário (`externalReference` =
 * `arenaSchedulePayment:{groupId}`). Espelho do das Aulas (`asaas-arena-class-webhook.ts`), com
 * uma mensalidade por pagamento.
 *
 * Age pelo status do GET fresco (o roteador `asaas-webhook.ts` sempre relê o pagamento), então a
 * ordem dos eventos não importa. Fases como no aluguel online (`resolvePaymentPhases`):
 * - PIX `RECEIVED`: mensalidade paga + crédito no caixa da arena + reativa a assinatura suspensa;
 * - cartão `CONFIRMED`: mensalidade paga + líquido no "a liberar"; `RECEIVED` (~D+32): crédito.
 * Pago com o grupo já anulado (baixa manual, cancelamento, pausa, encerramento) ou mensalidade fora
 * de "em aberto" vira estorno — cobrar duas vezes é pior que devolver. `OVERDUE` só atualiza o espelho.
 */
import * as logger from "firebase-functions/logger";
import {FieldValue, type DocumentReference, type Firestore, type Transaction} from "firebase-admin/firestore";
import {ARENA_SCHEDULE_ASAAS_PAYMENTS, ARENA_SCHEDULE_CHARGES, SCHEDULE_PAYMENT_REF_PREFIX} from "./arena-schedule-plan-constants";
import {chargeAsaasMirror} from "./arena-class-asaas-model";
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
import {reactivateIfClearCore} from "./arena-schedule-billing";
import {
  requestAnticipationQuietly,
  requestAsaasCardAnticipation,
  type RequestAnticipation,
} from "./card-anticipation-fee";

export interface ScheduleWebhookDeps {
  refund: (paymentId: string) => Promise<void>;
  now: () => Date;
  /** Pago online destrava a assinatura suspensa, como a baixa manual. */
  reactivate: (db: Firestore, subscriptionId: string, todayKey: string) => Promise<boolean>;
  /** Pede ao Asaas a antecipação do cartão (ausente nos testes antigos = não pede). */
  requestAnticipation?: RequestAnticipation;
}

const defaultDeps: ScheduleWebhookDeps = {
  refund: (paymentId) => refundAsaasPayment(paymentId),
  now: () => new Date(),
  reactivate: (db, subscriptionId, todayKey) => reactivateIfClearCore(db, subscriptionId, todayKey),
  requestAnticipation: requestAsaasCardAnticipation,
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

export function parseSchedulePaymentRef(ref: string): string | null {
  if (!ref.startsWith(SCHEDULE_PAYMENT_REF_PREFIX)) return null;
  const groupId = ref.slice(SCHEDULE_PAYMENT_REF_PREFIX.length).trim();
  return groupId && !groupId.includes("/") ? groupId : null;
}

export async function processArenaScheduleAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
  deps: ScheduleWebhookDeps = defaultDeps,
  /** `anticipationCredited`: chegou `RECEIVABLE_ANTICIPATION_CREDITED` deste cartão. */
  event: {anticipationCredited?: boolean} = {},
): Promise<void> {
  const groupId = parseSchedulePaymentRef((payment.externalReference || "").trim());
  if (!groupId) return;

  const processed = (await processedRef.get()).data() ?? {};
  const outcome = typeof processed["outcome"] === "string" ? processed["outcome"] : "";
  if (outcome && outcome !== "approved") {
    logger.info(`Asaas plano de horário: payment ${paymentId} já processado (${outcome})`);
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
    anticipationCredited: event.anticipationCredited === true,
  });

  const groupRef = db.collection(ARENA_SCHEDULE_ASAAS_PAYMENTS).doc(groupId);

  if (NEGATIVE_STATUSES.has(status)) {
    if (alreadyConfirmed) {
      // Estorno/chargeback depois de pago: a mensalidade fica paga (resolver à mão), mas o caixa
      // não espera um dinheiro que não vem.
      if (processed["awaitingSettlement"] != null && !alreadyCredited) {
        await releaseArenaAwaitingSettlement(db, processedRef, status).catch((e) =>
          logger.error(`Asaas plano de horário ${groupId}: falha ao tirar ${paymentId} do "a liberar"`, e));
      }
      logger.error(`Asaas plano de horário ${groupId}: pagamento ${paymentId} virou ${status} depois de pago — resolver à mão`, {
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
    logger.info(`Asaas plano de horário ${groupId}: pagamento ${paymentId} ainda ${status}`);
    return;
  }

  // Cartão pelo app: a taxa de antecipação foi por cima (`cardCharges` do grupo, por cobrança) e é da
  // plataforma — a mensalidade, a taxa da NexaGO e o caixa da arena ficam no valor do plano.
  const cardFeeCents = Number(((await groupRef.get()).data()?.["cardCharges"] as Record<string, unknown> | undefined)
    ?.[paymentId] ?? 0) || 0;
  const cardFeeReais = cardFeeCents > 0 ? cardFeeCents / 100 : 0;
  const gross = roundMoney((Number(payment.value) || 0) - cardFeeReais);
  let arenaId = String(processed["arenaId"] ?? "");
  let subscriptionId = String(processed["subscriptionId"] ?? "");
  let chargeId = String(processed["chargeId"] ?? "");

  if (phases.confirm) {
    const todayKey = dayKeyFromEventDate(deps.now());
    const result = await db.runTransaction(async (tx: Transaction) => {
      // Relido aqui dentro: webhook e varredura podem processar o mesmo pagamento ao mesmo tempo, e
      // a leitura de fora (que decidiu as fases) já pode estar velha.
      const processedNow = (await tx.get(processedRef)).data() ?? {};
      const outcomeNow = typeof processedNow["outcome"] === "string" ? processedNow["outcome"] : "";
      // Outra execução já decidiu estorno/órfão: não estorna de novo.
      if (outcomeNow && outcomeNow !== "approved") return {kind: "done" as const};
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists) return {kind: "orphan" as const};
      const group = groupSnap.data() as Record<string, unknown>;
      const chargeRef = db.collection(ARENA_SCHEDULE_CHARGES).doc(String(group["chargeId"] ?? "_"));
      const chargeSnap = await tx.get(chargeRef);
      const arenaSnap = await tx.get(db.collection("arenas").doc(String(group["arenaId"] ?? "_")));
      const state = String(group["state"] ?? "");
      const charge = chargeSnap.data() ?? {};
      const base = {
        kind: "arenaSchedulePayment",
        groupId,
        arenaId: String(group["arenaId"] ?? ""),
        subscriptionId: String(group["subscriptionId"] ?? ""),
        chargeId: chargeRef.id,
        paymentStatus: status,
        billingType,
      };
      // Já confirmado por outra execução com ESTE pagamento: nada a estornar; o crédito/"a liberar"
      // abaixo são idempotentes pelo doc de processados.
      const confirmedByOther = processedNow["confirmedAt"] != null ||
        (state === "paid" && group["paymentId"] === paymentId) || charge["asaasPaymentId"] === paymentId;
      if (confirmedByOther) return {kind: "already" as const, base};
      const mirror = (charge["asaas"] ?? {}) as Record<string, unknown>;
      // Mensalidade resolvida por outro caminho ou que já aponta para outro grupo: estorna.
      const stale = state === "void" || state === "voiding" ||
        !chargeSnap.exists || charge["status"] !== "open" || mirror["groupId"] !== groupId;
      if (stale) {
        tx.set(processedRef, {...base, outcome: "refund_stale", processedAt: FieldValue.serverTimestamp()}, {merge: true});
        tx.set(groupRef, {asaasStatus: status, paymentId, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
        return {kind: "stale" as const, base};
      }
      // Taxa da NexaGO no plano da arena agora — a mesma conta do crédito no caixa.
      const platformFeeReais = computePlatformFeeReais(
        gross, resolveArenaBookingFeePercent(arenaSnap.data() ?? {}, deps.now().getTime()),
      );
      tx.set(chargeRef, {
        status: "paid",
        paidVia: "asaas",
        onlineBillingType: billingType,
        asaasPaymentId: paymentId,
        platformFeeReais,
        paidOn: todayKey,
        paidAt: FieldValue.serverTimestamp(),
        paymentMethod: null,
        asaas: chargeAsaasMirror(groupId, "paid", {invoiceUrl: (group["invoiceUrl"] as string) ?? null, status}),
      }, {merge: true});
      tx.set(groupRef, {
        state: "paid", paymentId, asaasStatus: status, billingType, paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(processedRef, {
        ...base, outcome: "approved", confirmedAt: FieldValue.serverTimestamp(), processedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {kind: "approved" as const, base};
    });

    if (result.kind === "done") return;
    if (result.kind === "orphan") {
      logger.error(`Asaas plano de horário: grupo ${groupId} não encontrado para o pagamento ${paymentId} — estorno necessário`);
      await processedRef.set({kind: "arenaSchedulePayment", groupId, outcome: "orphan", paymentStatus: status,
        refundRequired: true, processedAt: FieldValue.serverTimestamp()}, {merge: true});
      return;
    }
    if (result.kind === "stale") {
      logger.warn(`Asaas plano de horário ${groupId}: pago com a mensalidade já resolvida — estornando ${paymentId}`, result.base);
      try {
        await deps.refund(paymentId);
        await processedRef.set({refundedAt: FieldValue.serverTimestamp()}, {merge: true});
      } catch (e) {
        logger.error(`Asaas plano de horário ${groupId}: estorno de ${paymentId} falhou — fazer à mão`, e);
        await processedRef.set({refundRequired: true}, {merge: true});
      }
      return;
    }
    arenaId = result.base.arenaId;
    subscriptionId = result.base.subscriptionId;
    chargeId = result.base.chargeId;
    if (result.kind === "already") {
      logger.info(`Asaas plano de horário ${groupId}: ${paymentId} já confirmado por outra execução`);
    } else if (subscriptionId) {
      try {
        await deps.reactivate(db, subscriptionId, todayKey);
      } catch (e) {
        logger.error(`Asaas plano de horário ${groupId}: reativar ${subscriptionId} falhou`, e);
      }
    }
  }

  if (!arenaId) return;
  const arenaData = (await db.collection("arenas").doc(arenaId).get()).data() ?? {};
  const platformFeeReais = computePlatformFeeReais(gross, resolveArenaBookingFeePercent(arenaData, deps.now().getTime()));
  // A taxa do gateway é sobre o que o Asaas cobrou (com a taxa de antecipação), não sobre o plano.
  const gatewayFeeReais = resolveGatewayFeeReais(payment, billingType, roundMoney(Number(payment.value) || 0));

  if (phases.awaitSettlement) {
    await holdArenaAwaitingSettlement(db, processedRef, {
      arenaId,
      netReais: arenaBookingNetReais({grossReais: gross, platformFeeReais, gatewayFeeReais}),
    });
  }
  // Taxa paga pelo atleta: a plataforma antecipa e o caixa da arena é creditado quando a antecipação
  // cair (~2 dias úteis). Uma vez por pagamento; falhou, credita na liquidação.
  if (phases.awaitSettlement && cardFeeReais > 0 && processed["anticipation"] == null && deps.requestAnticipation) {
    await requestAnticipationQuietly(processedRef, paymentId, `plano de horário ${groupId}`, deps.requestAnticipation);
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
      ledgerExtra: {
        source: "schedule_plan", subscriptionId, scheduleChargeId: chargeId,
        ...(cardFeeReais > 0 ? {cardFeeReais} : {}),
      },
    });
  }
}

/** Espelha o status do Asaas no grupo e na mensalidade; removido no Asaas anula o grupo. */
async function mirrorStatus(db: Firestore, groupId: string, status: string, voidGroup = false): Promise<void> {
  const groupRef = db.collection(ARENA_SCHEDULE_ASAAS_PAYMENTS).doc(groupId);
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists) return;
    const group = snap.data() as Record<string, unknown>;
    if (group["state"] === "paid") return;
    const chargeSnap = await tx.get(db.collection(ARENA_SCHEDULE_CHARGES).doc(String(group["chargeId"] ?? "_")));
    const state = voidGroup ? "void" : String(group["state"] ?? "open");
    // Já anulado por nós (o DELETED é o eco do nosso void): mantém o motivo original.
    const markVoid = voidGroup && group["state"] !== "void";
    tx.set(groupRef, {
      asaasStatus: status,
      ...(markVoid ? {state: "void", voidReason: "deleted_in_asaas", voidedAt: FieldValue.serverTimestamp()} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    const asaas = (chargeSnap.data()?.["asaas"] ?? {}) as Record<string, unknown>;
    if (!chargeSnap.exists || asaas["groupId"] !== groupId) return;
    tx.set(chargeSnap.ref, {asaas: {...asaas, state, status}}, {merge: true});
  });
}
