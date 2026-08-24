/** Tipos do módulo fiscal. Nenhum deles conhece o emissor ou o gateway. */
import type {Timestamp} from "firebase-admin/firestore";

export type FiscalMode = "always" | "on_demand" | "off";
export type FiscalConfigStatus = "draft" | "testing" | "active" | "error";

export type FiscalInvoiceOrigin = "booking" | "club" | "manual";
export type FiscalInvoiceStatus =
  | "requested"
  | "processing"
  | "authorized"
  | "rejected"
  | "cancelled"
  | "cancellation_failed";

export interface FiscalService {
  id: string;
  /** Código do serviço na tabela do município. */
  codigoMunicipal: string;
  descricao: string;
  /** Alíquota de ISS em percentual, ex.: 2 para 2%. */
  aliquotaIss: number;
}

export interface FiscalAddress {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  /** Código IBGE de 7 dígitos. */
  codigoIbge: string;
}

export interface ArenaFiscalConfig {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  enderecoFiscal: FiscalAddress;
  inscricaoMunicipal: string;
  regimeTributario: "simples_nacional" | "lucro_presumido" | "lucro_real" | "mei";
  /** Id da arena dentro do emissor. */
  issuerId?: string;
  /** Nome do secret no Secret Manager. NUNCA o valor. */
  credentialSecretName?: string;
  certificateExpiresAt?: Timestamp;
  services: FiscalService[];
  defaultServiceIdBooking?: string;
  defaultServiceIdClub?: string;
  mode: FiscalMode;
  status: FiscalConfigStatus;
  statusMessage?: string;
}

export interface FiscalTomador {
  nome: string;
  cpfCnpj: string;
  email?: string;
  endereco?: FiscalAddress;
}

export interface FiscalInvoice {
  arenaId: string;
  origin: FiscalInvoiceOrigin;
  originId: string | null;
  idempotencyKey: string;
  serviceId: string;
  codigoMunicipal: string;
  aliquotaIss: number;
  descricao: string;
  tomador: FiscalTomador;
  /** Uid do atleta quando conhecido. As rules dependem dele. */
  tomadorUid: string | null;
  valorBrutoReais: number;
  status: FiscalInvoiceStatus;
  numero?: string;
  serie?: string;
  codigoVerificacao?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  errorMessage?: string;
  requestedByUid?: string;
  issuedByUid?: string;
}
