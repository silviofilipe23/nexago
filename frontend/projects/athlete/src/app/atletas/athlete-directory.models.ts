import type { ArenaSportChip } from '@nexago/arena-discovery';
import type { RankingLevel } from '../ranking/athlete-ranking.models';

export interface AthleteDirectoryEntry {
  id: string;
  handle: string;
  fullName: string;
  city: string;
  distanceKm: number;
  sport: ArenaSportChip;
  level: RankingLevel;
  rankingPosition: number;
  suggestionReason: string | null;
}
