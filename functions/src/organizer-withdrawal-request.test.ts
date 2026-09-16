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

  it("torneio vazio (só espaços) falha com invalid-argument, não com erro de I/O", () => {
    // A ordem importa: isto tem de estourar ANTES de qualquer consulta ao
    // Firestore. Confere pelo `code` do HttpsError, não pela mensagem — é o
    // código que garante que o cliente recebe invalid-argument e não um
    // "internal" cru de um path do Firestore com segmento vazio.
    assert.throws(
      () => resolveWithdrawalRequest({
        tournamentId: "   ", amountReais: 40,
        profilePixKey: "pessoa@exemplo.com", profilePixKeyType: "EMAIL",
      }),
      (err: unknown) => {
        assert.equal((err as {code?: string}).code, "invalid-argument");
        return true;
      },
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
