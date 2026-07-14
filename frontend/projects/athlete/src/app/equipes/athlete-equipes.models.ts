import type { ArenaSportChip } from '@nexago/arena-discovery';

// Cópia local — não depende mais do modelo de Ranking, que passou a usar o rank unificado
// real (0/1/2/3/5) em vez desta escada de 4 nomes (mock, até Equipes também virar real).
export type RankingLevel = 'Iniciante' | 'Intermediário' | 'Avançado' | 'Profissional';

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
