import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {buildWalletViewRows} from "./organizer-withdrawal";

describe("buildWalletViewRows", () => {
  it("põe o caixa mais cheio na frente", () => {
    const rows = buildWalletViewRows(
      [
        {id: "t1", name: "Copa A"},
        {id: "t2", name: "Copa B"},
      ],
      new Map([
        ["t1", {availableReais: 10, pendingReais: 0}],
        ["t2", {availableReais: 90, pendingReais: 5}],
      ]),
    );
    assert.deepEqual(rows.map((r) => r.tournamentId), ["t2", "t1"]);
    assert.equal(rows[0]!.availableReais, 90);
    assert.equal(rows[0]!.pendingReais, 5);
  });

  it("caixa que ainda não existe entra zerado, não fora da lista", () => {
    const rows = buildWalletViewRows([{id: "t1", name: "Copa A"}], new Map());
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.availableReais, 0);
    assert.equal(rows[0]!.tournamentName, "Copa A");
  });

  it("empate de saldo ordena por nome", () => {
    const rows = buildWalletViewRows(
      [{id: "t2", name: "Copa Z"}, {id: "t1", name: "Copa A"}],
      new Map([
        ["t1", {availableReais: 0, pendingReais: 0}],
        ["t2", {availableReais: 0, pendingReais: 0}],
      ]),
    );
    assert.deepEqual(rows.map((r) => r.tournamentName), ["Copa A", "Copa Z"]);
  });
});
