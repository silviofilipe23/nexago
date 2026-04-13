export interface RankEntry {
  rank: number;
  name: string;
  points: number;
  trend: 'up' | 'same' | 'down';
  category: 'masculino' | 'feminino' | 'misto';
  type: 'individual' | 'dupla';
  year: number;
}

export const MOCK_RANKING: RankEntry[] = [
  { rank: 1, name: 'Marina Duarte', points: 2840, trend: 'up', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 2, name: 'Rafael Costa', points: 2712, trend: 'same', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 3, name: 'Luísa Mendes', points: 2655, trend: 'up', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 4, name: 'Pedro Oliveira', points: 2480, trend: 'down', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 5, name: 'Ana Ribeiro', points: 2398, trend: 'up', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 6, name: 'Gabriel Nunes', points: 2310, trend: 'same', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 7, name: 'Eduarda Lima', points: 2255, trend: 'down', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 8, name: 'Lucas Martins', points: 2212, trend: 'same', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 9, name: 'Bianca Torres', points: 2150, trend: 'up', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 10, name: 'Carlos Silva', points: 2130, trend: 'down', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 11, name: 'Amanda Rocha', points: 2105, trend: 'same', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 12, name: 'Felipe Souza', points: 2070, trend: 'up', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 13, name: 'Julia Alves', points: 2015, trend: 'same', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 14, name: 'Matheus Teixeira', points: 1996, trend: 'down', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 15, name: 'Patrícia Cruz', points: 1980, trend: 'up', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 16, name: 'Leonardo Prado', points: 1923, trend: 'down', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 17, name: 'Renata Gomes', points: 1887, trend: 'same', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 18, name: 'Fernando Moura', points: 1840, trend: 'up', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 19, name: 'Lorena Barros', points: 1802, trend: 'up', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 20, name: 'Tiago Carvalho', points: 1770, trend: 'down', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 21, name: 'Camila Reis', points: 1710, trend: 'same', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 22, name: 'Bruno Lopes', points: 1685, trend: 'up', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 23, name: 'Nicole Pinto', points: 1657, trend: 'down', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 24, name: 'Vitor Melo', points: 1632, trend: 'same', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 25, name: 'Letícia Araújo', points: 1608, trend: 'up', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 26, name: 'Diego Farias', points: 1589, trend: 'down', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 27, name: 'Beatriz Simões', points: 1564, trend: 'same', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 28, name: 'Gustavo Rocha', points: 1533, trend: 'up', category: 'masculino', type: 'individual', year: 2026 },
  { rank: 29, name: 'Sofia Santana', points: 1506, trend: 'same', category: 'feminino', type: 'individual', year: 2026 },
  { rank: 30, name: 'Daniel Pires', points: 1480, trend: 'down', category: 'masculino', type: 'individual', year: 2026 },

  // Mocks para dupla - feminino
  { rank: 1, name: 'Marina Duarte', points: 2840, trend: 'up', category: 'feminino', type: 'dupla', year: 2026 },
  { rank: 2, name: 'Ana Ribeiro', points: 2398, trend: 'down', category: 'feminino', type: 'dupla', year: 2026 },
  { rank: 3, name: 'Julia Alves', points: 2015, trend: 'same', category: 'feminino', type: 'dupla', year: 2026 },
  { rank: 4, name: 'Lorena Barros', points: 1802, trend: 'up', category: 'feminino', type: 'dupla', year: 2026 },
  { rank: 5, name: 'Letícia Araújo', points: 1608, trend: 'up', category: 'feminino', type: 'dupla', year: 2026 },

  // Mocks para dupla - masculino
  { rank: 1, name: 'Rafael Costa', points: 2712, trend: 'up', category: 'masculino', type: 'dupla', year: 2026 },
  { rank: 2, name: 'Pedro Oliveira', points: 2480, trend: 'same', category: 'masculino', type: 'dupla', year: 2026 },
  { rank: 3, name: 'Gabriel Nunes', points: 2310, trend: 'down', category: 'masculino', type: 'dupla', year: 2026 },
  { rank: 4, name: 'Lucas Martins', points: 2212, trend: 'up', category: 'masculino', type: 'dupla', year: 2026 },
  { rank: 5, name: 'Felipe Souza', points: 2070, trend: 'up', category: 'masculino', type: 'dupla', year: 2026 },

  // Mocks para mista - individual
  { rank: 1, name: 'João Pedro', points: 2600, trend: 'up', category: 'misto', type: 'individual', year: 2026 },
  { rank: 2, name: 'Harumi Takahashi', points: 2503, trend: 'same', category: 'misto', type: 'individual', year: 2026 },
  { rank: 3, name: 'Victor Oliveira', points: 2394, trend: 'down', category: 'misto', type: 'individual', year: 2026 },
  { rank: 4, name: 'Gabriela Freitas', points: 2259, trend: 'up', category: 'misto', type: 'individual', year: 2026 },
  { rank: 5, name: 'Tiago Carvalho', points: 1988, trend: 'same', category: 'misto', type: 'individual', year: 2026 },

  // Mocks para mista - dupla
  { rank: 1, name: 'João Pedro & Harumi Takahashi', points: 2680, trend: 'up', category: 'misto', type: 'dupla', year: 2026 },
  { rank: 2, name: 'Gabriela Freitas & Victor Oliveira', points: 2520, trend: 'same', category: 'misto', type: 'dupla', year: 2026 },
  { rank: 3, name: 'Tiago Carvalho & Sofia Santana', points: 2350, trend: 'down', category: 'misto', type: 'dupla', year: 2026 },
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
