export type ArenaTournamentStatus = 'inscricoes' | 'andamento' | 'concluido';

export interface ArenaTournament {
  id: string;
  name: string;
  sport: string;
  dateLabel: string;
  startAt: Date | null;
  status: ArenaTournamentStatus;
  enrolledCount: number;
  capacity: number;
  collectedReais: number;
  leagueId: string | null;
}
