/**
 * Riscos de segurança da view do Financeiro que antes só existiam DENTRO da
 * callable — e por isso não tinham teste nenhum: a máscara da chave PIX por
 * linha e a seleção do caixa quando o pedido não está na lista.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {buildWithdrawalRow, selectWalletRow} from "./organizer-withdrawal";

const EU = "gestor-uid";
const OUTRO = "outro-gestor-uid";
const CPF = "12345678901";

describe("buildWithdrawalRow: máscara da chave por linha", () => {
  it("o próprio solicitante vê a chave dele por extenso", () => {
    const row = buildWithdrawalRow(
      {id: "w1", data: {requestedBy: EU, pixKey: CPF, amountReais: 120}},
      EU,
    );
    assert.equal(row.pixKey, CPF);
  });

  it("chave de OUTRA pessoa vai mascarada — inclusive CPF de 11 dígitos", () => {
    // O motivo de a máscara ser esta e não a do cliente: `maskPixKey` do
    // portal só trunca acima de 12 caracteres, e CPF tem 11 — passava inteiro.
    const row = buildWithdrawalRow(
      {id: "w1", data: {requestedBy: OUTRO, pixKey: CPF, amountReais: 120}},
      EU,
    );
    assert.notEqual(row.pixKey, CPF);
    assert.equal(row.pixKey, "123••••••01");
    assert.ok(!row.pixKey.includes("456"), "o miolo do CPF não pode sobrar");
  });

  it("saque sem `requestedBy` (doc legado) também vai mascarado", () => {
    // Doc anterior a 16/09/2026 não grava `requestedBy`: "" nunca é igual a um
    // uid, então cai na máscara. É o lado seguro do empate.
    const row = buildWithdrawalRow({id: "w1", data: {pixKey: CPF}}, EU);
    assert.equal(row.pixKey, "123••••••01");
    assert.equal(row.requestedBy, "");
  });

  it("chave ausente não inventa máscara", () => {
    const row = buildWithdrawalRow({id: "w1", data: {requestedBy: OUTRO}}, EU);
    assert.equal(row.pixKey, "");
  });

  it("preenche os padrões da linha e converte a data", () => {
    const criado = Timestamp.fromDate(new Date("2026-09-16T12:00:00.000Z"));
    const row = buildWithdrawalRow(
      {
        id: "w9",
        data: {
          requestedBy: EU, requestedByStaff: true, pixKey: "eu@exemplo.com",
          amountReais: 500.5, status: "approved", payoutStatus: "sent",
          createdAt: criado,
        },
      },
      EU,
    );
    assert.deepEqual(row, {
      id: "w9",
      amountReais: 500.5,
      status: "approved",
      pixKey: "eu@exemplo.com",
      requestedBy: EU,
      requestedByStaff: true,
      payoutStatus: "sent",
      createdAt: "2026-09-16T12:00:00.000Z",
    });
  });

  it("doc sem campos cai em pendente, sem staff e sem data", () => {
    const row = buildWithdrawalRow({id: "w0", data: {}}, EU);
    assert.equal(row.status, "pending");
    assert.equal(row.requestedByStaff, false);
    assert.equal(row.payoutStatus, null);
    assert.equal(row.createdAt, null);
    assert.equal(row.amountReais, 0);
  });
});

describe("selectWalletRow: qual caixa a tela abre", () => {
  // `buildWalletViewRows` já entrega ordenado por disponível, então "o
  // primeiro" é "o mais cheio".
  const rows = [
    {tournamentId: "cheio", availableReais: 300},
    {tournamentId: "vazio", availableReais: 0},
  ];

  it("abre o caixa pedido quando ele está na lista", () => {
    assert.equal(selectWalletRow(rows, "vazio")?.tournamentId, "vazio");
  });

  it("pedido fora da lista cai no caixa mais cheio", () => {
    // Acontece de verdade: a lista muda quando alguém sai da equipe e o
    // cliente pode ter guardado a antiga.
    assert.equal(selectWalletRow(rows, "torneio-que-saiu")?.tournamentId, "cheio");
  });

  it("sem pedido nenhum abre o mais cheio", () => {
    assert.equal(selectWalletRow(rows, "")?.tournamentId, "cheio");
  });

  it("pedido só com espaços é pedido nenhum", () => {
    assert.equal(selectWalletRow(rows, "   ")?.tournamentId, "cheio");
  });

  it("lista vazia não tem caixa para abrir", () => {
    assert.equal(selectWalletRow([], "cheio"), null);
  });
});
