/**
 * Porta do emissor de notas. Nada aqui sabe HTTP nem qual é o fornecedor —
 * trocar de emissor é escrever outra implementação desta interface, e a NFC-e
 * do bar (fase 2) entra pela mesma porta.
 */
import type {FiscalAddress, FiscalTomador} from "./types";

export interface MunicipalRequirement {
  field: string;
  label: string;
  required: boolean;
  /** `password` sinaliza campo que nunca pode ser logado nem persistido. */
  type: "text" | "password" | "file";
}

export interface RegisterIssuerInput {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoMunicipal: string;
  endereco: FiscalAddress;
  regimeTributario: string;
  /** Certificado em base64. Passa em trânsito, nunca é persistido por nós. */
  certificadoBase64?: string;
  senhaCertificado?: string;
  loginPrefeitura?: string;
  senhaPrefeitura?: string;
}

export interface RegisterIssuerResult {
  issuerId: string;
  /** Token da empresa no emissor. Vai para o Secret Manager. */
  token: string;
  certificateExpiresAt?: Date;
}

export interface IssueServiceInvoiceInput {
  reference: string;
  prestador: {cnpj: string; inscricaoMunicipal: string; codigoIbge: string};
  tomador: FiscalTomador;
  servico: {
    valorServicos: number;
    itemListaServico: string;
    discriminacao: string;
    codigoIbge: string;
    aliquota: number;
    issRetido: boolean;
  };
  optanteSimplesNacional: boolean;
}

export interface IssueServiceInvoiceResult {
  status: "processing" | "authorized" | "rejected";
  numero?: string;
  serie?: string;
  codigoVerificacao?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  errorMessage?: string;
}

export interface FiscalIssuer {
  getMunicipalRequirements(codigoIbge: string): Promise<MunicipalRequirement[]>;
  registerIssuer(input: RegisterIssuerInput): Promise<RegisterIssuerResult>;
  issueServiceInvoice(
    token: string,
    input: IssueServiceInvoiceInput,
  ): Promise<IssueServiceInvoiceResult>;
  getInvoice(token: string, reference: string): Promise<IssueServiceInvoiceResult>;
  cancelInvoice(token: string, reference: string, motivo: string): Promise<void>;
}
