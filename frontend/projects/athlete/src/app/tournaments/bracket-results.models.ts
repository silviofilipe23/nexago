export type CategoryBracketFormat = 'chave' | 'grupos';

export interface BracketDuo {
  id: string;
  name: string;
  isViewer: boolean;
}

export interface GroupStanding {
  rank: number;
  duo: BracketDuo;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
  points: number;
  qualifies: boolean;
}

export interface CategoryGroup {
  id: string;
  letter: string;
  standings: GroupStanding[];
}

export type BracketMatchStatus = 'done' | 'live' | 'scheduled' | 'tbd';

export interface BracketMatchSide {
  duo: BracketDuo | null;
  score: number | null;
  winner: boolean;
}

export interface BracketMatch {
  id: string;
  status: BracketMatchStatus;
  /** Ex.: "Sáb 29/03 · 16:30 · Quadra 1" quando `status === 'scheduled'`. */
  scheduledLabel: string | null;
  sideA: BracketMatchSide;
  sideB: BracketMatchSide;
}

export interface BracketRound {
  id: string;
  label: string;
  matches: BracketMatch[];
}

export interface CategoryBracketData {
  categoryId: string;
  categoryName: string;
  format: CategoryBracketFormat;
  formatSummaryLabel: string;

  /** Formato `grupos`. */
  groups: CategoryGroup[];
  groupsQualifyNote: string | null;
  /** Chave eliminatória prévia, preenchida conforme os grupos terminam (formato `grupos`). */
  eliminationPreviewRounds: BracketRound[];

  /** Formato `chave`. */
  bracketRounds: BracketRound[];
}
