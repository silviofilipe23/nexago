import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {chargeIdempotencySuffix, dueAfterSquadDiscount} from "./tournament-registration-pix";
import {athleteFeeReais} from "./tournament-fees";

process.env.GCLOUD_PROJECT = "p";

describe("cobrança da inscrição: quem paga a taxa", () => {
  const rule = (payer: "atleta" | "organizador" | "dividido") => ({percent: 8, floorReais: 1.5, payer});

  it("organizador paga: valor e chave de idempotência iguais aos de antes do campo", () => {
    const charge = {chargeAmount: 50, serviceFeeReais: athleteFeeReais(50, rule("organizador")), squad: null};
    assert.equal(dueAfterSquadDiscount(charge), 50);
    assert.equal(chargeIdempotencySuffix(charge), "");
    assert.equal(chargeIdempotencySuffix({...charge, squad: {discountCents: 200}}), "-sq200");
  });

  it("atleta paga: parcela + taxa da parcela; dividido: + metade", () => {
    assert.equal(dueAfterSquadDiscount({chargeAmount: 50, serviceFeeReais: athleteFeeReais(50, rule("atleta")), squad: null}),
      54);
    assert.equal(dueAfterSquadDiscount({chargeAmount: 100, serviceFeeReais: athleteFeeReais(100, rule("dividido")),
      squad: null}), 104);
  });

  it("desconto do seguidor sai do total; a chave muda com a taxa para o Asaas não devolver a cobrança antiga", () => {
    const charge = {chargeAmount: 50, serviceFeeReais: 4, squad: {discountCents: 200}};
    assert.equal(dueAfterSquadDiscount(charge), 52);
    assert.equal(chargeIdempotencySuffix(charge), "-sq200-tx400");
    assert.equal(chargeIdempotencySuffix({...charge, squad: null}), "-tx400");
  });
});
