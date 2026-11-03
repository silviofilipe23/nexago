import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  anticipationTermsFromAccountFees,
  cardAnticipationPercent,
  cardFeeTermsFromAccountFees,
  cardSurcharge,
} from "./card-anticipation-fee";
import {tournamentOnlinePaymentMethods} from "./tournament-registration-pix-helpers";

describe("card-anticipation-fee", () => {
  it("tabela pública: 1,25% ao mês por 32 dias = 1,33% da cobrança", () => {
    assert.equal(cardAnticipationPercent({monthlyPercent: 1.25, daysToReceive: 32}), 1.33);
  });

  it("termos inválidos não cobram nada", () => {
    assert.equal(cardAnticipationPercent({monthlyPercent: 0, daysToReceive: 32}), 0);
    assert.equal(cardAnticipationPercent({monthlyPercent: 1.25, daysToReceive: 0}), 0);
  });

  it("acréscimo: processamento sobre o total + antecipação sobre a base", () => {
    const terms = {anticipationPercent: 1.33, processingPercent: 2.99, fixedReais: 0.49};
    // (100 + 1,33 + 0,49) / 0,9701 = 104,958… → 104,96.
    assert.deepEqual(cardSurcharge(100, terms), {totalCents: 496, processingCents: 363, anticipationCents: 133});
    // O Asaas tira 0,49 + 2,99% de 104,96 = 3,63 e sobram 101,33 = base + antecipação.
    assert.ok(10496 - Math.round(49 + 10496 * 0.0299) >= 10000 + 133);
    assert.deepEqual(cardSurcharge(0, terms), {totalCents: 0, processingCents: 0, anticipationCents: 0});
    assert.deepEqual(cardSurcharge(100, {anticipationPercent: 0, processingPercent: 0, fixedReais: 0}),
      {totalCents: 0, processingCents: 0, anticipationCents: 0});
    // Só antecipação (sem processamento): o acréscimo de antes.
    assert.equal(cardSurcharge(100, {anticipationPercent: 1.33, processingPercent: 0, fixedReais: 0}).totalCents, 133);
  });

  it("termos da conta: promoção vale até o dia de discountExpiration", () => {
    const fees = {
      payment: {creditCard: {
        operationValue: 0.49, oneInstallmentPercentage: 2.99,
        discountOneInstallmentPercentage: 1.99, discountExpiration: "2026-11-10 23:59:59", daysToReceive: 32,
      }},
      anticipation: {creditCard: {detachedMonthlyFeeValue: 1.25}},
    };
    assert.deepEqual(cardFeeTermsFromAccountFees(fees, "2026-11-10"),
      {anticipationPercent: 1.33, processingPercent: 1.99, fixedReais: 0.49});
    assert.equal(cardFeeTermsFromAccountFees(fees, "2026-11-11").processingPercent, 2.99);
    assert.deepEqual(cardFeeTermsFromAccountFees({}, "2026-11-03"),
      {anticipationPercent: 1.33, processingPercent: 2.99, fixedReais: 0.49});
  });

  it("lê as condições da conta em /myAccount/fees", () => {
    const terms = anticipationTermsFromAccountFees({
      payment: {creditCard: {daysToReceive: 30}},
      anticipation: {creditCard: {detachedMonthlyFeeValue: 2.49}},
    });
    assert.deepEqual(terms, {monthlyPercent: 2.49, daysToReceive: 30});
    assert.equal(cardAnticipationPercent(terms), 2.49);
  });

  it("campo ausente ou fora do contrato vale a tabela pública", () => {
    assert.deepEqual(anticipationTermsFromAccountFees({}), {monthlyPercent: 1.25, daysToReceive: 32});
    assert.deepEqual(
      anticipationTermsFromAccountFees({anticipation: {creditCard: {detachedMonthlyFeeValue: "2"}}}),
      {monthlyPercent: 1.25, daysToReceive: 32},
    );
  });
});

describe("tournamentOnlinePaymentMethods", () => {
  it("ausente, vazio ou lixo = Pix e cartão (acervo)", () => {
    assert.deepEqual(tournamentOnlinePaymentMethods(undefined), ["pix", "card"]);
    assert.deepEqual(tournamentOnlinePaymentMethods([]), ["pix", "card"]);
    assert.deepEqual(tournamentOnlinePaymentMethods(["boleto"]), ["pix", "card"]);
    assert.deepEqual(tournamentOnlinePaymentMethods("pix"), ["pix", "card"]);
  });

  it("só Pix, só cartão, os dois", () => {
    assert.deepEqual(tournamentOnlinePaymentMethods(["pix"]), ["pix"]);
    assert.deepEqual(tournamentOnlinePaymentMethods(["card"]), ["card"]);
    assert.deepEqual(tournamentOnlinePaymentMethods(["card", "pix"]), ["pix", "card"]);
  });
});
