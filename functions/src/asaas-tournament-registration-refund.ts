/**
 * Estorno de inscrição DEPOIS que o pagamento creditou o caixa do torneio: o
 * webhook desfaz o crédito sozinho (`reverseTournamentWalletCreditForRefund`).
 * A vaga e a inscrição não são tocadas — isso segue manual.
 */
import {type DocumentReference, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {type AsaasPaymentDetails} from "./asaas-booking-payment";
import {roundMoney} from "./mercadopago-arena-helpers";
import {reverseTournamentWalletCreditForRefund} from "./tournament-wallet";

/**
 * Único status que desfaz o crédito do caixa. `REFUNDED` é o fim da linha: o
 * dinheiro já voltou para o atleta (estorno concluído ou chargeback perdido).
 *
 * `REFUND_REQUESTED` e os de chargeback (`CHARGEBACK_REQUESTED`,
 * `CHARGEBACK_DISPUTE`, `AWAITING_CHARGEBACK_REVERSAL`) ainda podem voltar para
 * `CONFIRMED`/`RECEIVED` — estorno negado, disputa vencida — e não existe volta
 * para o caixa: `walletCreditedAt` fica, então nada creditaria de novo. Quando o
 * desfecho for mesmo o estorno, o Asaas avisa outra vez, já com `REFUNDED`.
 */
const WALLET_CREDIT_REVERSAL_STATUS = "REFUNDED";

/** Assinatura em `walletCreditReversal.by` — o script manual grava a dele. */
export const WEBHOOK_WALLET_REVERSAL_TAG = "webhook:asaas-tournament-registration";

const brl = (reais: number) => `R$ ${reais.toFixed(2)}`;

/**
 * `REFUNDED` cujos estornos somam menos que a cobrança: devolução parcial.
 *
 * A doc do Asaas não diz qual status a cobrança assume depois de um estorno
 * parcial; se vier `REFUNDED`, tirar o líquido inteiro do caixa cobraria do
 * organizador mais do que voltou para o atleta. Sem a lista (ou sem valor
 * legível nela) vale o status: `REFUNDED` é estorno total.
 */
export function isPartialAsaasRefund(payment: AsaasPaymentDetails): boolean {
  const refundedReais = (payment.refunds ?? [])
    .filter((refund) => (refund.status || "").toUpperCase() !== "CANCELLED")
    .map((refund) => Number(refund.value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((sum, value) => sum + value, 0);
  if (refundedReais <= 0) return false;
  return roundMoney(refundedReais) < roundMoney(Number(payment.value) || 0);
}

/**
 * Desfaz o crédito do caixa quando o status pede e devolve, em uma frase, o que
 * aconteceu com o caixa — para o log de quem vai cuidar da vaga. Nunca lança:
 * falha aqui não pode derrubar o resto do webhook.
 */
export async function reverseWalletCreditOfRefundedPayment(
  db: Firestore,
  processedRef: DocumentReference,
  params: {tournamentId: string; paymentId: string; status: string; payment: AsaasPaymentDetails},
): Promise<string> {
  const {tournamentId, paymentId} = params;
  if (params.status !== WALLET_CREDIT_REVERSAL_STATUS) {
    return "caixa segue como está (só REFUNDED desfaz o crédito)";
  }
  if (isPartialAsaasRefund(params.payment)) {
    return "estorno PARCIAL: crédito do caixa NÃO desfeito, acertar à mão";
  }

  try {
    const outcome = await reverseTournamentWalletCreditForRefund(db, processedRef, {
      tournamentId,
      paymentId,
      reason: params.status,
      by: WEBHOOK_WALLET_REVERSAL_TAG,
    });
    if (outcome.status === "reversed") {
      const debt = outcome.availableAfterReais < 0 ?
        " — caixa NEGATIVO: o organizador já tinha sacado, os próximos créditos abatem" :
        "";
      return `crédito de ${brl(outcome.netReais)} tirado do caixa ${tournamentId} ` +
        `(disponível agora ${brl(outcome.availableAfterReais)})${debt}`;
    }
    switch (outcome.reason) {
    case "already_reversed":
      return "crédito do caixa já tinha sido desfeito";
    case "not_credited":
      return "pagamento sem crédito marcado no caixa (walletCreditedAt): caixa não mexido";
    case "ledger_line_missing":
      return `crédito NÃO desfeito: a linha do pagamento não está no extrato do caixa ${tournamentId}, conferir à mão`;
    case "ledger_line_duplicated":
      return `crédito NÃO desfeito: mais de uma linha do pagamento no extrato do caixa ${tournamentId}, conferir à mão`;
    }
  } catch (reversalErr) {
    logger.error(
      `Asaas tournament registration: falha ao desfazer o crédito de ${paymentId} no caixa ${tournamentId}`,
      reversalErr,
    );
    return "crédito do caixa NÃO desfeito (falha), conferir à mão";
  }
}
