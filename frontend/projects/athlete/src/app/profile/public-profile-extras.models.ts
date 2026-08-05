import type { AchievementViewModel } from './achievement-catalog';

/**
 * Bloco de gamificação do perfil público (XP, nível e conquistas).
 *
 * Só existe pro DONO do perfil: a fonte é `users/{uid}/gamification/**`, cuja regra do Firestore
 * é `request.auth.uid == userId` — não há espelho público desses dados. Duplas, partidas e
 * estatísticas de jogo, que valem pra qualquer atleta, ficam em `public-profile-activity.ts`.
 */
export interface ProfileGamificationExtras {
  levelNumber: number;
  xpInLevel: number;
  xpForNextLevel: number;
  xpProgressPercent: number;
  /** Total de jogos contabilizado pela gamificação — usado só quando o atleta ainda não tem
   *  partidas de torneio em `matches` (senão as estatísticas saem do histórico real). */
  totalGames: number;
  /** Sequência de DIAS ativos (gamificação), não de vitórias. */
  streakDays: number;
  achievementViewModels: readonly AchievementViewModel[];
  unlockedCount: number;
  achievementTotal: number;
}
