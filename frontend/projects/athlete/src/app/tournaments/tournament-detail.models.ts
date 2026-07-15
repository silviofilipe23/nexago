export type BracketPreviewState = 'soon' | 'live' | 'done';

export interface TournamentDetailCategory {
  id: string;
  name: string;
  genderLabel: string;
  level: string;
  spotsLeft: number;
  spotsTotal: number;
  priceLabel: string;
  registrationClosed: boolean;
}

export interface TournamentDetailView {
  dateDetail: string;
  mapQuery: string;
  categories: TournamentDetailCategory[];
  bracketState: BracketPreviewState;
}
