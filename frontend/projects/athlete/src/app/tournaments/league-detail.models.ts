export type LeagueStageStatus = 'finished' | 'next' | 'upcoming';

export interface LeagueStage {
  id: string;
  order: number;
  name: string;
  city: string;
  dateLabel: string;
  status: LeagueStageStatus;
  tournamentId: string | null;
}

export interface LeagueRankingRow {
  rank: number;
  duoName: string;
  /** Pontos por etapa, na mesma ordem de `LeagueDetailView.stages`; `null` = etapa ainda sem pontuação lançada. */
  pointsByStage: (number | null)[];
  total: number;
}

export interface LeagueDetailView {
  id: string;
  name: string;
  statusLabel: string;
  formatLabel: string;
  citiesSummary: string;
  periodLabel: string;
  aboutText: string | null;

  stages: LeagueStage[];
  stagesCompletedLabel: string;

  ranking: LeagueRankingRow[];

  nextStagePriceLabel: string | null;
  nextStageTournamentId: string | null;

  rankingCalcLabel: string;

  organizerName: string | null;
}
