import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {isArenaEntitledPro, arenaEntitledTier, resolveArenaBookingFeePercent} from "./arena-entitlement";

const DAY = 24 * 60 * 60 * 1000;

describe("arena-entitlement.isArenaEntitledPro", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");
  const ts = (ms: number) => Timestamp.fromMillis(ms);

  it("essencial / sem tier nunca é entitled", () => {
    assert.equal(isArenaEntitledPro({planStatus: "active", planTier: "essencial"}, now), false);
    assert.equal(isArenaEntitledPro({planStatus: "active"}, now), false);
  });

  it("active com tier pago é entitled", () => {
    assert.equal(isArenaEntitledPro({planStatus: "active", planTier: "pro"}, now), true);
    assert.equal(isArenaEntitledPro({planStatus: "active", planTier: "parceiro"}, now), true);
  });

  it("overdue: entitled dentro da carência, expira depois", () => {
    const base = {planStatus: "overdue", planTier: "pro"};
    assert.equal(isArenaEntitledPro({...base, planActiveUntil: ts(now - 3 * DAY)}, now), true);
    assert.equal(isArenaEntitledPro({...base, planActiveUntil: ts(now - 8 * DAY)}, now), false);
    assert.equal(isArenaEntitledPro({...base, planActiveUntil: null}, now), false);
  });

  it("canceling: entitled até o fim do período pago", () => {
    const base = {planStatus: "canceling", planTier: "parceiro"};
    assert.equal(isArenaEntitledPro({...base, planActiveUntil: ts(now + DAY)}, now), true);
    assert.equal(isArenaEntitledPro({...base, planActiveUntil: ts(now - 1)}, now), false);
  });

  it("none não é entitled", () => {
    assert.equal(isArenaEntitledPro({planStatus: "none", planTier: "pro"}, now), false);
  });
});

describe("arena-entitlement.arenaEntitledTier", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");
  const ts = (ms: number) => Timestamp.fromMillis(ms);

  it("normaliza legados: parceiro ativo -> elite; essencial -> null", () => {
    assert.equal(arenaEntitledTier({planStatus: "active", planTier: "parceiro"}, now), "elite");
    assert.equal(arenaEntitledTier({planStatus: "active", planTier: "essencial"}, now), null);
  });

  it("tiers novos titulares", () => {
    assert.equal(arenaEntitledTier({planStatus: "active", planTier: "starter"}, now), "starter");
    assert.equal(arenaEntitledTier({planStatus: "active", planTier: "elite"}, now), "elite");
  });

  it("sem titularidade -> null (overdue fora da carência)", () => {
    assert.equal(
      arenaEntitledTier(
        {planStatus: "overdue", planTier: "pro", planActiveUntil: ts(now - 8 * DAY)},
        now,
      ),
      null,
    );
  });
});

describe("arena-entitlement.resolveArenaBookingFeePercent", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");

  it("8/6/5 por tier titular", () => {
    assert.equal(resolveArenaBookingFeePercent({planStatus: "active", planTier: "starter"}, now), 8);
    assert.equal(resolveArenaBookingFeePercent({planStatus: "active", planTier: "pro"}, now), 6);
    assert.equal(resolveArenaBookingFeePercent({planStatus: "active", planTier: "elite"}, now), 5);
    assert.equal(resolveArenaBookingFeePercent({planStatus: "active", planTier: "parceiro"}, now), 5);
  });

  it("sem plano / sem titularidade -> 8%", () => {
    assert.equal(resolveArenaBookingFeePercent({}, now), 8);
    assert.equal(resolveArenaBookingFeePercent({planStatus: "none", planTier: "pro"}, now), 8);
    assert.equal(resolveArenaBookingFeePercent({planStatus: "active", planTier: "essencial"}, now), 8);
  });
});
