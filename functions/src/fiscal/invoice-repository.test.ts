import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {createInvoiceRequest, readArenaFiscalConfig} from "./invoice-repository";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedConfig(fake: FakeFirestore): void {
  fake.seedDoc("arenas/arena1/fiscal/config", {
    cnpj: "12345678000199",
    razaoSocial: "Arena X Ltda",
    inscricaoMunicipal: "123456",
    regimeTributario: "simples_nacional",
    services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Quadra", aliquotaIss: 2}],
    defaultServiceIdBooking: "s1",
    mode: "always",
    status: "active",
  });
}

const input = {
  arenaId: "arena1",
  origin: "booking" as const,
  originId: "b1",
  idempotencyKey: "payment:pay_1",
  serviceId: "s1",
  codigoMunicipal: "3.03",
  aliquotaIss: 2,
  descricao: "Locação de quadra",
  tomador: {nome: "Fulano", cpfCnpj: "39053344705"},
  tomadorUid: "athlete1",
  valorBrutoReais: 100,
};

describe("readArenaFiscalConfig", () => {
  it("devolve null quando a arena não tem config fiscal", async () => {
    const fake = new FakeFirestore();
    assert.equal(await readArenaFiscalConfig(db(fake), "arena1"), null);
  });

  it("lê a config gravada", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);
    const config = await readArenaFiscalConfig(db(fake), "arena1");
    assert.equal(config?.status, "active");
    assert.equal(config?.services[0].codigoMunicipal, "3.03");
  });
});

describe("createInvoiceRequest", () => {
  it("cria o pedido com status requested", async () => {
    const fake = new FakeFirestore();
    const id = await createInvoiceRequest(db(fake), input);
    assert.ok(id);
    const doc = fake.store.get(`fiscalInvoices/${id}`);
    assert.equal(doc?.status, "requested");
    assert.equal(doc?.arenaId, "arena1");
    assert.equal(doc?.valorBrutoReais, 100);
    assert.equal(doc?.tomadorUid, "athlete1");
  });

  it("não cria a segunda nota para a mesma chave — o webhook repete", async () => {
    const fake = new FakeFirestore();
    const first = await createInvoiceRequest(db(fake), input);
    const second = await createInvoiceRequest(db(fake), input);
    assert.ok(first);
    assert.equal(second, null);
    const all = [...fake.store.keys()].filter((k) => k.startsWith("fiscalInvoices/"));
    assert.equal(all.length, 1);
  });

  it("cria notas separadas para chaves diferentes", async () => {
    const fake = new FakeFirestore();
    await createInvoiceRequest(db(fake), input);
    await createInvoiceRequest(db(fake), {...input, idempotencyKey: "payment:pay_2"});
    const all = [...fake.store.keys()].filter((k) => k.startsWith("fiscalInvoices/"));
    assert.equal(all.length, 2);
  });
});
