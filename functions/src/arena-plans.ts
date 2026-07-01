/**
 * Catálogo de planos de arena — fonte da verdade no servidor.
 *
 * O cliente envia apenas `tier` + `cycle`; o valor cobrado SEMPRE vem daqui,
 * nunca do request (segurança). Espelha os planos exibidos no site
 * (`ArenaPlanos`): Essencial (grátis), Pro e Parceiro.
 */

export type ArenaPlanTier = "essencial" | "pro" | "parceiro";
export type BillingCycle = "monthly" | "yearly";

export interface ArenaPlan {
  tier: ArenaPlanTier;
  name: string;
  /** Valor mensal em centavos (0 = grátis). */
  monthlyCents: number;
  /** Valor anual total em centavos (0 = grátis). */
  yearlyCents: number;
  free: boolean;
}

// Tabela oficial de planos. Ciclo anual = 2 meses grátis (10× o mensal).
// Essencial é grátis: monetiza via taxa sobre reservas, não por mensalidade.
export const ARENA_PLANS: Record<ArenaPlanTier, ArenaPlan> = {
  essencial: {tier: "essencial", name: "Essencial", monthlyCents: 0, yearlyCents: 0, free: true},
  pro: {tier: "pro", name: "Pro", monthlyCents: 14900, yearlyCents: 149000, free: false},
  parceiro: {tier: "parceiro", name: "Parceiro", monthlyCents: 39900, yearlyCents: 399000, free: false},
};

export function isArenaPlanTier(value: unknown): value is ArenaPlanTier {
  return value === "essencial" || value === "pro" || value === "parceiro";
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === "monthly" || value === "yearly";
}

/**
 * Valor em centavos do plano/ciclo. Lança `ARENA_PLAN_NOT_BILLABLE` se o plano
 * for gratuito (Essencial) ou não tiver preço configurado.
 */
export function resolvePlanPriceCents(tier: ArenaPlanTier, cycle: BillingCycle): number {
  const plan = ARENA_PLANS[tier];
  if (!plan || plan.free) {
    throw new Error("ARENA_PLAN_NOT_BILLABLE");
  }
  const cents = cycle === "yearly" ? plan.yearlyCents : plan.monthlyCents;
  if (!(cents > 0)) {
    throw new Error("ARENA_PLAN_NOT_BILLABLE");
  }
  return cents;
}

/** Mapeia o ciclo interno para o enum de recorrência do Asaas. */
export function asaasCycle(cycle: BillingCycle): "MONTHLY" | "YEARLY" {
  return cycle === "yearly" ? "YEARLY" : "MONTHLY";
}
