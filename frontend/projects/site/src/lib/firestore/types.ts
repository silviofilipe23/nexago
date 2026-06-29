/** Tipos do hub público, espelhando o schema real do Firestore (somente leitura). */

export type TournamentListingStatus = 'open' | 'almost_full' | 'live' | 'ended';
export type Sport = 'beachTennis' | 'beachVolleyball' | string;

export interface TournamentCategory {
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
