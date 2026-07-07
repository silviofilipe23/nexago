export interface LevelProgress {
  xpInLevel: number;
  xpForNextLevel: number;
  progressRatio: number;
}

const XP_PER_LEVEL = 100;

/**
 * Espelha a curva de XP do app Flutter (GamificationSummary em gamification_models.dart): 100 XP por nível.
 * `level` só é usado quando bate com o nível derivado do próprio `xp` — um `level` desatualizado ou
 * inconsistente (ex.: doc do Firestore com xp e level dessincronizados) nunca deve quebrar o invariante
 * xpInLevel + xpForNextLevel === XP_PER_LEVEL.
 */
export function computeLevelProgress(xp: number, level: number): LevelProgress {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const derivedLevel = Math.floor(safeXp / XP_PER_LEVEL);
  const safeLevel =
    Number.isFinite(level) && level >= 0 && Math.floor(level) === derivedLevel ? Math.floor(level) : derivedLevel;
  const xpInLevel = safeXp % XP_PER_LEVEL;
  const xpForNextLevel = (safeLevel + 1) * XP_PER_LEVEL - safeXp;
  const progressRatio = Math.min(1, Math.max(0, xpInLevel / XP_PER_LEVEL));
  return { xpInLevel, xpForNextLevel, progressRatio };
}
