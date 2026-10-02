import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_CASHBACK_CONFIG,
  parseCashbackConfig,
  readCashbackConfig,
} from "./cashback-config";

describe("parseCashbackConfig", () => {
  it("doc ausente cai no padrão, desligado", () => {
    assert.deepEqual(parseCashbackConfig(undefined), DEFAULT_CASHBACK_CONFIG);
    assert.equal(DEFAULT_CASHBACK_CONFIG.enabled, false);
  });

  it("lê os campos válidos e converte o mínimo para centavos", () => {
    assert.deepEqual(
      parseCashbackConfig({
        enabled: true,
        ratePercent: 3,
        maxShareOfFee: 0.4,
        minCashReais: 7.5,
        expiryMonths: 12,
        expiryWarningDays: 10,
      }),
      {
        enabled: true,
        ratePercent: 3,
        maxShareOfFee: 0.4,
        minCashCents: 750,
        expiryMonths: 12,
        expiryWarningDays: 10,
      },
    );
  });

  it("campo fora da faixa ou de outro tipo volta ao padrão", () => {
    const cfg = parseCashbackConfig({
      enabled: "true",
      ratePercent: 50,
      maxShareOfFee: "0.5",
      minCashReais: -1,
      expiryMonths: 0,
      expiryWarningDays: Number.NaN,
    });
    assert.deepEqual(cfg, DEFAULT_CASHBACK_CONFIG);
  });
});

describe("readCashbackConfig", () => {
  it("lê appConfig/cashback", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("appConfig/cashback", {enabled: true, ratePercent: 2});
    const cfg = await readCashbackConfig(fake as unknown as Firestore);
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.minCashCents, 500);
  });

  it("sem doc devolve o padrão", async () => {
    const fake = new FakeFirestore();
    assert.deepEqual(
      await readCashbackConfig(fake as unknown as Firestore),
      DEFAULT_CASHBACK_CONFIG,
    );
  });
});
