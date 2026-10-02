import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * Classificação das reservas divididas pelo destino da cobrança da reserva inteira.
 * É o que diz ao dono quem pagou em dobro (estorno) e quem teve a reserva dividida
 * cancelada pelo vencimento do PIX antigo — antes de qualquer decisão de reembolso.
 */

const require = createRequire(import.meta.url);
const { classifySplitBooking, originalPaymentIdOf } = require('../scripts/lib/split-superseded-audit.js');

describe('originalPaymentIdOf', () => {
  test('divisão antiga: a original ficou em asaasPaymentId', () => {
    assert.equal(originalPaymentIdOf({ asaasPaymentId: ' orig1 ' }), 'orig1');
  });

  test('divisão corrigida: a original está em supersededAsaasPaymentIds (a última)', () => {
    assert.equal(
      originalPaymentIdOf({ asaasPaymentId: null, supersededAsaasPaymentIds: ['old', 'orig2'] }),
      'orig2',
    );
  });

  test('sem cobrança da reserva inteira', () => {
    assert.equal(originalPaymentIdOf({}), null);
  });
});

describe('classifySplitBooking', () => {
  test('clean: divisão sem PIX prévio', () => {
    assert.equal(classifySplitBooking({ booking: {}, originalPaymentId: null, originalProcessed: null }), 'clean');
  });

  test('double_paid: a original foi aprovada pelo webhook antigo', () => {
    assert.equal(
      classifySplitBooking({
        booking: { asaasPaymentId: 'orig1', status: 'confirmed' },
        originalPaymentId: 'orig1',
        originalProcessed: { outcome: 'approved' },
      }),
      'double_paid',
    );
  });

  test('stale_paid_refund_required: a guarda nova pegou o pagamento', () => {
    assert.equal(
      classifySplitBooking({
        booking: { asaasPaymentId: null, supersededAsaasPaymentIds: ['orig1'] },
        originalPaymentId: 'orig1',
        originalProcessed: { outcome: 'stale_charge_after_split' },
      }),
      'stale_paid_refund_required',
    );
  });

  test('cancelled_by_stale_charge: o vencimento da original cancelou a reserva dividida', () => {
    assert.equal(
      classifySplitBooking({
        booking: { asaasPaymentId: 'orig1', status: 'cancelled' },
        originalPaymentId: 'orig1',
        originalProcessed: { outcome: 'rejected' },
      }),
      'cancelled_by_stale_charge',
    );
  });

  test('legacy_original_open: divisão antiga, original sem desfecho registrado', () => {
    assert.equal(
      classifySplitBooking({
        booking: { asaasPaymentId: 'orig1', status: 'confirmed' },
        originalPaymentId: 'orig1',
        originalProcessed: null,
      }),
      'legacy_original_open',
    );
  });

  test('superseded_ok: divisão corrigida, original cancelada sem pagamento', () => {
    assert.equal(
      classifySplitBooking({
        booking: { asaasPaymentId: null, supersededAsaasPaymentIds: ['orig1'], status: 'confirmed' },
        originalPaymentId: 'orig1',
        originalProcessed: null,
      }),
      'superseded_ok',
    );
  });
});
