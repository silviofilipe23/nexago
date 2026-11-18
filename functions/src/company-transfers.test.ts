import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  isManualTransfer,
  parseClassifyInput,
  planClassification,
  transferDateOf,
  transferTags,
  type ClassifyPlanInput,
} from "./company-transfers";

const MANUAL = {
  id: "cabea373-ecfe-4b54-b1f4-eee15008fe1d",
  status: "DONE",
  value: 90,
  dateCreated: "2026-11-10",
  effectiveDate: "2026-11-10 09:24:52",
  externalReference: null,
  bankAccount: {ownerName: "Fulano de Tal"},
};

function plan(over: Partial<ClassifyPlanInput> = {}) {
  return planClassification({
    transfer: MANUAL,
    existing: null,
    input: {transferId: MANUAL.id, kind: "withdrawal", tournamentId: null, alreadySettled: false, note: ""},
    wallet: null,
    tournament: null,
    tournamentWithdrawals: [],
    uid: "admin-1",
    ...over,
  });
}

describe("company-transfers: transferência manual", () => {
  it("concluída e sem referência do sistema é manual (feita no painel do Asaas)", () => {
    assert.equal(isManualTransfer(MANUAL), true);
  });

  it("com referência de saque do sistema não é manual", () => {
    assert.equal(isManualTransfer({...MANUAL, externalReference: "organizerWithdrawal:abc"}), false);
  });

  it("falhou, cancelada ou pendente não é classificável", () => {
    for (const status of ["FAILED", "CANCELLED", "PENDING", "BANK_PROCESSING"]) {
      assert.equal(isManualTransfer({...MANUAL, status}), false, status);
    }
  });

  it("sem id ou sem valor positivo não é classificável", () => {
    assert.equal(isManualTransfer({...MANUAL, id: ""}), false);
    assert.equal(isManualTransfer({...MANUAL, value: 0}), false);
  });

  it("data é a efetiva (dia em que saiu); sem ela, a de criação", () => {
    assert.equal(transferDateOf(MANUAL), "2026-11-10");
    assert.equal(transferDateOf({...MANUAL, effectiveDate: null, dateCreated: "2026-10-26"}), "2026-10-26");
    assert.equal(transferDateOf({}), null);
  });
});

describe("company-transfers: entrada do callable", () => {
  it("aceita retirada e despesa sem torneio", () => {
    assert.deepEqual(parseClassifyInput({transferId: " abc ", kind: "expense", note: " luz "}),
      {transferId: "abc", kind: "expense", tournamentId: null, alreadySettled: false, note: "luz"});
  });

  it("repasse exige o torneio", () => {
    assert.throws(() => parseClassifyInput({transferId: "abc", kind: "organizerPayout"}), /torneio/);
  });

  it("id da transferência só no formato do Asaas (seguro como doc e na URL)", () => {
    for (const bad of [".", "..", "__x__", "a/b", "a b", "a?b", "x".repeat(65)]) {
      assert.throws(() => parseClassifyInput({transferId: bad, kind: "withdrawal"}), /transferência/, bad);
    }
    assert.equal(parseClassifyInput({transferId: MANUAL.id, kind: "withdrawal"}).transferId, MANUAL.id);
  });

  it("recusa tipo desconhecido, id ausente e observação longa", () => {
    assert.throws(() => parseClassifyInput({transferId: "abc", kind: "presente"}), /tipo/i);
    assert.throws(() => parseClassifyInput({kind: "withdrawal"}), /transferência/);
    assert.throws(() => parseClassifyInput({transferId: "abc", kind: "withdrawal", note: "x".repeat(201)}), /observação/);
  });

  it("torneio só vale no repasse", () => {
    assert.equal(parseClassifyInput({transferId: "abc", kind: "withdrawal", tournamentId: "t1"}).tournamentId, null);
  });
});

describe("company-transfers: plano da classificação", () => {
  it("retirada grava só o registro, com valor e data vindos do Asaas", () => {
    const p = plan();
    assert.equal(p.status, "create");
    if (p.status !== "create") return;
    assert.equal(p.record.kind, "withdrawal");
    assert.equal(p.record.amountCents, 9000);
    assert.equal(p.record.date, "2026-11-10");
    assert.equal(p.record.destinationName, "Fulano de Tal");
    assert.equal(p.record.classifiedBy, "admin-1");
    assert.equal(p.payout, null);
  });

  it("Asaas devolvendo outra transferência é recusado", () => {
    assert.match(errorOf(plan({transfer: {...MANUAL, id: "outra"}})), /outra transferência/);
  });

  it("transferência do sistema ou não concluída é recusada", () => {
    assert.match(errorOf(plan({transfer: {...MANUAL, externalReference: "arenaWithdrawal:x"}})), /sistema/);
    assert.match(errorOf(plan({transfer: {...MANUAL, status: "FAILED"}})), /concluída/);
  });

  it("repasse baixa o caixa e cria o saque pago por fora", () => {
    const p = plan({
      input: {transferId: MANUAL.id, kind: "organizerPayout", tournamentId: "t1", alreadySettled: false, note: ""},
      wallet: {availableReais: 100.5, ownerId: "org-1"},
      tournament: {name: "Copa X", managerId: "org-2"},
    });
    assert.equal(p.status, "create");
    if (p.status !== "create" || !p.payout) throw new Error("sem repasse");
    assert.equal(p.payout.walletAvailableReais, 10.5);
    assert.equal(p.payout.withdrawalId, `asaas-transfer-${MANUAL.id}`);
    assert.equal(p.payout.withdrawal.organizerId, "org-1");
    assert.equal(p.payout.withdrawal.amountReais, 90);
    assert.equal(p.payout.withdrawal.status, "approved");
    assert.equal(p.payout.withdrawal.payoutStatus, "sent");
    assert.equal(p.payout.withdrawal.payoutProvider, "manual");
    assert.equal(p.payout.withdrawal.registeredManually, true);
    assert.equal(p.payout.withdrawal.paidOutsideTransferId, MANUAL.id);
    assert.equal("asaasTransferId" in p.payout.withdrawal, false, "não pode casar com o webhook de saque");
    assert.equal(p.record.tournamentId, "t1");
    assert.equal(p.record.tournamentName, "Copa X");
    assert.equal(p.record.withdrawalId, `asaas-transfer-${MANUAL.id}`);
  });

  it("repasse com caixa já baixado antes só registra o motivo, sem descontar de novo", () => {
    const p = plan({
      input: {transferId: MANUAL.id, kind: "organizerPayout", tournamentId: "t1", alreadySettled: true, note: ""},
      wallet: {availableReais: 0, ownerId: "org-1"},
      tournament: {name: "Goiânia Open"},
      tournamentWithdrawals: [{status: "approved", payoutProvider: "manual", registeredManually: true, amountReais: 761.38}],
    });
    assert.equal(p.status, "create");
    if (p.status !== "create") return;
    assert.equal(p.payout, null, "não baixa o caixa nem cria saque");
    assert.equal(p.record.walletSettledBefore, true);
    assert.equal(p.record.tournamentName, "Goiânia Open");
    assert.equal(p.record.withdrawalId, null);
  });

  const PAYOUT = {transferId: MANUAL.id, kind: "organizerPayout" as const, tournamentId: "t1", alreadySettled: false, note: ""};
  const RICH = {wallet: {availableReais: 5000, ownerId: "org-1"}, tournament: {name: "Queen & King"}};

  it("baixa à mão anterior do mesmo valor bloqueia o repasse sem a caixinha", () => {
    const prior = {status: "approved", payoutProvider: "manual", registeredManually: true, amountReais: 90};
    assert.match(errorOf(plan({...RICH, input: PAYOUT, tournamentWithdrawals: [prior]})), /já foi baixado antes/);
    // valor diferente ou já ligada a outra transferência: não é gêmea
    assert.equal(plan({...RICH, input: PAYOUT, tournamentWithdrawals: [{...prior, amountReais: 91}]}).status, "create");
    assert.equal(plan({...RICH, input: PAYOUT, tournamentWithdrawals: [{...prior, paidOutsideTransferId: "outra"}]}).status, "create");
  });

  it("pedido de saque em aberto no torneio bloqueia o repasse (com ou sem a caixinha)", () => {
    for (const open of [{status: "pending"}, {status: "approved", payoutStatus: "pending"}, {status: "approved", payoutStatus: "failed"}]) {
      assert.match(errorOf(plan({...RICH, input: PAYOUT, tournamentWithdrawals: [open]})), /fila de saques/, JSON.stringify(open));
      assert.match(errorOf(plan({...RICH, input: {...PAYOUT, alreadySettled: true}, tournamentWithdrawals: [open]})), /fila de saques/);
    }
    assert.equal(plan({...RICH, input: PAYOUT, tournamentWithdrawals: [{status: "approved", payoutStatus: "sent", payoutProvider: "asaas"}]}).status, "create");
  });

  it("caixa já baixado exige alguma baixa à mão registrada no torneio", () => {
    assert.match(errorOf(plan({...RICH, input: {...PAYOUT, alreadySettled: true}})), /não foi baixado/);
    const viaQueue = {status: "approved", payoutStatus: "sent", payoutProvider: "manual"};
    assert.equal(plan({...RICH, input: {...PAYOUT, alreadySettled: true}, tournamentWithdrawals: [viaQueue]}).status, "create");
  });

  it("observação do admin não vai para o saque que o organizador lê", () => {
    const p = plan({...RICH, input: {...PAYOUT, note: "interno"}});
    if (p.status !== "create" || !p.payout) throw new Error("sem repasse");
    assert.equal(String(p.payout.withdrawal.reviewNote).includes("interno"), false);
    assert.equal(p.record.note, "interno");
  });

  it("caixa já baixado só vale no repasse", () => {
    assert.equal(parseClassifyInput({transferId: "abc", kind: "withdrawal", alreadySettled: true}).alreadySettled, false);
    assert.equal(parseClassifyInput({transferId: "abc", kind: "organizerPayout", tournamentId: "t1", alreadySettled: true}).alreadySettled, true);
    assert.equal(parseClassifyInput({transferId: "abc", kind: "organizerPayout", tournamentId: "t1", alreadySettled: "sim"}).alreadySettled, false);
  });

  it("repasse maior que o disponível do caixa é recusado", () => {
    const p = plan({
      input: {transferId: MANUAL.id, kind: "organizerPayout", tournamentId: "t1", alreadySettled: false, note: ""},
      wallet: {availableReais: 50, ownerId: "org-1"},
      tournament: {name: "Copa X"},
    });
    assert.match(errorOf(p), /R\$ 50,00/);
  });

  it("repasse para caixa inexistente ou sem dono é recusado", () => {
    const input = {transferId: MANUAL.id, kind: "organizerPayout" as const, tournamentId: "t1", alreadySettled: false, note: ""};
    assert.match(errorOf(plan({input, wallet: null, tournament: {name: "Copa X"}})), /caixa/);
    assert.match(errorOf(plan({input, wallet: {availableReais: 500}, tournament: {}})), /dono/);
  });

  it("mesma classificação de novo não faz nada", () => {
    assert.equal(plan({existing: {kind: "withdrawal"}}).status, "unchanged");
  });

  it("repetir o mesmo repasse não baixa o caixa de novo", () => {
    const input = {transferId: MANUAL.id, kind: "organizerPayout" as const, tournamentId: "t1", alreadySettled: false, note: ""};
    assert.equal(plan({existing: {kind: "organizerPayout", tournamentId: "t1"}, input}).status, "unchanged");
    assert.equal(plan({existing: {kind: "organizerPayout", tournamentId: "t2"}, input}).status, "error");
  });

  it("retirada e despesa trocam entre si", () => {
    const p = plan({existing: {kind: "withdrawal"}, input: {transferId: MANUAL.id, kind: "expense", tournamentId: null, alreadySettled: false, note: "fornecedor"}});
    assert.equal(p.status, "update");
    if (p.status !== "update") return;
    assert.equal(p.record.kind, "expense");
    assert.equal(p.record.note, "fornecedor");
    assert.equal(p.record.previousKind, "withdrawal");
  });

  it("repasse já registrado não troca, e nada vira repasse depois", () => {
    assert.match(errorOf(plan({existing: {kind: "organizerPayout"}})), /repasse/i);
    const toPayout = plan({
      existing: {kind: "expense"},
      input: {transferId: MANUAL.id, kind: "organizerPayout", tournamentId: "t1", alreadySettled: false, note: ""},
      wallet: {availableReais: 500, ownerId: "o"},
      tournament: {},
    });
    assert.match(errorOf(toPayout), /repasse/i);
  });
});

describe("company-transfers: etiquetas do extrato", () => {
  const records = new Map<string, Record<string, unknown>>([
    ["t-ret", {kind: "withdrawal", note: ""}],
    ["t-rep", {kind: "organizerPayout", tournamentName: "Copa X", note: ""}],
  ]);
  const transfers = [
    {...MANUAL, id: "t-ret"},
    {...MANUAL, id: "t-rep"},
    {...MANUAL, id: "t-nova", value: 44.95, effectiveDate: "2026-10-26 10:40:42"},
    {...MANUAL, id: "t-nov", value: 10},
    {...MANUAL, id: "t-sistema", externalReference: "organizerWithdrawal:x"},
    {...MANUAL, id: "t-falhou", status: "FAILED"},
  ];

  it("classificadas ganham o tipo; manuais sem registro ficam a classificar", () => {
    const {tags, unclassified} = transferTags(transfers, records);
    assert.deepEqual(tags.get("t-ret"), {state: "classified", kind: "withdrawal", tournamentName: null, note: ""});
    assert.deepEqual(tags.get("t-rep"), {state: "classified", kind: "organizerPayout", tournamentName: "Copa X", note: ""});
    assert.deepEqual(tags.get("t-nova"), {state: "unclassified"});
    assert.equal(tags.has("t-sistema"), false);
    assert.equal(tags.has("t-falhou"), false);
    assert.deepEqual(unclassified, {count: 2, cents: 5495, months: ["2026-11", "2026-10"]});
  });

  it("sem a lista do Asaas: só as classificadas e nenhuma contagem", () => {
    const {tags, unclassified} = transferTags(null, records);
    assert.equal(tags.size, 2);
    assert.equal(unclassified, null);
  });
});

function errorOf(p: ReturnType<typeof planClassification>): string {
  return p.status === "error" ? p.message : "";
}
