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
  /**
   * O líquido deste cartão já está no "a liberar" do caixa (marcador
   * `awaitingSettlement` no doc processado). Ausente = não está.
   */
  alreadyAwaitingSettlement?: boolean;
  /**
   * O Asaas creditou a antecipação deste cartão (`RECEIVABLE_ANTICIPATION_CREDITED`): o dinheiro já
   * está na conta da plataforma antes da liquidação, então o caixa pode ser creditado.
   */
  anticipationCredited?: boolean;
}

export interface PaymentPhases {
  /** Confirmar a inscrição, cancelar as cobranças abertas e notificar. */
  confirm: boolean;
  /** Creditar a carteira do organizador. */
  credit: boolean;
  /**
   * Somar o líquido previsto ao "a liberar" do caixa: cartão aprovado cujo
   * dinheiro ainda não liquidou. Também vale numa reentrega do `CONFIRMED`
   * sem o marcador — é assim que o backfill preenche o acervo anterior.
   */
  awaitSettlement: boolean;
}

const SETTLED_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH"]);

export function resolvePaymentPhases(input: PaymentPhaseInput): PaymentPhases {
  const status = input.status.toUpperCase();
  const cardAuthorized =
    input.billingType === "CREDIT_CARD" && status === "CONFIRMED";
  const settled = SETTLED_STATUSES.has(status) ||
    (cardAuthorized && input.anticipationCredited === true);

  if (!settled && !cardAuthorized) {
    return {confirm: false, credit: false, awaitSettlement: false};
  }

  return {
    confirm: !input.alreadyConfirmed,
    credit: settled && !input.alreadyCredited,
    awaitSettlement: cardAuthorized && !settled && !input.alreadyCredited &&
      input.alreadyAwaitingSettlement !== true,
  };
}
