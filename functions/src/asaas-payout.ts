import {FieldValue, type DocumentReference} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {AsaasApiError, fetchAsaas} from "./asaas-client";
import {ARENA_WITHDRAWAL_REF_PREFIX} from "./arena-booking-payment-constants";
import {roundMoney} from "./mercadopago-arena-helpers";

export type ResolvedWithdrawalPix = {
  pixAddressKey: string;
  pixAddressKeyType: string;
};

export type PayoutSendResult = {
  payoutId: string;
  payoutStatus: "sent";
};

export class AsaasPayoutError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly asaasBody = "",
  ) {
    super(message);
    this.name = "AsaasPayoutError";
  }
}

/** Infere tipo da chave PIX para a API Asaas. */
export function inferPixKeyType(pixKey: string): string {
  const key = pixKey.trim();
  if (key.includes("@")) return "EMAIL";
  const digits = key.replace(/\D/g, "");
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
  ) {
    return "EVP";
  }
  if (digits.length >= 10 && digits.length <= 13) return "PHONE";
  return "EMAIL";
}

/** Normaliza chave PIX conforme tipo exigido pela API Asaas. */
export function normalizePixAddressKey(pixKey: string, pixKeyType: string): string {
  const key = pixKey.trim();
  const type = pixKeyType.trim().toUpperCase();
  if (type === "CPF" || type === "CNPJ" || type === "PHONE") {
    return key.replace(/\D/g, "");
  }
  if (type === "EMAIL") {
    return key.toLowerCase();
  }
  return key;
}

const ASAAS_PIX_KEY_TYPES = new Set([
  "CPF",
  "CNPJ",
  "EMAIL",
  "PHONE",
  "EVP",
]);

export function isValidAsaasPixKeyType(type: string): boolean {
  return ASAAS_PIX_KEY_TYPES.has(type.trim().toUpperCase());
}

/** Resolve chave e tipo PIX para transferência (tipo explícito ou inferência). */
export function resolveWithdrawalPixFields(
  pixKey: string,
  explicitType?: string,
): ResolvedWithdrawalPix {
  const trimmed = pixKey.trim();
  const typeRaw = explicitType?.trim().toUpperCase() ?? "";
  if (typeRaw && isValidAsaasPixKeyType(typeRaw)) {
    return {
      pixAddressKey: normalizePixAddressKey(trimmed, typeRaw),
      pixAddressKeyType: typeRaw,
    };
  }
  const pixAddressKeyType = inferPixKeyType(trimmed);
  const pixAddressKey = normalizePixAddressKey(trimmed, pixAddressKeyType);
  return {pixAddressKey, pixAddressKeyType};
}

/** Lê chave/tipo do doc do saque ou infere a partir de `pixKey`. */
export function resolveWithdrawalPixFromDoc(
  withdrawal: Record<string, unknown>,
): ResolvedWithdrawalPix {
  const rawKey = (withdrawal.pixKey as string | undefined)?.trim() ?? "";
  const storedType = (withdrawal.pixKeyType as string | undefined)?.trim();
  if (storedType && rawKey.length >= 5) {
    return {
      pixAddressKey: normalizePixAddressKey(rawKey, storedType),
      pixAddressKeyType: storedType.toUpperCase(),
    };
  }
  return resolveWithdrawalPixFields(rawKey);
}

export function formatAsaasPayoutError(httpStatus: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{description?: string}>;
    };
    if (Array.isArray(parsed.errors)) {
      detail = parsed.errors.map((e) => e.description ?? "").filter(Boolean).join("; ");
    }
  } catch {
    if (body.trim()) detail = body.trim().slice(0, 200);
  }

  if (
    detail.toLowerCase().includes("saldo") ||
    detail.toLowerCase().includes("balance") ||
    httpStatus === 402
  ) {
    return `Saldo insuficiente na conta Asaas da NexaGO.${detail ? ` Detalhe: ${detail}` : ""}`;
  }
  if (
    detail.toLowerCase().includes("pix") ||
    detail.toLowerCase().includes("chave")
  ) {
    return `Chave PIX inválida ou não aceita pelo Asaas.${detail ? ` Detalhe: ${detail}` : ""}`;
  }
  if (httpStatus === 403 || httpStatus === 401) {
    return "Token Asaas inválido ou sem permissão para transferências.";
  }

  const suffix = detail ? ` Detalhe: ${detail}` : "";
  return (
    "Não foi possível enviar o PIX. O saque permanece pendente — verifique saldo Asaas e a chave PIX." +
    suffix
  );
}

type AsaasTransferResponse = {
  id?: string;
  status?: string;
};

/**
 * Envia PIX da conta NexaGO (Asaas) para a chave do saque.
 * Idempotente se `asaasTransferId` já existir com payoutStatus sent.
 */
export async function sendArenaWithdrawalPixTransfer(
  withdrawalRef: DocumentReference,
  withdrawal: Record<string, unknown>,
  externalRefPrefix: string = ARENA_WITHDRAWAL_REF_PREFIX,
): Promise<PayoutSendResult> {
  const existingStatus = (withdrawal.payoutStatus as string | undefined)?.toLowerCase();
  const existingId = withdrawal.asaasTransferId as string | undefined;
  if (existingStatus === "sent" && existingId) {
    return {payoutId: existingId, payoutStatus: "sent"};
  }

  const legacyMpId = withdrawal.mercadopagoPayoutId as string | undefined;
  if (existingStatus === "sent" && legacyMpId) {
    return {payoutId: legacyMpId, payoutStatus: "sent"};
  }

  const withdrawalId = withdrawalRef.id;
  const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFromDoc(withdrawal);
  const amountReais = roundMoney(Number(withdrawal.amountReais) || 0);
  const feeReais = roundMoney(Math.max(0, Number(withdrawal.feeReais) || 0));
  const netReais = roundMoney(amountReais - feeReais);

  if (pixAddressKey.length < 5) {
    throw new Error("PIX_KEY_INVALID");
  }
  if (amountReais <= 0 || netReais <= 0) {
    throw new Error("AMOUNT_INVALID");
  }

  await withdrawalRef.update({
    payoutStatus: "pending",
    payoutProvider: "asaas",
    payoutError: FieldValue.delete(),
    pixKey: pixAddressKey,
    pixKeyType: pixAddressKeyType,
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    const data = await fetchAsaas<AsaasTransferResponse>("/v3/transfers", {
      method: "POST",
      body: {
        value: netReais,
        pixAddressKey,
        pixAddressKeyType,
        externalReference: `${externalRefPrefix}${withdrawalId}`,
        description: `Repasse NexaGO — saque ${withdrawalId}`,
      },
      idempotencyKey: `withdrawal-transfer-${externalRefPrefix}${withdrawalId}`,
    });

    const transferId = data.id?.trim() || withdrawalId;

    await withdrawalRef.update({
      payoutStatus: "sent",
      asaasTransferId: transferId,
      payoutError: FieldValue.delete(),
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {payoutId: transferId, payoutStatus: "sent"};
  } catch (e) {
    const httpStatus = e instanceof AsaasApiError ? e.httpStatus : 500;
    const body = e instanceof AsaasApiError ? e.body : String(e);
    logger.error("sendArenaWithdrawalPixTransfer failed:", httpStatus, body.slice(0, 500));
    await withdrawalRef.update({
      payoutStatus: "failed",
      payoutError: `Asaas ${httpStatus}: ${body.slice(0, 500)}`,
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw new AsaasPayoutError(formatAsaasPayoutError(httpStatus, body), httpStatus, body);
  }
}
