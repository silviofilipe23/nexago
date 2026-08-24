/**
 * Implementação da porta fiscal contra a Focus NFe.
 * Único arquivo do módulo que sabe qual é o fornecedor.
 */
import {defineSecret} from "firebase-functions/params";
import type {
  FiscalIssuer,
  IssueServiceInvoiceInput,
  IssueServiceInvoiceResult,
  MunicipalRequirement,
  RegisterIssuerInput,
  RegisterIssuerResult,
} from "./issuer-port";

export const FOCUS_ACCOUNT_TOKEN = defineSecret("FOCUS_ACCOUNT_TOKEN");
export const FOCUS_ENV = defineSecret("FOCUS_ENV");
export const focusFiscalSecrets = [FOCUS_ACCOUNT_TOKEN, FOCUS_ENV];

export const FOCUS_API_URL_PRODUCTION = "https://api.focusnfe.com.br";
export const FOCUS_API_URL_SANDBOX = "https://homologacao.focusnfe.com.br";

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

function basicAuth(token: string): string {
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

function mapStatus(raw: string): IssueServiceInvoiceResult["status"] {
  if (raw === "autorizado") return "authorized";
  if (raw === "cancelado" || raw === "erro_autorizacao") return "rejected";
  return "processing";
}

export class FocusNfeIssuer implements FiscalIssuer {
  /**
   * `accountToken` é o token da conta nexaGO, usado só para cadastrar empresas.
   * A emissão usa o token da empresa, que vem por parâmetro.
   */
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = fetch as unknown as FetchFn,
    private readonly accountToken = "",
  ) {}

  private async call<T>(
    token: string,
    path: string,
    init: RequestInit = {},
  ): Promise<{status: number; body: T}> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: basicAuth(token),
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    const body = text.trim() ? (JSON.parse(text) as T) : ({} as T);
    return {status: res.status, body};
  }

  async getMunicipalRequirements(): Promise<MunicipalRequirement[]> {
    // A Focus cadastra a empresa com certificado; a exigência por município é
    // resolvida no cadastro. O wizard usa esta lista fixa como ponto de partida.
    return [
      {field: "inscricaoMunicipal", label: "Inscrição municipal", required: true, type: "text"},
      {field: "certificado", label: "Certificado digital A1 (.pfx)", required: true, type: "file"},
      {field: "senhaCertificado", label: "Senha do certificado", required: true, type: "password"},
    ];
  }

  async registerIssuer(input: RegisterIssuerInput): Promise<RegisterIssuerResult> {
    // ATENÇÃO ao implementar: confirme os nomes exatos dos campos em
    // https://doc.focusnfe.com.br (seção Empresas) e valide com um cadastro
    // real em homologação antes de dar a task por pronta. Não persista
    // `certificadoBase64` nem `senhaCertificado` em lugar nenhum.
    const {status, body} = await this.call<{
      id?: number;
      token_homologacao?: string;
      token_producao?: string;
    }>(this.accountToken, "/v2/empresas", {
      method: "POST",
      body: JSON.stringify({
        cnpj: input.cnpj,
        nome: input.razaoSocial,
        nome_fantasia: input.nomeFantasia,
        inscricao_municipal: input.inscricaoMunicipal,
        regime_tributario: input.regimeTributario,
        habilita_nfse: true,
        arquivo_certificado_base64: input.certificadoBase64,
        senha_certificado: input.senhaCertificado,
        logradouro: input.endereco.logradouro,
        numero: input.endereco.numero,
        complemento: input.endereco.complemento,
        bairro: input.endereco.bairro,
        municipio: input.endereco.municipio,
        uf: input.endereco.uf,
        cep: input.endereco.cep,
        codigo_municipio: input.endereco.codigoIbge,
      }),
    });
    if (status >= 400 || !body.id) {
      throw new Error(`FOCUS_REGISTER_FAILED_${status}`);
    }
    const token = body.token_producao ?? body.token_homologacao;
    if (!token) throw new Error("FOCUS_TOKEN_MISSING");
    return {issuerId: String(body.id), token};
  }

  async issueServiceInvoice(
    token: string,
    input: IssueServiceInvoiceInput,
  ): Promise<IssueServiceInvoiceResult> {
    const doc = input.tomador.cpfCnpj.replace(/\D/g, "");
    const {status, body} = await this.call<Record<string, string>>(
      token,
      `/v2/nfse?ref=${encodeURIComponent(input.reference)}`,
      {
        method: "POST",
        body: JSON.stringify({
          data_emissao: new Date().toISOString(),
          natureza_operacao: "1",
          optante_simples_nacional: input.optanteSimplesNacional,
          prestador: {
            cnpj: input.prestador.cnpj,
            inscricao_municipal: input.prestador.inscricaoMunicipal,
            codigo_municipio: input.prestador.codigoIbge,
          },
          tomador: {
            ...(doc.length === 14 ? {cnpj: doc} : {cpf: doc}),
            razao_social: input.tomador.nome.slice(0, 115),
            email: input.tomador.email,
          },
          servico: {
            valor_servicos: input.servico.valorServicos,
            iss_retido: input.servico.issRetido,
            item_lista_servico: input.servico.itemListaServico,
            discriminacao: input.servico.discriminacao,
            codigo_municipio: input.servico.codigoIbge,
            aliquota: input.servico.aliquota,
          },
        }),
      },
    );

    if (status >= 500) throw new Error(`FOCUS_UNAVAILABLE_${status}`);
    if (status >= 400) {
      return {
        status: "rejected",
        errorMessage: body.mensagem ?? body.codigo ?? `HTTP ${status}`,
      };
    }
    return {
      status: mapStatus(body.status ?? "processando_autorizacao"),
      numero: body.numero,
      serie: body.serie,
      codigoVerificacao: body.codigo_verificacao,
      pdfUrl: body.url_danfse,
      xmlUrl: body.caminho_xml_nota_fiscal,
      errorMessage: body.mensagem,
    };
  }

  async getInvoice(token: string, reference: string): Promise<IssueServiceInvoiceResult> {
    const {body} = await this.call<Record<string, string>>(
      token,
      `/v2/nfse/${encodeURIComponent(reference)}`,
    );
    return {
      status: mapStatus(body.status ?? "processando_autorizacao"),
      numero: body.numero,
      serie: body.serie,
      codigoVerificacao: body.codigo_verificacao,
      pdfUrl: body.url_danfse,
      xmlUrl: body.caminho_xml_nota_fiscal,
      errorMessage: body.mensagem,
    };
  }

  async cancelInvoice(token: string, reference: string, motivo: string): Promise<void> {
    const {status} = await this.call(
      token,
      `/v2/nfse/${encodeURIComponent(reference)}`,
      {method: "DELETE", body: JSON.stringify({justificativa: motivo})},
    );
    if (status >= 400) throw new Error(`FOCUS_CANCEL_FAILED_${status}`);
  }
}
