import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

export const ASAAS_API_KEY = defineSecret("ASAAS_API_KEY");
export const ASAAS_WEBHOOK_ACCESS_TOKEN = defineSecret("ASAAS_WEBHOOK_ACCESS_TOKEN");
export const ASAAS_ENV = defineSecret("ASAAS_ENV");

export const ASAAS_API_URL_PRODUCTION = "https://api.asaas.com";
export const ASAAS_API_URL_SANDBOX = "https://api-sandbox.asaas.com";

export const asaasArenaSecrets = [
  ASAAS_API_KEY,
  ASAAS_WEBHOOK_ACCESS_TOKEN,
  ASAAS_ENV,
];

export class AsaasApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly body = "",
  ) {
    super(message);
    this.name = "AsaasApiError";
  }
}

export function getAsaasApiBaseUrl(): string {
  try {
    const env = ASAAS_ENV.value()?.trim().toLowerCase();
    if (env === "sandbox") return ASAAS_API_URL_SANDBOX;
    if (env === "production" || env === "prod") return ASAAS_API_URL_PRODUCTION;
  } catch {
    // emulador sem secret
  }
  return ASAAS_API_URL_PRODUCTION;
}

/** Tag persistida no cache Firestore — muda ao trocar sandbox ↔ produção. */
export function getAsaasEnvTag(): "sandbox" | "production" {
  try {
    const env = ASAAS_ENV.value()?.trim().toLowerCase();
    if (env === "sandbox") return "sandbox";
  } catch {
    // emulador sem secret
  }
  return "production";
}

export function isAsaasInvalidCustomerError(e: unknown): boolean {
  if (!(e instanceof AsaasApiError)) return false;
  if (e.httpStatus === 404) return true;
  return e.body.includes("invalid_customer");
}

export function getAsaasApiKey(): string {
  try {
    const key = ASAAS_API_KEY.value()?.trim();
    if (key) return key;
  } catch {
    // emulador
  }
  throw new Error("ASAAS_API_KEY_MISSING");
}

export function parseAsaasErrorMessage(httpStatus: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{description?: string; code?: string}>;
    };
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      detail = parsed.errors
        .map((e) => e.description ?? e.code ?? "")
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    if (body.trim()) detail = body.trim().slice(0, 300);
  }
  if (
    detail.toLowerCase().includes("saldo") ||
    detail.toLowerCase().includes("balance") ||
    httpStatus === 402
  ) {
    return `Saldo insuficiente na conta Asaas da NexaGO.${detail ? ` Detalhe: ${detail}` : ""}`;
  }
  if (
    detail.toLowerCase().includes("cpf") ||
    detail.toLowerCase().includes("cnpj")
  ) {
    return "CPF ou CNPJ do pagador é obrigatório para gerar o PIX.";
  }
  return detail || `Erro Asaas HTTP ${httpStatus}`;
}

export async function fetchAsaas<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const apiKey = getAsaasApiKey();
  const base = getAsaasApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const method = (options.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    access_token: apiKey,
  };
  // Asaas: GET com body ou Content-Type pode retornar 403 no /pixQrCode.
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    headers["X-Idempotency-Key"] = options.idempotencyKey;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    logger.error("fetchAsaas failed:", res.status, path, text.slice(0, 500));
    throw new AsaasApiError(parseAsaasErrorMessage(res.status, text), res.status, text);
  }

  if (!text.trim()) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}
