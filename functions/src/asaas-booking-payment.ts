import * as logger from "firebase-functions/logger";
import {AsaasApiError, fetchAsaas} from "./asaas-client";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";

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
 */
async function fetchPixQrCodeWithRetry(paymentId: string): Promise<{
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
  bookingId: string;
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
      externalReference: `${ARENA_BOOKING_PAYMENT_REF_PREFIX}${params.bookingId}`,
    },
    idempotencyKey: `arena-booking-pix-${params.bookingId}`,
  });

  const paymentId = payment.id?.trim() ?? "";
  if (!paymentId) {
    throw new Error("ASAAS_PAYMENT_MISSING_ID");
  }

  logger.info(
    `createAsaasPixCharge: payment ${paymentId} status=${payment.status ?? "?"} dueDate=${dueDate}`,
  );

  const {qrCode, qrCodeBase64} = await fetchPixQrCodeWithRetry(paymentId);

  return {paymentId, qrCode, qrCodeBase64};
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

export type AsaasPaymentDetails = {
  id?: string;
  status?: string;
  value?: number;
  externalReference?: string;
};

export async function getAsaasPayment(paymentId: string): Promise<AsaasPaymentDetails> {
  return fetchAsaas<AsaasPaymentDetails>(
    `/v3/payments/${encodeURIComponent(paymentId)}`,
    {method: "GET"},
  );
}
