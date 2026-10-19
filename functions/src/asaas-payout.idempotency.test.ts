import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  asaasErrorIsDefinitiveRefusal,
  transferResponseIsDead,
  withdrawalTransferIdempotencyKey,
} from "./asaas-payout";

describe("withdrawalTransferIdempotencyKey", () => {
  it("primeira tentativa usa a chave do saque", () => {
    assert.equal(
      withdrawalTransferIdempotencyKey("organizerWithdrawal:", "s1", {payoutStatus: "pending"}),
      "withdrawal-transfer-organizerWithdrawal:s1",
    );
  });

  it("repetir a mesma tentativa (resultado incerto) repete a chave", () => {
    const w = {payoutStatus: "failed", transferAttempt: 2};
    assert.equal(
      withdrawalTransferIdempotencyKey("arenaWithdrawal:", "s2", w),
      withdrawalTransferIdempotencyKey("arenaWithdrawal:", "s2", w),
    );
  });

  it("cada tentativa nova tem chave própria — nunca volta à de uma anterior", () => {
    const keys = [0, 1, 2, 3].map((transferAttempt) =>
      withdrawalTransferIdempotencyKey("arenaWithdrawal:", "s2", {transferAttempt}));
    assert.equal(new Set(keys).size, 4);
    assert.equal(keys[2], "withdrawal-transfer-arenaWithdrawal:s2-try-2");
  });
});

describe("asaasErrorIsDefinitiveRefusal", () => {
  it("4xx de validação garante que nada foi criado", () => {
    assert.ok(asaasErrorIsDefinitiveRefusal(400));
    assert.ok(asaasErrorIsDefinitiveRefusal(404));
  });

  it("rede, 5xx, timeout, conflito e limite são incertos", () => {
    for (const status of [500, 502, 408, 409, 429]) {
      assert.ok(!asaasErrorIsDefinitiveRefusal(status), String(status));
    }
  });
});

describe("transferResponseIsDead", () => {
  it("transferência cancelada ou falha devolvida pela idempotência não é envio", () => {
    assert.ok(transferResponseIsDead("CANCELLED"));
    assert.ok(transferResponseIsDead("failed"));
  });

  it("pendente, em processamento ou concluída é envio", () => {
    for (const status of ["PENDING", "BANK_PROCESSING", "DONE", ""]) {
      assert.ok(!transferResponseIsDead(status), status);
    }
  });
});
