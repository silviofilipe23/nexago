import {defineSecret} from "firebase-functions/params";

export const PLATFORM_FEE_FIXED_BRL = defineSecret("PLATFORM_FEE_FIXED_BRL");

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
