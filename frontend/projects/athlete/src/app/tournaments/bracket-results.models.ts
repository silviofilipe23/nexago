/** `unsupported` = dupla eliminação (grade WB/LB não implementada nesta rodada). */
export type CategoryBracketFormat = 'chave' | 'grupos' | 'unsupported';

export interface BracketDuo {
  id: string;
  name: string;
}

export interface GroupStanding {
  rank: number;
  duo: BracketDuo;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
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
  /** Ex.: "16:30" quando `status === 'scheduled'`. */
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

  /** Preenchido quando a categoria tem fase de grupos. */
  groups: CategoryGroup[];
  /** Mata-mata (fase única, ou pós-grupos quando a categoria tem grupos + mata-mata). */
  bracketRounds: BracketRound[];
}
