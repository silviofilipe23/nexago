import type { ArenaSportChip } from '@nexago/arena-discovery';
import type { RankingLevel } from '../ranking/athlete-ranking.models';

export interface TeamMemberRef {
  /** uid do atleta — usado como rota `/atletas/:id` (null quando o slot ainda não tem parceiro). */
  handle: string | null;
  fullName: string;
  levelLabel: string;
}

export interface TeamTitle {
  id: string;
  name: string;
}

export interface TeamMatchResult {
  id: string;
  result: 'V' | 'D';
  opponent: string;
  contextLabel: string;
  score: string;
  dateLabel: string;
}

export interface TeamPublicProfile {
  id: string;
  teamName: string;
  sport: ArenaSportChip;
  level: RankingLevel | null;
  city: string;
  wins: number;
  losses: number;
  currentStreakWins: number;
  rankingPosition: number | null;
  rankingPoints: number;
  togetherSinceLabel: string;
  members: readonly TeamMemberRef[];
  titles: readonly TeamTitle[];
  matches: readonly TeamMatchResult[];
}
