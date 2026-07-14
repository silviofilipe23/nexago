import type { ArenaSportChip } from '@nexago/arena-discovery';

// Cópia local — não depende mais do modelo de Ranking, que passou a usar o rank unificado
// real (0/1/2/3/5) em vez desta escada de 4 nomes (mock, até o Diretório também virar real).
export type RankingLevel = 'Iniciante' | 'Intermediário' | 'Avançado' | 'Profissional';

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
