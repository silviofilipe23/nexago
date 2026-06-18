import {test} from "node:test";
import assert from "node:assert";
import {
  canCancelTournament,
  countPaidRegistrations,
} from "./tournament-cancellation";

test("countPaidRegistrations counts only paid, non-waitlisted", () => {
  const count = countPaidRegistrations([
    {isPaid: true},
    {isPaid: true, waitlist: false},
    {isPaid: true, waitlist: true}, // fila não conta
    {isPaid: false}, // pendente não conta
    {}, // sem dados não conta
  ]);
  assert.equal(count, 2);
});

test("canCancelTournament allows free cancel with no paid registrations", () => {
  assert.equal(canCancelTournament({paidCount: 0, force: false}), true);
});

test("canCancelTournament blocks paid cancel without force", () => {
  assert.equal(canCancelTournament({paidCount: 3, force: false}), false);
});

test("canCancelTournament allows paid cancel with explicit force", () => {
  assert.equal(canCancelTournament({paidCount: 3, force: true}), true);
});
