export interface ArenaLeagueSummary {
  id: string;
  name: string;
  sport: string;
  city: string;
  seasonLabel: string | null;
  /** Quantas etapas dessa liga acontecem nesta arena (vs. o total de etapas da liga). */
  stagesHereCount: number;
  stagesTotalCount: number;
}
