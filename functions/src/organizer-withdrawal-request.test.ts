import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {resolveWithdrawalRequest} from "./organizer-withdrawal";

describe("resolveWithdrawalRequest", () => {
  it("usa a chave do perfil de quem pede", () => {
    const out = resolveWithdrawalRequest({
      tournamentId: "t1",
      amountReais: 40,
      profilePixKey: "pessoa@exemplo.com",
      profilePixKeyType: "EMAIL",
    });
    assert.equal(out.amount, 40);
    assert.equal(out.pixKey, "pessoa@exemplo.com");
    assert.equal(out.pixKeyType, "EMAIL");
  });

  it("exige torneio", () => {
    assert.throws(
      () => resolveWithdrawalRequest({
        tournamentId: "  ", amountReais: 40,
        profilePixKey: "pessoa@exemplo.com", profilePixKeyType: "EMAIL",
      }),
      /torneio/i,
    );
  });

  it("exige valor positivo", () => {
    assert.throws(
      () => resolveWithdrawalRequest({
        tournamentId: "t1", amountReais: 0,
        profilePixKey: "pessoa@exemplo.com", profilePixKeyType: "EMAIL",
      }),
      /valor/i,
    );
  });

  it("sem chave cadastrada, manda cadastrar", () => {
    assert.throws(
      () => resolveWithdrawalRequest({
        tournamentId: "t1", amountReais: 40, profilePixKey: "", profilePixKeyType: "",
      }),
      /chave PIX/i,
    );
  });

  it("arredonda centavos do valor", () => {
    const out = resolveWithdrawalRequest({
      tournamentId: "t1", amountReais: 40.005,
      profilePixKey: "pessoa@exemplo.com", profilePixKeyType: "EMAIL",
    });
    assert.equal(out.amount, 40.01);
  });
});
