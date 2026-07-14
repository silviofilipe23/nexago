/** Espelha `ranking_list_models.dart` (Flutter) — ranking real por pontos de torneio, sem
 *  recorte por esporte (pontos vêm de `tournamentCategoryResults`, que não guarda esporte). */

export type RankingMode = 'individual' | 'doubles';

export type RankingGender = 'male' | 'female' | 'mixed';
export type RankingGenderFilter = 'all' | RankingGender;

/** `null` = "Geral" (soma de todos os anos, lida de `athleteRankings`/`teamRankings`). */
export type RankingYearFilter = number | null;

/** Rank unificado de nível — 0/1/2/3/5 (1 e 4 reservados para a escada futura do beach
 *  tennis). `null` = "Todos os níveis". Espelha `AthleteProfileOptions.levelRank`. */
export type RankingLevelFilter = number | null;

export interface RankingRow {
  rank: number;
  entityId: string;
  displayName: string;
  subtitle: string;
  points: number;
  tournamentsCount: number;
  initials: string;
  avatarUrl: string | null;
  isCurrentUser: boolean;
}

export interface RankingScoringRule {
  id: string;
  title: string;
  detail: string;
}
