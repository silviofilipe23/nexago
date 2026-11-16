/* eslint-disable */
/**
 * Lógica pura de `reverse-refunded-registration-credit.js`: o que tirar do caixa
 * do torneio quando o Asaas estorna um pagamento que já tinha creditado.
 *
 * Devolve um plano; quem lê e grava é o script, numa transação só.
 */

const EPSILON_REAIS = 0.001;
const round = (v) => Math.round((Number(v) || 0) * 100) / 100;
const brl = (v) => `R$ ${round(v).toFixed(2)}`;

function uniquePaymentIds(paymentIds) {
  return [...new Set((paymentIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

/** Por que este pagamento não pode ser revertido — `null` quando pode. */
function processedProblem(paymentId, processed) {
  if (!processed) return `${paymentId}: sem registro em asaas_processed_payments`;
  if (processed.kind !== 'tournamentRegistration') {
    return `${paymentId}: não é inscrição de torneio (kind=${processed.kind})`;
  }
  if (processed.walletCreditedAt == null) return `${paymentId}: não creditou o caixa (sem walletCreditedAt)`;
  return null;
}

/**
 * @param {{
 *   wallet: { availableReais?: number } | undefined,
 *   ledgerLines: Array<{ id: string, type?: string, asaasPaymentId?: string, netReais?: number }>,
 *   processedByPaymentId: Record<string, object | undefined>,
 *   paymentIds: string[],
 * }} input
 * @returns {{
 *   errors: string[],
 *   reversals: Array<{ paymentId: string, ledgerEntryId: string, netReais: number, ledgerEntry: object }>,
 *   alreadyReversed: string[],
 *   totalNetReais: number,
 *   availableBeforeReais: number,
 *   availableAfterReais: number,
 * }}
 */
function planRefundedCreditReversal({ wallet, ledgerLines, processedByPaymentId, paymentIds }) {
  const errors = [];
  const reversals = [];
  const alreadyReversed = [];
  const availableBeforeReais = round(wallet && wallet.availableReais);

  for (const paymentId of uniquePaymentIds(paymentIds)) {
    const processed = (processedByPaymentId || {})[paymentId];
    if (processed && processed.walletCreditReversedAt != null) {
      alreadyReversed.push(paymentId);
      continue;
    }
    const problem = processedProblem(paymentId, processed);
    if (problem) {
      errors.push(problem);
      continue;
    }
    const credits = (ledgerLines || []).filter((l) => l.type === 'credit' && l.asaasPaymentId === paymentId);
    if (credits.length !== 1) {
      errors.push(
        credits.length === 0 ?
          `${paymentId}: crédito não está no extrato deste caixa` :
          `${paymentId}: ${credits.length} linhas de crédito no extrato — conferir à mão`,
      );
      continue;
    }
    const { id, ...ledgerEntry } = credits[0];
    reversals.push({ paymentId, ledgerEntryId: id, netReais: round(ledgerEntry.netReais), ledgerEntry });
  }

  const totalNetReais = round(reversals.reduce((sum, r) => sum + r.netReais, 0));
  if (totalNetReais > availableBeforeReais + EPSILON_REAIS) {
    errors.push(
      `o caixa só tem ${brl(availableBeforeReais)} disponível (< ${brl(totalNetReais)}): ` +
      'parte já foi sacada ou está reservada — decidir à mão',
    );
  }

  return {
    errors,
    reversals,
    alreadyReversed,
    totalNetReais,
    availableBeforeReais,
    availableAfterReais: round(Math.max(0, availableBeforeReais - totalNetReais)),
  };
}

module.exports = { planRefundedCreditReversal };
