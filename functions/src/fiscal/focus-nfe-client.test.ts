import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FocusNfeIssuer} from "./focus-nfe-client";

type Call = {url: string; init: RequestInit};

function stubFetch(response: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    calls.push({url, init});
    return {
      ok: status < 400,
      status,
      text: async () => JSON.stringify(response),
    } as unknown as Response;
  };
  return {calls, fetchFn};
}

const input = {
  reference: "inv1",
  prestador: {cnpj: "12345678000199", inscricaoMunicipal: "123456", codigoIbge: "5208707"},
  tomador: {nome: "Fulano de Tal", cpfCnpj: "39053344705"},
  servico: {
    valorServicos: 100,
    itemListaServico: "3.03",
    discriminacao: "Locação de quadra",
    codigoIbge: "5208707",
    aliquota: 2,
    issRetido: false,
  },
  optanteSimplesNacional: true,
};

describe("FocusNfeIssuer.issueServiceInvoice", () => {
  it("chama POST /v2/nfse com ref na query e Basic auth do token", async () => {
    const {calls, fetchFn} = stubFetch({status: "processando_autorizacao"});
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    await issuer.issueServiceInvoice("tok_abc", input);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://homologacao.focusnfe.com.br/v2/nfse?ref=inv1");
    assert.equal(calls[0].init.method, "POST");
    const auth = (calls[0].init.headers as Record<string, string>)["Authorization"];
    assert.equal(auth, `Basic ${Buffer.from("tok_abc:").toString("base64")}`);
  });

  it("monta o corpo com tomador por CPF quando o documento tem 11 dígitos", async () => {
    const {calls, fetchFn} = stubFetch({status: "processando_autorizacao"});
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    await issuer.issueServiceInvoice("tok_abc", input);

    const body = JSON.parse(calls[0].init.body as string);
    assert.equal(body.tomador.cpf, "39053344705");
    assert.equal(body.tomador.cnpj, undefined);
    assert.equal(body.tomador.razao_social, "Fulano de Tal");
    assert.equal(body.servico.item_lista_servico, "3.03");
    assert.equal(body.servico.valor_servicos, 100);
    assert.equal(body.optante_simples_nacional, true);
  });

  it("usa cnpj no tomador quando o documento tem 14 dígitos", async () => {
    const {calls, fetchFn} = stubFetch({status: "processando_autorizacao"});
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    await issuer.issueServiceInvoice("tok_abc", {
      ...input,
      tomador: {nome: "Empresa Y", cpfCnpj: "12345678000199"},
    });

    const body = JSON.parse(calls[0].init.body as string);
    assert.equal(body.tomador.cnpj, "12345678000199");
    assert.equal(body.tomador.cpf, undefined);
  });

  it("traduz autorizado para o resultado da porta", async () => {
    const {fetchFn} = stubFetch({
      status: "autorizado",
      numero: "42",
      serie: "1",
      codigo_verificacao: "ABC",
      url_danfse: "https://focus/nota.pdf",
      caminho_xml_nota_fiscal: "https://focus/nota.xml",
    });
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    const result = await issuer.issueServiceInvoice("tok_abc", input);

    assert.equal(result.status, "authorized");
    assert.equal(result.numero, "42");
    assert.equal(result.pdfUrl, "https://focus/nota.pdf");
  });

  it("traduz erro de validação para rejeitado, com a mensagem crua", async () => {
    const {fetchFn} = stubFetch(
      {codigo: "requisicao_invalida", mensagem: "inscricao_municipal inválida"},
      422,
    );
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    const result = await issuer.issueServiceInvoice("tok_abc", input);

    assert.equal(result.status, "rejected");
    assert.match(result.errorMessage ?? "", /inscricao_municipal/);
  });

  it("propaga erro de infraestrutura para o retry pegar", async () => {
    const {fetchFn} = stubFetch({mensagem: "indisponível"}, 503);
    const issuer = new FocusNfeIssuer("https://homologacao.focusnfe.com.br", fetchFn);

    await assert.rejects(() => issuer.issueServiceInvoice("tok_abc", input));
  });
});
