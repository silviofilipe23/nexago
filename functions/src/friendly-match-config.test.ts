import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FRIENDLY_MATCH_CONFIG,
  loadFriendlyMatchConfig,
  parseFriendlyMatchConfig,
} from "./friendly-match-config";
import {FakeFirestore} from "./fake-firestore.test-helper";
import type {Firestore} from "firebase-admin/firestore";

describe("parseFriendlyMatchConfig", () => {
  it("retorna os defaults quando o raw é nulo/indefinido/vazio", () => {
    for (const raw of [undefined, null, {}]) {
      const config = parseFriendlyMatchConfig(raw);
      assert.deepEqual(config, DEFAULT_FRIENDLY_MATCH_CONFIG);
    }
  });

  it("defaults: expiração 24h, cancelamento 6h, reveal 72h, check-in -30min/+24h, desligado", () => {
    const config = parseFriendlyMatchConfig(undefined);
    assert.equal(config.enabled, false);
    assert.equal(config.inviteExpirationHours, 24);
    assert.equal(config.cancellationPenaltyWindowHours, 6);
    assert.equal(config.reviewRevealHours, 72);
    assert.deepEqual(config.checkInWindow, {beforeMinutes: 30, afterHours: 24});
  });

  it("aplica overrides válidos do doc", () => {
    const config = parseFriendlyMatchConfig({
      enabled: true,
      inviteExpirationHours: 48,
      cancellationPenaltyWindowHours: 12,
      reviewRevealHours: 24,
      checkInWindow: {beforeMinutes: 60, afterHours: 6},
    });
    assert.equal(config.enabled, true);
    assert.equal(config.inviteExpirationHours, 48);
    assert.equal(config.cancellationPenaltyWindowHours, 12);
    assert.equal(config.reviewRevealHours, 24);
    assert.deepEqual(config.checkInWindow, {beforeMinutes: 60, afterHours: 6});
  });

  it("ignora valores inválidos (tipo errado, negativo, zero) caindo no default do campo", () => {
    const config = parseFriendlyMatchConfig({
      enabled: "sim",
      inviteExpirationHours: -5,
      cancellationPenaltyWindowHours: "6",
      reviewRevealHours: 0,
      checkInWindow: {beforeMinutes: -1, afterHours: null},
    });
    assert.deepEqual(config, DEFAULT_FRIENDLY_MATCH_CONFIG);
  });

  it("override parcial preserva os demais defaults", () => {
    const config = parseFriendlyMatchConfig({inviteExpirationHours: 12});
    assert.equal(config.inviteExpirationHours, 12);
    assert.equal(config.cancellationPenaltyWindowHours, 6);
    assert.equal(config.enabled, false);
  });
});

describe("loadFriendlyMatchConfig", () => {
  it("doc ausente → defaults", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    const config = await loadFriendlyMatchConfig(db);
    assert.deepEqual(config, DEFAULT_FRIENDLY_MATCH_CONFIG);
  });

  it("lê e parseia appConfig/friendlyMatch", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("appConfig/friendlyMatch", {enabled: true, inviteExpirationHours: 36});
    const config = await loadFriendlyMatchConfig(fake as unknown as Firestore);
    assert.equal(config.enabled, true);
    assert.equal(config.inviteExpirationHours, 36);
    assert.equal(config.reviewRevealHours, 72);
  });
});
