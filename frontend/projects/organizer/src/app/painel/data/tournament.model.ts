/** Espelha `tournaments/{id}` (top-level, mesma coleção pública lida pelo athlete/arena),
 *  filtrado por `managerId == uid` — quem organiza o torneio. Ver `tournaments-repository.ts`
 *  pro mapeamento de campos. */

export type OrganizerTournamentStatus = 'inscricoes' | 'andamento' | 'concluido' | 'cancelado';

export interface OrganizerTournamentCategory {
  id: string; // categoryId usado em inscriptions/matches
  name: string;
  maxTeams: number | null;
}

export interface OrganizerTournament {
  id: string;
  name: string;
  sportLabel: string;
  status: OrganizerTournamentStatus;
  startAt: Date | null;
  endAt: Date | null;
  city: string | null;
  location: string | null;
  categories: OrganizerTournamentCategory[];
  capacity: number | null;
  leagueId: string | null;
}
