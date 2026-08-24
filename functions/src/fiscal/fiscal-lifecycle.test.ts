/**
 * Caminho feliz de ponta a ponta do módulo fiscal, atravessando as fronteiras
 * de task que os outros testes cobrem só uma de cada vez:
 * hook de pagamento -> repositório -> processador -> emissor -> webhook.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {FakeIssuer} from "./fake-issuer.test-helper";
import {requestInvoiceForPaidBooking} from "./payment-hooks";
import {processInvoiceRequest} from "./invoice-processor";
import {applyIssuerNotification} from "./invoice-webhook";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

describe("ciclo de vida da nota (pagamento -> emissor -> webhook)", () => {
  it("da reserva paga até a nota autorizada com número e PDF", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1/fiscal/config", {
      cnpj: "12345678000199",
      razaoSocial: "Arena X Ltda",
      inscricaoMunicipal: "123456",
      regimeTributario: "simples_nacional",
      enderecoFiscal: {codigoIbge: "5208707", municipio: "Goiânia", uf: "GO"},
      services: [
        {id: "s1", codigoMunicipal: "3.03", descricao: "Locação de quadra", aliquotaIss: 2},
      ],
      defaultServiceIdBooking: "s1",
      credentialSecretName: "fiscal-issuer-token-arena1",
      mode: "always",
      status: "active",
    });
    fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", paymentStatus: "paid"});

    // 1. O webhook do Asaas confirma o pagamento e pede a nota.
    await requestInvoiceForPaidBooking(db(fake), {
      arenaId: "arena1",
      bookingId: "b1",
      asaasPaymentId: "pay_1",
      grossReais: 120,
      tomador: {nome: "Fulano", cpfCnpj: "39053344705"},
      tomadorUid: "athlete1",
    });

    const invoiceId = [...fake.store.keys()]
      .filter((k) => k.startsWith("fiscalInvoices/"))
      .map((k) => k.slice("fiscalInvoices/".length))[0];
    assert.ok(invoiceId, "o hook precisa ter criado o pedido");
    assert.equal(fake.store.get(`fiscalInvoices/${invoiceId}`)?.status, "requested");

    // 2. O trigger processa e a Focus aceita, mas ainda sem resposta da
    //    prefeitura — é o que acontece na maioria das NFS-e.
    const issuer = new FakeIssuer();
    issuer.nextResult = {status: "processing"};
    await processInvoiceRequest(db(fake), issuer, async () => "tok_teste", invoiceId);

    assert.equal(issuer.issued.length, 1);
    assert.equal(issuer.issued[0].servico.valorServicos, 120);
    assert.equal(issuer.issued[0].reference, invoiceId);
    assert.equal(fake.store.get(`fiscalInvoices/${invoiceId}`)?.status, "processing");

    // 3. A prefeitura responde depois, pelo callback do emissor.
    await applyIssuerNotification(db(fake), {
      ref: invoiceId,
      status: "autorizado",
      numero: "42",
      serie: "1",
      codigo_verificacao: "ABC123",
      url_danfse: "https://focus/nota.pdf",
      caminho_xml_nota_fiscal: "https://focus/nota.xml",
    });

    const doc = fake.store.get(`fiscalInvoices/${invoiceId}`);
    assert.equal(doc?.status, "authorized");
    assert.equal(doc?.numero, "42");
    assert.equal(doc?.pdfUrl, "https://focus/nota.pdf");
    assert.equal(doc?.xmlUrl, "https://focus/nota.xml");
    assert.equal(doc?.errorMessage, null);
  });
});
