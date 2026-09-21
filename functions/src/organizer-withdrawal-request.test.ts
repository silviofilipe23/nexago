import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {resolveWithdrawalRequest, assertTournamentHasOwner} from "./organizer-withdrawal";

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

  it("torneio vazio (só espaços) falha com invalid-argument, não com mensagem crua", () => {
    // Confere pelo `code` do HttpsError, não pela mensagem — é o código que
    // garante que o cliente recebe invalid-argument daqui. A ORDEM em que a
    // callable chama isto (antes do controle de acesso, antes de qualquer
    // consulta ao Firestore) não é exercitada por este teste — esta função é
    // pura, sem I/O; aquela garantia foi conferida por leitura do código.
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

describe("assertTournamentHasOwner", () => {
  it("torneio sem managerId (string vazia) é recusado com failed-precondition", () => {
    // `assertCanWithdrawFromTournament` libera esse uid pelo caminho de super
    // admin, que não garante managerId preenchido — sem esta guarda o saque
    // gravaria organizerId: "" e ficaria órfão, fora da fila do backoffice.
    assert.throws(
      () => assertTournamentHasOwner(""),
      (err: unknown) => {
        assert.equal((err as {code?: string}).code, "failed-precondition");
        return true;
      },
    );
  });

  it("torneio com dono definido passa direto", () => {
    assert.doesNotThrow(() => assertTournamentHasOwner("donoUid"));
  });
});
