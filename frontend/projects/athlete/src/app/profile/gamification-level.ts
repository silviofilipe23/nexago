export interface LevelProgress {
  xpInLevel: number;
  xpForNextLevel: number;
  progressRatio: number;
}

const XP_PER_LEVEL = 100;

/** Espelha a curva de XP do app Flutter (GamificationSummary em gamification_models.dart): 100 XP por nível. */
export function computeLevelProgress(xp: number, level: number): LevelProgress {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const safeLevel = Number.isFinite(level) && level >= 0 ? Math.floor(level) : Math.floor(safeXp / XP_PER_LEVEL);
  const xpInLevel = safeXp % XP_PER_LEVEL;
  const xpForNextLevel = (safeLevel + 1) * XP_PER_LEVEL - safeXp;
  const progressRatio = Math.min(1, Math.max(0, xpInLevel / XP_PER_LEVEL));
  return { xpInLevel, xpForNextLevel, progressRatio };
}
