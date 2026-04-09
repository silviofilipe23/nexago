export interface RankEntry {
  rank: number;
  name: string;
  points: number;
  trend: 'up' | 'same' | 'down';
}

export const MOCK_RANKING: RankEntry[] = [
  { rank: 1, name: 'Marina Duarte', points: 2840, trend: 'up' },
  { rank: 2, name: 'Rafael Costa', points: 2712, trend: 'same' },
  { rank: 3, name: 'Luísa Mendes', points: 2655, trend: 'up' },
  { rank: 4, name: 'Pedro Oliveira', points: 2480, trend: 'down' },
  { rank: 5, name: 'Ana Ribeiro', points: 2398, trend: 'up' },
  { rank: 6, name: 'Gabriel Nunes', points: 2310, trend: 'same' },
];

/** Destaque “você” na landing (dados fictícios para sensação de produto vivo). */
export interface ViewerRankingHighlight {
  rank: number;
  pointsBehindTop10: number;
  /** 0–100: proximidade da meta (ex.: entrar no top 10). */
  progressToTop10Pct: number;
}

export const VIEWER_RANKING_HIGHLIGHT: ViewerRankingHighlight = {
  rank: 18,
  pointsBehindTop10: 120,
  progressToTop10Pct: 72,
};
