import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * Plano de `reverse-refunded-registration-credit.js`: tirar do caixa do torneio
 * o crédito de um pagamento que o Asaas estornou depois de confirmado.
 *
 * O que não pode acontecer: tirar duas vezes o mesmo crédito (rodar de novo),
 * tirar dinheiro que o organizador já sacou (o caixa ficaria negativo sem
 * ninguém decidir isso) ou mexer num pagamento que nunca creditou o caixa.
 */

const require = createRequire(import.meta.url);
const { planRefundedCreditReversal } = require('../scripts/lib/refunded-credit-reversal.js');

const CREDITED = { kind: 'tournamentRegistration', walletCreditedAt: { seconds: 1 } };
const line = (id, paymentId, netReais, extra = {}) => ({
  id, type: 'credit', asaasPaymentId: paymentId, netReais, grossReais: 200, platformFeeReais: 16, ...extra,
});

describe('planRefundedCreditReversal', () => {
  test('tira do disponível o líquido de cada crédito estornado', () => {
    // Arrange
    const input = {
      wallet: { availableReais: 368, pendingReais: 0 },
      ledgerLines: [line('l1', 'pay_a', 184), line('l2', 'pay_b', 184)],
      processedByPaymentId: { pay_a: CREDITED, pay_b: CREDITED },
      paymentIds: ['pay_a', 'pay_b'],
    };

    // Act
    const plan = planRefundedCreditReversal(input);

    // Assert
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.totalNetReais, 368);
    assert.equal(plan.availableAfterReais, 0);
    assert.deepEqual(plan.reversals.map((r) => [r.paymentId, r.ledgerEntryId, r.netReais]), [
      ['pay_a', 'l1', 184],
      ['pay_b', 'l2', 184],
    ]);
  });

  test('só mexe nos pagamentos pedidos: o resto do caixa fica', () => {
    const plan = planRefundedCreditReversal({
      wallet: { availableReais: 468.4 },
      ledgerLines: [line('l1', 'pay_a', 184), line('l2', 'pay_outro', 284.4)],
      processedByPaymentId: { pay_a: CREDITED },
      paymentIds: ['pay_a'],
    });

    assert.deepEqual(plan.errors, []);
    assert.equal(plan.totalNetReais, 184);
    assert.equal(plan.availableAfterReais, 284.4);
  });

  test('pagamento já revertido é pulado, não revertido de novo', () => {
    const plan = planRefundedCreditReversal({
      wallet: { availableReais: 0 },
      ledgerLines: [],
      processedByPaymentId: { pay_a: { ...CREDITED, walletCreditReversedAt: { seconds: 2 } } },
      paymentIds: ['pay_a'],
    });

    assert.deepEqual(plan.errors, []);
    assert.deepEqual(plan.reversals, []);
    assert.deepEqual(plan.alreadyReversed, ['pay_a']);
    assert.equal(plan.availableAfterReais, 0);
  });

  test('recusa quando o caixa não tem mais o valor disponível', () => {
    const plan = planRefundedCreditReversal({
      wallet: { availableReais: 100, pendingReais: 268 },
      ledgerLines: [line('l1', 'pay_a', 184), line('l2', 'pay_b', 184)],
      processedByPaymentId: { pay_a: CREDITED, pay_b: CREDITED },
      paymentIds: ['pay_a', 'pay_b'],
    });

    assert.equal(plan.errors.length, 1);
    assert.match(plan.errors[0], /dispon[ií]vel/);
  });

  test('recusa pagamento que não creditou o caixa', () => {
    const plan = planRefundedCreditReversal({
      wallet: { availableReais: 368 },
      ledgerLines: [line('l1', 'pay_a', 184)],
      processedByPaymentId: { pay_a: { kind: 'tournamentRegistration' } },
      paymentIds: ['pay_a'],
    });

    assert.match(plan.errors[0], /pay_a/);
    assert.match(plan.errors[0], /n[aã]o creditou/);
  });

  test('recusa pagamento sem registro ou de outro tipo', () => {
    const plan = planRefundedCreditReversal({
      wallet: { availableReais: 368 },
      ledgerLines: [line('l1', 'pay_a', 184), line('l2', 'pay_b', 184)],
      processedByPaymentId: { pay_b: { ...CREDITED, kind: 'arenaBooking' } },
      paymentIds: ['pay_a', 'pay_b'],
    });

    assert.equal(plan.errors.length, 2);
  });

  test('recusa quando o crédito não está no extrato deste caixa', () => {
    const plan = planRefundedCreditReversal({
      wallet: { availableReais: 368 },
      ledgerLines: [line('l1', 'pay_outro', 184)],
      processedByPaymentId: { pay_a: CREDITED },
      paymentIds: ['pay_a'],
    });

    assert.match(plan.errors[0], /extrato/);
  });

  test('recusa crédito duplicado em vez de escolher uma linha', () => {
    const plan = planRefundedCreditReversal({
      wallet: { availableReais: 368 },
      ledgerLines: [line('l1', 'pay_a', 184), line('l2', 'pay_a', 184)],
      processedByPaymentId: { pay_a: CREDITED },
      paymentIds: ['pay_a'],
    });

    assert.match(plan.errors[0], /2 linhas/);
  });

  test('linha que não é crédito não conta como o crédito do pagamento', () => {
    const plan = planRefundedCreditReversal({
      wallet: { availableReais: 368 },
      ledgerLines: [line('l1', 'pay_a', 184, { type: 'withdrawal_transfer_failed' })],
      processedByPaymentId: { pay_a: CREDITED },
      paymentIds: ['pay_a'],
    });

    assert.match(plan.errors[0], /extrato/);
  });

  test('o mesmo pagamento pedido duas vezes conta uma vez só', () => {
    const plan = planRefundedCreditReversal({
      wallet: { availableReais: 184 },
      ledgerLines: [line('l1', 'pay_a', 184)],
      processedByPaymentId: { pay_a: CREDITED },
      paymentIds: ['pay_a', ' pay_a '],
    });

    assert.deepEqual(plan.errors, []);
    assert.equal(plan.totalNetReais, 184);
    assert.equal(plan.reversals.length, 1);
  });

  test('centavos somam sem resíduo de ponto flutuante', () => {
    const plan = planRefundedCreditReversal({
      wallet: { availableReais: 0.3 },
      ledgerLines: [line('l1', 'pay_a', 0.1), line('l2', 'pay_b', 0.2)],
      processedByPaymentId: { pay_a: CREDITED, pay_b: CREDITED },
      paymentIds: ['pay_a', 'pay_b'],
    });

    assert.deepEqual(plan.errors, []);
    assert.equal(plan.totalNetReais, 0.3);
    assert.equal(plan.availableAfterReais, 0);
  });
});
