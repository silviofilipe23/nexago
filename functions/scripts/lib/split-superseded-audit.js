/* eslint-disable */
/**
 * Lógica pura de `audit-split-superseded-charges.js`: de qual cobrança da reserva
 * inteira (a "original") cada reserva dividida veio, e o que aconteceu com ela.
 */

/** A original: `asaasPaymentId` nas divisões antigas, a última de `supersededAsaasPaymentIds` nas corrigidas. */
function originalPaymentIdOf(booking) {
  if (typeof booking.asaasPaymentId === 'string' && booking.asaasPaymentId.trim()) {
    return booking.asaasPaymentId.trim();
  }
  const superseded = Array.isArray(booking.supersededAsaasPaymentIds) ?
    booking.supersededAsaasPaymentIds.filter((v) => typeof v === 'string' && v.trim()) :
    [];
  return superseded.length ? superseded[superseded.length - 1].trim() : null;
}

function classifySplitBooking({ booking, originalPaymentId, originalProcessed }) {
  if (!originalPaymentId) return 'clean';
  const outcome = originalProcessed ? originalProcessed.outcome : null;
  if (outcome === 'approved') return 'double_paid';
  if (outcome === 'stale_charge_after_split') return 'stale_paid_refund_required';
  if (outcome === 'rejected' && String(booking.status || '').toLowerCase() === 'cancelled') {
    return 'cancelled_by_stale_charge';
  }
  const legacy = typeof booking.asaasPaymentId === 'string' && booking.asaasPaymentId.trim() !== '';
  return legacy ? 'legacy_original_open' : 'superseded_ok';
}

module.exports = { classifySplitBooking, originalPaymentIdOf };
