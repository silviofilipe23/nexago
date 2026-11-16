import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {isPartialAsaasRefund} from "./asaas-tournament-registration-refund";

describe("isPartialAsaasRefund", () => {
  it("sem a lista de estornos, REFUNDED vale como estorno total", () => {
    assert.equal(isPartialAsaasRefund({value: 100}), false);
    assert.equal(isPartialAsaasRefund({value: 100, refunds: null}), false);
    assert.equal(isPartialAsaasRefund({value: 100, refunds: []}), false);
  });

  it("estornos que somam menos que a cobrança são parciais", () => {
    assert.equal(isPartialAsaasRefund({value: 100, refunds: [{status: "DONE", value: 40}]}), true);
  });

  it("estornos que somam a cobrança inteira são totais", () => {
    assert.equal(isPartialAsaasRefund({value: 100, refunds: [{status: "DONE", value: 100}]}), false);
    assert.equal(
      isPartialAsaasRefund({value: 100, refunds: [{status: "DONE", value: 40}, {status: "DONE", value: 60}]}),
      false,
    );
  });

  it("estorno cancelado não conta como devolvido", () => {
    assert.equal(
      isPartialAsaasRefund({
        value: 100,
        refunds: [{status: "CANCELLED", value: 60}, {status: "DONE", value: 40}],
      }),
      true,
    );
  });

  it("lista sem valor legível não decide nada: vale o status", () => {
    assert.equal(isPartialAsaasRefund({value: 100, refunds: [{status: "DONE"}]}), false);
  });
});
