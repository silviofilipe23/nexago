import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  anticipationTermsFromAccountFees,
  cardAnticipationFeeCents,
  cardAnticipationPercent,
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

  it("taxa em centavos sobre o valor do cartão", () => {
    assert.equal(cardAnticipationFeeCents(100, 1.33), 133);
    assert.equal(cardAnticipationFeeCents(54.5, 1.33), 72);
    assert.equal(cardAnticipationFeeCents(0, 1.33), 0);
    assert.equal(cardAnticipationFeeCents(100, 0), 0);
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
