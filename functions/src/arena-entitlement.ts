/**
 * Titularidade (entitlement) do plano de arena no servidor. Espelha
 * `ArenaPlanStatus.entitledAt` do app e `arenaEntitled` das firestore.rules:
 *  - active: sim;
 *  - overdue: sim enquanto dentro da carência de 7 dias após o vencimento;
 *  - canceling: sim até o fim do período pago (planActiveUntil);
 *  - demais: não.
 */
import {Timestamp} from "firebase-admin/firestore";

export const OVERDUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

type ArenaPlanFields = {
  planStatus?: unknown;
  planTier?: unknown;
  planActiveUntil?: unknown;
};

/** A arena tem titularidade de um plano pago (Pro/Parceiro) neste momento? */
export function isArenaEntitledPro(arena: ArenaPlanFields, nowMs: number): boolean {
  const tier = typeof arena.planTier === "string" ? arena.planTier : "";
  if (tier !== "pro" && tier !== "parceiro") return false;

  const status = typeof arena.planStatus === "string" ? arena.planStatus : "none";
  const until = arena.planActiveUntil instanceof Timestamp ?
    arena.planActiveUntil.toMillis() :
    null;

  if (status === "active") return true;
  if (status === "overdue") return until != null && nowMs < until + OVERDUE_GRACE_MS;
  if (status === "canceling") return until != null && nowMs < until;
  return false;
}
