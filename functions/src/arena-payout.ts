/**
 * Repasse PIX de saques de arena — implementação Asaas.
 * @deprecated Importe de `./asaas-payout` em código novo.
 */
export {
  AsaasPayoutError,
  inferPixKeyType,
  sendArenaWithdrawalPixTransfer as sendArenaWithdrawalPixPayout,
  type PayoutSendResult,
} from "./asaas-payout";
