import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildIdempotencyKey,
  shouldAutoIssue,
  shouldProcess,
} from "./invoice-emitter";
import type {ArenaFiscalConfig} from "./types";

function config(overrides: Partial<ArenaFiscalConfig> = {}): ArenaFiscalConfig {
  return {
    cnpj: "12345678000199",
    razaoSocial: "Arena X Ltda",
    enderecoFiscal: {
      logradouro: "Rua A",
      numero: "10",
      bairro: "Centro",
      municipio: "Goiânia",
      uf: "GO",
      cep: "74000000",
      codigoIbge: "5208707",
    },
    inscricaoMunicipal: "123456",
    regimeTributario: "simples_nacional",
    services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Quadra", aliquotaIss: 2}],
    defaultServiceIdBooking: "s1",
    mode: "always",
    status: "active",
    ...overrides,
  };
}

describe("shouldAutoIssue", () => {
  it("emite quando a config está ativa e o modo é sempre", () => {
    assert.equal(shouldAutoIssue(config()), true);
  });

  it("não emite quando a arena não tem config", () => {
    assert.equal(shouldAutoIssue(null), false);
  });

  it("não emite no modo sob demanda — a nota nasce quando o atleta pede", () => {
    assert.equal(shouldAutoIssue(config({mode: "on_demand"})), false);
  });

  it("não emite com o modo desligado", () => {
    assert.equal(shouldAutoIssue(config({mode: "off"})), false);
  });

  it("não emite enquanto a config não foi ativada", () => {
    assert.equal(shouldAutoIssue(config({status: "draft"})), false);
    assert.equal(shouldAutoIssue(config({status: "testing"})), false);
    assert.equal(shouldAutoIssue(config({status: "error"})), false);
  });
});

describe("shouldProcess", () => {
  const base = {
    config: config(),
    originPaid: true,
    valorBrutoReais: 100,
    tomadorCpfCnpj: "12345678909",
    hasAuthorizedTwin: false,
    origin: "booking" as const,
  };

  it("processa o caminho feliz", () => {
    assert.deepEqual(shouldProcess(base), {ok: true});
  });

  it("recusa quando a origem ainda não foi paga", () => {
    assert.deepEqual(shouldProcess({...base, originPaid: false}), {
      ok: false,
      reason: "ORIGIN_NOT_PAID",
    });
  });

  it("dispensa a checagem de pagamento na nota avulsa", () => {
    const result = shouldProcess({...base, origin: "manual", originPaid: false});
    assert.deepEqual(result, {ok: true});
  });

  it("recusa valor zerado", () => {
    assert.deepEqual(shouldProcess({...base, valorBrutoReais: 0}), {
      ok: false,
      reason: "INVALID_AMOUNT",
    });
  });

  it("recusa CPF inválido", () => {
    assert.deepEqual(shouldProcess({...base, tomadorCpfCnpj: "123456789"}), {
      ok: false,
      reason: "INVALID_TOMADOR_DOCUMENT",
    });
  });

  it("recusa quando já existe nota autorizada para a mesma origem", () => {
    assert.deepEqual(shouldProcess({...base, hasAuthorizedTwin: true}), {
      ok: false,
      reason: "ALREADY_AUTHORIZED",
    });
  });

  it("processa no modo sob demanda — aqui o pedido do atleta já existe", () => {
    const onDemand = {...base, config: config({mode: "on_demand"})};
    assert.deepEqual(shouldProcess(onDemand), {ok: true});
  });

  it("recusa com a config desligada", () => {
    const off = {...base, config: config({mode: "off"})};
    assert.deepEqual(shouldProcess(off), {ok: false, reason: "CONFIG_NOT_EMITTING"});
  });
});

describe("shouldProcess — activation_test", () => {
  const activationBase = {
    origin: "activation_test" as const,
    originPaid: true,
    valorBrutoReais: 1,
    tomadorCpfCnpj: "39053344705",
    hasAuthorizedTwin: false,
  };

  it("processa com status testing, mesmo sem active", () => {
    const testingConfig = config({status: "testing", mode: "off"});
    assert.deepEqual(
      shouldProcess({...activationBase, config: testingConfig}),
      {ok: true},
    );
  });

  it("processa com status error (caminho do reemitir)", () => {
    const errorConfig = config({status: "error", mode: "off"});
    assert.deepEqual(
      shouldProcess({...activationBase, config: errorConfig}),
      {ok: true},
    );
  });

  it("recusa com status draft — cadastro ainda não foi enviado", () => {
    const draftConfig = config({status: "draft", mode: "off"});
    assert.deepEqual(
      shouldProcess({...activationBase, config: draftConfig}),
      {ok: false, reason: "CONFIG_NOT_EMITTING"},
    );
  });

  it("dispensa a checagem de pagamento, igual manual", () => {
    const testingConfig = config({status: "testing", mode: "off"});
    const result = shouldProcess({...activationBase, config: testingConfig, originPaid: false});
    assert.deepEqual(result, {ok: true});
  });
});

describe("buildIdempotencyKey", () => {
  it("deriva do pagamento no caminho online", () => {
    assert.equal(
      buildIdempotencyKey({origin: "booking", asaasPaymentId: "pay_1"}),
      "payment:pay_1",
    );
  });

  it("deriva do recebimento no caminho presencial", () => {
    assert.equal(
      buildIdempotencyKey({origin: "booking", bookingId: "b1", receiptId: "r1"}),
      "receipt:b1:r1",
    );
  });

  it("deriva do próprio id na avulsa", () => {
    assert.equal(
      buildIdempotencyKey({origin: "manual", invoiceId: "i1"}),
      "manual:i1",
    );
  });
});

describe("buildIdempotencyKey — activation_test", () => {
  it("deriva da arena, não de pagamento", () => {
    assert.equal(
      buildIdempotencyKey({origin: "activation_test", arenaId: "arena1"}),
      "activation:arena1",
    );
  });
});
