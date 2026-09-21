import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {resolveWithdrawalWalletTarget} from "./organizer-withdrawal-payout";

describe("resolveWithdrawalWalletTarget", () => {
  it("saque novo debita o caixa do torneio", () => {
    assert.deepEqual(
      resolveWithdrawalWalletTarget({tournamentId: "t1", organizerId: "org1"}),
      {kind: "tournament", tournamentId: "t1"},
    );
  });

  it("saque legado sem torneio debita a carteira antiga", () => {
    assert.deepEqual(
      resolveWithdrawalWalletTarget({organizerId: "org1"}),
      {kind: "organizer", organizerId: "org1"},
    );
  });

  it("doc sem nenhum dos dois é inválido", () => {
    assert.throws(() => resolveWithdrawalWalletTarget({}), /WITHDRAWAL_DATA_INVALID/);
  });
});
