import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {requestInvoiceForPaidBooking} from "./payment-hooks";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedConfig(fake: FakeFirestore, overrides: Record<string, unknown> = {}): void {
  fake.seedDoc("arenas/arena1/fiscal/config", {
    cnpj: "12345678000199",
    razaoSocial: "Arena X Ltda",
    inscricaoMunicipal: "123456",
    regimeTributario: "simples_nacional",
    enderecoFiscal: {codigoIbge: "5208707"},
    services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Locação de quadra", aliquotaIss: 2}],
    defaultServiceIdBooking: "s1",
    mode: "always",
    status: "active",
    ...overrides,
  });
}

const input = {
  arenaId: "arena1",
  bookingId: "b1",
  asaasPaymentId: "pay_1",
  grossReais: 100,
  tomador: {nome: "Fulano", cpfCnpj: "39053344705"},
  tomadorUid: "athlete1",
};

function invoices(fake: FakeFirestore): string[] {
  return [...fake.store.keys()].filter((k) => k.startsWith("fiscalInvoices/"));
}

describe("requestInvoiceForPaidBooking", () => {
  it("cria o pedido pelo valor bruto quando o modo é sempre", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    await requestInvoiceForPaidBooking(db(fake), input);
    const keys = invoices(fake);
    assert.equal(keys.length, 1);
    const doc = fake.store.get(keys[0]);
    assert.equal(doc?.valorBrutoReais, 100);
    assert.equal(doc?.idempotencyKey, "payment:pay_1");
    assert.equal(doc?.descricao, "Locação de quadra");
  });

  it("não faz nada quando a arena não tem config fiscal", async () => {
    const fake = new FakeFirestore();
    await requestInvoiceForPaidBooking(db(fake), input);
    assert.equal(invoices(fake).length, 0);
  });

  it("não cria nada no modo sob demanda", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {mode: "on_demand"});
    await requestInvoiceForPaidBooking(db(fake), input);
    assert.equal(invoices(fake).length, 0);
  });

  it("não cria nada com a config em rascunho", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {status: "draft"});
    await requestInvoiceForPaidBooking(db(fake), input);
    assert.equal(invoices(fake).length, 0);
  });

  it("não cria duas notas quando o webhook repete", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    await requestInvoiceForPaidBooking(db(fake), input);
    await requestInvoiceForPaidBooking(db(fake), input);
    assert.equal(invoices(fake).length, 1);
  });

  it("nunca propaga erro — confirmação de pagamento não pode cair por causa de nota", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {defaultServiceIdBooking: "inexistente"});
    await requestInvoiceForPaidBooking(db(fake), input);
    assert.equal(invoices(fake).length, 0);
  });
});
