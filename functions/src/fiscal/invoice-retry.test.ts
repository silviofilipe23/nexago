import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {FakeIssuer} from "./fake-issuer.test-helper";
import {processInvoiceRequest} from "./invoice-processor";
import {reprocessFiscalInvoice, retryFiscalInvoiceCore} from "./invoice-retry";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedArena(fake: FakeFirestore): void {
  fake.seedDoc("arenas/arena1", {managerUserId: "manager1", name: "Arena X"});
}

// Config ativa da arena — necessária para `processInvoiceRequest` autorizar a
// nota reemitida. Sem isto, `shouldProcess` rejeita com CONFIG_NOT_EMITTING
// mesmo depois do reset, e a nota volta pra "rejected" (não "authorized").
function seedActiveFiscalConfig(fake: FakeFirestore): void {
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
  });
}

function seedRejectedInvoice(fake: FakeFirestore, overrides: Record<string, unknown> = {}): void {
  seedActiveFiscalConfig(fake);
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
    status: "rejected",
    errorMessage: "Pagamento ainda não confirmado.",
    ...overrides,
  });
  fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", paymentStatus: "paid"});
}

const readToken = async () => "tok_teste";

describe("reprocessFiscalInvoice", () => {
  it("reseta status e errorMessage antes de reprocessar", async () => {
    const fake = new FakeFirestore();
    seedRejectedInvoice(fake);
    const issuer = new FakeIssuer();

    await reprocessFiscalInvoice(db(fake), issuer, readToken, "inv1");

    const doc = fake.store.get("fiscalInvoices/inv1");
    assert.equal(doc?.status, "authorized");
    assert.equal(doc?.errorMessage, null);
    assert.equal(issuer.issued.length, 1);
  });

  it("sem o reset, processInvoiceRequest seria um no-op — prova que o reset é necessário", async () => {
    // Sanity check da premissa do design: chamar processInvoiceRequest direto
    // numa nota "rejected" (sem passar por reprocessFiscalInvoice) não faz nada,
    // porque a guarda de entrada exige status "requested".
    const fake = new FakeFirestore();
    seedRejectedInvoice(fake);
    const issuer = new FakeIssuer();

    await processInvoiceRequest(db(fake), issuer, readToken, "inv1");

    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "rejected");
    assert.equal(issuer.issued.length, 0);
  });
});

describe("retryFiscalInvoiceCore", () => {
  it("reemite uma nota rejeitada da própria arena", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedRejectedInvoice(fake);
    const issuer = new FakeIssuer();

    await retryFiscalInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      invoiceId: "inv1",
      callerUid: "manager1",
    });

    assert.equal(fake.store.get("fiscalInvoices/inv1")?.status, "authorized");
  });

  it("recusa quem não é gestor da arena", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedRejectedInvoice(fake);
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        retryFiscalInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          invoiceId: "inv1",
          callerUid: "intruso",
        }),
      /permission-denied|PERMISSION/,
    );
  });

  it("recusa nota que não pertence à arena informada", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedRejectedInvoice(fake, {arenaId: "arena2"});
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        retryFiscalInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          invoiceId: "inv1",
          callerUid: "manager1",
        }),
      /not-found|NOT_FOUND/,
    );
  });

  it("recusa nota que não está rejected", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedRejectedInvoice(fake, {status: "authorized"});
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        retryFiscalInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          invoiceId: "inv1",
          callerUid: "manager1",
        }),
      /failed-precondition|NOT_REJECTED/,
    );
  });

  it("recusa cancellation_failed — rota do contador, não reemitir simples", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedRejectedInvoice(fake, {status: "cancellation_failed"});
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        retryFiscalInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          invoiceId: "inv1",
          callerUid: "manager1",
        }),
      /failed-precondition|NOT_REJECTED/,
    );
  });
});
