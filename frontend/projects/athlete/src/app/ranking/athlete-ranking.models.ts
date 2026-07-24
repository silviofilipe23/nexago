import type { ArenaSportChip } from '@nexago/arena-discovery';

export type RankingMode = 'individual' | 'doubles';
/** Os 5 níveis da escada única (`AthleteProfileOptions.levels`) — "Avançado"/"Profissional"
 *  eram sinônimos legados que o backend já normaliza pra Intermediário/Open, não tiers à parte. */
export type RankingLevel = 'Iniciante 1' | 'Iniciante 2' | 'Intermediário 1' | 'Intermediário 2' | 'Open';
export type FilterLevel = 'all' | RankingLevel;
export type RankingPeriod = 'geral' | 'temporada';

export interface RankingParticipant {
  id: string;
  name: string;
  city: string;
  points: number;
  level: RankingLevel | null;
  sport: ArenaSportChip;
  /** Variação de posição — sem dado real no backend hoje (sempre 0, sem seta). */
  trend: number;
}

export interface RankingSelfEntry {
  rank: number;
  name: string;
  city: string;
  points: number;
  level: RankingLevel | null;
  trend: number;
}

export interface RankingScoringRule {
  id: string;
  title: string;
  detail: string;
}

/** Tabela real de pontos por colocação (`ranking_constants.dart`) — "melhores 5" só vale
 *  no modo Temporada; no modo Geral soma tudo que o atleta já ganhou. */
export const RANKING_SCORING_RULES: readonly RankingScoringRule[] = [
  { id: 'rule-1', title: '1º lugar', detail: '100 pts' },
  { id: 'rule-2', title: '2º lugar', detail: '80 pts' },
  { id: 'rule-3', title: '3º lugar', detail: '60 pts' },
  { id: 'rule-4', title: '4º lugar', detail: '50 pts' },
  { id: 'rule-5-8', title: '5º–8º lugar', detail: '33 pts' },
];
