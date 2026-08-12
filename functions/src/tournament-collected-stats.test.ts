import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
  categoryEntryFeeCents,
  computeTournamentCollectedStats,
  confirmedInscriptionPayment,
  inscriptionPaidAmountCents,
  isAwaitingOrganizerVerification,
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

  it("computeTournamentCollectedStats sums paid inscriptions across categories", () => {
    const tournament = {
      categories: [
        {id: "cat-a", entryFeeCents: 10000},
        {id: "cat-b", entryFee: 50},
      ],
    };
    const stats = computeTournamentCollectedStats(tournament, [
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
    assert.equal(stats.totalCents, 15000);
    assert.equal(stats.viaAppCents, 5000);
    assert.equal(stats.viaOrganizerCents, 10000);
    assert.equal(stats.toVerifyCents, 0);
  });

  it("isAwaitingOrganizerVerification mirrors the 'A conferir' badge anchor", () => {
    // Sem `declaredPaidAt`: inscrição direta ANTERIOR ao fluxo de declaração não entra
    // retroativamente na fila de conferência.
    assert.equal(isAwaitingOrganizerVerification({isPaid: true}), false);
    assert.equal(
      isAwaitingOrganizerVerification({declaredPaidAt: "2026-08-01"}),
      true,
    );
    assert.equal(
      isAwaitingOrganizerVerification({
        declaredPaidAt: "2026-08-01",
        paymentVerifiedByOrganizer: true,
      }),
      false,
    );
  });

  it("computeTournamentCollectedStats separa declarado de conferido no canal direto", () => {
    const tournament = {categories: [{id: "cat-a", entryFeeCents: 10000}]};
    const stats = computeTournamentCollectedStats(tournament, [
      // Declarou e ninguém conferiu: entra no total e no "a conferir".
      {categoryId: "cat-a", isPaid: true, declaredPaidAt: "2026-08-01"},
      // Organizador deu baixa: direto, mas já conferido.
      {
        categoryId: "cat-a",
        isPaid: true,
        paidAmount: 100,
        paymentMethod: ORGANIZER_DIRECT_PAYMENT_METHOD,
        declaredPaidAt: "2026-08-01",
        paymentVerifiedByOrganizer: true,
      },
    ]);
    assert.equal(stats.totalCents, 20000);
    assert.equal(stats.viaAppCents, 0);
    assert.equal(stats.viaOrganizerCents, 20000);
    assert.equal(stats.toVerifyCents, 10000);
  });

  it("baixa manual em torneio 'pelo app' conta como por fora", () => {
    // O caso que o recorte pelo `paymentMode` do wizard erraria: o torneio cobra pelo app, mas
    // esta dupla pagou na mão do organizador.
    const tournament = {categories: [{id: "cat-a", entryFeeCents: 10000}]};
    const stats = computeTournamentCollectedStats(tournament, [
      {categoryId: "cat-a", isPaid: true, paidAmount: 100},
      {
        categoryId: "cat-a",
        isPaid: true,
        paidAmount: 100,
        paymentMethod: ORGANIZER_DIRECT_PAYMENT_METHOD,
      },
    ]);
    assert.equal(stats.viaAppCents, 10000);
    assert.equal(stats.viaOrganizerCents, 10000);
  });
});
