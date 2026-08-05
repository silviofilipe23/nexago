/** Tipos do hub público, espelhando o schema real do Firestore (somente leitura). */

/**
 * Estado exibido no badge. Derivado do doc por `resolveListingStatus` (tournament-status.ts) —
 * nunca lido cru do Firestore, que grava outro vocabulário (`draft|open|closed|completed|cancelled`
 * + legados). `closed` = inscrição encerrada, evento ainda por vir. `cancelled` só aparece na
 * página individual: fica fora da listagem.
 */
export type TournamentListingStatus = 'open' | 'almost_full' | 'closed' | 'live' | 'ended' | 'cancelled';
export type Sport = 'beachTennis' | 'beachVolleyball' | string;

export interface TournamentCategory {
  categoryName?: string; // ex.: 'Categoria A', 'Iniciante Misto'
  genderType?: string; // 'male' | 'female' | 'mixed'
  level?: string; // 'Open' | 'Iniciante' | ...
  entryFeeCents?: number;
  spotsTotal?: number;
  bracketFormat?: string;
}

export interface TournamentSummary {
  id: string;
  name: string;
  sport: Sport;
  city: string | null;
  state: string | null;
  locationName: string | null;
  dateLabel: string | null;
  startAt: Date | null;
  endAt: Date | null;
  listingStatus: TournamentListingStatus;
  featured: boolean;
  enrolledCount: number;
  capacity: number | null;
  liveMatchesNow: number;
  categoriesCount: number;
  leagueId: string | null;
  leagueStageName: string | null;
  coverUrl: string | null;
}

export interface TournamentDetail extends TournamentSummary {
  description: string | null;
  location: string | null;
  locationAddress: string | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  defaultEntryFeeCents: number | null;
  cashPrizesEnabled: boolean;
  categories: TournamentCategory[];
}

export interface LeagueStage {
  name: string | null;
  dateLabel: string | null;
  startAt: Date | null;
  tournamentIds: string[];
}

export interface LeagueSummary {
  id: string;
  name: string;
  seasonLabel: string | null;
  description: string | null;
  coverUrl: string | null;
  stages: LeagueStage[];
}

export interface ArenaSummary {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  description: string | null;
  sports: string[]; // courtTypes
  surfaces: string[];
  amenities: string[];
  photoUrls: string[];
  logoUrl: string | null;
}

export interface ArenaCourt {
  id: string;
  name: string | null;
  sport: string | null;
  surface: string | null;
}

export interface ArenaDetail extends ArenaSummary {
  courts: ArenaCourt[];
}
