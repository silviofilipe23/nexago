import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {FakeIssuer} from "./fake-issuer.test-helper";
import {invoiceIdFor} from "./invoice-repository";
import {
  emitActivationTestInvoiceCore,
  applyActivationOutcome,
} from "./activation";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedArena(fake: FakeFirestore): void {
  fake.seedDoc("arenas/arena1", {managerUserId: "manager1", name: "Arena X"});
}

function seedConfig(fake: FakeFirestore, overrides: Record<string, unknown> = {}): void {
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
    mode: "off",
    status: "testing",
    ...overrides,
  });
}

const activationId = invoiceIdFor("arena1", "activation:arena1");
const readToken = async () => "tok_teste";

describe("emitActivationTestInvoiceCore", () => {
  it("cria a nota de teste quando não existe nenhuma ainda — sem processar direto, o trigger de criação da Fatia A cuida disso", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake);
    const issuer = new FakeIssuer();

    await emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      callerUid: "manager1",
    });

    const doc = fake.store.get(`fiscalInvoices/${activationId}`);
    assert.equal(doc?.origin, "activation_test");
    assert.equal(doc?.originId, null);
    assert.equal(doc?.valorBrutoReais, 1);
    assert.equal((doc?.tomador as {nome?: string} | undefined)?.nome, "Cliente de Teste NexaGO");
    assert.equal(doc?.status, "requested");
    // Nenhuma chamada síncrona ao emissor neste ramo — é o trigger
    // `onFiscalInvoiceRequested` (Fatia A, disparado pela CRIAÇÃO do
    // documento) que processa, do mesmo jeito que qualquer outra nota.
    // Chamar `reprocessFiscalInvoice` aqui também seria enviar a nota à
    // Focus duas vezes em paralelo — ver a nota no início desta task.
    assert.equal(issuer.issued.length, 0);
  });

  it("reemite direto quando a nota de teste já existe e está rejected", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake, {status: "error", statusMessage: "Inscrição municipal inválida."});
    fake.seedDoc(`fiscalInvoices/${activationId}`, {
      arenaId: "arena1",
      origin: "activation_test",
      originId: null,
      idempotencyKey: "activation:arena1",
      serviceId: "s1",
      codigoMunicipal: "3.03",
      aliquotaIss: 2,
      descricao: "Nota de teste — ativação",
      tomador: {nome: "Cliente de Teste NexaGO", cpfCnpj: "39053344705"},
      tomadorUid: null,
      valorBrutoReais: 1,
      status: "rejected",
      errorMessage: "Inscrição municipal inválida.",
    });
    const issuer = new FakeIssuer();

    await emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      callerUid: "manager1",
    });

    const doc = fake.store.get(`fiscalInvoices/${activationId}`);
    assert.equal(doc?.status, "authorized");
    assert.equal(issuer.issued.length, 1);
  });

  it("não faz nada quando a nota já está authorized", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake, {status: "active", mode: "off"});
    fake.seedDoc(`fiscalInvoices/${activationId}`, {
      arenaId: "arena1",
      origin: "activation_test",
      status: "authorized",
      numero: "1",
    });
    const issuer = new FakeIssuer();

    await emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      callerUid: "manager1",
    });

    assert.equal(issuer.issued.length, 0);
  });

  it("não faz nada quando já está requested/processing — evita chamada duplicada em voo", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake);
    fake.seedDoc(`fiscalInvoices/${activationId}`, {
      arenaId: "arena1",
      origin: "activation_test",
      status: "processing",
    });
    const issuer = new FakeIssuer();

    await emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      callerUid: "manager1",
    });

    assert.equal(issuer.issued.length, 0);
  });

  it("recusa quando a config não existe", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          callerUid: "manager1",
        }),
      /failed-precondition|NO_CONFIG/,
    );
  });

  it("recusa quando o status é draft — cadastro ainda não foi enviado", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake, {status: "draft"});
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          callerUid: "manager1",
        }),
      /failed-precondition|DRAFT/,
    );
  });

  it("recusa quando o status já é active — nada a ativar de novo", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake, {status: "active", mode: "off"});
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          callerUid: "manager1",
        }),
      /failed-precondition|ALREADY_ACTIVE/,
    );
  });

  it("recusa quem não é gestor da arena", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedConfig(fake);
    const issuer = new FakeIssuer();

    await assert.rejects(
      () =>
        emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
          arenaId: "arena1",
          callerUid: "intruso",
        }),
      /permission-denied|PERMISSION/,
    );
  });
});

describe("applyActivationOutcome", () => {
  it("promove a config para active quando a nota de teste é autorizada", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);

    await applyActivationOutcome(db(fake), "arena1", {status: "authorized"});

    assert.equal(fake.store.get("arenas/arena1/fiscal/config")?.status, "active");
  });

  it("marca error com o motivo quando a nota de teste é rejeitada", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake);

    await applyActivationOutcome(db(fake), "arena1", {
      status: "rejected",
      errorMessage: "CPF/CNPJ do cliente inválido ou ausente.",
    });

    const cfg = fake.store.get("arenas/arena1/fiscal/config");
    assert.equal(cfg?.status, "error");
    assert.equal(cfg?.statusMessage, "CPF/CNPJ do cliente inválido ou ausente.");
  });

  it("ignora status não-terminal — processing não deve promover nem rebaixar", async () => {
    const fake = new FakeFirestore();
    seedConfig(fake, {status: "testing"});

    await applyActivationOutcome(db(fake), "arena1", {status: "processing"});

    assert.equal(fake.store.get("arenas/arena1/fiscal/config")?.status, "testing");
  });
});
