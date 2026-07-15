/** Espelha `functions/src/arena-plans.ts` (fonte da verdade do preço no servidor — o
 *  cliente nunca envia valor, só `tier`/`cycle`) e `nexago_app/.../arena/domain/arena_plan.dart`. */

export type ArenaPlanTier = 'essencial' | 'pro' | 'parceiro';
export type ArenaBillingCycle = 'monthly' | 'yearly';

/** `active` | `overdue` | `canceling` | `pending` | `none`. */
export type ArenaPlanRawStatus = 'active' | 'overdue' | 'canceling' | 'pending' | 'none';

export type ArenaCapability =
  | 'pdvComandas'
  | 'estoque'
  | 'promocoes'
  | 'metricasCompletas'
  | 'receberTorneios'
  | 'multiUnidade';

/** Carência após o vencimento em que a arena `overdue` ainda mantém o Pro (dias). Espelha `firestore.rules`. */
const ARENA_OVERDUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ArenaPlanStatus {
  tier: ArenaPlanTier | null;
  status: ArenaPlanRawStatus;
  activeUntil: Date | null;
}

export const ARENA_PLAN_STATUS_NONE: ArenaPlanStatus = { tier: null, status: 'none', activeUntil: null };

function isKnownTier(value: unknown): value is ArenaPlanTier {
  return value === 'essencial' || value === 'pro' || value === 'parceiro';
}

export function arenaPlanStatusFromDoc(data: Record<string, unknown> | undefined): ArenaPlanStatus {
  if (!data) return ARENA_PLAN_STATUS_NONE;
  const tier = isKnownTier(data['planTier']) ? data['planTier'] : null;
  const rawStatus = data['planStatus'];
  const status: ArenaPlanRawStatus =
    typeof rawStatus === 'string' && rawStatus.trim().length > 0 ? (rawStatus as ArenaPlanRawStatus) : 'none';
  const activeUntilValue = data['planActiveUntil'] as { toDate?: () => Date } | undefined;
  const activeUntil = activeUntilValue?.toDate?.() ?? null;
  return { tier, status, activeUntil };
}

/** A arena tem titularidade do plano pago em `now`? Mesma regra de `ArenaPlanStatus.entitledAt` no Flutter. */
export function arenaPlanEntitledAt(planStatus: ArenaPlanStatus, now: Date): boolean {
  if (planStatus.tier == null) return false;
  switch (planStatus.status) {
    case 'active':
      return true;
    case 'overdue':
      return planStatus.activeUntil != null && now.getTime() < planStatus.activeUntil.getTime() + ARENA_OVERDUE_GRACE_MS;
    case 'canceling':
      return planStatus.activeUntil != null && now.getTime() < planStatus.activeUntil.getTime();
    default:
      return false;
  }
}

/** Sem titularidade, cai para o comportamento do Essencial (sem capabilities Pro). */
export function arenaCapabilitiesFor(tier: ArenaPlanTier | null, entitled: boolean): ReadonlySet<ArenaCapability> {
  const effectiveTier = entitled ? tier : 'essencial';
  switch (effectiveTier) {
    case 'parceiro':
      return new Set<ArenaCapability>([
        'pdvComandas',
        'estoque',
        'promocoes',
        'metricasCompletas',
        'receberTorneios',
        'multiUnidade',
      ]);
    case 'pro':
      return new Set<ArenaCapability>(['pdvComandas', 'estoque', 'promocoes', 'metricasCompletas', 'receberTorneios']);
    default:
      return new Set<ArenaCapability>();
  }
}

/** Máximo de quadras por plano (`null` = ilimitado). Sem titularidade cai pro teto do
 *  Essencial. Espelha `maxCourtsFor` (Flutter) e a rule `arenaCanAddCourt`. */
export function maxCourtsFor(tier: ArenaPlanTier | null, entitled: boolean): number | null {
  const effectiveTier = entitled ? tier : 'essencial';
  return effectiveTier === 'pro' || effectiveTier === 'parceiro' ? null : 2;
}

/** Máximo de horários fixos (mensalista) ativos por plano (`null` = ilimitado). Espelha
 *  `ESSENCIAL_MAX_ACTIVE_RECURRING`/`isArenaEntitledPro` em `functions/src/arena-recurring-booking.ts`
 *  — aqui é só uma dica de UI; a Cloud Function é quem de fato barra a criação. */
export function maxRecurringActiveFor(tier: ArenaPlanTier | null, entitled: boolean): number | null {
  const effectiveTier = entitled ? tier : 'essencial';
  return effectiveTier === 'pro' || effectiveTier === 'parceiro' ? null : 3;
}

export interface ArenaPlanCatalogEntry {
  tier: ArenaPlanTier;
  name: string;
  tagline: string;
  monthlyCents: number;
  yearlyCents: number;
  free: boolean;
  features: readonly string[];
}

/** Catálogo de planos — preços espelham `functions/src/arena-plans.ts` (fonte da verdade
 *  no servidor); features espelham `arenaPlansCatalog` em `arena_plan.dart`/site. */
export const ARENA_PLAN_CATALOG: Readonly<Record<ArenaPlanTier, ArenaPlanCatalogEntry>> = {
  essencial: {
    tier: 'essencial',
    name: 'Essencial',
    tagline: 'Comece a receber reservas online sem pagar mensalidade.',
    monthlyCents: 0,
    yearlyCents: 0,
    free: true,
    features: [
      'Perfil público e listagem na busca',
      'Reservas online com pagamento PIX',
      'Agenda e disponibilidade das quadras',
      'Avaliações da arena',
      'Carteira e saque via PIX',
    ],
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    tagline: 'A operação completa da arena, do balcão ao torneio.',
    monthlyCents: 14900,
    yearlyCents: 149000,
    free: false,
    features: [
      'Tudo do Essencial',
      'PDV e comandas',
      'Controle de estoque e produtos',
      'Destaque na busca e promoções de horário',
      'Dashboard completo, insights e seguidores',
      'Receber etapas e torneios',
    ],
  },
  parceiro: {
    tier: 'parceiro',
    name: 'Parceiro',
    tagline: 'Para arenas que querem sediar a Liga nexaGO.',
    monthlyCents: 39900,
    yearlyCents: 399000,
    free: false,
    features: [
      'Tudo do Pro',
      'Quadras ilimitadas',
      'Prioridade em etapas da Liga nexaGO',
      'Gerente de conta dedicado',
    ],
  },
};

export const ARENA_PLAN_TIER_ORDER: readonly ArenaPlanTier[] = ['essencial', 'pro', 'parceiro'];

export function arenaPlanPriceCents(tier: ArenaPlanTier, cycle: ArenaBillingCycle): number {
  const plan = ARENA_PLAN_CATALOG[tier];
  return cycle === 'yearly' ? plan.yearlyCents : plan.monthlyCents;
}
