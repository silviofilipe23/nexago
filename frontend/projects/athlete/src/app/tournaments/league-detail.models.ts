export type LeagueStageStatus = 'finished' | 'next' | 'upcoming';

export interface LeagueStage {
  id: string;
  order: number;
  name: string;
  city: string;
  dateLabel: string;
  status: LeagueStageStatus;
  /** Colocação do atleta na etapa (só quando `status === 'finished'`). */
  placement: number | null;
  /** Pontos ganhos na etapa (só quando `status === 'finished'`). */
  points: number | null;
  /** Torneio real vinculado (permite "Inscrever"/"Detalhes" linkarem pra `/torneios/:id`). */
  tournamentId: string | null;
}

export interface LeagueRankingRow {
  rank: number;
  duoName: string;
  isViewer: boolean;
  /** Pontos por etapa, na mesma ordem de `LeagueDetailData.stages`; `null` = etapa ainda não jogada. */
  pointsByStage: (number | null)[];
  total: number;
}

export interface LeagueDetailData {
  id: string;
  name: string;
  statusLabel: string;
  formatLabel: string;
  citiesSummary: string;
  periodLabel: string;
  aboutText: string | null;

  /** Posição do atleta logado na liga (null quando não há dado curado pra essa liga). */
  yourRank: number | null;
  yourDuoName: string | null;
  yourPoints: number | null;
  nextStageLabel: string | null;

  stages: LeagueStage[];
  stagesCompletedLabel: string | null;

  ranking: LeagueRankingRow[];

  prizeTotalLabel: string | null;
  nextStagePriceLabel: string | null;
  nextStageTournamentId: string | null;

  categoriesLabel: string | null;
  rankingCalcLabel: string | null;
  priceLabel: string | null;

  organizerName: string;
  organizerInitials: string;
}
