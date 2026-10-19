/**
 * Taxa que o gateway cobrou numa cobrança, para repassar a quem recebe
 * (organizador na inscrição, arena na reserva).
 *
 * Sai do próprio pagamento (`value − netValue`) em vez de uma alíquota fixa no
 * código, que envelheceria calada a cada renegociação com o Asaas. Só vale
 * para cartão: no PIX a plataforma absorve o custo, como sempre absorveu.
 */
import * as logger from "firebase-functions/logger";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";
import {roundMoney} from "./mercadopago-arena-helpers";
import type {RegistrationBillingType} from "./registration-payment-phases";

export function resolveGatewayFeeReais(
  payment: AsaasPaymentDetails,
  billingType: RegistrationBillingType,
  grossReais: number,
): number {
  if (billingType !== "CREDIT_CARD") return 0;
  const net = Number(payment.netValue);
  if (!Number.isFinite(net) || net <= 0 || net > grossReais) {
    logger.error(
      "Asaas: netValue ausente/inválido no cartão — creditando sem descontar a taxa do gateway",
      {paymentId: payment.id, value: grossReais, netValue: payment.netValue},
    );
    return 0;
  }
  return roundMoney(grossReais - net);
}
