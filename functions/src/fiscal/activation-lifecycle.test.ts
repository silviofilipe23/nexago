/**
 * Caminho feliz da ATIVAÇÃO de ponta a ponta, atravessando as fronteiras de
 * arquivo que os testes de cada task cobrem só uma de cada vez:
 * callable de ativação -> repositório -> processador -> emissor -> promoção da
 * config. O que nenhum teste por task consegue provar é justamente a costura:
 * a nota criada pelo callable é a mesma que o trigger de criação processa, e o
 * status dela é o que promove `testing` -> `active`.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {FakeIssuer} from "./fake-issuer.test-helper";
import {invoiceIdFor} from "./invoice-repository";
import {processInvoiceRequest} from "./invoice-processor";
import {applyActivationOutcome, emitActivationTestInvoiceCore} from "./activation";
import type {FiscalInvoiceStatus} from "./types";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

describe("ciclo de vida da ativação (botão -> emissor -> config active)", () => {
  it("do wizard em testing até a arena promovida a active", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {managerUserId: "manager1", name: "Arena X"});
    fake.seedDoc("arenas/arena1/fiscal/config", {
      cnpj: "12345678000199",
      razaoSocial: "Arena X Ltda",
      inscricaoMunicipal: "123456",
      regimeTributario: "simples_nacional",
      enderecoFiscal: {codigoIbge: "5208707", municipio: "Goiânia", uf: "GO"},
      services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Locação de quadra", aliquotaIss: 2}],
      defaultServiceIdBooking: "s1",
      issuerId: "emp_1",
      credentialSecretName: "fiscal-issuer-token-arena1",
      mode: "off",
      status: "testing",
    });

    const issuer = new FakeIssuer();
    const readToken = async () => "tok_teste";

    // 1. O dono clica em "Emitir nota de teste" no passo 5 do wizard. Só cria
    //    o pedido — quem fala com a Focus é o trigger de criação.
    await emitActivationTestInvoiceCore(db(fake), issuer, readToken, {
      arenaId: "arena1",
      callerUid: "manager1",
    });

    const invoiceId = invoiceIdFor("arena1", "activation:arena1");
    assert.equal(fake.store.get(`fiscalInvoices/${invoiceId}`)?.status, "requested");
    assert.equal(issuer.issued.length, 0);
    assert.equal(fake.store.get("arenas/arena1/fiscal/config")?.status, "testing");

    // 2. `onFiscalInvoiceRequested` (Fatia A) pega a criação e emite de verdade.
    await processInvoiceRequest(db(fake), issuer, readToken, invoiceId);

    assert.equal(issuer.issued.length, 1);
    assert.equal(issuer.issued[0].servico.valorServicos, 1);
    assert.equal(issuer.issued[0].servico.itemListaServico, "3.03");
    assert.equal(issuer.issued[0].tomador.nome, "Cliente de Teste NexaGO");
    assert.equal(fake.store.get(`fiscalInvoices/${invoiceId}`)?.status, "authorized");

    // 3. `onActivationTestInvoiceResolved` vê a nota virar authorized e promove
    //    a config — é o único caminho de `testing` para `active`.
    const resolved = fake.store.get(`fiscalInvoices/${invoiceId}`);
    await applyActivationOutcome(db(fake), "arena1", {
      status: resolved?.status as FiscalInvoiceStatus,
      errorMessage: (resolved?.errorMessage as string | null) ?? null,
    });

    const config = fake.store.get("arenas/arena1/fiscal/config");
    assert.equal(config?.status, "active");
    assert.equal(config?.statusMessage, null);
  });
});
