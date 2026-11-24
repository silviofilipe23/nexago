import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {
  ARENA_FEATURES_UNLOCKED,
  arenaFeatureTier,
  isArenaEntitledPro,
  arenaEntitledTier,
  resolveArenaWithdrawalFeeReais,
} from "./arena-entitlement";

const DAY = 24 * 60 * 60 * 1000;
/** Gates por plano (chave de funções liberadas desligada). */
const LOCKED = false;

describe("arena-entitlement: funções liberadas (fase sem cobrança por plano)", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");

  it("a chave está ligada", () => {
    assert.equal(ARENA_FEATURES_UNLOCKED, true);
  });

  it("toda arena tem as funções Pro, com ou sem plano", () => {
    assert.equal(isArenaEntitledPro({}, now), true);
    assert.equal(isArenaEntitledPro({planStatus: "none", planTier: "pro"}, now), true);
    assert.equal(arenaFeatureTier({}, now), "elite");
  });

  it("taxa e tarifa de saque continuam no plano pago real", () => {
    assert.equal(arenaEntitledTier({}, now), null);
    assert.equal(resolveArenaWithdrawalFeeReais({}, now), 1.75);
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "active", planTier: "pro"}, now), 1.75);
  });

  it("com a chave desligada, segue o plano pago", () => {
    assert.equal(arenaFeatureTier({}, now, LOCKED), null);
    assert.equal(arenaFeatureTier({planStatus: "active", planTier: "pro"}, now, LOCKED), "pro");
  });
});

describe("arena-entitlement.isArenaEntitledPro", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");
  const ts = (ms: number) => Timestamp.fromMillis(ms);

  it("essencial / sem tier nunca é entitled", () => {
    assert.equal(isArenaEntitledPro({planStatus: "active", planTier: "essencial"}, now, LOCKED), false);
    assert.equal(isArenaEntitledPro({planStatus: "active"}, now, LOCKED), false);
  });

  it("active com tier pago é entitled", () => {
    assert.equal(isArenaEntitledPro({planStatus: "active", planTier: "pro"}, now, LOCKED), true);
    assert.equal(isArenaEntitledPro({planStatus: "active", planTier: "parceiro"}, now, LOCKED), true);
  });

  it("overdue: entitled dentro da carência, expira depois", () => {
    const base = {planStatus: "overdue", planTier: "pro"};
    assert.equal(isArenaEntitledPro({...base, planActiveUntil: ts(now - 3 * DAY)}, now, LOCKED), true);
    assert.equal(isArenaEntitledPro({...base, planActiveUntil: ts(now - 8 * DAY)}, now, LOCKED), false);
    assert.equal(isArenaEntitledPro({...base, planActiveUntil: null}, now, LOCKED), false);
  });

  it("canceling: entitled até o fim do período pago", () => {
    const base = {planStatus: "canceling", planTier: "parceiro"};
    assert.equal(isArenaEntitledPro({...base, planActiveUntil: ts(now + DAY)}, now, LOCKED), true);
    assert.equal(isArenaEntitledPro({...base, planActiveUntil: ts(now - 1)}, now, LOCKED), false);
  });

  it("none não é entitled", () => {
    assert.equal(isArenaEntitledPro({planStatus: "none", planTier: "pro"}, now, LOCKED), false);
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

describe("arena-entitlement.resolveArenaWithdrawalFeeReais", () => {
  const now = Date.parse("2026-07-01T12:00:00Z");

  it("elite (e parceiro legado) isento; demais pagam R$1,75", () => {
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "active", planTier: "elite"}, now), 0);
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "active", planTier: "parceiro"}, now), 0);
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "active", planTier: "pro"}, now), 1.75);
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "active", planTier: "starter"}, now), 1.75);
    assert.equal(resolveArenaWithdrawalFeeReais({}, now), 1.75);
  });

  it("elite sem titularidade paga tarifa", () => {
    assert.equal(resolveArenaWithdrawalFeeReais({planStatus: "none", planTier: "elite"}, now), 1.75);
  });
});
