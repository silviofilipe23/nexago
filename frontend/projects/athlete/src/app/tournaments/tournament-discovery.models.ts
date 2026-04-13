export type TournamentGenderCat = 'M' | 'F' | 'Mix';
export type TournamentFormat = 'Dupla' | 'Individual';
export type TournamentListingStatus = 'open' | 'almost_full' | 'live' | 'ended';

/** Liga com uma ou mais etapas; cada etapa referencia torneios por `id`. */
export interface DiscoveryLeague {
  id: string;
  name: string;
  /** Ex.: "Temporada 2026" */
  seasonLabel?: string;
  city?: string;
  stages: DiscoveryLeagueStage[];
}

export interface DiscoveryLeagueStage {
  id: string;
  /** Ex.: "Etapa Nordeste" */
  name: string;
  order: number;
  dateLabel?: string;
  /** Referências a `DiscoveryTournament.id` */
  tournamentIds: string[];
}

export interface DiscoveryTournament {
  id: string;
  name: string;
  location: string;
  city: string;
  dateLabel: string;
  startDate: Date;
  categories: TournamentGenderCat[];
  format: TournamentFormat;
  priceLabel: string;
  priceValue: number;
  spotsLeft: number;
  spotsTotal: number;
  status: TournamentListingStatus;
  featured: boolean;
  enrolledCount: number;
  liveMatchesNow: number;
  /** Fim da janela de promoção / early bird (opcional) */
  offerEndsAt: Date | null;
  /** Quando faz parte de uma liga (redundante com MOCK_DISCOVERY_LEAGUES; útil para APIs). */
  leagueId?: string;
  leagueStageId?: string;
}

export type FilterCategory = 'all' | TournamentGenderCat;
export type FilterFormat = 'all' | TournamentFormat;
