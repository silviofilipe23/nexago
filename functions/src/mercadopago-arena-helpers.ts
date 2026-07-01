import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {isArenaEntitledPro} from "./arena-entitlement";
import {BOOKING_FEE_PERCENT, computePlatformFeeReais} from "./platform-fees";

export const MERCADOPAGO_APP_ID = defineSecret("MERCADOPAGO_APP_ID");
export const MERCADOPAGO_APP_SECRET = defineSecret("MERCADOPAGO_APP_SECRET");
export const MERCADOPAGO_PLATFORM_ACCESS_TOKEN = defineSecret(
  "MERCADOPAGO_PLATFORM_ACCESS_TOKEN",
);
export const PLATFORM_FEE_FIXED_BRL = defineSecret("PLATFORM_FEE_FIXED_BRL");

export const MP_OAUTH_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
export const MP_PAYMENTS_URL = "https://api.mercadopago.com/v1/payments";
/** Money Out — transferência PIX única (conta NexaGO). */
export const MP_PIX_PAYOUT_URL = "https://api.mercadopago.com/v1/payouts";

export type ArenaPaymentReceiver = "platform" | "manager";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function readPlatformFeeBrl(): number {
  try {
    const feeVal = PLATFORM_FEE_FIXED_BRL.value();
    if (feeVal != null && feeVal !== "") {
      const n = Number(feeVal);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch {
    // secret ausente em emulador
  }
  return 2;
}

export function applicationFeeForAmount(amount: number, platformFeeBrl: number): number {
  if (amount <= 0) return 0;
  return Math.min(platformFeeBrl, roundMoney(amount - 0.01));
}

export async function refreshMercadoPagoToken(managerId: string): Promise<string> {
  const db = getFirestore();
  const docSnap = await db.doc(`users/${managerId}/mercadopago/credentials`).get();
  const creds = docSnap.data();
  if (!creds?.refresh_token) {
    throw new Error("Organizador ainda não vinculou conta Mercado Pago");
  }
  const appId = MERCADOPAGO_APP_ID.value();
  const appSecret = MERCADOPAGO_APP_SECRET.value();
  if (!appId || !appSecret) {
    throw new Error("Configuração Mercado Pago incompleta");
  }
  const tokenRes = await fetch(MP_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "refresh_token",
      refresh_token: String(creds.refresh_token),
    }).toString(),
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    logger.error("MP refresh token failed:", tokenRes.status, errText);
    throw new Error("Falha ao renovar token Mercado Pago");
  }
  const data = await tokenRes.json() as {access_token: string; expires_in: number};
  const expiresAt = Date.now() + data.expires_in * 1000;
  await db.doc(`users/${managerId}/mercadopago/credentials`).update({
    access_token: data.access_token,
    expires_at: expiresAt,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return data.access_token;
}

/** Token OAuth do gestor da arena (com refresh automático). */
export async function getManagerMercadoPagoAccessToken(managerId: string): Promise<string> {
  const db = getFirestore();
  const mpCredsSnap = await db.doc(`users/${managerId}/mercadopago/credentials`).get();
  const mpCreds = mpCredsSnap.data();
  if (!mpCreds?.access_token) {
    throw new Error("MP_NOT_LINKED");
  }
  let accessToken = mpCreds.access_token as string;
  const expiresAt = mpCreds.expires_at as number | undefined;
  if (expiresAt != null && Date.now() >= expiresAt - 60000) {
    accessToken = await refreshMercadoPagoToken(managerId);
  }
  return accessToken;
}

export function readArenaPaymentReceiver(
  arena: Record<string, unknown>,
): ArenaPaymentReceiver {
  const raw = (arena.paymentReceiver as string | undefined)?.trim().toLowerCase();
  if (raw === "manager") return "manager";
  return "platform";
}

export function readArenaPayoutPixKey(arena: Record<string, unknown>): string {
  const raw = arena.payoutPixKey;
  if (typeof raw === "string") return raw.trim();
  return "";
}

export function readArenaPayoutPixKeyType(arena: Record<string, unknown>): string {
  const raw = arena.payoutPixKeyType;
  if (typeof raw === "string") return raw.trim().toUpperCase();
  return "";
}

export function requireArenaPayoutPixKey(arena: Record<string, unknown>): string {
  const key = readArenaPayoutPixKey(arena);
  if (key.length < 5) {
    throw new Error("ARENA_PAYOUT_PIX_KEY_REQUIRED");
  }
  return key;
}

export function getPlatformMercadoPagoAccessToken(): string {
  try {
    const token = MERCADOPAGO_PLATFORM_ACCESS_TOKEN.value()?.trim();
    if (token) return token;
  } catch {
    // secret ausente em emulador
  }
  throw new Error("MP_PLATFORM_TOKEN_MISSING");
}

export type ResolvedPixPaymentAuth = {
  accessToken: string;
  paymentReceiver: ArenaPaymentReceiver;
  applicationFee: number;
};

/** Token e taxa para criar cobrança PIX conforme modo da arena. */
export async function resolvePixPaymentAuth(
  arena: Record<string, unknown>,
  managerId: string | undefined,
  amountToPayNow: number,
): Promise<ResolvedPixPaymentAuth> {
  const paymentReceiver = readArenaPaymentReceiver(arena);

  if (paymentReceiver === "platform") {
    return {
      accessToken: getPlatformMercadoPagoAccessToken(),
      paymentReceiver: "platform",
      applicationFee: 0,
    };
  }

  if (!managerId) {
    throw new Error("ARENA_MANAGER_REQUIRED");
  }

  // Split para o recebedor manager: taxa só se a arena está no plano gratuito.
  const entitled = isArenaEntitledPro(arena, Date.now());
  const accessToken = await getManagerMercadoPagoAccessToken(managerId);
  return {
    accessToken,
    paymentReceiver: "manager",
    applicationFee: entitled ?
      0 :
      computePlatformFeeReais(amountToPayNow, BOOKING_FEE_PERCENT),
  };
}

export function readArenaPaymentFlags(arena: Record<string, unknown>): {
  onlinePaymentEnabled: boolean;
  onsitePaymentEnabled: boolean;
} {
  const readBool = (keys: string[], defaultVal: boolean): boolean => {
    for (const k of keys) {
      const v = arena[k];
      if (v === true) return true;
      if (v === false) return false;
    }
    return defaultVal;
  };
  return {
    onlinePaymentEnabled: readBool(
      ["onlinePaymentEnabled", "acceptOnlinePayment"],
      true,
    ),
    onsitePaymentEnabled: readBool(
      ["onsitePaymentEnabled", "acceptOnsitePayment", "acceptLocalPayment"],
      true,
    ),
  };
}
