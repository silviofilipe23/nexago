import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {
  requestInvoiceForPaidBooking,
  requestInvoiceForPaidClubSpot,
  shouldAttemptFiscalInvoice,
} from "./payment-hooks";

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
    defaultServiceIdClub: "s1",
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

  it("grava o shareId quando a nota veio de uma fatia do split", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    await requestInvoiceForPaidBooking(db(fake), {...input, shareId: "sh1"});
    const doc = fake.store.get(invoices(fake)[0]);
    assert.equal(doc?.shareId, "sh1");
  });

  it("grava shareId nulo no pagamento único da reserva", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    await requestInvoiceForPaidBooking(db(fake), input);
    const doc = fake.store.get(invoices(fake)[0]);
    assert.equal(doc?.shareId, null);
  });
});

const clubInput = {
  arenaId: "arena1",
  sessionId: "sess1",
  participantId: "athlete1",
  asaasPaymentId: "pay_9",
  grossReais: 45,
  tomador: {nome: "Fulano", cpfCnpj: "39053344705"},
  tomadorUid: "athlete1",
};

describe("requestInvoiceForPaidClubSpot", () => {
  it("cria o pedido pelo valor bruto quando o modo é sempre", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    await requestInvoiceForPaidClubSpot(db(fake), clubInput);
    const keys = invoices(fake);
    assert.equal(keys.length, 1);
    const doc = fake.store.get(keys[0]);
    assert.equal(doc?.valorBrutoReais, 45);
    assert.equal(doc?.origin, "club");
    assert.equal(doc?.originId, "sess1:athlete1");
    assert.equal(doc?.idempotencyKey, "payment:pay_9");
    assert.equal(doc?.descricao, "Locação de quadra");
  });

  it("não faz nada quando a arena não tem config fiscal", async () => {
    const fake = new FakeFirestore();
    await requestInvoiceForPaidClubSpot(db(fake), clubInput);
    assert.equal(invoices(fake).length, 0);
  });

  it("não cria nada no modo sob demanda", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {mode: "on_demand"});
    await requestInvoiceForPaidClubSpot(db(fake), clubInput);
    assert.equal(invoices(fake).length, 0);
  });

  it("não cria nada com a config em rascunho", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {status: "draft"});
    await requestInvoiceForPaidClubSpot(db(fake), clubInput);
    assert.equal(invoices(fake).length, 0);
  });

  it("não cria duas notas quando o webhook repete", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    await requestInvoiceForPaidClubSpot(db(fake), clubInput);
    await requestInvoiceForPaidClubSpot(db(fake), clubInput);
    assert.equal(invoices(fake).length, 1);
  });

  it("nunca propaga erro — confirmação de pagamento não pode cair por causa de nota", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {defaultServiceIdClub: "inexistente"});
    await requestInvoiceForPaidClubSpot(db(fake), clubInput);
    assert.equal(invoices(fake).length, 0);
  });
});

describe("shouldAttemptFiscalInvoice", () => {
  it("é verdadeiro com a config ativa no modo sempre", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    assert.equal(await shouldAttemptFiscalInvoice(db(fake), "arena1"), true);
  });

  it("é falso quando a arena não tem config fiscal", async () => {
    const fake = new FakeFirestore();
    assert.equal(await shouldAttemptFiscalInvoice(db(fake), "arena1"), false);
  });

  it("é falso no modo sob demanda e no desligado", async () => {
    const onDemand = new FakeFirestore();
    seedConfig(onDemand, {mode: "on_demand"});
    assert.equal(await shouldAttemptFiscalInvoice(db(onDemand), "arena1"), false);

    const off = new FakeFirestore();
    seedConfig(off, {mode: "off"});
    assert.equal(await shouldAttemptFiscalInvoice(db(off), "arena1"), false);
  });

  it("é falso enquanto a config não estiver ativa", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {status: "testing"});
    assert.equal(await shouldAttemptFiscalInvoice(db(fake), "arena1"), false);
  });
});
