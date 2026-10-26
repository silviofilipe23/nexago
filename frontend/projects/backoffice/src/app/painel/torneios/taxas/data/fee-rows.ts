import type { TournamentRow } from '../../data/tournaments.repository';
import type { FeeOverrideEntry, OrganizerFeeInfo, TournamentRevenue } from './tournament-fees.repository';
import {
  baseRule,
  feeReais,
  isOverrideActive,
  resolveRule,
  type FeeRule,
  type ResolvedFeeRule,
  type TournamentFeeOverride,
} from './tournament-fees';

/** Linha da tabela de Taxas: o torneio, a exceção gravada e a regra que a cobrança aplica hoje. */
export interface FeeRow {
  tournament: TournamentRow;
  organizerName: string | null;
  /** Exceção gravada (mesmo vencida); `null` = nunca teve ou voltou ao padrão. */
  override: TournamentFeeOverride | null;
  /** `version` do doc em `tournamentFees` (0 = nunca editado). */
  version: number;
  /** A regra sem a exceção: cadastro do organizador ou padrão da plataforma. */
  base: ResolvedFeeRule;
  /** A regra que vale hoje. */
  rule: ResolvedFeeRule;
  /** Tem exceção, mas `until` já passou: a cobrança voltou à `base`. */
  expired: boolean;
}

export type FeeFilter = 'todos' | 'padrao' | 'custom' | 'isento';

export function buildFeeRow(
  tournament: TournamentRow,
  entry: FeeOverrideEntry | undefined,
  organizer: OrganizerFeeInfo | undefined,
  defaults: FeeRule,
  today: string,
): FeeRow {
  const override = entry?.override ?? null;
  const commission = organizer?.commissionPercent ?? null;
  return {
    tournament,
    organizerName: organizer?.name ?? null,
    override,
    version: entry?.version ?? 0,
    base: baseRule(commission, defaults),
    rule: resolveRule(override, commission, defaults, today),
    expired: override !== null && !isOverrideActive(override, today),
  };
}

/** Modo que a linha mostra: exceção vencida conta como padrão (é o que a cobrança faz). */
export function rowMode(row: FeeRow): 'padrao' | 'custom' | 'isento' {
  return row.rule.source === 'tournament' && row.override ? row.override.mode : 'padrao';
}

/** Ids com exceção vigente de um modo (os filtros Personalizada/Isento leem por id, sem paginar). */
export function activeOverrideIds(
  overrides: ReadonlyMap<string, FeeOverrideEntry>,
  mode: 'custom' | 'isento',
  today: string,
): string[] {
  return [...overrides.values()]
    .filter((e) => e.override?.mode === mode && isOverrideActive(e.override, today))
    .map((e) => e.tournamentId);
}

/**
 * Simulação sobre o já pago: N pagamentos de valor médio `bruto ÷ N`. Aproxima (o extrato só
 * dá a soma), mas o piso é por pagamento, então é melhor que aplicar o % sobre o total.
 */
export function simulateOnPaid(revenue: TournamentRevenue, rule: FeeRule): number {
  if (revenue.payments <= 0 || revenue.grossReais <= 0) {
    return 0;
  }
  const avg = revenue.grossReais / revenue.payments;
  return Math.round(feeReais(avg, rule) * revenue.payments * 100) / 100;
}
