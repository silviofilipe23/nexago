/**
 * Configuração ao vivo do cashback do atleta — `appConfig/cashback`.
 *
 * Desligado por padrão: doc ausente ou campo inválido cai no padrão seguro.
 * Desligar para de GERAR e de OFERECER o uso do saldo; o saldo já ganho segue
 * visível e é preservado.
 */
import type {Firestore} from "firebase-admin/firestore";
import {toCents} from "./cashback-rules";

export type CashbackConfig = {
  enabled: boolean;
  ratePercent: number;
  maxShareOfFee: number;
  minCashCents: number;
  expiryMonths: number;
  expiryWarningDays: number;
};

export const DEFAULT_CASHBACK_CONFIG: CashbackConfig = {
  enabled: false,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
};

function numberInRange(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= min && raw <= max ?
    raw :
    fallback;
}

export function parseCashbackConfig(raw?: Record<string, unknown>): CashbackConfig {
  const d = DEFAULT_CASHBACK_CONFIG;
  if (!raw) return {...d};
  return {
    enabled: raw.enabled === true,
    ratePercent: numberInRange(raw.ratePercent, 0, 20, d.ratePercent),
    maxShareOfFee: numberInRange(raw.maxShareOfFee, 0, 1, d.maxShareOfFee),
    minCashCents: toCents(numberInRange(raw.minCashReais, 0, 1000, d.minCashCents / 100)),
    expiryMonths: Math.round(numberInRange(raw.expiryMonths, 1, 60, d.expiryMonths)),
    expiryWarningDays: Math.round(numberInRange(raw.expiryWarningDays, 0, 90, d.expiryWarningDays)),
  };
}

export async function readCashbackConfig(db: Firestore): Promise<CashbackConfig> {
  const snap = await db.doc("appConfig/cashback").get();
  return parseCashbackConfig(snap.exists ? snap.data() : undefined);
}
