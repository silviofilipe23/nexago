/* eslint-disable */
/** Lógica pura de `cashback-report.js`: passivo atual e movimento do período. */

const LEDGER_TYPES = ['earn', 'release', 'cancel', 'redeem', 'expire', 'reverse', 'refund'];

function summarizeCashback(wallets, { fromMs, toMs }) {
  const current = { availableCents: 0, pendingCents: 0, heldCents: 0 };
  const lifetime = { earnedCents: 0, redeemedCents: 0 };
  const period = Object.fromEntries(LEDGER_TYPES.map((t) => [t, 0]));
  for (const { wallet, ledger } of wallets) {
    current.availableCents += Number(wallet.availableCents) || 0;
    current.pendingCents += Number(wallet.pendingCents) || 0;
    current.heldCents += Number(wallet.heldCents) || 0;
    lifetime.earnedCents += Number(wallet.lifetimeEarnedCents) || 0;
    lifetime.redeemedCents += Number(wallet.lifetimeRedeemedCents) || 0;
    for (const entry of ledger) {
      if (entry.createdAtMs < fromMs || entry.createdAtMs >= toMs) continue;
      if (!(entry.type in period)) continue;
      period[entry.type] += Number(entry.amountCents) || 0;
    }
  }
  return {
    wallets: wallets.length,
    liabilityCents: current.availableCents + current.pendingCents + current.heldCents,
    current,
    lifetime,
    period,
  };
}

module.exports = { summarizeCashback };
