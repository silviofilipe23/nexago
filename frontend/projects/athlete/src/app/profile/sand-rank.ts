/** Sand Rank — escada de elos por XP de engajamento (16 degraus, Iniciante → Lenda).
 *  Porta 1:1 de `sand_rank_catalog.dart` (Flutter) / `SAND_RANK_TRACK`
 *  (functions/src/sand-rank-engine.ts). Mede engajamento (XP da gamificação),
 *  não habilidade (o Glicko-2 é outra escada, server-side). A UI é gateada pela
 *  flag `appConfig/sandRank.enabled` — mesmo doc que o app lê. */

export interface SandRankStep {
  trackIndex: number;
  rankCode: SandRankCode;
  rankName: string;
  /** 3/2/1 dentro do elo; 0 = Lenda (sem divisão). */
  division: number;
  minXp: number;
}

export type SandRankCode = 'INICIANTE' | 'COMPETIDOR' | 'DESAFIANTE' | 'ELITE' | 'MESTRE' | 'LENDA';

const step = (trackIndex: number, rankCode: SandRankCode, rankName: string, division: number, minXp: number): SandRankStep => ({
  trackIndex,
  rankCode,
  rankName,
  division,
  minXp,
});

export const SAND_RANK_TRACK: readonly SandRankStep[] = [
  step(0, 'INICIANTE', 'Iniciante III', 3, 0),
  step(1, 'INICIANTE', 'Iniciante II', 2, 100),
  step(2, 'INICIANTE', 'Iniciante I', 1, 250),
  step(3, 'COMPETIDOR', 'Competidor III', 3, 450),
  step(4, 'COMPETIDOR', 'Competidor II', 2, 700),
  step(5, 'COMPETIDOR', 'Competidor I', 1, 1000),
  step(6, 'DESAFIANTE', 'Desafiante III', 3, 1400),
  step(7, 'DESAFIANTE', 'Desafiante II', 2, 1900),
  step(8, 'DESAFIANTE', 'Desafiante I', 1, 2500),
  step(9, 'ELITE', 'Elite III', 3, 3300),
  step(10, 'ELITE', 'Elite II', 2, 4200),
  step(11, 'ELITE', 'Elite I', 1, 5300),
  step(12, 'MESTRE', 'Mestre III', 3, 6600),
  step(13, 'MESTRE', 'Mestre II', 2, 8200),
  step(14, 'MESTRE', 'Mestre I', 1, 10000),
  step(15, 'LENDA', 'Lenda', 0, 12500),
];

/** Cores por elo — `sandRankColor` (sand_rank_reward_catalog.dart). */
export const SAND_RANK_COLOR: Record<SandRankCode, string> = {
  INICIANTE: '#B08D57',
  COMPETIDOR: '#2F6FBF',
  DESAFIANTE: '#17A2A6',
  ELITE: '#7B4FBF',
  MESTRE: '#C0392B',
  LENDA: '#D4A017',
};

export function sandRankStepFromXp(xp: number): SandRankStep {
  let current = SAND_RANK_TRACK[0]!;
  for (const s of SAND_RANK_TRACK) {
    if (xp >= s.minXp) current = s;
    else break;
  }
  return current;
}

export interface SandRankProgress {
  current: SandRankStep;
  next: SandRankStep | null;
  /** 0..1 dentro do degrau atual; 1 quando é Lenda. */
  progress: number;
  xpIntoStep: number;
  xpForNext: number | null;
}

export function sandRankProgressFromXp(xp: number): SandRankProgress {
  const current = sandRankStepFromXp(xp);
  const next = SAND_RANK_TRACK[current.trackIndex + 1] ?? null;
  if (!next) {
    return { current, next: null, progress: 1, xpIntoStep: xp - current.minXp, xpForNext: null };
  }
  const span = next.minXp - current.minXp;
  const into = xp - current.minXp;
  return {
    current,
    next,
    progress: span > 0 ? Math.min(1, Math.max(0, into / span)) : 0,
    xpIntoStep: into,
    xpForNext: next.minXp - xp,
  };
}
