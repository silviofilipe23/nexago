/**
 * Validação de saque do Asaas: só passa transferência que bate com um saque
 * que o nexaGO criou. Cada recusa abaixo é um jeito de tirar dinheiro da conta
 * com a chave de API e sem saque de verdade.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  decideWithdrawalTransfer,
  samePixKey,
  validateAsaasOutgoingOperation,
} from "./asaas-withdrawal-validation";

/** Saque de R$ 120 com R$ 2 de tarifa: a transferência leva R$ 118. */
function saque(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organizerId: "dono",
    tournamentId: "copa",
    amountReais: 120,
    feeReais: 2,
    status: "approved",
    payoutProvider: "asaas",
    payoutStatus: "sent",
    asaasTransferId: "tra_1",
    pixKey: "62999998888",
    pixKeyType: "PHONE",
    transferRequestedAt: 1,
    ...extra,
  };
}

const transfer = (extra: Record<string, unknown> = {}) => ({
  id: "tra_1",
  externalReference: "organizerWithdrawal:saque-1",
  value: 118,
  bankAccount: {pixAddressKey: "62999998888"},
  ...extra,
});

describe("decideWithdrawalTransfer", () => {
  it("aprova a transferência do próprio saque", () => {
    assert.deepEqual(decideWithdrawalTransfer(transfer(), saque()), {status: "APPROVED"});
    assert.deepEqual(
      decideWithdrawalTransfer(transfer({operationType: "PIX"}), saque()),
      {status: "APPROVED"},
    );
  });

  it("aprova ainda com o envio em andamento (antes de gravar o id da transferência)", () => {
    const w = saque({payoutStatus: "pending", asaasTransferId: undefined});
    assert.equal(decideWithdrawalTransfer(transfer(), w).status, "APPROVED");
  });


  const recusas: Array<[string, ReturnType<typeof transfer>, Record<string, unknown> | null, RegExp]> = [
    ["sem saque nosso", transfer(), null, /não reconhecida/],
    ["saque recusado", transfer(), saque({status: "rejected"}), /recusado/],
    ["saque pago por fora", transfer(), saque({payoutStatus: "manual"}), /aguardando envio/],
    ["saque já pago", transfer(), saque({payoutStatus: "paid"}), /aguardando envio/],
    ["outro gateway", transfer(), saque({payoutProvider: "mercadopago"}), /não foi enviado/],
    ["outra transferência", transfer({id: "tra_2"}), saque(), /diferente da registrada/],
    ["valor bruto em vez do líquido", transfer({value: 120}), saque(), /Valor/],
    ["valor ausente", transfer({value: undefined}), saque(), /Valor/],
    ["outra chave", transfer({bankAccount: {pixAddressKey: "62911112222"}}), saque(), /Chave/],
    ["chave no payload e saque sem chave", transfer(), saque({pixKey: ""}), /Chave/],
    ["pedido sem chave PIX", transfer({bankAccount: null}), saque(), /Chave/],
    ["TED com a referência e o valor certos", transfer({operationType: "TED"}), saque(), /só paga saque por PIX/],
    [
      "saque acima do limite ainda sem revisão",
      transfer(),
      saque({payoutStatus: "pending", asaasTransferId: undefined, transferRequestedAt: undefined}),
      /liberado para envio/,
    ],
    [
      "transferência morta de uma tentativa anterior",
      transfer({id: "tra_0"}),
      saque({payoutStatus: "pending", asaasTransferId: undefined, failedTransferIds: ["tra_0"]}),
      /diferente da registrada/,
    ],
  ];
  for (const [nome, t, w, motivo] of recusas) {
    it(`recusa: ${nome}`, () => {
      const decision = decideWithdrawalTransfer(t, w);
      assert.equal(decision.status, "REFUSED");
      assert.match(decision.status === "REFUSED" ? decision.refuseReason : "", motivo);
    });
  }
});

describe("samePixKey", () => {
  it("telefone com +55 e formatado é a mesma chave", () => {
    assert.ok(samePixKey("+55 (62) 99999-8888", "62999998888", "PHONE"));
  });

  it("CPF com pontuação, e-mail em caixa diferente", () => {
    assert.ok(samePixKey("529.982.247-25", "52998224725", "CPF"));
    assert.ok(samePixKey("Dono@Example.com", "dono@example.com", "EMAIL"));
  });

  it("chaves diferentes não batem", () => {
    assert.ok(!samePixKey("62911112222", "62999998888", "PHONE"));
    assert.ok(!samePixKey("outro@example.com", "dono@example.com", "EMAIL"));
  });
});

describe("validateAsaasOutgoingOperation", () => {
  const db = (fake: FakeFirestore) => fake as unknown as Firestore;

  it("acha o saque pela referência, aprova e deixa o rastro", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("organizerWithdrawals/saque-1", saque());

    const decision = await validateAsaasOutgoingOperation(db(fake), {
      type: "TRANSFER", transfer: transfer(),
    });

    assert.deepEqual(decision, {status: "APPROVED"});
    const doc = (await fake.doc("organizerWithdrawals/saque-1").get()).data() ?? {};
    const rastro = doc.transferValidation as Record<string, unknown>;
    assert.equal(rastro.decision, "APPROVED");
    assert.equal(rastro.transferId, "tra_1");
  });

  it("saque de arena pela referência da arena", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaWithdrawals/saque-a", saque({arenaId: "arena-1", asaasTransferId: "tra_a"}));

    const decision = await validateAsaasOutgoingOperation(db(fake), {
      type: "TRANSFER",
      transfer: transfer({id: "tra_a", externalReference: "arenaWithdrawal:saque-a"}),
    });

    assert.equal(decision.status, "APPROVED");
  });

  it("referência inventada para um saque que não existe é recusada", async () => {
    const fake = new FakeFirestore();
    const decision = await validateAsaasOutgoingOperation(db(fake), {
      type: "TRANSFER", transfer: transfer({externalReference: "organizerWithdrawal:nao-existe"}),
    });
    assert.equal(decision.status, "REFUSED");
  });

  it("outros tipos de saída (boleto, QR Pix, estorno, split) são recusados", async () => {
    const fake = new FakeFirestore();
    for (const type of ["BILL", "PIX_QR_CODE", "PIX_REFUND", "PAYMENT_SPLIT", ""]) {
      const decision = await validateAsaasOutgoingOperation(db(fake), {type, transfer: transfer()});
      assert.equal(decision.status, "REFUSED", type);
    }
  });
});
