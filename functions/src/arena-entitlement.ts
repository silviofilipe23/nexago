/**
 * Titularidade (entitlement) do plano de arena no servidor. Espelha
 * `ArenaPlanStatus.entitledAt` do app e `arenaEntitled` das firestore.rules:
 *  - active: sim;
 *  - overdue: sim enquanto dentro da carência de 7 dias após o vencimento;
 *  - canceling: sim até o fim do período pago (planActiveUntil);
 *  - demais: não.
 * Tiers legados são normalizados (parceiro→elite; essencial→sem plano).
 */
import {Timestamp} from "firebase-admin/firestore";
import {normalizeArenaPlanTier, type ArenaPlanTier} from "./arena-plans";
import {
  ARENA_WITHDRAWAL_FEE_REAIS,
  BOOKING_FEE_PERCENT_BY_TIER,
  BOOKING_FEE_PERCENT_NO_PLAN,
} from "./platform-fees";

export const OVERDUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

type ArenaPlanFields = {
  planStatus?: unknown;
  planTier?: unknown;
  planActiveUntil?: unknown;
};

/** Tier (normalizado) do qual a arena é titular neste momento, ou null. */
export function arenaEntitledTier(arena: ArenaPlanFields, nowMs: number): ArenaPlanTier | null {
  const tier = normalizeArenaPlanTier(
    typeof arena.planTier === "string" ? arena.planTier.trim() : arena.planTier,
  );
  if (!tier) return null;

  const status = typeof arena.planStatus === "string" ? arena.planStatus : "none";
  const until = arena.planActiveUntil instanceof Timestamp ?
    arena.planActiveUntil.toMillis() :
    null;

  if (status === "active") return tier;
  if (status === "overdue") {
    return until != null && nowMs < until + OVERDUE_GRACE_MS ? tier : null;
  }
  if (status === "canceling") {
    return until != null && nowMs < until ? tier : null;
  }
  return null;
}

/** A arena tem titularidade Pro-ou-superior? (gates de operação: comandas, estoque, clubinho, métricas, torneios.) */
export function isArenaEntitledPro(arena: ArenaPlanFields, nowMs: number): boolean {
  const tier = arenaEntitledTier(arena, nowMs);
  return tier === "pro" || tier === "elite";
}

/** Percentual da taxa de reserva conforme o plano titular (sem plano = 8%). */
export function resolveArenaBookingFeePercent(arena: ArenaPlanFields, nowMs: number): number {
  const tier = arenaEntitledTier(arena, nowMs);
  return tier ? BOOKING_FEE_PERCENT_BY_TIER[tier] : BOOKING_FEE_PERCENT_NO_PLAN;
}

/** Tarifa fixa do saque PIX conforme o plano titular da arena (Elite isento). */
export function resolveArenaWithdrawalFeeReais(arena: ArenaPlanFields, nowMs: number): number {
  return arenaEntitledTier(arena, nowMs) === "elite" ? 0 : ARENA_WITHDRAWAL_FEE_REAIS;
}
