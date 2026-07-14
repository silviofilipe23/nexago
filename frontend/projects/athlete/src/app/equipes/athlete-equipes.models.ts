/** Espelha `teams/{teamId}` (real) — sem recorte por esporte (times não guardam esporte,
 *  mesma realidade já confirmada no Ranking). Convite de parceiro (formação de dupla nova)
 *  fica fora do escopo desta tela: no app real isso é uma sub-etapa da inscrição em torneio
 *  (`tournamentRegistrationInvites`, escrita só via Cloud Function), não uma ação isolada. */

export type TeamGenderFilter = 'all' | 'male' | 'female' | 'mixed';

/** Rank unificado de nível — 0/1/2/3/5. `null` = "Todos os níveis". Espelha o mesmo mapeamento
 *  usado no Ranking (`AthleteProfileOptions.levelRank`). */
export type TeamLevelFilter = number | null;

export interface TeamCard {
  teamId: string;
  displayName: string;
  player1Name: string;
  player2Name: string;
  player1Initials: string;
  player2Initials: string;
  city: string | null;
  points: number;
  tournamentsCount: number;
  isMine: boolean;
}
