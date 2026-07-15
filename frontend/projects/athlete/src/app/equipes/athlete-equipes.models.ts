import type { ArenaSportChip } from '@nexago/arena-discovery';
import type { RankingLevel } from '../ranking/athlete-ranking.models';

export interface MyTeam {
  id: string;
  memberAInitials: string;
  memberBInitials: string;
  name: string;
  sport: ArenaSportChip;
  level: RankingLevel | null;
  wins: number;
  losses: number;
  doublesRank: number | null;
}

export interface PartnerCandidate {
  id: string;
  initials: string;
  name: string;
  locationLabel: string;
  level: RankingLevel | null;
  sport: ArenaSportChip;
}
