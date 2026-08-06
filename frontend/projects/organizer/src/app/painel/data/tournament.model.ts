/** Espelha `tournaments/{id}` (top-level, mesma coleção pública lida pelo athlete/arena),
 *  filtrado por `managerId == uid` — quem organiza o torneio. Ver `tournaments-repository.ts`
 *  pro mapeamento de campos. */

import type { TournamentPaymentMode, TournamentVisibility } from './tournament-create.model';

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
  /** Uniforme CRU da categoria (`none`/`top_only`/`top`/`full`). A herança das flags da raiz
   *  (categoria sem exigência própria em torneio com `uniformRequired`) fica em `uniforms.ts`,
   *  igual ao portal do atleta — aqui só o que está gravado no doc. */
  uniformType: string | null;
  uniformNumberOnShirt: boolean;
  uniformNameOnShirt: boolean;
  uniformSizeOptionsTop: string[];
  uniformSizeOptionsShorts: string[];
}

export interface OrganizerTournamentCourt {
  id: string;
  name: string;
  order: number;
}

/** Config do telão ao vivo (`tournaments/{id}.bigScreen`) — escrita só pelo painel do
 *  organizador; a TV escuta o doc e reage ao vivo. Ausente = defaults de
 *  `effectiveTelaoConfig` (todas as quadras, tudo ligado). */
export interface TelaoConfig {
  courtIds: string[];
  showUpcoming: boolean;
  showCall: boolean;
  showAvatars: boolean;
  autoRotate: boolean;
  /** Destaque "em chamas" na dupla com 3+ pontos seguidos. */
  showStreak: boolean;
  /** Modo GRANDE FINAL: final/grand final/3º lugar assumem a tela inteira. */
  showFinalMode: boolean;
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
  /** uid do dono do torneio — só quem organiza gerencia a equipe (rules: `isTournamentOwner`). */
  managerId: string;
  sportLabel: string;
  /** `sport` cru do documento (`beachVolleyball`/`beachTennis`/…) — usado pra resolver o
   *  código de esporte do perfil (`tournamentSportToLevelSportCode`) na pontuação de nível. */
  sportId: string | null;
  /** Capa do torneio (`coverUrl`/`imageUrl`/… no Firestore) — nula quando não enviada. */
  coverUrl: string | null;
  status: OrganizerTournamentStatus;
  /** `linkOnly` fica fora da listagem pública do site — o único caminho até ele é o link que o
   *  organizador compartilha, e é isso que decide o destino em `tournament-share.ts`. */
  visibility: TournamentVisibility;
  /** `directWithOrganizer` não tem webhook: o atleta declara que pagou e o dinheiro cai fora do
   *  app. É o que separa "pagou" de "disse que pagou" na tela de Inscrições. */
  paymentMode: TournamentPaymentMode;
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
  bigScreen: TelaoConfig | null;
  /** Flags de uniforme da RAIZ do torneio (`uniformRequired`/`uniformNumberOnShirt`/
   *  `uniformNameOnShirt`) — o wizard grava as duas coisas (raiz + categoria), e categoria sem
   *  exigência própria herda daqui (ver `uniforms.ts`). */
  uniformRequired: boolean;
  uniformNumberOnShirt: boolean;
  uniformNameOnShirt: boolean;
}
