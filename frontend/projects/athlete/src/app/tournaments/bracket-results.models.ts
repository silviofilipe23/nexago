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

/** Estado do jogo, derivado do `status` do doc — igual ao selo do painel do organizador. Uma
 *  partida sem data marcada continua "agendada" (ela existe na chave); quem informa a falta de
 *  horário é o rodapé do card ("Sem horário"), não o selo. */
export type BracketMatchStatus = 'done' | 'live' | 'scheduled' | 'canceled';

export interface BracketMatchSide {
  duo: BracketDuo | null;
  /** Nomes dos atletas da dupla ("Martins / Silva" → 2 avatares empilhados). */
  names: string[];
  score: number | null;
  winner: boolean;
}

/** Card da chave — mesma anatomia do card do painel do organizador: cabeçalho (`#nº · quadra` +
 *  selo de status), um lado por dupla (avatares, nome, sets) e rodapé de agendamento. */
export interface BracketMatch {
  id: string;
  /** `#12 · Quadra 1` — número do jogo e quadra, no topo do card. */
  metaLabel: string;
  status: BracketMatchStatus;
  statusLabel: string;
  /** Rodapé: "Sáb 29/03 · 16:30 · Quadra 1" quando agendada; senão "Sem horário". */
  scheduleLabel: string;
  /** `true` quando há data/hora marcada — o rodapé ganha ícone e destaque. */
  scheduled: boolean;
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
