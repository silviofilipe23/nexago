import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
  categoryEntryFeeCents,
  computeTournamentCollectedCents,
  confirmedInscriptionPayment,
  inscriptionPaidAmountCents,
} from "./tournament-collected-stats";
import {ORGANIZER_DIRECT_PAYMENT_METHOD} from "./organizer-category-ops-payments";

describe("tournament-collected-stats", () => {
  it("inscriptionPaidAmountCents converts reais to cents", () => {
    assert.equal(inscriptionPaidAmountCents(100), 10000);
    assert.equal(inscriptionPaidAmountCents(0), 0);
    assert.equal(inscriptionPaidAmountCents("x"), 0);
  });

  it("categoryEntryFeeCents prefers entryFeeCents", () => {
    assert.equal(categoryEntryFeeCents({entryFeeCents: 15000}), 15000);
    assert.equal(categoryEntryFeeCents({entryFee: 120}), 12000);
  });

  it("confirmedInscriptionPayment mirrors organizer app logic", () => {
    assert.equal(
      confirmedInscriptionPayment({
        inscription: {isPaid: true, waitlist: true},
        entryFeeCents: 10000,
      }),
      null,
    );

    const direct = confirmedInscriptionPayment({
      inscription: {
        isPaid: true,
        paidAmount: 100,
        paymentMethod: ORGANIZER_DIRECT_PAYMENT_METHOD,
      },
      entryFeeCents: 10000,
    });
    assert.deepEqual(direct, {channel: "viaOrganizer", cents: 10000});

    const app = confirmedInscriptionPayment({
      inscription: {isPaid: true, paidAmount: 80},
      entryFeeCents: 10000,
    });
    assert.deepEqual(app, {channel: "viaApp", cents: 8000});
  });

  it("computeTournamentCollectedCents sums paid inscriptions across categories", () => {
    const tournament = {
      categories: [
        {id: "cat-a", entryFeeCents: 10000},
        {id: "cat-b", entryFee: 50},
      ],
    };
    const total = computeTournamentCollectedCents(tournament, [
      {
        categoryId: "cat-a",
        isPaid: true,
        paidAmount: 100,
        paymentMethod: ORGANIZER_DIRECT_PAYMENT_METHOD,
      },
      {categoryId: "cat-b", isPaid: true, paidAmount: 50},
      {categoryId: "cat-a", isPaid: false},
      {categoryId: "cat-a", isPaid: true, waitlist: true, paidAmount: 100},
    ]);
    assert.equal(total, 15000);
  });
});
