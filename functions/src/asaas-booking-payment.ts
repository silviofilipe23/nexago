import * as logger from "firebase-functions/logger";
import {AsaasApiError, fetchAsaas} from "./asaas-client";

export type AsaasPixChargeResult = {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
};

type AsaasPaymentResponse = {
  id?: string;
  status?: string;
  invoiceUrl?: string;
};

type AsaasPixQrResponse = Record<string, unknown>;

const PIX_QR_RETRY_MS = [0, 500, 1000, 1500, 2500, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Data de vencimento no fuso de São Paulo (YYYY-MM-DD). */
function formatDueDateBrazil(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function todayBrazil(): string {
  return formatDueDateBrazil(new Date());
}

/** Garante dueDate >= hoje (Asaas rejeita ou não gera PIX em vencimento passado). */
function resolveDueDate(expiresAt: Date): string {
  const expiry = formatDueDateBrazil(expiresAt);
  const today = todayBrazil();
  return expiry < today ? today : expiry;
}

function extractPixPayload(qr: AsaasPixQrResponse): string {
  const keys = ["payload", "copyPaste", "copyPasteCode", "emv", "pixCopyPaste"];
  for (const key of keys) {
    const raw = qr[key];
    if (typeof raw === "string" && raw.trim().length > 20) {
      return raw.trim();
    }
  }
  return "";
}

function extractEncodedImage(qr: AsaasPixQrResponse): string {
  const raw = qr.encodedImage;
  if (typeof raw !== "string" || !raw.trim()) return "";
  let b64 = raw.trim();
  const marker = "base64,";
  const idx = b64.indexOf(marker);
  if (idx >= 0) {
    b64 = b64.slice(idx + marker.length);
  }
  return b64;
}

async function fetchPixQrCodeOnce(paymentId: string): Promise<AsaasPixQrResponse> {
  return fetchAsaas<AsaasPixQrResponse>(
    `/v3/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
    {method: "GET"},
  );
}

/**
 * O QR dinâmico pode demorar alguns segundos após POST /payments (pixTransaction null é normal).
 * Reutilizável para cobranças avulsas e para o 1º pagamento de uma assinatura.
 */
export async function fetchAsaasPixQrCode(paymentId: string): Promise<{
  qrCode: string;
  qrCodeBase64: string;
}> {
  let lastQr: AsaasPixQrResponse = {};
  for (const delayMs of PIX_QR_RETRY_MS) {
    if (delayMs > 0) await sleep(delayMs);
    try {
      lastQr = await fetchPixQrCodeOnce(paymentId);
      const qrCode = extractPixPayload(lastQr);
      const qrCodeBase64 = extractEncodedImage(lastQr);
      if (qrCode) {
        logger.info(
          `fetchPixQrCode: ok paymentId=${paymentId} delayMs=${delayMs} hasImage=${qrCodeBase64.length > 0}`,
        );
        return {qrCode, qrCodeBase64};
      }
    } catch (e) {
      if (e instanceof AsaasApiError && (e.httpStatus === 404 || e.httpStatus === 403)) {
        logger.warn(
          `fetchPixQrCode: retry paymentId=${paymentId} status=${e.httpStatus}`,
        );
        continue;
      }
      throw e;
    }
  }

  const qrCode = extractPixPayload(lastQr);
  const qrCodeBase64 = extractEncodedImage(lastQr);
  if (qrCode) {
    return {qrCode, qrCodeBase64};
  }

  logger.error(
    "fetchPixQrCode: payload vazio após retries",
    paymentId,
    JSON.stringify(lastQr).slice(0, 500),
  );
  throw new Error("ASAAS_PIX_QR_MISSING");
}

/**
 * Cria cobrança PIX no Asaas e retorna QR / copia e cola.
 */
export async function createAsaasPixCharge(params: {
  customerId: string;
  valueReais: number;
  dueDate: Date;
  description: string;
  externalReference: string;
  idempotencyKey: string;
}): Promise<AsaasPixChargeResult> {
  const dueDate = resolveDueDate(params.dueDate);

  const payment = await fetchAsaas<AsaasPaymentResponse>("/v3/payments", {
    method: "POST",
    body: {
      customer: params.customerId,
      billingType: "PIX",
      value: params.valueReais,
      dueDate,
      description: params.description.slice(0, 500),
      externalReference: params.externalReference,
    },
    idempotencyKey: params.idempotencyKey,
  });

  const paymentId = payment.id?.trim() ?? "";
  if (!paymentId) {
    throw new Error("ASAAS_PAYMENT_MISSING_ID");
  }

  logger.info(
    `createAsaasPixCharge: payment ${paymentId} status=${payment.status ?? "?"} dueDate=${dueDate}`,
  );

  const {qrCode, qrCodeBase64} = await fetchAsaasPixQrCode(paymentId);

  return {paymentId, qrCode, qrCodeBase64};
}

/**
 * Cria cobrança de cartão no Asaas e devolve o checkout HOSPEDADO
 * (`invoiceUrl`). Nenhum dado de cartão passa por nós: o atleta digita no
 * domínio do Asaas. Mesmo formato de `createAsaasPixCharge` — o que muda é o
 * `billingType` e o fato de não haver QR para buscar.
 */
export async function createAsaasCardCharge(params: {
  customerId: string;
  valueReais: number;
  dueDate: Date;
  description: string;
  externalReference: string;
  idempotencyKey: string;
}): Promise<{paymentId: string; invoiceUrl: string}> {
  const dueDate = resolveDueDate(params.dueDate);

  const payment = await fetchAsaas<AsaasPaymentResponse>("/v3/payments", {
    method: "POST",
    body: {
      customer: params.customerId,
      billingType: "CREDIT_CARD",
      value: params.valueReais,
      dueDate,
      description: params.description.slice(0, 500),
      externalReference: params.externalReference,
    },
    idempotencyKey: params.idempotencyKey,
  });

  const paymentId = payment.id?.trim() ?? "";
  if (!paymentId) {
    throw new Error("ASAAS_PAYMENT_MISSING_ID");
  }

  const invoiceUrl = payment.invoiceUrl?.trim() ?? "";
  if (!invoiceUrl) {
    // Sem checkout não há como o atleta pagar: falhar aqui é melhor que
    // devolver uma tela com botão para lugar nenhum.
    throw new Error("ASAAS_CARD_INVOICE_URL_MISSING");
  }

  logger.info(
    `createAsaasCardCharge: payment ${paymentId} status=${payment.status ?? "?"} dueDate=${dueDate}`,
  );

  return {paymentId, invoiceUrl};
}

/**
 * Estorna um pagamento recebido (PIX volta integral ao pagador). Estorno já
 * feito é tratado como sucesso — o fluxo de cancelamento fica idempotente.
 */
export async function refundAsaasPayment(
  paymentId: string,
  valueReais?: number,
): Promise<void> {
  const id = paymentId.trim();
  if (!id) throw new Error("ASAAS_REFUND_MISSING_PAYMENT_ID");
  try {
    await fetchAsaas(`/v3/payments/${encodeURIComponent(id)}/refund`, {
      method: "POST",
      body: valueReais != null ? {value: valueReais} : {},
    });
  } catch (e) {
    if (e instanceof AsaasApiError && isAlreadyRefundedAsaasError(e)) {
      logger.info(`refundAsaasPayment: ${id} já estornado (idempotente)`);
      return;
    }
    throw e;
  }
}

function isAlreadyRefundedAsaasError(e: AsaasApiError): boolean {
  const text = `${e.message} ${e.body}`.toLowerCase();
  return text.includes("já estornado") ||
    text.includes("ja estornado") ||
    text.includes("already refunded") ||
    text.includes("totalmente estornado");
}

/** Cancela cobrança aberta no Asaas (ignora erros se já paga/removida). */
export async function deleteAsaasPaymentIfOpen(paymentId: string): Promise<void> {
  const id = paymentId.trim();
  if (!id) return;
  try {
    await fetchAsaas(`/v3/payments/${encodeURIComponent(id)}`, {method: "DELETE"});
  } catch {
    // cobrança já liquidada ou inexistente
  }
}

/**
 * Cancela cobrança aberta e PROPAGA falhas — para fluxos que não podem seguir
 * com a cobrança viva (ex.: cancelamento de inscrição, que deleta o documento
 * que o webhook precisaria achar). 404 não é falha: a cobrança já não existe.
 */
export async function deleteAsaasPaymentOrThrow(paymentId: string): Promise<void> {
  const id = paymentId.trim();
  if (!id) return;
  try {
    await fetchAsaas(`/v3/payments/${encodeURIComponent(id)}`, {method: "DELETE"});
  } catch (e) {
    if (e instanceof AsaasApiError && e.httpStatus === 404) return;
    throw e;
  }
}

export type AsaasPaymentDetails = {
  id?: string;
  status?: string;
  value?: number;
  /** `PIX`, `CREDIT_CARD`, … — decide o tratamento no webhook de inscrição. */
  billingType?: string;
  /** Bruto − taxa do gateway. A diferença para `value` é o custo da cobrança. */
  netValue?: number;
  externalReference?: string;
  /** Id da assinatura Asaas, quando o pagamento é gerado por uma `/subscriptions`. */
  subscription?: string;
  /** Vencimento (YYYY-MM-DD) do pagamento. */
  dueDate?: string;
};

export async function getAsaasPayment(paymentId: string): Promise<AsaasPaymentDetails> {
  return fetchAsaas<AsaasPaymentDetails>(
    `/v3/payments/${encodeURIComponent(paymentId)}`,
    {method: "GET"},
  );
}
