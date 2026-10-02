import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/** Números do cashback para o dono: passivo atual e movimento do período. */

const require = createRequire(import.meta.url);
const { summarizeCashback } = require('../scripts/lib/cashback-report.js');

describe('summarizeCashback', () => {
  test('soma o passivo atual e o movimento do período por tipo', () => {
    const summary = summarizeCashback([
      {
        wallet: { availableCents: 500, pendingCents: 240, heldCents: 100, lifetimeEarnedCents: 900, lifetimeRedeemedCents: 300 },
        ledger: [
          { type: 'earn', amountCents: 240, createdAtMs: 2000 },
          { type: 'redeem', amountCents: 300, createdAtMs: 2500 },
          { type: 'expire', amountCents: 50, createdAtMs: 500 },
        ],
      },
      {
        wallet: { availableCents: 1000, pendingCents: 0, heldCents: 0, lifetimeEarnedCents: 1000, lifetimeRedeemedCents: 0 },
        ledger: [{ type: 'release', amountCents: 1000, createdAtMs: 1500 }],
      },
    ], { fromMs: 1000, toMs: 3000 });

    assert.equal(summary.wallets, 2);
    assert.equal(summary.liabilityCents, 1840);
    assert.deepEqual(summary.current, { availableCents: 1500, pendingCents: 240, heldCents: 100 });
    assert.deepEqual(summary.lifetime, { earnedCents: 1900, redeemedCents: 300 });
    assert.equal(summary.period.earn, 240);
    assert.equal(summary.period.redeem, 300);
    assert.equal(summary.period.release, 1000);
    assert.equal(summary.period.expire, 0);
  });
});
