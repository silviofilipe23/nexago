import type { ArenaSportChip } from '@nexago/arena-discovery';
import type { RankingLevel } from '../ranking/athlete-ranking.models';

export type TeamStatus = 'fixed' | 'pending';
export type AvailabilityTag = 'morning' | 'afternoon' | 'night' | 'weekend' | 'flexible';
export type FilterAvailability = 'all' | AvailabilityTag;

export interface MyTeam {
  id: string;
  memberAInitials: string;
  memberBInitials: string;
  name: string;
  sport: ArenaSportChip;
  level: RankingLevel;
  status: TeamStatus;
  wins: number;
  losses: number;
  doublesRank: number | null;
  pendingNote: string | null;
}

export interface DiscoverTeam {
  id: string;
  memberAInitials: string;
  memberBInitials: string;
  name: string;
  sport: ArenaSportChip;
  level: RankingLevel;
  city: string;
  wins: number;
  losses: number;
  doublesRank: number;
}

export interface PartnerCandidate {
  id: string;
  initials: string;
  name: string;
  locationLabel: string;
  distanceKm: number;
  level: RankingLevel;
  sport: ArenaSportChip;
  availabilityTag: AvailabilityTag;
  note: string;
}
