/**
 * Regras de emissão de NFS-e. Funções puras: nenhuma delas toca Firestore,
 * rede ou relógio. É aqui que se decide se uma nota deve existir.
 */
import {isValidCpfCnpj, normalizeCpfCnpj} from "../asaas-customer";
import type {ArenaFiscalConfig, FiscalInvoiceOrigin} from "./types";

/**
 * Decide, no momento do pagamento, se já nasce um pedido de nota. Só o modo
 * `always` cria sozinho — em `on_demand` o documento nasce quando o atleta
 * pede, para a coleção não encher de pedido que nunca vira nota.
 */
export function shouldAutoIssue(config: ArenaFiscalConfig | null): boolean {
  if (!config) return false;
  return config.status === "active" && config.mode === "always";
}

export type ShouldProcessReason =
  | "CONFIG_NOT_EMITTING"
  | "ORIGIN_NOT_PAID"
  | "INVALID_AMOUNT"
  | "INVALID_TOMADOR_DOCUMENT"
  | "ALREADY_AUTHORIZED";

export interface ShouldProcessInput {
  config: ArenaFiscalConfig | null;
  origin: FiscalInvoiceOrigin;
  originPaid: boolean;
  valorBrutoReais: number;
  tomadorCpfCnpj: string;
  hasAuthorizedTwin: boolean;
}

export type ShouldProcessResult =
  | {ok: true}
  | {ok: false; reason: ShouldProcessReason};

/**
 * Revalidação feita pelo trigger, imediatamente antes de bater no emissor. A
 * config pode ter mudado entre a gravação do pedido e o processamento.
 */
export function shouldProcess(input: ShouldProcessInput): ShouldProcessResult {
  const {config} = input;
  if (!config || config.status !== "active" || config.mode === "off") {
    return {ok: false, reason: "CONFIG_NOT_EMITTING"};
  }
  if (input.origin !== "manual" && !input.originPaid) {
    return {ok: false, reason: "ORIGIN_NOT_PAID"};
  }
  if (!(input.valorBrutoReais > 0)) {
    return {ok: false, reason: "INVALID_AMOUNT"};
  }
  if (!isValidCpfCnpj(normalizeCpfCnpj(input.tomadorCpfCnpj))) {
    return {ok: false, reason: "INVALID_TOMADOR_DOCUMENT"};
  }
  if (input.hasAuthorizedTwin) {
    return {ok: false, reason: "ALREADY_AUTHORIZED"};
  }
  return {ok: true};
}

export type IdempotencyInput =
  | {origin: FiscalInvoiceOrigin; asaasPaymentId: string}
  | {origin: FiscalInvoiceOrigin; bookingId: string; receiptId: string}
  | {origin: "manual"; invoiceId: string};

/**
 * Chave única da nota. O webhook do Asaas repete, e nota duplicada é problema
 * fiscal, não bug de tela.
 */
export function buildIdempotencyKey(input: IdempotencyInput): string {
  if ("asaasPaymentId" in input) return `payment:${input.asaasPaymentId}`;
  if ("receiptId" in input) return `receipt:${input.bookingId}:${input.receiptId}`;
  return `manual:${input.invoiceId}`;
}
