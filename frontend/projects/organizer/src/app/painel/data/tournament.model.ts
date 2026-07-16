/** Espelha `tournaments/{id}` (top-level, mesma coleção pública lida pelo athlete/arena),
 *  filtrado por `managerId == uid` — quem organiza o torneio. Ver `tournaments-repository.ts`
 *  pro mapeamento de campos. */

export type OrganizerTournamentStatus = 'inscricoes' | 'andamento' | 'concluido' | 'cancelado';

export interface OrganizerTournamentCategory {
  id: string; // categoryId usado em inscriptions/matches
  name: string;
  maxTeams: number | null;
  /** Formato salvo na categoria (`bracketFormat`: groups_knockout/single_elimination/…) e a
   *  config de grupos/sets — usados pela geração de chave (Task O11). */
  bracketFormat: string | null;
  teamsPerGroup: number;
  qualifiersPerGroup: number;
  bestOf: string | null; // singleSet | bestOf3 | bestOf5
}

export interface OrganizerTournamentCourt {
  id: string;
  name: string;
  order: number;
}

/** Espelha `TournamentMatchOpsConfig` (Flutter): jornada e durações do dia de jogo. */
export interface OrganizerMatchOpsConfig {
  dayStart: string; // "07:00"
  dayEnd: string; // "24:00" (exclusivo)
  defaultMatchDurationMin: number;
  minRestBetweenMatchesMin: number;
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
  courts: OrganizerTournamentCourt[];
  courtsCount: number;
  matchOps: OrganizerMatchOpsConfig;
}
