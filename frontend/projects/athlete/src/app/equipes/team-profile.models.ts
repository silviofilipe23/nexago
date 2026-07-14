import type { ArenaSportChip } from '@nexago/arena-discovery';
import type { DemoMatchResult } from '../profile/public-profile-demo.models';
import type { RankingLevel, TeamStatus } from './athlete-equipes.models';

export interface TeamMemberRef {
  /** null quando não há perfil de atleta conhecido pra linkar (times gerados por fallback). */
  handle: string | null;
  fullName: string;
  role: string;
  levelNumber: number;
}

export interface TeamTitle {
  id: string;
  name: string;
  resultLabel: string;
  dateLabel: string;
}

export interface TeamPublicProfile {
  id: string;
  teamName: string;
  sport: ArenaSportChip;
  level: RankingLevel;
  city: string;
  status: TeamStatus;
  wins: number;
  losses: number;
  currentStreakWins: number;
  rankingPosition: number;
  rankingPoints: number;
  togetherSinceLabel: string;
  bio: string;
  members: readonly TeamMemberRef[];
  titles: readonly TeamTitle[];
  matches: readonly DemoMatchResult[];
  availabilitySlots: readonly string[];
}
