import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {applyIssuerNotification} from "./invoice-webhook";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedProcessing(fake: FakeFirestore): void {
  fake.seedDoc("fiscalInvoices/inv1", {
    arenaId: "arena1",
    status: "processing",
    valorBrutoReais: 100,
  });
}

describe("applyIssuerNotification", () => {
  it("marca autorizada com número, PDF e XML", async () => {
    const fake = new FakeFirestore();
    seedProcessing(fake);

    await applyIssuerNotification(db(fake), {
      ref: "inv1",
      status: "autorizado",
      numero: "42",
      serie: "1",
      codigo_verificacao: "ABC",
      url_danfse: "https://focus/nota.pdf",
      caminho_xml_nota_fiscal: "https://focus/nota.xml",
    });

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "authorized");
    assert.equal(doc?.numero, "42");
    assert.equal(doc?.xmlUrl, "https://focus/nota.xml");
  });

  it("marca rejeitada guardando a mensagem da prefeitura", async () => {
    const fake = new FakeFirestore();
    seedProcessing(fake);

    await applyIssuerNotification(db(fake), {
      ref: "inv1",
      status: "erro_autorizacao",
      mensagem: "Código de serviço não habilitado",
    });

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "rejected");
    assert.equal(doc?.errorMessage, "Código de serviço não habilitado");
  });

  it("ignora notificação de nota que não existe", async () => {
    const fake = new FakeFirestore();
    await applyIssuerNotification(db(fake), {ref: "sumiu", status: "autorizado"});
    assert.equal(fake.store.get("fiscalInvoices/sumiu"), undefined);
  });

  it("não rebaixa uma nota já autorizada", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("fiscalInvoices/inv1", {arenaId: "arena1", status: "authorized", numero: "42"});

    await applyIssuerNotification(db(fake), {ref: "inv1", status: "processando_autorizacao"});

    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "authorized");
  });
});
