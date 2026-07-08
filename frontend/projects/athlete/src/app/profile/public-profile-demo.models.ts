import type { AchievementViewModel } from './achievement-catalog';

export interface DemoMatchResult {
  id: string;
  opponent: string;
  contextLabel: string;
  result: 'W' | 'L';
  score: string;
  dateLabel: string;
}

export interface DemoTeamMembership {
  id: string;
  /** id de rota pra /equipes/:teamId; null quando o time ainda não tem perfil público próprio. */
  teamId: string | null;
  teamName: string;
  detailLabel: string;
}

/** Complementa PublicAthleteProfile com seções que ainda não têm espelho público no Firestore. */
export interface ProfileDemoExtras {
  levelNumber: number;
  xpInLevel: number;
  xpForNextLevel: number;
  xpProgressPercent: number;
  totalGames: number;
  /** null quando a fonte (ex.: gamification summary real) não rastreia vitórias. */
  wins: number | null;
  streakDays: number;
  achievementViewModels: readonly AchievementViewModel[];
  unlockedCount: number;
  achievementTotal: number;
  teams: readonly DemoTeamMembership[];
  matches: readonly DemoMatchResult[];
}
