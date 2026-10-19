import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * Seleção do backfill do "a liberar": só cartão confirmado que ainda não
 * creditou o caixa e não tem o marcador. Pegar a mais (um já creditado) faria
 * o reprocessamento não achar nada a fazer; pegar a menos deixa o organizador
 * sem ver o dinheiro a caminho.
 */

const require = createRequire(import.meta.url);
const {
  isAwaitingSettlementCandidate,
  awaitingSettlementAction,
} = require('../scripts/lib/card-awaiting-settlement.js');

const CONFIRMED_CARD = {
  kind: 'tournamentRegistration',
  outcome: 'approved',
  billingType: 'CREDIT_CARD',
  confirmedAt: { seconds: 1 },
};

describe('isAwaitingSettlementCandidate', () => {
  test('cartão confirmado, sem crédito e sem marcador entra', () => {
    assert.equal(isAwaitingSettlementCandidate(CONFIRMED_CARD), true);
  });

  test('já creditado fica de fora', () => {
    assert.equal(isAwaitingSettlementCandidate({ ...CONFIRMED_CARD, walletCreditedAt: { seconds: 2 } }), false);
  });

  test('já somado fica de fora (rodar de novo não soma duas vezes)', () => {
    assert.equal(
      isAwaitingSettlementCandidate({ ...CONFIRMED_CARD, awaitingSettlement: { tournamentId: 't1', netReais: 88.71 } }),
      false,
    );
  });

  test('PIX, recusado, duplicado e acervo sem confirmedAt ficam de fora', () => {
    assert.equal(isAwaitingSettlementCandidate({ ...CONFIRMED_CARD, billingType: 'PIX' }), false);
    assert.equal(isAwaitingSettlementCandidate({ ...CONFIRMED_CARD, outcome: 'rejected' }), false);
    assert.equal(isAwaitingSettlementCandidate({ ...CONFIRMED_CARD, outcome: 'duplicate_payer' }), false);
    assert.equal(isAwaitingSettlementCandidate({ ...CONFIRMED_CARD, confirmedAt: undefined }), false);
    assert.equal(isAwaitingSettlementCandidate({ ...CONFIRMED_CARD, kind: 'booking' }), false);
    assert.equal(isAwaitingSettlementCandidate(undefined), false);
  });
});

describe('awaitingSettlementAction', () => {
  test('ainda CONFIRMED soma ao a liberar', () => {
    assert.equal(awaitingSettlementAction('CONFIRMED'), 'hold');
    assert.equal(awaitingSettlementAction('confirmed'), 'hold');
  });

  test('RECEIVED perdido só credita com a opção explícita', () => {
    assert.equal(awaitingSettlementAction('RECEIVED'), 'report_received');
    assert.equal(awaitingSettlementAction('RECEIVED', { creditReceived: true }), 'credit');
    assert.equal(awaitingSettlementAction('RECEIVED_IN_CASH', { creditReceived: true }), 'credit');
  });

  test('estorno e chargeback não somam', () => {
    for (const s of ['REFUNDED', 'CHARGEBACK_REQUESTED', 'REFUND_REQUESTED', '']) {
      assert.equal(awaitingSettlementAction(s, { creditReceived: true }), 'skip');
    }
  });
});
