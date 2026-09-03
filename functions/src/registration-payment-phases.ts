/**
 * Quais fases um evento de pagamento de inscrição dispara.
 *
 * No PIX as duas fases sempre andam juntas na liquidação. No cartão elas se
 * separam no tempo: a autorização (`CONFIRMED`) garante a vaga do atleta na
 * hora, mas o dinheiro só chega à plataforma na liquidação (`RECEIVED`,
 * ~D+30) — e a carteira do organizador só pode ser creditada quando o dinheiro
 * existe, senão a plataforma financia o repasse.
 */

export type RegistrationBillingType = "PIX" | "CREDIT_CARD";

/**
 * Só cartão é tratado à parte; qualquer outra coisa (inclusive campo ausente
 * no acervo inteiro) segue o caminho histórico do PIX.
 */
export function parseRegistrationBillingType(
  raw: unknown,
): RegistrationBillingType {
  return raw === "CREDIT_CARD" ? "CREDIT_CARD" : "PIX";
}

export interface PaymentPhaseInput {
  billingType: RegistrationBillingType;
  status: string;
  alreadyConfirmed: boolean;
  alreadyCredited: boolean;
}

export interface PaymentPhases {
  /** Confirmar a inscrição, cancelar as cobranças abertas e notificar. */
  confirm: boolean;
  /** Creditar a carteira do organizador. */
  credit: boolean;
}

const SETTLED_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH"]);

export function resolvePaymentPhases(input: PaymentPhaseInput): PaymentPhases {
  const status = input.status.toUpperCase();
  const settled = SETTLED_STATUSES.has(status);
  const cardAuthorized =
    input.billingType === "CREDIT_CARD" && status === "CONFIRMED";

  if (!settled && !cardAuthorized) {
    return {confirm: false, credit: false};
  }

  return {
    confirm: !input.alreadyConfirmed,
    credit: settled && !input.alreadyCredited,
  };
}
