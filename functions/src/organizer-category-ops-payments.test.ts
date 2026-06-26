import assert from "node:assert/strict";
import {test} from "node:test";

import {
  ORGANIZER_DIRECT_PAYMENT_METHOD,
  organizerDirectConfirmPaidAmount,
} from "./organizer-category-ops-payments";

test("organizerDirectConfirmPaidAmount returns entry fee in reais", () => {
  assert.equal(organizerDirectConfirmPaidAmount(160), 160);
  assert.equal(organizerDirectConfirmPaidAmount(99.5), 99.5);
});

test("organizerDirectConfirmPaidAmount rejects non-positive fees", () => {
  assert.equal(organizerDirectConfirmPaidAmount(0), null);
  assert.equal(organizerDirectConfirmPaidAmount(-10), null);
});

test("organizer direct payment method constant", () => {
  assert.equal(ORGANIZER_DIRECT_PAYMENT_METHOD, "organizer_direct");
});
