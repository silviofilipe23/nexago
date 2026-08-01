/** Espelha `functions/src/arena-plans.ts` (fonte da verdade do preço no servidor — o
 *  cliente nunca envia valor, só `tier`/`cycle`) e `nexago_app/.../arena/domain/arena_plan.dart`. */

export type ArenaPlanTier = 'starter' | 'pro' | 'elite';
export type ArenaBillingCycle = 'monthly' | 'yearly';

/** `active` | `overdue` | `canceling` | `pending` | `none`. */
export type ArenaPlanRawStatus = 'active' | 'overdue' | 'canceling' | 'pending' | 'none';

export type ArenaCapability =
  | 'pdvComandas'
  | 'estoque'
  | 'promocoes'
  | 'clubinho'
  | 'metricasCompletas'
  | 'receberTorneios'
  | 'multiUnidade'
  | 'equipe';

/** Carência após o vencimento em que a arena `overdue` ainda mantém o plano (dias). Espelha `firestore.rules`. */
const ARENA_OVERDUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** Ativação única na primeira assinatura da arena — cobrada pelo servidor somada à
 *  1ª fatura (não se repete em renovação nem em re-assinatura). Espelha
 *  `ACTIVATION_FEE_CENTS` em `functions/src/arena-plans.ts`. */
export const ARENA_ACTIVATION_FEE_CENTS = 9700;

export interface ArenaPlanStatus {
  tier: ArenaPlanTier | null;
  status: ArenaPlanRawStatus;
  activeUntil: Date | null;
}

export const ARENA_PLAN_STATUS_NONE: ArenaPlanStatus = { tier: null, status: 'none', activeUntil: null };

/** Normaliza um tier lido de doc/ref, aceitando ids legados de docs antigos:
 *  'parceiro' vira 'elite' (mantém tudo que tinha); 'essencial' (grátis extinto) vira
 *  null (sem plano). Nenhum doc é migrado — espelha `normalizeArenaPlanTier` em
 *  `functions/src/arena-plans.ts` e `ArenaPlanTierX.fromId` no Flutter. */
export function normalizeArenaPlanTier(value: unknown): ArenaPlanTier | null {
  if (value === 'starter' || value === 'pro' || value === 'elite') return value;
  if (value === 'parceiro') return 'elite';
  return null;
}

export function arenaPlanStatusFromDoc(data: Record<string, unknown> | undefined): ArenaPlanStatus {
  if (!data) return ARENA_PLAN_STATUS_NONE;
  const tier = normalizeArenaPlanTier(data['planTier']);
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

/** Sem titularidade (sem plano, atraso fora da carência, cancelamento já expirado), cai
 *  para o comportamento de "sem plano": nenhuma capability paga. */
export function arenaCapabilitiesFor(tier: ArenaPlanTier | null, entitled: boolean): ReadonlySet<ArenaCapability> {
  const effectiveTier = entitled ? tier : null;
  switch (effectiveTier) {
    case 'elite':
      return new Set<ArenaCapability>([
        'pdvComandas',
        'estoque',
        'promocoes',
        'clubinho',
        'metricasCompletas',
        'receberTorneios',
        'multiUnidade',
        'equipe',
      ]);
    case 'pro':
      return new Set<ArenaCapability>([
        'pdvComandas',
        'estoque',
        'promocoes',
        'clubinho',
        'metricasCompletas',
        'receberTorneios',
        'equipe',
      ]);
    default:
      return new Set<ArenaCapability>();
  }
}

/** Máximo de quadras por plano (`null` = ilimitado). Sem titularidade cai pro teto de
 *  "sem plano". Espelha `maxCourtsFor` (Flutter) e a rule `arenaCanAddCourt`. */
export function maxCourtsFor(tier: ArenaPlanTier | null, entitled: boolean): number | null {
  const effectiveTier = entitled ? tier : null;
  if (effectiveTier === 'elite') return null;
  if (effectiveTier === 'pro') return 5;
  return 2;
}

/** Plano que destrava mais quadras a partir do tier atual (`null` = já é ilimitado).
 *  Sem plano/Starter (teto 2) sobem para o Pro (teto 5); Pro sobe para o Elite. Espelha
 *  `nextCourtsTierFor` em `arena_plan.dart` — o upsell não pode vender o plano que a
 *  arena já tem. */
export function nextCourtsTierFor(tier: ArenaPlanTier | null, entitled: boolean): ArenaPlanTier | null {
  const effectiveTier = entitled ? tier : null;
  if (effectiveTier === 'elite') return null;
  return effectiveTier === 'pro' ? 'elite' : 'pro';
}

/** Máximo de horários fixos (mensalista) ativos por plano (`null` = ilimitado). Espelha
 *  `maxRecurringBookingsFor` (Flutter) e o gate em `functions/src/arena-recurring-booking.ts`
 *  — aqui é só uma dica de UI; a Cloud Function é quem de fato barra a criação. */
export function maxRecurringActiveFor(tier: ArenaPlanTier | null, entitled: boolean): number | null {
  const effectiveTier = entitled ? tier : null;
  return effectiveTier === 'pro' || effectiveTier === 'elite' ? null : 3;
}

export interface ArenaPlanCatalogEntry {
  tier: ArenaPlanTier;
  name: string;
  tagline: string;
  monthlyCents: number;
  yearlyCents: number;
  features: readonly string[];
}

/** Catálogo de planos — preços espelham `functions/src/arena-plans.ts` (fonte da verdade
 *  no servidor); features/taglines espelham `arenaPlansCatalog` em `arena_plan.dart`/site.
 *  Não existe mais plano grátis — toda arena sem assinatura ativa é "sem plano" (tier
 *  `null`) e paga 8% por reserva. */
export const ARENA_PLAN_CATALOG: Readonly<Record<ArenaPlanTier, ArenaPlanCatalogEntry>> = {
  starter: {
    tier: 'starter',
    name: 'Starter',
    tagline: 'Ideal para pequenas arenas começarem online.',
    monthlyCents: 9900,
    yearlyCents: 108000,
    features: [
      'Até 2 quadras · 1 admin',
      'Site institucional + perfil na busca',
      'Agenda e reservas online (site e app)',
      'Avaliações e reputação',
      'Pagamento e saque via PIX',
      'Taxa de 8% por reserva',
    ],
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    tagline: 'A operação completa da arena.',
    monthlyCents: 24900,
    yearlyCents: 273600,
    features: [
      'Tudo do Starter · até 5 quadras',
      'Torneios ilimitados e ranking da arena',
      'Inscrições com pagamento online',
      'Relatórios e dashboard',
      'PDV, comandas e estoque',
      'Push para atletas · taxa de 6%',
    ],
  },
  elite: {
    tier: 'elite',
    name: 'Elite',
    tagline: 'Para arenas grandes e redes.',
    monthlyCents: 49900,
    yearlyCents: 548400,
    features: [
      'Tudo do Pro · usuários ilimitados',
      'Análise financeira + consultoria semanal',
      'Landing pages ilimitadas',
      'Área de patrocinadores',
      'Suporte prioritário',
      'Taxa de 5% · saque PIX sem tarifa',
    ],
  },
};

export const ARENA_PLAN_TIER_ORDER: readonly ArenaPlanTier[] = ['starter', 'pro', 'elite'];

export function arenaPlanPriceCents(tier: ArenaPlanTier, cycle: ArenaBillingCycle): number {
  const plan = ARENA_PLAN_CATALOG[tier];
  return cycle === 'yearly' ? plan.yearlyCents : plan.monthlyCents;
}
