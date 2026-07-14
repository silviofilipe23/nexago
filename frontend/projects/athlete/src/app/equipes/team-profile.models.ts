/** Espelha o perfil público real de uma dupla — `teams` + `teamRankings` + `matches`
 *  (ganhas/perdidas computadas dos jogos reais, sem o agrupamento por campanha/torneio do
 *  app nem o head-to-head; lista simples de partidas, mais perto do que o mock já mostrava). */

export interface TeamMatchRow {
  matchId: string;
  opponentName: string;
  result: 'win' | 'loss';
  scoreLabel: string;
  dateLabel: string;
}

export interface TeamProfileView {
  teamId: string;
  displayName: string;
  player1Name: string;
  player2Name: string;
  player1Initials: string;
  player2Initials: string;
  city: string | null;
  points: number;
  tournamentsCount: number;
  wins: number;
  losses: number;
  matches: readonly TeamMatchRow[];
}
