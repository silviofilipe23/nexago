/* eslint-disable */
/**
 * Lógica pura de `backfill-card-awaiting-settlement.js`: quais pagamentos
 * entram e o que fazer com cada um, conforme o status atual no Asaas.
 */

const SETTLED = new Set(['RECEIVED', 'RECEIVED_IN_CASH']);

/** Cartão confirmado, caixa ainda não creditado e sem o "a liberar" somado. */
function isAwaitingSettlementCandidate(processed) {
  return !!processed &&
    processed.kind === 'tournamentRegistration' &&
    processed.outcome === 'approved' &&
    processed.billingType === 'CREDIT_CARD' &&
    processed.confirmedAt != null &&
    processed.walletCreditedAt == null &&
    processed.awaitingSettlement == null;
}

/**
 * - `hold`: ainda `CONFIRMED` → reprocessar soma ao "a liberar".
 * - `credit`: já liquidou e o caixa não foi creditado (RECEIVED perdido) →
 *   reprocessar CREDITA; só com `creditReceived`.
 * - `report_received`: o mesmo caso, sem a opção — só aparece no relatório.
 * - `skip`: qualquer outro status (estorno, chargeback…): não vai liquidar
 *   como previsto, nada a somar.
 */
function awaitingSettlementAction(status, { creditReceived = false } = {}) {
  const s = String(status || '').toUpperCase();
  if (s === 'CONFIRMED') return 'hold';
  if (SETTLED.has(s)) return creditReceived ? 'credit' : 'report_received';
  return 'skip';
}

module.exports = { isAwaitingSettlementCandidate, awaitingSettlementAction };
