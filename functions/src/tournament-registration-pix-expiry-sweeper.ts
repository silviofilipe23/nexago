/**
 * Varredura das cobranças PIX de inscrição que venceram.
 *
 * É a ÚNICA expiração real que existe. O `dueDate` do Asaas tem granularidade
 * de DIA, então a cobrança criada às 14h05 segue pagável até a virada da noite
 * — os "15 minutos" nunca existiram no gateway. Até aqui quem matava o QR era
 * o relógio da tela do atleta, chamando `cancelPendingTournamentRegistrationPix`
 * ao zerar: app fechado, aba trocada ou celular sem bateria, e a cobrança ficava
 * viva. Pago depois, o dinheiro entrava sem inscrição para creditar.
 *
 * Esta varredura fecha isso do lado do servidor: passou do `paymentExpiresAt`,
 * a cobrança morre no gateway. Ela cuida só do DINHEIRO — a vaga é assunto de
 * `expirePendingTournamentRegistrations`, que roda pelo `holdExpiresAt` da
 * inscrição. Como a cobrança nasce dois minutos ANTES do prazo da vaga
 * (`PIX_HOLD_MARGIN_MS`), quando a varredura da vaga chega aqui já não há
 * cobrança viva para matar.
 *
 * Também é a REDE do webhook. O handler do Asaas responde 200 mesmo quando o
 * processamento falha (o Asaas interrompe a fila inteira depois de 15 erros
 * seguidos), então um aviso perdido nunca volta: em 02/10 a releitura do
 * pagamento levou 403 do CloudFront e um PIX integral pago ficou sem crédito.
 * O sintoma chega aqui — a cobrança paga não pode ser apagada — e é aqui que o
 * crédito é feito, pelo MESMO processador do webhook.
 */

import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {FieldValue, Timestamp, getFirestore} from "firebase-admin/firestore";
import {asaasArenaSecrets} from "./asaas-client";
import {deleteAsaasPaymentOrThrow, getAsaasPayment} from "./asaas-booking-payment";
import {parseRegistrationBillingType} from "./registration-payment-phases";
import {processTournamentRegistrationAsaasNotification} from
  "./asaas-tournament-registration-webhook";
import {getFirebaseProjectId} from "./firebase-paths";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";

/** Teto por volta: a cadência de 1 minuto dá vazão de sobra para o pico. */
const SWEEP_BATCH_SIZE = 100;

/** Marca de quem morreu de velho, e não por pagamento ou cancelamento. */
export const PIX_CANCELLED_EXPIRED = "expired";

/**
 * Dinheiro garantido no gateway: PIX liquidado ou cartão autorizado. Cobrança
 * assim que ainda consta `pending` aqui é webhook que não creditou.
 */
const GATEWAY_PAID_STATUSES = new Set([
  "CONFIRMED",
  "RECEIVED",
  "RECEIVED_IN_CASH",
]);

/**
 * Cartão que já saiu do "aberto" no gateway: deletar aqui destruiria pagamento
 * em voo — o atleta digitou o cartão e o webhook ainda não chegou.
 */
const CARD_IN_FLIGHT_STATUSES = new Set([
  ...GATEWAY_PAID_STATUSES,
  "AWAITING_RISK_ANALYSIS",
]);

/** O mínimo de um `pixPending` para a varredura decidir. */
export interface ExpiringPixDoc {
  id: string;
  data(): Record<string, unknown> | undefined;
}

function timestampMs(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

/**
 * Mata as cobranças vencidas da leva e marca os documentos.
 *
 * Cada documento é decidido de novo aqui, e não na consulta: entre uma coisa e
 * outra o atleta pode ter gerado um QR novo, com vencimento lá na frente.
 *
 * Cobrança liquidada (`status: "paid"`) nunca é tocada — aquele documento é o
 * registro do pagamento. Falha do gateway não marca nada: dizer "cancelada"
 * com a cobrança possivelmente viva seria mentir sobre o estado, e a próxima
 * volta tenta de novo.
 */
export async function expireOpenPixCharges<T extends ExpiringPixDoc>(params: {
  docs: T[];
  nowMs: number;
  cancelCharge: (asaasPaymentId: string) => Promise<void>;
  markCancelled: (doc: T) => Promise<void>;
  /**
   * Status atual da cobrança no gateway. Consultado de saída só para cartão; no
   * PIX, só quando o Asaas recusa apagar a cobrança.
   */
  resolveChargeStatus?: (asaasPaymentId: string) => Promise<string>;
  /** Credita a cobrança paga que o webhook não creditou (mesmo processador). */
  reconcilePaidCharge?: (asaasPaymentId: string) => Promise<void>;
}): Promise<{expired: number; failed: number; reconciled: number}> {
  let expired = 0;
  let failed = 0;
  let reconciled = 0;

  /** Credita e conta; a falha deixa o documento pendente para a próxima volta. */
  const reconcile = async (
    doc: T,
    asaasPaymentId: string,
    gatewayStatus: string,
  ): Promise<void> => {
    try {
      await params.reconcilePaidCharge!(asaasPaymentId);
      logger.warn("Cobrança paga sem crédito do webhook — creditada pela varredura", {
        payerUid: doc.id,
        asaasPaymentId,
        gatewayStatus,
      });
      reconciled++;
    } catch (e) {
      logger.error("Falha ao creditar cobrança paga sem webhook", {
        payerUid: doc.id,
        asaasPaymentId,
        error: e,
      });
      failed++;
    }
  };

  /** Status pago do gateway, ou `null` (não pago, sem consulta ou consulta falhou). */
  const paidGatewayStatusOrNull = async (
    asaasPaymentId: string,
  ): Promise<string | null> => {
    if (!params.resolveChargeStatus || !params.reconcilePaidCharge) return null;
    try {
      const status =
        (await params.resolveChargeStatus(asaasPaymentId)).toUpperCase();
      return GATEWAY_PAID_STATUSES.has(status) ? status : null;
    } catch (e) {
      logger.error("Falha ao consultar cobrança que o Asaas recusou apagar", {
        asaasPaymentId,
        error: e,
      });
      return null;
    }
  };

  for (const doc of params.docs) {
    const data = doc.data() ?? {};
    if (data.status !== "pending") continue;

    const expiresAtMs = timestampMs(data.paymentExpiresAt);
    // Sem relógio não há o que declarar vencido (doc legado ou malformado).
    if (expiresAtMs == null || expiresAtMs > params.nowMs) continue;

    const asaasPaymentId =
      (data.asaasPaymentId as string | undefined)?.trim() ?? "";
    if (asaasPaymentId) {
      if (
        parseRegistrationBillingType(data.billingType) === "CREDIT_CARD" &&
        params.resolveChargeStatus
      ) {
        let gatewayStatus: string;
        try {
          gatewayStatus =
            (await params.resolveChargeStatus(asaasPaymentId)).toUpperCase();
        } catch (e) {
          logger.error("Falha ao consultar cobrança de cartão vencida", {
            payerUid: doc.id,
            asaasPaymentId,
            error: e,
          });
          failed++;
          continue;
        }
        if (
          GATEWAY_PAID_STATUSES.has(gatewayStatus) &&
          params.reconcilePaidCharge
        ) {
          await reconcile(doc, asaasPaymentId, gatewayStatus);
          continue;
        }
        if (CARD_IN_FLIGHT_STATUSES.has(gatewayStatus)) {
          logger.info(
            "Cobrança de cartão vencida no relógio, mas em voo no gateway",
            {payerUid: doc.id, asaasPaymentId, gatewayStatus},
          );
          continue;
        }
      }

      try {
        await params.cancelCharge(asaasPaymentId);
      } catch (e) {
        // O Asaas só recusa apagar cobrança que não está pendente: a pergunta
        // seguinte é se ela foi PAGA. Fica só para a recusa, para o caminho
        // normal do PIX continuar sem consulta ao gateway.
        const paidStatus = await paidGatewayStatusOrNull(asaasPaymentId);
        if (paidStatus) {
          await reconcile(doc, asaasPaymentId, paidStatus);
          continue;
        }
        logger.error("Falha ao matar cobrança PIX vencida", {
          payerUid: doc.id,
          asaasPaymentId,
          error: e,
        });
        failed++;
        continue;
      }
    }

    await params.markCancelled(doc);
    expired++;
  }

  return {expired, failed, reconciled};
}

export const expireOpenTournamentRegistrationPixCharges = onSchedule({
  schedule: "every 1 minutes",
  // Os avisos de push saem daqui quando a varredura credita no lugar do webhook.
  secrets: [
    ...asaasArenaSecrets,
    WEB_PUSH_PUBLIC_KEY,
    WEB_PUSH_PRIVATE_KEY,
    WEB_PUSH_SUBJECT,
  ],
}, async () => {
  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const now = Timestamp.now();

  const snap = await db
    .collectionGroup("pixPending")
    .where("status", "==", "pending")
    .where("paymentExpiresAt", "<", now)
    .limit(SWEEP_BATCH_SIZE)
    .get();

  const {expired, failed, reconciled} = await expireOpenPixCharges({
    docs: snap.docs,
    nowMs: now.toMillis(),
    cancelCharge: deleteAsaasPaymentOrThrow,
    resolveChargeStatus: async (id) => (await getAsaasPayment(id)).status ?? "",
    reconcilePaidCharge: async (id) => {
      // Mesmo documento de idempotência do webhook: se o aviso chegar depois,
      // ele vê a fase já feita e não credita de novo.
      await processTournamentRegistrationAsaasNotification(
        db,
        id,
        await getAsaasPayment(id),
        db.doc(
          `artifacts/${projectId}/public/data/asaas_processed_payments/${id}`,
        ),
      );
    },
    markCancelled: async (doc) => {
      await doc.ref.set({
        status: "cancelled",
        cancelledReason: PIX_CANCELLED_EXPIRED,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    },
  });

  // Loga toda volta, inclusive vazia: job agendado que só fala quando age é
  // indistinguível de job que parou de rodar.
  logger.info("Varredura de cobrança PIX vencida concluída", {
    candidates: snap.size,
    expired,
    failed,
    reconciled,
  });
});
