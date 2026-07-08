import type { ArenaSportChip } from '@nexago/arena-discovery';

export type RankingMode = 'individual' | 'doubles';
export type RankingLevel = 'Iniciante' | 'Intermediário' | 'Avançado' | 'Profissional';
export type FilterLevel = 'all' | RankingLevel;

export interface RankingParticipant {
  id: string;
  name: string;
  city: string;
  points: number;
  level: RankingLevel;
  sport: ArenaSportChip;
  /** Variação de posição desde a última atualização; 0 = sem mudança. */
  trend: number;
}

export interface RankingSelfEntry {
  rank: number;
  name: string;
  city: string;
  points: number;
  level: RankingLevel;
  trend: number;
}

export interface RankingScoringRule {
  id: string;
  title: string;
  detail: string;
}
