import {FieldValue, type DocumentReference} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {AsaasApiError, fetchAsaas} from "./asaas-client";
import {ARENA_WITHDRAWAL_REF_PREFIX} from "./arena-booking-payment-constants";
import {roundMoney} from "./mercadopago-arena-helpers";
import {
  failedTransferIds,
  lowerStatus,
  nextTransferAttempt,
  transferAttempt,
} from "./withdrawal-transfer-state";

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
  /** `false` enquanto espera autorização por token SMS/APP no Asaas. */
  authorized?: boolean;
};

export type WithdrawalTransferAmount = {
  /** Valor bruto pedido pelo gestor (o que sai do saldo da carteira). */
  amountReais: number;
  /** Tarifa de saque retida pela plataforma (0 em Elite e em docs antigos). */
  feeReais: number;
  /** Valor efetivamente transferido por PIX. É este o `value` do Asaas. */
  netReais: number;
};

/**
 * Aritmética do valor transferido em um saque — o caminho do dinheiro.
 *
 * Docs antigos (e todos os saques de ORGANIZADOR, que não têm tarifa) não
 * gravam `feeReais`: nesse caso a tarifa é 0 e transfere-se o bruto, sem
 * quebrar saques em voo. Uma tarifa maior que o valor devolve `netReais <= 0`,
 * que o chamador rejeita — nunca se transfere valor negativo.
 */
export function resolveWithdrawalTransferAmount(
  withdrawal: Record<string, unknown>,
): WithdrawalTransferAmount {
  const amountReais = roundMoney(Number(withdrawal.amountReais) || 0);
  const feeReais = roundMoney(Math.max(0, Number(withdrawal.feeReais) || 0));
  return {amountReais, feeReais, netReais: roundMoney(amountReais - feeReais)};
}

/** O valor a transferir é utilizável? Bruto e líquido têm de ser positivos. */
export function withdrawalTransferAmountIsValid(
  amounts: Pick<WithdrawalTransferAmount, "amountReais" | "netReais">,
): boolean {
  return amounts.amountReais > 0 && amounts.netReais > 0;
}

/**
 * Chave de idempotência da transferência do saque: uma por tentativa
 * (`transferAttempt`, ver withdrawal-transfer-state.ts). Repetir a mesma
 * tentativa devolve a mesma transferência; tentativa nova cria outra.
 */
export function withdrawalTransferIdempotencyKey(
  externalRefPrefix: string,
  withdrawalId: string,
  withdrawal: Record<string, unknown>,
): string {
  const base = `withdrawal-transfer-${externalRefPrefix}${withdrawalId}`;
  const attempt = transferAttempt(withdrawal);
  return attempt > 0 ? `${base}-try-${attempt}` : base;
}

/**
 * Erro do Asaas que garante que a transferência NÃO foi criada (recusa de
 * validação, saldo, chave). Rede, 5xx, 408, 409 e 429 são incertos.
 */
export function asaasErrorIsDefinitiveRefusal(httpStatus: number): boolean {
  return httpStatus >= 400 && httpStatus < 500 &&
    httpStatus !== 408 && httpStatus !== 409 && httpStatus !== 429;
}

/**
 * Envia PIX da conta NexaGO (Asaas) para a chave do saque.
 * Idempotente se `asaasTransferId` já existir com payoutStatus sent/paid.
 */
export async function sendArenaWithdrawalPixTransfer(
  withdrawalRef: DocumentReference,
  withdrawal: Record<string, unknown>,
  externalRefPrefix: string = ARENA_WITHDRAWAL_REF_PREFIX,
): Promise<PayoutSendResult> {
  const existingStatus = (withdrawal.payoutStatus as string | undefined)?.toLowerCase();
  const existingId = withdrawal.asaasTransferId as string | undefined;
  if ((existingStatus === "sent" || existingStatus === "paid") && existingId) {
    return {payoutId: existingId, payoutStatus: "sent"};
  }

  const legacyMpId = withdrawal.mercadopagoPayoutId as string | undefined;
  if (existingStatus === "sent" && legacyMpId) {
    return {payoutId: legacyMpId, payoutStatus: "sent"};
  }

  const withdrawalId = withdrawalRef.id;
  const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFromDoc(withdrawal);
  const amounts = resolveWithdrawalTransferAmount(withdrawal);
  const {netReais} = amounts;

  if (pixAddressKey.length < 5) {
    throw new Error("PIX_KEY_INVALID");
  }
  if (!withdrawalTransferAmountIsValid(amounts)) {
    throw new Error("AMOUNT_INVALID");
  }

  // Nova tentativa depois de uma transferência morta: o id dela vai para
  // `failedTransferIds`, para evento atrasado dela não mexer mais no saque.
  const retiredTransferId = existingStatus === "failed" ? existingId?.trim() ?? "" : "";
  await withdrawalRef.update({
    payoutStatus: "pending",
    payoutProvider: "asaas",
    payoutError: FieldValue.delete(),
    pixKey: pixAddressKey,
    pixKeyType: pixAddressKeyType,
    // Marca de envio em curso: a validação de saque só aprova com ela, e saque
    // acima do limite (pending desde o pedido) só a ganha quando é aprovado.
    transferRequestedAt: FieldValue.serverTimestamp(),
    ...(retiredTransferId ? {
      failedTransferIds: [...failedTransferIds(withdrawal), retiredTransferId],
      asaasTransferId: FieldValue.delete(),
    } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  let data: AsaasTransferResponse;
  try {
    data = await fetchAsaas<AsaasTransferResponse>("/v3/transfers", {
      method: "POST",
      body: {
        value: netReais,
        pixAddressKey,
        pixAddressKeyType,
        externalReference: `${externalRefPrefix}${withdrawalId}`,
        description: `Repasse NexaGO — saque ${withdrawalId}`,
      },
      idempotencyKey: withdrawalTransferIdempotencyKey(externalRefPrefix, withdrawalId, withdrawal),
    });
  } catch (e) {
    const httpStatus = e instanceof AsaasApiError ? e.httpStatus : 500;
    const body = e instanceof AsaasApiError ? e.body : String(e);
    logger.error("sendArenaWithdrawalPixTransfer failed:", httpStatus, body.slice(0, 500));
    const refused = e instanceof AsaasApiError && asaasErrorIsDefinitiveRefusal(httpStatus);
    await withdrawalRef.update({
      payoutStatus: "failed",
      payoutError: `Asaas ${httpStatus}: ${body.slice(0, 500)}`,
      // Recusa certa: a chave desta tentativa não criou nada e pode ter
      // guardado o erro — a próxima usa outra. Incerto: mantém a chave.
      ...(refused ? {transferAttempt: nextTransferAttempt(withdrawal)} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw new AsaasPayoutError(formatAsaasPayoutError(httpStatus, body), httpStatus, body);
  }

  const transferId = data.id?.trim() || withdrawalId;
  const remoteStatus = data.status?.trim().toUpperCase() ?? "";
  if (transferResponseIsDead(remoteStatus)) {
    // A idempotência devolveu uma transferência que já morreu (resposta
    // anterior perdida): não é envio. A próxima tentativa ganha chave nova.
    await withdrawalRef.update({
      payoutStatus: "failed",
      asaasTransferId: transferId,
      asaasTransferStatus: remoteStatus,
      payoutError: `Transferência ${remoteStatus} no Asaas.`,
      transferAttempt: nextTransferAttempt(withdrawal),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw new AsaasPayoutError(
      "A transferência anterior deste saque não foi concluída no Asaas. Tente de novo.",
      409,
      remoteStatus,
    );
  }

  const recorded = await recordTransferCreated(withdrawalRef, transferId, data);
  if (recorded === "retired") {
    throw new AsaasPayoutError(
      "O Asaas devolveu uma transferência antiga deste saque. Tente de novo.",
      409,
      transferId,
    );
  }
  return {payoutId: transferId, payoutStatus: "sent"};
}

/** Resposta do Asaas com uma transferência que não vai sair. */
export function transferResponseIsDead(status: string): boolean {
  const s = status.trim().toUpperCase();
  return s === "CANCELLED" || s === "FAILED";
}

/**
 * "sent" = o Asaas aceitou CRIAR a transferência, não que o dinheiro saiu: ela
 * ainda pode esperar autorização (token SMS/APP, validação de saque) e falhar
 * no banco. `paidAt` e `payoutStatus: "paid"` só chegam pelo `TRANSFER_DONE`
 * (asaas-withdrawal-webhook.ts) — e se esse webhook (ou o de falha) chegou
 * antes desta gravação, ela não o desfaz.
 */
async function recordTransferCreated(
  withdrawalRef: DocumentReference,
  transferId: string,
  data: AsaasTransferResponse,
): Promise<"recorded" | "settled" | "retired"> {
  const authorized = typeof data.authorized === "boolean" ? data.authorized : null;
  return withdrawalRef.firestore.runTransaction(async (tx) => {
    const current = (await tx.get(withdrawalRef)).data() ?? {};
    if (failedTransferIds(current).includes(transferId)) {
      // Uma transferência já aposentada voltou pela chave (não deveria, com a
      // chave por tentativa — mas aceitá-la consumiria a reserva sem PIX).
      tx.update(withdrawalRef, {
        payoutStatus: "failed",
        payoutError: "O Asaas devolveu uma transferência antiga deste saque.",
        transferAttempt: nextTransferAttempt(current),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "retired";
    }
    const status = lowerStatus(current.payoutStatus);
    const sameTransfer = ((current.asaasTransferId as string | undefined) ?? "") === transferId;
    if ((status === "paid" || status === "failed") && sameTransfer) {
      tx.update(withdrawalRef, {
        asaasTransferAuthorized: authorized,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "settled";
    }
    tx.update(withdrawalRef, {
      payoutStatus: "sent",
      asaasTransferId: transferId,
      asaasTransferStatus: data.status?.trim() || null,
      asaasTransferAuthorized: authorized,
      payoutError: FieldValue.delete(),
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "recorded";
  });
}
