/**
 * `TRANSFER_*` dos saques sobre `FakeFirestore`: "pago" só com TRANSFER_DONE, e
 * transferência falha/cancelada devolvendo o valor ao caixa uma vez só.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  parseWithdrawalReference,
  processArenaWithdrawalTransferWebhook,
  type WithdrawalTransferFailure,
} from "./asaas-withdrawal-webhook";

const SAQUE_ORG = "organizerWithdrawals/saque-1";
const CAIXA_TORNEIO = "tournamentWallets/copa";
const SAQUE_ARENA = "arenaWithdrawals/saque-a";
const CARTEIRA_ARENA = "arenaWallets/arena-1";

/** Saque de R$ 120 (tarifa R$ 2) já aprovado: a reserva saiu do caixa e o PIX foi criado. */
function seedSaqueOrganizadorEnviado(fake: FakeFirestore, extra: Record<string, unknown> = {}): void {
  fake.seedDoc(CAIXA_TORNEIO, {tournamentId: "copa", availableReais: 50, pendingReais: 0});
  fake.seedDoc(SAQUE_ORG, {
    tournamentId: "copa",
    organizerId: "dono",
    requestedBy: "gestor",
    amountReais: 120,
    feeReais: 2,
    status: "approved",
    payoutProvider: "asaas",
    payoutStatus: "sent",
    asaasTransferId: "tra_1",
    pixKey: "dono@example.com",
    pixKeyType: "EMAIL",
    ...extra,
  });
}

function data(fake: FakeFirestore, path: string): Record<string, unknown> {
  return (fake as unknown as {store: Map<string, Record<string, unknown>>}).store.get(path) ?? {};
}

function recorder() {
  const calls: WithdrawalTransferFailure[] = [];
  return {calls, notify: async (f: WithdrawalTransferFailure) => {
    calls.push(f);
  }};
}

const db = (fake: FakeFirestore) => fake as unknown as Firestore;

describe("parseWithdrawalReference", () => {
  it("separa arena e organizador pelo prefixo", () => {
    assert.deepEqual(parseWithdrawalReference("organizerWithdrawal:s1"), {
      kind: "organizer", collection: "organizerWithdrawals", withdrawalId: "s1",
    });
    assert.deepEqual(parseWithdrawalReference("arenaWithdrawal:s2"), {
      kind: "arena", collection: "arenaWithdrawals", withdrawalId: "s2",
    });
  });

  it("referência de outra coisa ou sem id não é saque", () => {
    assert.equal(parseWithdrawalReference("arenaBooking:b1"), null);
    assert.equal(parseWithdrawalReference("organizerWithdrawal:"), null);
    assert.equal(parseWithdrawalReference(undefined), null);
  });
});

describe("TRANSFER_DONE", () => {
  it("só aqui o saque vira pago, com paidAt", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake);

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_DONE", {
      id: "tra_1", externalReference: "organizerWithdrawal:saque-1", status: "DONE",
    });

    const saque = data(fake, SAQUE_ORG);
    assert.equal(saque.payoutStatus, "paid");
    assert.ok(saque.paidAt, "paidAt gravado na conclusão");
    assert.equal(saque.transferWebhookStatus, "done");
    assert.equal(data(fake, CAIXA_TORNEIO).availableReais, 50, "caixa intocado");
  });

  it("acha o saque pelo id da transferência quando falta a referência", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake);

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_DONE", {id: "tra_1"});

    assert.equal(data(fake, SAQUE_ORG).payoutStatus, "paid");
  });

  it("saque ainda na fila: vira pago com alerta para fechar no backoffice", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake, {status: "pending"});

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_DONE", {
      id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
    });

    const saque = data(fake, SAQUE_ORG);
    assert.equal(saque.payoutStatus, "paid");
    assert.equal(saque.status, "pending");
    assert.match(String(saque.payoutWebhookAlert), /fechar o saque/);
  });

  it("DONE de uma transferência antiga (já trocada) não marca o saque", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake, {asaasTransferId: "tra_2", failedTransferIds: ["tra_1"]});

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_DONE", {
      id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
    });

    assert.equal(data(fake, SAQUE_ORG).payoutStatus, "sent");
  });

  it("concluída depois de devolvida ao caixa: não vira paga, levanta alerta", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake, {status: "rejected", payoutStatus: "failed"});

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_DONE", {
      id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
    });

    const saque = data(fake, SAQUE_ORG);
    assert.equal(saque.payoutStatus, "failed");
    assert.match(String(saque.payoutWebhookAlert), /devolvido/);
  });
});

describe("TRANSFER_FAILED / TRANSFER_CANCELLED", () => {
  for (const event of ["TRANSFER_FAILED", "TRANSFER_CANCELLED"]) {
    it(`${event}: saque aprovado devolve o BRUTO ao caixa e vira recusado`, async () => {
      const fake = new FakeFirestore();
      seedSaqueOrganizadorEnviado(fake);
      const {calls, notify} = recorder();

      await processArenaWithdrawalTransferWebhook(db(fake), event, {
        id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
      }, notify);

      const saque = data(fake, SAQUE_ORG);
      assert.equal(saque.status, "rejected");
      assert.equal(saque.payoutStatus, "failed");
      assert.equal(saque.returnedToWalletReais, 120);
      assert.equal(data(fake, CAIXA_TORNEIO).availableReais, 170, "50 + 120 de volta");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].amountReais, 120);
    });
  }

  it("motivo do banco vai para o saque", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake);

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_FAILED", {
      id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
      failReason: "Chave PIX não encontrada",
    }, recorder().notify);

    const saque = data(fake, SAQUE_ORG);
    assert.equal(saque.payoutError, "Chave PIX não encontrada");
    assert.match(String(saque.reviewNote), /Chave PIX não encontrada/);
  });

  it("reentrega e FAILED seguido de CANCELLED devolvem uma vez só", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake);
    const {calls, notify} = recorder();
    const transfer = {id: "tra_1", externalReference: "organizerWithdrawal:saque-1"};

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_FAILED", transfer, notify);
    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_FAILED", transfer, notify);
    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_CANCELLED", transfer, notify);

    assert.equal(data(fake, CAIXA_TORNEIO).availableReais, 170);
    assert.equal(calls.length, 1);
  });

  it("evento atrasado da tentativa anterior não devolve o saque que está sendo pago", async () => {
    // T1 falhou, o admin tentou de novo e T2 está saindo: o CANCELLED de T1
    // chegando agora devolveria ao caixa um valor que T2 vai pagar.
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake, {asaasTransferId: "tra_2", failedTransferIds: ["tra_1"]});
    const {calls, notify} = recorder();

    for (const event of ["TRANSFER_CANCELLED", "TRANSFER_FAILED"]) {
      await processArenaWithdrawalTransferWebhook(db(fake), event, {
        id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
      }, notify);
    }

    const saque = data(fake, SAQUE_ORG);
    assert.equal(saque.status, "approved");
    assert.equal(saque.payoutStatus, "sent");
    assert.equal(data(fake, CAIXA_TORNEIO).availableReais, 50);
    assert.equal(calls.length, 0);
  });

  it("evento de outra transferência que não a gravada é ignorado", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake, {asaasTransferId: "tra_2"});

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_FAILED", {
      id: "tra_x", externalReference: "organizerWithdrawal:saque-1",
    }, recorder().notify);

    assert.equal(data(fake, SAQUE_ORG).status, "approved");
    assert.equal(data(fake, CAIXA_TORNEIO).availableReais, 50);
  });

  it("envio que falhou sem saber o id (resposta perdida) grava o id da transferência morta", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake, {
      status: "pending", payoutStatus: "failed", asaasTransferId: undefined,
    });

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_CANCELLED", {
      id: "tra_9", externalReference: "organizerWithdrawal:saque-1",
    }, recorder().notify);

    const saque = data(fake, SAQUE_ORG);
    assert.equal(saque.asaasTransferId, "tra_9");
    assert.equal(saque.transferAttempt, 1, "a próxima tentativa ganha chave nova");
    assert.equal(saque.status, "pending");
    assert.equal(data(fake, CAIXA_TORNEIO).availableReais, 50);
  });

  it("falha depois de pago não mexe no caixa", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake, {payoutStatus: "paid"});
    const {calls, notify} = recorder();

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_FAILED", {
      id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
    }, notify);

    assert.equal(data(fake, SAQUE_ORG).payoutStatus, "paid");
    assert.equal(data(fake, CAIXA_TORNEIO).availableReais, 50);
    assert.equal(calls.length, 0);
  });

  it("saque ainda pendente (reserva no caixa) volta para a revisão sem devolver", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake, {status: "pending"});
    const {calls, notify} = recorder();

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_CANCELLED", {
      id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
    }, notify);

    const saque = data(fake, SAQUE_ORG);
    assert.equal(saque.status, "pending");
    assert.equal(saque.payoutStatus, "failed");
    assert.equal(saque.transferAttempt, 1);
    assert.ok(saque.payoutWebhookAlert);
    assert.equal(data(fake, CAIXA_TORNEIO).availableReais, 50);
    assert.equal(calls.length, 0);
  });

  it("saque pago por fora (manual) não é tocado", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake, {payoutStatus: "manual"});

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_FAILED", {
      id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
    }, recorder().notify);

    assert.equal(data(fake, SAQUE_ORG).status, "approved");
    assert.equal(data(fake, CAIXA_TORNEIO).availableReais, 50);
  });

  it("saque de arena devolve para a carteira da arena", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(CARTEIRA_ARENA, {arenaId: "arena-1", availableReais: 10, pendingReais: 0});
    fake.seedDoc(SAQUE_ARENA, {
      arenaId: "arena-1", managerUserId: "gestor-arena", amountReais: 80,
      status: "approved", payoutProvider: "asaas", payoutStatus: "sent", asaasTransferId: "tra_a",
    });
    const {calls, notify} = recorder();

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_FAILED", {
      id: "tra_a", externalReference: "arenaWithdrawal:saque-a",
    }, notify);

    assert.equal(data(fake, CARTEIRA_ARENA).availableReais, 90);
    assert.equal(data(fake, SAQUE_ARENA).status, "rejected");
    assert.equal(calls[0].kind, "arena");
  });

  it("saque legado sem torneio devolve para a carteira antiga do organizador", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("organizerWallets/dono", {availableReais: 0, pendingReais: 0});
    seedSaqueOrganizadorEnviado(fake, {tournamentId: null});

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_FAILED", {
      id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
    }, recorder().notify);

    assert.equal(data(fake, "organizerWallets/dono").availableReais, 120);
    assert.equal(data(fake, CAIXA_TORNEIO).availableReais, 50);
  });

  it("transferência que não é de saque é ignorada", async () => {
    const fake = new FakeFirestore();
    seedSaqueOrganizadorEnviado(fake);

    await processArenaWithdrawalTransferWebhook(db(fake), "TRANSFER_FAILED", {
      id: "tra_outra", externalReference: "algo:else",
    }, recorder().notify);

    assert.equal(data(fake, SAQUE_ORG).status, "approved");
  });
});
