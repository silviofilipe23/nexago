import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  FinanceBook,
  addArenaLedgerLine,
  addArenaSubscriptionPayment,
  addArenaWithdrawal,
  addAsaasStatementEntry,
  addCenterInvoice,
  addHolding,
  addPlanContract,
  addProfessorCharge,
  addSquadCommission,
  addStockEntry,
  addStoreOrder,
  addTournamentLedgerLine,
  asaasNetCost,
  balanceSummary,
  costsTotal,
  deductionsTotal,
  holdingOf,
  inAccountCents,
  monthKeyOf,
  monthResult,
  monthWindow,
  pendingReturnSettlementCents,
  pendingStoreRefundCents,
  professorChargeFeeCents,
  revenueTotal,
  windowDates,
} from "./company-finance";

const NOV = new Date("2026-11-10T15:00:00Z");
const OCT = new Date("2026-10-10T15:00:00Z");

function book(operating = 0): FinanceBook {
  return new FinanceBook(monthWindow("2026-11", 6), operating);
}

function nov(b: FinanceBook) {
  return b.result().find((m) => m.key === "2026-11")!;
}

describe("company-finance: meses em São Paulo", () => {
  it("janela de 6 meses terminando no mês pedido, com virada de ano", () => {
    assert.deepEqual(monthWindow("2026-02", 3), ["2025-12", "2026-01", "2026-02"]);
    assert.deepEqual(windowDates(monthWindow("2026-02", 3)), {start: "2025-12-01", finish: "2026-02-28"});
  });

  it("00:30 UTC de 1º de dezembro ainda é novembro em SP", () => {
    assert.equal(monthKeyOf(new Date("2026-12-01T00:30:00Z")), "2026-11");
  });

  it("valor fora da janela é ignorado", () => {
    const b = book();
    addTournamentLedgerLine(b, {type: "credit", platformFeeReais: 10, createdAt: new Date("2025-01-01T12:00:00Z")});
    assert.equal(b.result().reduce((s, m) => s + revenueTotal(m), 0), 0);
  });
});

describe("company-finance: fontes de receita", () => {
  it("torneio: taxa do organizador + do atleta; cashback e Squad são dedução; tarifas repassadas voltam", () => {
    const b = book();
    addTournamentLedgerLine(b, {
      type: "credit", platformFeeReais: 12.8, serviceFeeReais: 4.35, cashbackAppliedReais: 16,
      squadDiscountReais: 8, gatewayFeeReais: 4.62, cardFeeReais: 2.1, createdAt: NOV,
    });
    addTournamentLedgerLine(b, {type: "debit", platformFeeReais: 99, createdAt: NOV});
    const m = nov(b);
    assert.equal(m.revenue.torneios, 1715);
    assert.equal(m.deductions.cashback, 1600);
    assert.equal(m.deductions.squadDiscount, 800);
    assert.equal(m.feesRecovered, 672);
  });

  it("arena: sem source = quadra; class, schedule_plan e club vão para a própria linha; estorno não é receita", () => {
    const b = book();
    addArenaLedgerLine(b, {type: "credit", platformFeeReais: 8, createdAt: NOV});
    addArenaLedgerLine(b, {type: "credit", source: "class", platformFeeReais: 6, createdAt: NOV});
    addArenaLedgerLine(b, {type: "credit", source: "schedule_plan", platformFeeReais: 5, createdAt: NOV});
    addArenaLedgerLine(b, {type: "credit", source: "club", platformFeeReais: 1.5, createdAt: NOV});
    addArenaLedgerLine(b, {type: "refund", source: "club", grossReais: -20, platformFeeReais: 0, createdAt: NOV});
    const m = nov(b);
    assert.deepEqual([m.revenue.quadras, m.revenue.aulas, m.revenue.horarios, m.revenue.clubinho], [800, 600, 500, 150]);
  });

  it("assinatura da arena: só cobrança paga, pela data do pagamento", () => {
    const b = book();
    addArenaSubscriptionPayment(b, {status: "RECEIVED", value: 346, paymentDate: "2026-11-03"});
    addArenaSubscriptionPayment(b, {status: "CONFIRMED", value: 249, confirmedDate: "2026-10-03"});
    addArenaSubscriptionPayment(b, {status: "OVERDUE", value: 249, dueDate: "2026-11-03"});
    assert.equal(nov(b).revenue.planosArena, 34600);
    assert.equal(b.result().find((m) => m.key === "2026-10")!.revenue.planosArena, 24900);
  });

  it("tarifa de saque da arena só conta saque aprovado", () => {
    const b = book();
    addArenaWithdrawal(b, {status: "approved", feeReais: 1.75, paidAt: NOV});
    addArenaWithdrawal(b, {status: "rejected", feeReais: 1.75, reviewedAt: NOV});
    addArenaWithdrawal(b, {status: "pending", feeReais: 1.75, createdAt: NOV});
    assert.equal(nov(b).revenue.saques, 175);
  });

  it("loja: pedido pago vale o total menos o devolvido; saldo usado é cashback; sem pagamento não conta", () => {
    const b = book();
    addStoreOrder(b, {paidAt: NOV, totalCents: 37021, refundedCents: 5000, walletCents: 1200});
    addStoreOrder(b, {paidAt: null, totalCents: 87381, status: "can"});
    const m = nov(b);
    assert.equal(m.revenue.loja, 32021);
    assert.equal(m.deductions.cashback, 1200);
  });

  it("compra de estoque usa o custo com frete; ajuste e transferência não são compra", () => {
    const b = book();
    addStockEntry(b, {type: "entrada", subtype: "compra", status: "confirmada", createdAt: NOV,
      items: [{qty: 10, unitCostCents: 3000, unitCostWithFreightCents: 3200}, {qty: 2, unitCostCents: 500}]});
    addStockEntry(b, {type: "ajuste", subtype: "ajuste", createdAt: NOV, items: [{qty: 5, unitCostCents: 100}]});
    addStockEntry(b, {type: "entrada", subtype: "devolucao", createdAt: NOV, items: [{qty: 1, unitCostCents: 100}]});
    assert.equal(nov(b).stockPurchases, 33000);
  });

  it("professor: 5% do líquido do Asaas, reconstruído dos 95% gravados", () => {
    assert.equal(professorChargeFeeCents({status: "paid", feePercent: 5, netReais: 95}), 500);
    assert.equal(professorChargeFeeCents({status: "paid", feePercent: 5, amountReais: 100}), 500);
    assert.equal(professorChargeFeeCents({status: "open", feePercent: 5, netReais: 95}), 0);
    const b = book();
    addProfessorCharge(b, {status: "paid", feePercent: 5, netReais: 190, paidAt: NOV});
    assert.equal(nov(b).revenue.professores, 1000);
  });

  it("centro de treino: % da fatura aprovada, com o padrão de 5%", () => {
    const b = book();
    addCenterInvoice(b, {status: "approved", amountCents: 20000, approvedAt: NOV}, null);
    addCenterInvoice(b, {status: "approved", amountCents: 20000, approvedAt: NOV}, 10);
    addCenterInvoice(b, {status: "pending", amountCents: 20000, approvedAt: NOV}, 10);
    assert.equal(nov(b).revenue.centros, 3000);
  });

  it("plano NexaGO: sinal num mês, saldo no outro; sem sinal, o valor cheio", () => {
    const b = book();
    addPlanContract(b, {depositPaidAt: OCT, paidAt: NOV, depositCents: 150000, balanceCents: 150000, priceCents: 300000});
    addPlanContract(b, {paidAt: NOV, priceCents: 120000});
    assert.equal(b.result().find((m) => m.key === "2026-10")!.revenue.planosNexago, 150000);
    assert.equal(nov(b).revenue.planosNexago, 270000);
  });

  it("comissão do Squad conta liberada ou paga, pela liberação", () => {
    const b = book();
    addSquadCommission(b, {status: "released", amountCents: 372, releasedAt: NOV});
    addSquadCommission(b, {status: "paid", amountCents: 500, releasedAt: OCT, paidAt: NOV});
    addSquadCommission(b, {status: "canceled", amountCents: 999, releasedAt: NOV});
    assert.equal(nov(b).deductions.squadCommission, 372);
  });
});

describe("company-finance: custos e resultado", () => {
  it("tarifa do Asaas = débito com FEE no tipo; recebimento e transferência não são tarifa", () => {
    const b = book();
    addAsaasStatementEntry(b, {type: "PAYMENT_FEE", value: -1.99, date: "2026-11-05"});
    addAsaasStatementEntry(b, {type: "TRANSFER_FEE", value: -2, date: "2026-11-05"});
    addAsaasStatementEntry(b, {type: "PAYMENT_RECEIVED", value: 160, date: "2026-11-05"});
    addAsaasStatementEntry(b, {type: "TRANSFER", value: -500, date: "2026-11-05"});
    assert.equal(nov(b).asaasFees, 399);
  });

  it("resultado = receita − deduções − (Asaas líquido + estoque + operação)", () => {
    const b = book(45199);
    addTournamentLedgerLine(b, {type: "credit", platformFeeReais: 100, cashbackAppliedReais: 10, gatewayFeeReais: 3, createdAt: NOV});
    addAsaasStatementEntry(b, {type: "PAYMENT_FEE", value: -5, date: "2026-11-05"});
    const m = nov(b);
    assert.equal(revenueTotal(m), 10000);
    assert.equal(deductionsTotal(m), 1000);
    assert.equal(asaasNetCost(m), 200);
    assert.equal(costsTotal(m), 200 + 45199);
    assert.equal(monthResult(m), 10000 - 1000 - 45399);
  });

  it("sem extrato a tarifa vira null e não entra na conta", () => {
    const b = book();
    b.markAsaasFeesUnknown();
    addAsaasStatementEntry(b, {type: "PAYMENT_FEE", value: -5, date: "2026-11-05"});
    assert.equal(nov(b).asaasFees, null);
    assert.equal(asaasNetCost(nov(b)), 0);
  });
});

describe("company-finance: saldo", () => {
  it("terceiros = disponível + em saque; o a liberar fica de fora", () => {
    const h = addHolding(holdingOf({availableReais: 2817.03, awaitingSettlementReais: 461.08}), holdingOf({pendingReais: 571.03}));
    assert.equal(inAccountCents(h), 338806);
    assert.equal(h.awaitingCents, 46108);
    assert.equal(h.count, 2);
  });

  it("saldo da NexaGO e saldo livre; sem Asaas, os dois ficam null", () => {
    assert.deepEqual(balanceSummary(984217, 340206, 33266), {
      asaasCents: 984217, thirdPartyCents: 340206, provisionsCents: 33266, companyCents: 644011, freeCents: 610745,
    });
    assert.equal(balanceSummary(null, 1, 1).freeCents, null);
  });

  it("devolução pendente da loja: só o que volta em dinheiro", () => {
    assert.equal(pendingStoreRefundCents({refunds: [
      {status: "pendente", destination: "original", amountCents: 25330},
      {status: "pendente", destination: "saldo", amountCents: 1000},
      {status: "feito", destination: "original", amountCents: 500},
    ]}), 25330);
    assert.equal(pendingReturnSettlementCents({settlement: {type: "reembolso", status: "pendente", amountCents: 900}}), 900);
    assert.equal(pendingReturnSettlementCents({settlement: {type: "saldo", status: "pendente", amountCents: 900}}), 0);
  });
});
