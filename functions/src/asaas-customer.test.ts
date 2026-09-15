import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  GENERIC_PAYER_NAME,
  asaasCustomerCacheIsFresh,
  pickAthletePayerName,
} from "./asaas-customer";

describe("pickAthletePayerName", () => {
  it("usa o nome completo do doc do atleta", () => {
    assert.equal(
      pickAthletePayerName({fullName: "Maria de Souza Lima"}),
      "Maria de Souza Lima",
    );
  });

  it("prefere o doc ao displayName do Auth", () => {
    // O Auth só tem displayName quando o atleta entrou por Google/Apple, e o
    // nome de lá costuma ser abreviado. Quem casa com o CPF da cobrança é o
    // `fullName` do onboarding.
    assert.equal(
      pickAthletePayerName({fullName: "Maria de Souza Lima"}, "Maria S."),
      "Maria de Souza Lima",
    );
  });

  it("cai no displayName do Auth quando o doc não tem nome", () => {
    assert.equal(pickAthletePayerName({cpfCnpj: "123"}, "Maria S."), "Maria S.");
    assert.equal(pickAthletePayerName(null, "Maria S."), "Maria S.");
  });

  it("aceita os campos legados de nome, do mais completo ao mais fraco", () => {
    assert.equal(pickAthletePayerName({name: "João Pedro"}), "João Pedro");
    assert.equal(pickAthletePayerName({displayName: "João P."}), "João P.");
    assert.equal(pickAthletePayerName({nickname: "Jopê"}), "Jopê");
    assert.equal(pickAthletePayerName({firstName: "João"}), "João");
    assert.equal(
      pickAthletePayerName({nickname: "Jopê", fullName: "João Pedro Alves"}),
      "João Pedro Alves",
    );
  });

  it("ignora campos em branco", () => {
    assert.equal(
      pickAthletePayerName({fullName: "   ", name: "João Pedro"}),
      "João Pedro",
    );
    assert.equal(pickAthletePayerName({fullName: "  Ana Paula  "}), "Ana Paula");
  });

  it("só usa o genérico quando não há nome em lugar nenhum", () => {
    assert.equal(pickAthletePayerName(null), GENERIC_PAYER_NAME);
    assert.equal(pickAthletePayerName({}, "   "), GENERIC_PAYER_NAME);
  });

  it("corta em 80 caracteres (limite do Asaas)", () => {
    const longo = "A".repeat(120);
    assert.equal(pickAthletePayerName({fullName: longo}).length, 80);
    assert.equal(pickAthletePayerName(null, longo).length, 80);
  });
});

describe("asaasCustomerCacheIsFresh", () => {
  const base = {
    cachedId: "cus_1",
    cachedCpf: "12345678901",
    cachedEnv: "production",
    cachedName: "Maria de Souza Lima",
    cpfCnpj: "12345678901",
    env: "production",
    name: "Maria de Souza Lima",
  };

  it("reaproveita o customer quando id, CPF, ambiente e nome batem", () => {
    assert.equal(asaasCustomerCacheIsFresh(base), true);
  });

  it("invalida quando o nome mudou", () => {
    // Customers criados antes deste fix ficaram com o nome genérico; a
    // diferença é o que dispara o PUT que renomeia no Asaas.
    assert.equal(
      asaasCustomerCacheIsFresh({...base, cachedName: GENERIC_PAYER_NAME}),
      false,
    );
    assert.equal(asaasCustomerCacheIsFresh({...base, cachedName: ""}), false);
  });

  it("invalida quando CPF, ambiente ou id não batem", () => {
    assert.equal(asaasCustomerCacheIsFresh({...base, cachedCpf: "999"}), false);
    assert.equal(asaasCustomerCacheIsFresh({...base, cachedEnv: "sandbox"}), false);
    assert.equal(asaasCustomerCacheIsFresh({...base, cachedId: ""}), false);
  });
});
