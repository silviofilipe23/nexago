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
 */

import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {FieldValue, Timestamp, getFirestore} from "firebase-admin/firestore";
import {asaasArenaSecrets} from "./asaas-client";
import {deleteAsaasPaymentOrThrow, getAsaasPayment} from "./asaas-booking-payment";
import {parseRegistrationBillingType} from "./registration-payment-phases";

/** Teto por volta: a cadência de 1 minuto dá vazão de sobra para o pico. */
const SWEEP_BATCH_SIZE = 100;

/** Marca de quem morreu de velho, e não por pagamento ou cancelamento. */
export const PIX_CANCELLED_EXPIRED = "expired";

/**
 * Cartão que já saiu do "aberto" no gateway: deletar aqui destruiria pagamento
 * em voo — o atleta digitou o cartão e o webhook ainda não chegou. O webhook
 * resolve em minutos; a varredura só precisa não atrapalhar.
 */
const CARD_IN_FLIGHT_STATUSES = new Set([
  "CONFIRMED",
  "RECEIVED",
  "RECEIVED_IN_CASH",
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
  /** Status atual da cobrança no gateway. Consultado SÓ para cartão. */
  resolveChargeStatus?: (asaasPaymentId: string) => Promise<string>;
}): Promise<{expired: number; failed: number}> {
  let expired = 0;
  let failed = 0;

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

  return {expired, failed};
}

export const expireOpenTournamentRegistrationPixCharges = onSchedule({
  schedule: "every 1 minutes",
  secrets: [...asaasArenaSecrets],
}, async () => {
  const db = getFirestore();
  const now = Timestamp.now();

  const snap = await db
    .collectionGroup("pixPending")
    .where("status", "==", "pending")
    .where("paymentExpiresAt", "<", now)
    .limit(SWEEP_BATCH_SIZE)
    .get();

  const {expired, failed} = await expireOpenPixCharges({
    docs: snap.docs,
    nowMs: now.toMillis(),
    cancelCharge: deleteAsaasPaymentOrThrow,
    resolveChargeStatus: async (id) => (await getAsaasPayment(id)).status ?? "",
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
  });
});
