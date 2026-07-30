/**
 * Catálogo de planos de arena — fonte da verdade no servidor.
 *
 * O cliente envia apenas `tier` + `cycle`; o valor cobrado SEMPRE vem daqui,
 * nunca do request (segurança). Espelha os planos exibidos no site
 * (`ArenaPlanos`): Starter, Pro e Elite — todos pagos; a taxa por reserva
 * (8/6/5%) vive em `platform-fees.ts`.
 *
 * IDs legados em docs antigos: 'parceiro' é lido como 'elite' e 'essencial'
 * como "sem plano" via `normalizeArenaPlanTier` — nenhum doc é migrado.
 */

export type ArenaPlanTier = "starter" | "pro" | "elite";
export type BillingCycle = "monthly" | "yearly";

export interface ArenaPlan {
  tier: ArenaPlanTier;
  name: string;
  /** Valor mensal em centavos. */
  monthlyCents: number;
  /** Valor anual total em centavos (12× a parcela da tabela comercial ≈ 1 mês grátis). */
  yearlyCents: number;
}

// Tabela oficial (2026-07): anual = 12× R$90 / R$228 / R$457.
export const ARENA_PLANS: Record<ArenaPlanTier, ArenaPlan> = {
  starter: {tier: "starter", name: "Starter", monthlyCents: 9900, yearlyCents: 108000},
  pro: {tier: "pro", name: "Pro", monthlyCents: 24900, yearlyCents: 273600},
  elite: {tier: "elite", name: "Elite", monthlyCents: 49900, yearlyCents: 548400},
};

/** Ativação única na primeira assinatura da arena (domínio, site, onboarding). */
export const ACTIVATION_FEE_CENTS = 9700;

export function isArenaPlanTier(value: unknown): value is ArenaPlanTier {
  return value === "starter" || value === "pro" || value === "elite";
}

/**
 * Normaliza um tier lido de doc/ref, aceitando ids legados: 'parceiro' vira
 * 'elite' (mantém tudo que tinha); 'essencial' (grátis extinto) vira null.
 */
export function normalizeArenaPlanTier(value: unknown): ArenaPlanTier | null {
  if (isArenaPlanTier(value)) return value;
  if (value === "parceiro") return "elite";
  return null;
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === "monthly" || value === "yearly";
}

/** Valor em centavos do plano/ciclo. Lança `ARENA_PLAN_NOT_BILLABLE` se inválido. */
export function resolvePlanPriceCents(tier: ArenaPlanTier, cycle: BillingCycle): number {
  const plan = ARENA_PLANS[tier];
  if (!plan) {
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
