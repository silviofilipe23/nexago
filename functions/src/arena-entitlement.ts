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
import {ARENA_WITHDRAWAL_FEE_REAIS} from "./platform-fees";

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

/**
 * Fase "tudo liberado" (decisão do dono em 24/11/2026): toda arena usa todas as
 * funções, sem trava nem cobrança por plano; a Nexa ganha só nos pagamentos que
 * passam pela plataforma. Chave única do servidor: desligar volta aos gates por
 * plano. Espelhos: `arenaFeaturesUnlocked()` em firestore.rules e storage.rules,
 * `kArenaFeaturesUnlocked` no app e `ARENA_FEATURES_UNLOCKED` no portal.
 *
 * Só as FUNÇÕES seguem esta chave. Taxa por reserva (`arena-fees.ts`) e tarifa
 * de saque continuam lendo o plano pago real (`arenaEntitledTier`).
 */
export const ARENA_FEATURES_UNLOCKED = true;

/**
 * Tier que decide as funções liberadas (gates de operação, equipe, limites).
 * Com a chave ligada, toda arena tem o conjunto mais completo (Elite); sem
 * ela, é o plano pago real. Nunca use para taxa ou cobrança.
 */
export function arenaFeatureTier(
  arena: ArenaPlanFields,
  nowMs: number,
  unlocked: boolean = ARENA_FEATURES_UNLOCKED,
): ArenaPlanTier | null {
  return unlocked ? "elite" : arenaEntitledTier(arena, nowMs);
}

/** A arena tem as funções Pro-ou-superior? (gates de operação: comandas, estoque, clubinho, métricas, torneios.) */
export function isArenaEntitledPro(
  arena: ArenaPlanFields,
  nowMs: number,
  unlocked: boolean = ARENA_FEATURES_UNLOCKED,
): boolean {
  const tier = arenaFeatureTier(arena, nowMs, unlocked);
  return tier === "pro" || tier === "elite";
}

/** Tarifa fixa do saque PIX conforme o plano PAGO da arena (Elite isento). Não segue a chave de funções liberadas. */
export function resolveArenaWithdrawalFeeReais(arena: ArenaPlanFields, nowMs: number): number {
  return arenaEntitledTier(arena, nowMs) === "elite" ? 0 : ARENA_WITHDRAWAL_FEE_REAIS;
}
