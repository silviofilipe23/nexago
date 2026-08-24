import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {FakeIssuer} from "./fake-issuer.test-helper";
import {processInvoiceRequest} from "./invoice-processor";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedAll(fake: FakeFirestore, overrides: Record<string, unknown> = {}): void {
  fake.seedDoc("arenas/arena1/fiscal/config", {
    cnpj: "12345678000199",
    razaoSocial: "Arena X Ltda",
    inscricaoMunicipal: "123456",
    regimeTributario: "simples_nacional",
    enderecoFiscal: {codigoIbge: "5208707", municipio: "Goiânia", uf: "GO"},
    services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Quadra", aliquotaIss: 2}],
    defaultServiceIdBooking: "s1",
    issuerId: "emp_1",
    credentialSecretName: "fiscal-arena1",
    mode: "always",
    status: "active",
    ...overrides,
  });
  fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", paymentStatus: "paid"});
  fake.seedDoc("fiscalInvoices/inv1", {
    arenaId: "arena1",
    origin: "booking",
    originId: "b1",
    idempotencyKey: "payment:pay_1",
    serviceId: "s1",
    codigoMunicipal: "3.03",
    aliquotaIss: 2,
    descricao: "Locação de quadra",
    tomador: {nome: "Fulano", cpfCnpj: "39053344705"},
    tomadorUid: "athlete1",
    valorBrutoReais: 100,
    status: "requested",
  });
}

const readToken = async () => "tok_teste";

describe("processInvoiceRequest", () => {
  it("autoriza e grava número, PDF e XML", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "authorized");
    assert.equal(doc?.numero, "42");
    assert.equal(doc?.pdfUrl, "https://exemplo/nota.pdf");
    assert.equal(issuer.issued.length, 1);
    assert.equal(issuer.issued[0].servico.valorServicos, 100);
    assert.equal(issuer.issued[0].servico.itemListaServico, "3.03");
  });

  it("marca rejeitada com a mensagem crua do emissor", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    const issuer = new FakeIssuer();
    issuer.nextResult = {status: "rejected", errorMessage: "Inscrição municipal inválida"};

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "rejected");
    assert.equal(doc?.errorMessage, "Inscrição municipal inválida");
  });

  it("não emite quando a config foi desligada depois do pedido", async () => {
    const fake = new FakeFirestore();
    seedAll(fake, {mode: "off"});
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    assert.equal(issuer.issued.length, 0);
    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "rejected");
    // Mensagem em português: o gestor lê isto cru na lista de notas fiscais.
    assert.equal(
      fake.store.get("fiscalInvoices/inv1")?.errorMessage,
      "Emissão automática desligada para esta arena.",
    );
  });

  it("não emite quando a reserva ainda não está paga", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", paymentStatus: "pending"});
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    assert.equal(issuer.issued.length, 0);
    assert.equal(
      fake.store.get("fiscalInvoices/inv1")?.errorMessage,
      "Pagamento ainda não confirmado.",
    );
  });

  it("emite a fatia paga do split mesmo com a reserva ainda pendente", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    // As outras fatias ainda não pagaram, então `finalizeArenaBooking...` não
    // rodou e a reserva continua `pending` — o que vale é a fatia desta nota.
    fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", paymentStatus: "pending"});
    fake.seedDoc("arenaBookings/b1/paymentShares/sh1", {status: "paid"});
    fake.seedDoc("fiscalInvoices/inv1", {
      ...(fake.store.get("fiscalInvoices/inv1") as Record<string, unknown>),
      shareId: "sh1",
    });
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    assert.equal(issuer.issued.length, 1);
    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "authorized");
  });

  it("não emite quando a própria fatia do split ainda está pendente", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", paymentStatus: "paid"});
    fake.seedDoc("arenaBookings/b1/paymentShares/sh1", {status: "pending"});
    fake.seedDoc("fiscalInvoices/inv1", {
      ...(fake.store.get("fiscalInvoices/inv1") as Record<string, unknown>),
      shareId: "sh1",
    });
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    assert.equal(issuer.issued.length, 0);
    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "rejected");
    assert.equal(
      fake.store.get("fiscalInvoices/inv1")?.errorMessage,
      "Pagamento ainda não confirmado.",
    );
  });

  it("ignora pedido que já não está em requested — o trigger pode repetir", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    fake.seedDoc("fiscalInvoices/inv1", {
      ...(fake.store.get("fiscalInvoices/inv1") as Record<string, unknown>),
      status: "authorized",
    });
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    assert.equal(issuer.issued.length, 0);
  });

  it("não rebaixa nota que o webhook autorizou enquanto a chamada corria", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    const issuer = new FakeIssuer();
    issuer.nextResult = {status: "rejected", errorMessage: "recusada"};
    // Simula o `fiscalIssuerWebhook` chegando com a autorização no meio da
    // chamada ao emissor: o pedido passa pela guarda inicial em `requested`,
    // mas já está terminal quando a gravação final vai acontecer.
    const issue = issuer.issueServiceInvoice.bind(issuer);
    issuer.issueServiceInvoice = async (token, input) => {
      fake.seedDoc("fiscalInvoices/inv1", {
        ...(fake.store.get("fiscalInvoices/inv1") as Record<string, unknown>),
        status: "authorized",
        numero: "42",
        pdfUrl: "https://exemplo/nota.pdf",
      });
      return issue(token, input);
    };

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "authorized");
    assert.equal(doc?.numero, "42");
    assert.equal(doc?.pdfUrl, "https://exemplo/nota.pdf");
    assert.equal(doc?.errorMessage, undefined);
  });

  it("deixa em requested quando o emissor cai, para o retry pegar", async () => {
    const fake = new FakeFirestore();
    seedAll(fake);
    const issuer = new FakeIssuer();
    issuer.throwOnIssue = new Error("ECONNRESET");

    await assert.rejects(() => processInvoiceRequest(db(fake), issuer, readToken, "inv1"));

    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "requested");
  });
});
