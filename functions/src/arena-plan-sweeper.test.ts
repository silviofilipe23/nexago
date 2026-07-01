import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {isEntitlementLapsed} from "./arena-plan-sweeper";

const DAY = 24 * 60 * 60 * 1000;

describe("arena-plan-sweeper.isEntitlementLapsed", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");
  const ts = (ms: number) => Timestamp.fromMillis(ms);

  it("overdue: entitled dentro da carência de 7 dias", () => {
    assert.equal(isEntitlementLapsed("overdue", ts(now - 3 * DAY), now), false);
  });

  it("overdue: expira após 7 dias do vencimento", () => {
    assert.equal(isEntitlementLapsed("overdue", ts(now - 8 * DAY), now), true);
  });

  it("overdue: exatamente na borda dos 7 dias já expirou", () => {
    assert.equal(isEntitlementLapsed("overdue", ts(now - 7 * DAY), now), true);
  });

  it("canceling: entitled até o fim do período pago", () => {
    assert.equal(isEntitlementLapsed("canceling", ts(now + DAY), now), false);
  });

  it("canceling: expira quando passa o período pago", () => {
    assert.equal(isEntitlementLapsed("canceling", ts(now - 1), now), true);
  });

  it("activeUntil ausente conta como expirado", () => {
    assert.equal(isEntitlementLapsed("overdue", null, now), true);
    assert.equal(isEntitlementLapsed("canceling", null, now), true);
  });

  it("outros status nunca são finalizados por aqui", () => {
    assert.equal(isEntitlementLapsed("active", ts(now - 30 * DAY), now), false);
    assert.equal(isEntitlementLapsed("none", null, now), false);
  });
});
